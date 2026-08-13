from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from opsledger.fixtures import demo_fixtures
from opsledger.models import AuditEvent, Case, ReviewAction, ValidationFinding
from opsledger.schemas import CaseStage, ReviewActionCreate, ReviewActionType
from opsledger.seed import seed_demo_data
from opsledger.services import (
    apply_review_action,
    build_case_packet,
    create_case,
    get_case_detail,
    process_case,
    store_case_document,
)
from opsledger.state_machine import InvalidTransition, transition_case
from opsledger.storage import Storage

from .conftest import TestContext


def _seeded_cases(context: TestContext) -> dict[str, Case]:
    assert seed_demo_data(context.db, context.settings)
    return {
        case.reference: case for case in context.db.scalars(select(Case).order_by(Case.reference))
    }


def test_three_required_demo_routes(context: TestContext) -> None:
    cases = _seeded_cases(context)

    assert set(cases) == {"OPS-2026-0001", "OPS-2026-0002", "OPS-2026-0003"}
    assert cases["OPS-2026-0001"].stage == "READY_FOR_HUMAN_REVIEW"
    assert cases["OPS-2026-0001"].completeness_score == 100
    assert cases["OPS-2026-0002"].stage == "NEEDS_INFORMATION"
    assert cases["OPS-2026-0002"].completeness_score == 85
    assert cases["OPS-2026-0003"].stage == "MANUAL_INVESTIGATION"


def test_case_b_has_only_document_and_recency_findings(context: TestContext) -> None:
    cases = _seeded_cases(context)
    rule_codes = set(
        context.db.scalars(
            select(ValidationFinding.rule_code).where(
                ValidationFinding.case_id == cases["OPS-2026-0002"].id
            )
        )
    )

    assert rule_codes == {"REQUIRED_DOCUMENT_MISSING", "FINANCIAL_EVIDENCE_STALE"}


def test_case_c_has_identity_and_duplicate_findings(context: TestContext) -> None:
    cases = _seeded_cases(context)
    rule_codes = set(
        context.db.scalars(
            select(ValidationFinding.rule_code).where(
                ValidationFinding.case_id == cases["OPS-2026-0003"].id
            )
        )
    )

    assert rule_codes == {"LEGAL_NAME_MISMATCH", "DUPLICATE_REGISTRATION"}


def test_human_approval_records_rationale_and_audit(context: TestContext) -> None:
    case = _seeded_cases(context)["OPS-2026-0001"]
    action = apply_review_action(
        context.db,
        case,
        ReviewActionCreate(
            reviewer_id="Terry Benjamin Jr.",
            action_type=ReviewActionType.APPROVE_FOR_NEXT_STAGE,
            rationale="Reviewed the complete evidence package and all cited fields.",
        ),
        correlation_id="test-human-approval",
    )
    context.db.commit()

    assert case.stage == "APPROVED_FOR_NEXT_STAGE"
    assert action.resulting_stage == "APPROVED_FOR_NEXT_STAGE"
    saved_action = context.db.scalar(select(ReviewAction).where(ReviewAction.case_id == case.id))
    assert saved_action is not None
    audit = context.db.scalar(
        select(AuditEvent).where(
            AuditEvent.case_id == case.id,
            AuditEvent.event_type == "HUMAN_REVIEW_ACTION",
        )
    )
    assert audit is not None
    assert audit.correlation_id == "test-human-approval"


def test_case_b_draft_is_editable_but_stage_does_not_advance(context: TestContext) -> None:
    case = _seeded_cases(context)["OPS-2026-0002"]
    edited = "Subject: Updated evidence request\n\nPlease provide the two listed items."
    apply_review_action(
        context.db,
        case,
        ReviewActionCreate(
            reviewer_id="Terry Benjamin Jr.",
            action_type=ReviewActionType.EDIT_AGENT_DRAFT,
            rationale="Adjusted the draft for clarity before external use.",
            edited_draft=edited,
        ),
        correlation_id="test-draft-edit",
    )
    context.db.commit()
    detail = get_case_detail(context.db, case.id)

    assert detail is not None
    assert detail.stage == "NEEDS_INFORMATION"
    assert detail.agent_runs[-1].structured_output_json["follow_up_draft"] == edited
    assert not any(event.event_type == "MESSAGE_SENT" for event in detail.audit_events)


