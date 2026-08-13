from __future__ import annotations

from sqlalchemy import select

from opsledger.models import Case, Document, ExtractedField, ValidationFinding
from opsledger.schemas import CaseStage
from opsledger.seed import seed_demo_data
from opsledger.validation import normalize_business_name, run_validation

from .conftest import TestContext


def _cases(context: TestContext) -> dict[str, Case]:
    assert seed_demo_data(context.db, context.settings)
    return {
        case.reference: case for case in context.db.scalars(select(Case).order_by(Case.reference))
    }


def _rule_codes(context: TestContext, case: Case) -> set[str]:
    return set(
        context.db.scalars(
            select(ValidationFinding.rule_code).where(ValidationFinding.case_id == case.id)
        )
    )


def test_business_name_normalization_removes_punctuation_and_company_suffixes() -> None:
    assert normalize_business_name("Island Harvest Foods, Ltd.") == "ISLAND HARVEST FOODS"
    assert normalize_business_name("  BLUE-shore Repairs LLC ") == "BLUE SHORE REPAIRS"


def test_revalidating_the_original_case_does_not_mark_it_as_the_later_duplicate(
    context: TestContext,
) -> None:
    case_a = _cases(context)["OPS-2026-0001"]

    target = run_validation(context.db, case_a, context.settings)
    context.db.flush()

    assert target == CaseStage.AGENT_REVIEW
    assert not _rule_codes(context, case_a)


def test_identity_currency_date_and_arithmetic_rules_are_deterministic(
    context: TestContext,
) -> None:
    case_a = _cases(context)["OPS-2026-0001"]
    registration_fields = list(
        context.db.scalars(
            select(ExtractedField).where(
                ExtractedField.case_id == case_a.id,
                ExtractedField.field_name.in_(["registration_number", "jurisdiction"]),
            )
        )
    )
    for field in registration_fields:
        if field.field_name == "registration_number":
            field.normalized_value = "DIFFERENT-900"
        else:
            field.normalized_value = "Saint Lucia"

    revenue = context.db.scalar(
        select(Document).where(
            Document.case_id == case_a.id,
            Document.document_type == "REVENUE_STATEMENT",
        )
    )
    assert revenue is not None
    revenue.metadata_json = {
        **revenue.metadata_json,
        "as_of_date": "2026-08-14",
        "declared_total": "999999",
        "currency": "USD",
    }
    case_a.currency = "EUR"

    target = run_validation(context.db, case_a, context.settings)
    context.db.flush()
    rules = _rule_codes(context, case_a)

    assert target == CaseStage.NEEDS_INFORMATION
    assert {
        "REGISTRATION_NUMBER_MISMATCH",
        "JURISDICTION_MISMATCH",
        "FINANCIAL_DATE_INVALID",
        "REVENUE_TOTAL_MISMATCH",
        "CURRENCY_MISMATCH",
        "CURRENCY_NOT_SUPPORTED",
    }.issubset(rules)


def test_later_business_and_document_reuse_routes_to_manual_investigation(
    context: TestContext,
) -> None:
    cases = _cases(context)
    case_a = cases["OPS-2026-0001"]
    case_b = cases["OPS-2026-0002"]
    case_b.legal_business_name = case_a.legal_business_name
    case_b.contact_email = case_a.contact_email

    first_a_document = context.db.scalar(
        select(Document).where(Document.case_id == case_a.id).order_by(Document.uploaded_at)
    )
    first_b_document = context.db.scalar(
        select(Document).where(Document.case_id == case_b.id).order_by(Document.uploaded_at)
    )
    assert first_a_document is not None and first_b_document is not None
    first_b_document.sha256 = first_a_document.sha256

    target = run_validation(context.db, case_b, context.settings)
    context.db.flush()
    rules = _rule_codes(context, case_b)

    assert target == CaseStage.MANUAL_INVESTIGATION
    assert "DUPLICATE_BUSINESS_CONTACT" in rules
    assert "DUPLICATE_DOCUMENT" in rules
