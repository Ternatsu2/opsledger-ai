from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import record_event
from .config import Settings, get_settings
from .models import AgentRun, Case, Document, ExtractedField, ValidationFinding
from .policy import DEMO_POLICY
from .schemas import CaseStage
from .state_machine import transition_case


class StrictAgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvidenceCitation(StrictAgentModel):
    citation_id: str
    label: str
    claim: str


class UnresolvedFinding(StrictAgentModel):
    finding_id: str
    explanation: str


class MissingInformationItem(StrictAgentModel):
    item: str
    rule_code: str
    reason: str


class AgentRecommendation(StrictAgentModel):
    case_summary: str = Field(min_length=20, max_length=1600)
    evidence_summary: list[EvidenceCitation] = Field(min_length=1, max_length=12)
    unresolved_findings: list[UnresolvedFinding] = Field(max_length=20)
    missing_information: list[MissingInformationItem] = Field(max_length=20)
    recommended_action: Literal[
        "READY_FOR_HUMAN_REVIEW",
        "NEEDS_INFORMATION",
        "MANUAL_INVESTIGATION",
    ]
    recommendation_reason: str = Field(min_length=10, max_length=800)
    follow_up_draft: str | None = Field(max_length=4000)
    limitations: list[str] = Field(min_length=1, max_length=8)


class ProviderResult(BaseModel):
    output: AgentRecommendation
    provider: str
    model: str
    token_usage: dict[str, Any] = Field(default_factory=dict)
    fallback_reason: str | None = None


def _case_tool(case: Case) -> dict[str, Any]:
    fields = [
        "legal_business_name",
        "registration_number",
        "jurisdiction",
        "industry",
        "requested_amount",
        "currency",
        "funding_purpose",
        "annual_revenue",
        "stage",
        "completeness_score",
    ]
    return {
        "case_id": case.id,
        "reference": case.reference,
        "values": {
            field: {
                "value": str(getattr(case, field)),
                "citation_id": f"case:{case.id}:{field}",
            }
            for field in fields
        },
    }


def _fields_tool(db: Session, case_id: str) -> list[dict[str, Any]]:
    fields = db.scalars(select(ExtractedField).where(ExtractedField.case_id == case_id)).all()
    return [
        {
            "id": field.id,
            "citation_id": field.id,
            "field_name": field.field_name,
            "value": field.normalized_value,
            "source_locator": field.source_locator,
            "document_id": field.document_id,
        }
        for field in fields
    ]


def _findings_tool(db: Session, case_id: str) -> list[dict[str, Any]]:
    findings = db.scalars(
        select(ValidationFinding).where(ValidationFinding.case_id == case_id)
    ).all()
    return [
        {
            "id": finding.id,
            "citation_id": finding.id,
            "rule_code": finding.rule_code,
            "severity": finding.severity,
            "message": finding.message,
            "evidence": finding.evidence_json,
        }
        for finding in findings
    ]


def _documents_tool(db: Session, case_id: str) -> list[dict[str, Any]]:
    documents = db.scalars(select(Document).where(Document.case_id == case_id)).all()
    return [
        {
            "id": document.id,
            "citation_id": document.id,
            "type": document.document_type,
            "filename": document.original_filename,
            "extraction_status": document.extraction_status,
            "metadata": document.metadata_json,
        }
        for document in documents
    ]