def test_review_packet_is_a_pdf(context: TestContext) -> None:
    case = _seeded_cases(context)["OPS-2026-0001"]
    detail = get_case_detail(context.db, case.id)
    assert detail is not None

    packet = build_case_packet(detail)

    assert packet.startswith(b"%PDF")
    assert len(packet) > 2_000


def test_seed_is_safe_to_run_more_than_once(context: TestContext) -> None:
    assert seed_demo_data(context.db, context.settings)
    assert not seed_demo_data(context.db, context.settings)
    assert len(list(context.db.scalars(select(Case)))) == 3


def test_failed_extraction_can_be_retried_after_the_file_is_replaced(
    context: TestContext,
) -> None:
    fixture = demo_fixtures()[0]
    case = create_case(
        context.db,
        fixture.profile.model_copy(update={"registration_number": "RETRY-100"}),
        correlation_id="retry-case",
        reference="OPS-2026-0100",
    )
    storage = Storage(context.settings)
    document = store_case_document(
        context.db,
        case,
        document_type="REGISTRATION_EVIDENCE",
        filename="retry-registration.pdf",
        mime_type="application/pdf",
        content=b"%PDF-not-a-valid-document",
        correlation_id="retry-case",
        storage=storage,
        settings=context.settings,
    )

    process_case(
        context.db,
        case,
        correlation_id="retry-failed",
        storage=storage,
        settings=context.settings,
    )
    assert case.stage == "EXTRACTION_FAILED"
    assert document.error_code == "PDF_UNREADABLE"

    valid_registration = fixture.documents[0]
    storage.put(document.storage_key, valid_registration.content, valid_registration.mime_type)
    process_case(
        context.db,
        case,
        correlation_id="retry-success",
        storage=storage,
        settings=context.settings,
    )

    assert document.extraction_status == "EXTRACTED"
    assert case.stage == "NEEDS_INFORMATION"


def test_invalid_transition_is_rejected_and_audited(context: TestContext) -> None:
    fixture = demo_fixtures()[0]
    case = create_case(
        context.db,
        fixture.profile.model_copy(update={"registration_number": "TRANSITION-100"}),
        correlation_id="transition-case",
        reference="OPS-2026-0101",
    )

    with pytest.raises(InvalidTransition, match="is not allowed"):
        transition_case(
            context.db,
            case,
            CaseStage.APPROVED_FOR_NEXT_STAGE,
            correlation_id="transition-rejected",
            actor_type="user",
            actor_id="test-reviewer",
            summary="This should not be accepted",
        )
    context.db.flush()

    event = context.db.scalar(
        select(AuditEvent).where(
            AuditEvent.case_id == case.id,
            AuditEvent.event_type == "TRANSITION_REJECTED",
        )
    )
    assert event is not None
    assert case.stage == "DRAFT"


def test_audit_events_cannot_be_updated_or_deleted_through_the_orm(
    context: TestContext,
) -> None:
    _seeded_cases(context)
    event = context.db.scalar(select(AuditEvent).limit(1))
    assert event is not None
    event.summary = "Attempted rewrite"
    with pytest.raises(ValueError, match="append-only"):
        context.db.flush()
    context.db.rollback()

    event = context.db.scalar(select(AuditEvent).limit(1))
    assert event is not None
    context.db.delete(event)
    with pytest.raises(ValueError, match="append-only"):
        context.db.flush()


def test_seeded_extraction_matches_the_committed_fixture_contracts(
    context: TestContext,
) -> None:
    cases = _seeded_cases(context)
    fixture_root = Path(__file__).resolve().parents[3] / "fixtures"

    for reference, case in cases.items():
        expected = json.loads((fixture_root / reference / "expected.json").read_text())
        detail = get_case_detail(context.db, case.id)
        assert detail is not None
        values: dict[str, list[object]] = {}
        for field in detail.extracted_fields:
            values.setdefault(field.field_name, []).append(field.normalized_value)

        assert detail.stage == expected["expected_stage"]
        assert detail.completeness_score == expected["expected_completeness_score"]
        assert {finding.rule_code for finding in detail.findings} == set(
            expected["expected_findings"]
        )
        for field_name, expected_value in expected["expected_extracted_values"].items():
            assert expected_value in values[field_name]
