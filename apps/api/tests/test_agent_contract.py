from __future__ import annotations

from sqlalchemy import select

import opsledger.agent as agent_module
from opsledger.agent import (
    AgentRecommendation,
    ProviderResult,
    collect_agent_context,
    run_agent_review,
)
from opsledger.models import Case
from opsledger.seed import seed_demo_data

from .conftest import TestContext


def test_agent_response_schema_is_strict_at_every_object_boundary() -> None:
    schema = AgentRecommendation.model_json_schema()
    objects = [schema, *schema.get("$defs", {}).values()]

    for item in objects:
        if item.get("type") != "object":
            continue
        assert item.get("additionalProperties") is False
        assert set(item.get("properties", {})) == set(item.get("required", []))


def test_invalid_grounding_is_repaired_once_then_saved(
    context: TestContext,
    monkeypatch,
) -> None:
    assert seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0001"))
    assert case is not None
    calls = 0

    def fake_generate(case_arg, context_arg, _prompt, _settings):
        nonlocal calls
        calls += 1
        output = agent_module._deterministic_recommendation(case_arg, context_arg)
        if calls == 1:
            output.evidence_summary[0].citation_id = "not-a-real-citation"
        return ProviderResult(output=output, provider="contract-test", model="bounded-fixture")

    monkeypatch.setattr(agent_module, "_generate", fake_generate)
    run = run_agent_review(
        context.db,
        case,
        correlation_id="agent-repair-test",
        settings=context.settings,
    )

    assert calls == 2
    assert run.status == "COMPLETED"
    assert run.model_provider == "contract-test"
    assert len(run.tool_calls_json) == 5
    assert len(run.tool_calls_json) <= 8
    assert run.structured_output_json is not None
    assert run.structured_output_json["recommended_action"] == "READY_FOR_HUMAN_REVIEW"
    assert "chain_of_thought" not in run.structured_output_json


def test_follow_up_draft_is_rejected_outside_needs_information(context: TestContext) -> None:
    assert seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0003"))
    assert case is not None
    agent_context, _ = collect_agent_context(context.db, case)
    output = agent_module._deterministic_recommendation(case, agent_context)
    output.follow_up_draft = "This must not be prepared for a held identity conflict."

    errors = agent_module._validate_grounding(output, agent_context, case)

    assert "follow_up_draft must be null unless the route is NEEDS_INFORMATION" in errors


def test_reviewer_copy_uses_plain_language(context: TestContext) -> None:
    assert seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0002"))
    assert case is not None
    agent_context, _ = collect_agent_context(context.db, case)

    output = agent_module._deterministic_recommendation(case, agent_context)
    reviewer_copy = " ".join(
        [
            output.case_summary,
            output.recommendation_reason,
            output.follow_up_draft or "",
            *output.limitations,
            *(item.label for item in output.evidence_summary),
            *(item.claim for item in output.evidence_summary),
            *(item.explanation for item in output.unresolved_findings),
            *(item.item for item in output.missing_information),
            *(item.reason for item in output.missing_information),
        ]
    ).lower()

    for implementation_term in (
        "bounded",
        "deterministic",
        "schema",
        "synthetic",
        "validation",
        "workflow readiness",
        "readiness score",
    ):
        assert implementation_term not in reviewer_copy
    assert "ownership form" in reviewer_copy