def collect_agent_context(
    db: Session,
    case: Case,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    tool_calls: list[dict[str, Any]] = []

    case_result = _case_tool(case)
    tool_calls.append({"name": "get_case", "arguments": {"case_id": case.id}, "result_count": 1})

    fields_result = _fields_tool(db, case.id)
    tool_calls.append(
        {
            "name": "get_extracted_fields",
            "arguments": {"case_id": case.id},
            "result_count": len(fields_result),
        }
    )

    findings_result = _findings_tool(db, case.id)
    tool_calls.append(
        {
            "name": "get_validation_findings",
            "arguments": {"case_id": case.id},
            "result_count": len(findings_result),
        }
    )

    documents_result = _documents_tool(db, case.id)
    tool_calls.append(
        {
            "name": "get_document_evidence",
            "arguments": {"case_id": case.id},
            "result_count": len(documents_result),
        }
    )

    policy_result = {
        "citation_id": "policy:financing_readiness_demo",
        "policy": DEMO_POLICY,
    }
    tool_calls.append(
        {
            "name": "retrieve_demo_policy",
            "arguments": {"query": "financing readiness"},
            "result_count": 1,
        }
    )

    context = {
        "case": case_result,
        "extracted_fields": fields_result,
        "validation_findings": findings_result,
        "documents": documents_result,
        "policy": policy_result,
    }
    return context, tool_calls


def _expected_action(case: Case) -> str:
    if case.stage == CaseStage.MANUAL_INVESTIGATION.value:
        return CaseStage.MANUAL_INVESTIGATION.value
    if case.stage == CaseStage.NEEDS_INFORMATION.value:
        return CaseStage.NEEDS_INFORMATION.value
    return CaseStage.READY_FOR_HUMAN_REVIEW.value


def _allowed_citations(context: dict[str, Any]) -> set[str]:
    allowed = {context["policy"]["citation_id"]}
    allowed.update(value["citation_id"] for value in context["case"]["values"].values())
    for key in ("extracted_fields", "validation_findings", "documents"):
        allowed.update(item["citation_id"] for item in context[key])
    return allowed


def _validate_grounding(
    output: AgentRecommendation,
    context: dict[str, Any],
    case: Case,
) -> list[str]:
    errors: list[str] = []
    allowed = _allowed_citations(context)
    invalid_citations = [
        item.citation_id for item in output.evidence_summary if item.citation_id not in allowed
    ]
    if invalid_citations:
        errors.append(f"Unknown citation IDs: {', '.join(invalid_citations)}")
    finding_ids = {finding["id"] for finding in context["validation_findings"]}
    invalid_findings = [
        item.finding_id for item in output.unresolved_findings if item.finding_id not in finding_ids
    ]
    if invalid_findings:
        errors.append(f"Unknown finding IDs: {', '.join(invalid_findings)}")
    expected = _expected_action(case)
    if output.recommended_action != expected:
        errors.append(
            f"recommended_action must be {expected} because deterministic routing is authoritative"
        )
    if expected == CaseStage.NEEDS_INFORMATION.value and not output.follow_up_draft:
        errors.append("follow_up_draft is required when the route is NEEDS_INFORMATION")
    if expected != CaseStage.NEEDS_INFORMATION.value and output.follow_up_draft is not None:
        errors.append("follow_up_draft must be null unless the route is NEEDS_INFORMATION")
    return errors


def _deterministic_recommendation(
    case: Case,
    context: dict[str, Any],
) -> AgentRecommendation:
    findings = context["validation_findings"]
    case_values = context["case"]["values"]
    action = _expected_action(case)
    evidence: list[EvidenceCitation] = [
        EvidenceCitation(
            citation_id=case_values["legal_business_name"]["citation_id"],
            label="Intake record",
            claim=f"The intake names {case.legal_business_name} as the applicant business.",
        ),
        EvidenceCitation(
            citation_id=case_values["requested_amount"]["citation_id"],
            label="Funding request",
            claim=f"The request is {case.currency} {case.requested_amount:,.2f}.",
        ),
    ]
    if findings:
        evidence.extend(
            EvidenceCitation(
                citation_id=finding["id"],
                label=finding["rule_code"].replace("_", " ").title(),
                claim=finding["message"],
            )
            for finding in findings[:4]
        )
    else:
        evidence.append(
            EvidenceCitation(
                citation_id=context["policy"]["citation_id"],
                label="Synthetic demo policy",
                claim=(
                    "The required document and consistency checks completed without "
                    "an open finding."
                ),
            )
        )

    unresolved = [
        UnresolvedFinding(
            finding_id=finding["id"],
            explanation=finding["message"],
        )
        for finding in findings
    ]
    missing = [
        MissingInformationItem(
            item=finding["message"],
            rule_code=finding["rule_code"],
            reason=("The synthetic demo policy requires the reviewer to resolve this finding."),
        )
        for finding in findings
        if finding["rule_code"]
        in {
            "REQUIRED_DOCUMENT_MISSING",
            "REQUIRED_FIELD_MISSING",
            "FINANCIAL_EVIDENCE_STALE",
        }
    ]
    follow_up = None
    if missing:
        requests = "\n".join(f"- {item.item}" for item in missing)
        follow_up = (
            f"Subject: Information needed for {case.reference}\n\n"
            f"Hello {case.contact_name},\n\n"
            "We reviewed the financing-readiness package and need the items below "
            "before the review can continue:\n"
            f"{requests}\n\n"
            "Please reply with updated synthetic demo documents. No financing "
            "decision has been made."
        )

    if action == CaseStage.READY_FOR_HUMAN_REVIEW.value:
        reason = (
            "The configured completeness and consistency checks finished without "
            "a blocking finding."
        )
    elif action == CaseStage.MANUAL_INVESTIGATION.value:
        reason = "A duplicate or identity conflict requires a reviewer to resolve the evidence."
    else:
        reason = "One or more required or current items are missing from the package."

    return AgentRecommendation(
        case_summary=(
            f"{case.legal_business_name} submitted a {case.currency} "
            f"{case.requested_amount:,.2f} request to "
            f"{case.funding_purpose.rstrip(' .').lower()}. "
            f"The package has a transparent readiness score of "
            f"{case.completeness_score}/100."
        ),
        evidence_summary=evidence,
        unresolved_findings=unresolved,
        missing_information=missing,
        recommended_action=action,
        recommendation_reason=reason,
        follow_up_draft=follow_up,
        limitations=[
            "This review uses synthetic data and a buildathon demonstration policy.",
            "The recommendation concerns workflow readiness, not creditworthiness or eligibility.",
        ],
    )


def _prompt(
    context: dict[str, Any],
    expected_action: str,
    validation_errors: list[str] | None = None,
) -> str:
    repair = ""
    if validation_errors:
        repair = "\nYour prior response failed validation:\n- " + "\n- ".join(validation_errors)
    guardrails = (
        "Use only the tool results below. Cite exact citation_id values. "
        "Do not infer creditworthiness, legal status, ownership, revenue, or eligibility. "
        "Keep deterministic findings intact. The only allowed recommended_action for "
        f"this run is {expected_action}. A person will make the consequential decision. "
        "Set follow_up_draft only for NEEDS_INFORMATION; set it to null for every other route. "
        "Return a JSON object that matches the supplied schema. Do not include hidden "
        "reasoning or Markdown."
    )
    return f"""You are the bounded review agent inside OpsLedger AI.

{guardrails}
{repair}

TOOL RESULTS
{json.dumps(context, default=str, separators=(",", ":"))}
"""


def _extract_usage(stdout: str) -> dict[str, Any]:
    usage: dict[str, Any] = {}
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        candidate = event.get("usage") or event.get("turn", {}).get("usage")
        if isinstance(candidate, dict):
            usage = candidate
    return usage


def _run_codex(prompt: str, settings: Settings) -> ProviderResult:
    desktop_binary = Path("/Applications/ChatGPT.app/Contents/Resources/codex")
    codex = settings.codex_binary or shutil.which("codex")
    if not codex and desktop_binary.is_file():
        codex = str(desktop_binary)
    if not codex:
        raise RuntimeError("CODEX_NOT_INSTALLED")
    with tempfile.TemporaryDirectory(prefix="opsledger-agent-") as temporary_dir:
        workdir = Path(temporary_dir)
        schema_path = workdir / "agent-output.schema.json"
        output_path = workdir / "agent-output.json"
        schema_path.write_text(
            json.dumps(AgentRecommendation.model_json_schema()),
            encoding="utf-8",
        )
        command = [
            codex,
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--model",
            settings.codex_model,
            "--config",
            f'model_reasoning_effort="{settings.codex_reasoning_effort}"',
            "--output-schema",
            str(schema_path),
            "--output-last-message",
            str(output_path),
            "--json",
            "--cd",
            str(workdir),
            "-",
        ]
        completed = subprocess.run(
            command,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=settings.codex_timeout_seconds,
            check=False,
            env=os.environ.copy(),
        )
        if completed.returncode != 0 or not output_path.exists():
            raise RuntimeError("CODEX_RUN_FAILED")
        raw_output = output_path.read_text(encoding="utf-8").strip()
        if raw_output.startswith("```"):
            raw_output = raw_output.strip("`").removeprefix("json").strip()
        output = AgentRecommendation.model_validate_json(raw_output)
        return ProviderResult(
            output=output,
            provider="codex_cli",
            model=settings.codex_model,
            token_usage=_extract_usage(completed.stdout),
        )


def _generate(
    case: Case,
    context: dict[str, Any],
    prompt: str,
    settings: Settings,
) -> ProviderResult:
    provider = settings.model_provider.lower()
    if provider in {"codex_luna", "auto"}:
        try:
            return _run_codex(prompt, settings)
        except (RuntimeError, subprocess.TimeoutExpired, ValidationError):
            if settings.model_strict:
                raise
            return ProviderResult(
                output=_deterministic_recommendation(case, context),
                provider="deterministic_fallback",
                model="opsledger-rules-2026-08-13",
                fallback_reason="Local Codex run was unavailable or invalid.",
            )
    return ProviderResult(
        output=_deterministic_recommendation(case, context),
        provider="deterministic",
        model="opsledger-rules-2026-08-13",
    )


def run_agent_review(
    db: Session,
    case: Case,
    *,
    correlation_id: str,
    settings: Settings | None = None,
) -> AgentRun:
    settings = settings or get_settings()
    context, tool_calls = collect_agent_context(db, case)
    serialized_context = json.dumps(context, default=str, sort_keys=True)
    agent_run = AgentRun(
        case_id=case.id,
        model_provider=settings.model_provider,
        model_name=settings.codex_model,
        input_hash=hashlib.sha256(serialized_context.encode()).hexdigest(),
        tool_calls_json=tool_calls,
    )
    db.add(agent_run)
    db.flush()

    started = time.perf_counter()
    validation_errors: list[str] | None = None
    provider_result: ProviderResult | None = None
    try:
        for _attempt in range(2):
            provider_result = _generate(
                case,
                context,
                _prompt(context, _expected_action(case), validation_errors),
                settings,
            )
            validation_errors = _validate_grounding(
                provider_result.output,
                context,
                case,
            )
            if not validation_errors:
                break
        if validation_errors or provider_result is None:
            raise ValueError("Agent output did not pass grounding validation")

        agent_run.model_provider = provider_result.provider
        agent_run.model_name = provider_result.model
        agent_run.structured_output_json = provider_result.output.model_dump(mode="json")
        agent_run.token_usage = provider_result.token_usage
        agent_run.status = "COMPLETED"
        agent_run.completed_at = datetime.now(UTC)
        agent_run.latency_ms = int((time.perf_counter() - started) * 1000)
        if provider_result.fallback_reason:
            agent_run.error_code = "PROVIDER_FALLBACK"

        target = CaseStage(provider_result.output.recommended_action)
        transition_case(
            db,
            case,
            target,
            correlation_id=correlation_id,
            actor_type="agent",
            actor_id=agent_run.id,
            summary=f"Agent recommendation validated: {target.value}",
        )
        record_event(
            db,
            case_id=case.id,
            correlation_id=correlation_id,
            actor_type="agent",
            actor_id=agent_run.id,
            event_type="AGENT_RECOMMENDATION_SAVED",
            summary="Saved a schema-validated recommendation with evidence citations",
            new_state={
                "agent_run_id": agent_run.id,
                "provider": agent_run.model_provider,
            },
        )
    except Exception:
        agent_run.status = "FAILED"
        agent_run.error_code = "AGENT_OUTPUT_INVALID"
        agent_run.completed_at = datetime.now(UTC)
        agent_run.latency_ms = int((time.perf_counter() - started) * 1000)
        raise
    return agent_run
