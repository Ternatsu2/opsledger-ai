from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .models import Case, Document, ExtractedField, ValidationFinding
from .policy import DEMO_POLICY
from .schemas import CaseStage

MANUAL_RULES = {
    "DUPLICATE_BUSINESS_CONTACT",
    "DUPLICATE_REGISTRATION",
    "DUPLICATE_DOCUMENT",
    "LEGAL_NAME_MISMATCH",
}
NEEDS_INFORMATION_RULES = {
    "REQUIRED_FIELD_MISSING",
    "REQUIRED_DOCUMENT_MISSING",
    "FINANCIAL_EVIDENCE_STALE",
    "FINANCIAL_DATE_INVALID",
    "REGISTRATION_NUMBER_MISMATCH",
    "JURISDICTION_MISMATCH",
    "REVENUE_TOTAL_MISMATCH",
    "CURRENCY_MISMATCH",
    "CURRENCY_NOT_SUPPORTED",
}


def normalize_business_name(value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9 ]", " ", value.upper())
    tokens = [
        token for token in normalized.split() if token not in {"LTD", "LIMITED", "INC", "LLC"}
    ]
    return " ".join(tokens)


def _add_finding(
    db: Session,
    case_id: str,
    rule_code: str,
    severity: str,
    message: str,
    evidence: list[dict[str, Any]],
) -> None:
    db.add(
        ValidationFinding(
            case_id=case_id,
            rule_code=rule_code,
            severity=severity,
            message=message,
            evidence_json=evidence,
        )
    )


def _field_values(fields: list[ExtractedField], field_name: str) -> list[ExtractedField]:
    return [field for field in fields if field.field_name == field_name]


def _older_than_case(case: Case) -> Any:
    return or_(
        Case.created_at < case.created_at,
        and_(Case.created_at == case.created_at, Case.id < case.id),
    )


def _completeness(
    case: Case,
    documents: list[Document],
) -> tuple[int, list[dict[str, Any]]]:
    items: list[dict[str, Any]] = []
    required_fields = [
        ("legal_business_name", "Legal business name", 8),
        ("registration_number", "Registration number", 8),
        ("jurisdiction", "Jurisdiction", 6),
        ("requested_amount", "Requested amount", 6),
        ("funding_purpose", "Funding purpose", 6),
        ("contact_email", "Contact email", 6),
    ]
    for field_name, label, weight in required_fields:
        complete = bool(getattr(case, field_name, None))
        items.append(
            {
                "code": field_name,
                "label": label,
                "weight": weight,
                "complete": complete,
            }
        )

    present_types = {
        document.document_type for document in documents if document.upload_status == "STORED"
    }
    for document_type in DEMO_POLICY["required_documents"]:
        items.append(
            {
                "code": document_type,
                "label": document_type.replace("_", " ").title(),
                "weight": 15,
                "complete": document_type in present_types,
            }
        )
    return sum(item["weight"] for item in items if item["complete"]), items


def run_validation(
    db: Session,
    case: Case,
    settings: Settings | None = None,
) -> CaseStage:
    settings = settings or get_settings()
    db.execute(delete(ValidationFinding).where(ValidationFinding.case_id == case.id))
    documents = list(db.scalars(select(Document).where(Document.case_id == case.id)))
    fields = list(db.scalars(select(ExtractedField).where(ExtractedField.case_id == case.id)))

    score, breakdown = _completeness(case, documents)
    case.completeness_score = score
    case.completeness_breakdown = breakdown

    for item in breakdown:
        if item["complete"]:
            continue
        if item["code"] in DEMO_POLICY["required_documents"]:
            code = "REQUIRED_DOCUMENT_MISSING"
        else:
            code = "REQUIRED_FIELD_MISSING"
        _add_finding(
            db,
            case.id,
            code,
            "BLOCKING",
            f"{item['label']} is required by the synthetic demo policy.",
            [{"citation_id": f"policy:{item['code']}", "label": item["label"]}],
        )

    for field in _field_values(fields, "legal_business_name"):
        expected = normalize_business_name(case.legal_business_name)
        observed = normalize_business_name(str(field.normalized_value))
        similarity = SequenceMatcher(None, expected, observed).ratio()
        if similarity < DEMO_POLICY["legal_name_similarity_threshold"]:
            _add_finding(
                db,
                case.id,
                "LEGAL_NAME_MISMATCH",
                "HIGH",
                "A supporting document uses a business name that does not match the intake record.",
                [
                    {
                        "citation_id": field.id,
                        "label": field.source_locator,
                        "observed": field.raw_value,
                    },
                    {
                        "citation_id": f"case:{case.id}:legal_business_name",
                        "label": "Intake record",
                    },
                ],
            )

    for field in _field_values(fields, "registration_number"):
        observed = re.sub(r"[^A-Z0-9]", "", str(field.normalized_value).upper())
        expected = re.sub(r"[^A-Z0-9]", "", case.registration_number.upper())
        if observed != expected:
            _add_finding(
                db,
                case.id,
                "REGISTRATION_NUMBER_MISMATCH",
                "HIGH",
                "A supporting document contains a different registration number.",
                [
                    {
                        "citation_id": field.id,
                        "label": field.source_locator,
                        "observed": field.raw_value,
                    }
                ],
            )

    for field in _field_values(fields, "jurisdiction"):
        observed = " ".join(str(field.normalized_value).casefold().split())
        expected = " ".join(case.jurisdiction.casefold().split())
        if observed != expected:
            _add_finding(
                db,
                case.id,
                "JURISDICTION_MISMATCH",
                "HIGH",
                "A supporting document contains a different jurisdiction.",
                [
                    {
                        "citation_id": field.id,
                        "label": field.source_locator,
                        "observed": field.raw_value,
                    }
                ],
            )

    duplicate_case = db.scalar(
        select(Case).where(
            Case.id != case.id,
            Case.registration_number == case.registration_number,
            Case.stage != CaseStage.CLOSED.value,
            _older_than_case(case),
        )
    )
    if duplicate_case:
        _add_finding(
            db,
            case.id,
            "DUPLICATE_REGISTRATION",
            "HIGH",
            f"Registration number matches open case {duplicate_case.reference}.",
            [
                {
                    "citation_id": f"case:{duplicate_case.id}:registration_number",
                    "label": duplicate_case.reference,
                }
            ],
        )

    same_contact_cases = db.scalars(
        select(Case).where(
            Case.id != case.id,
            func.lower(Case.contact_email) == case.contact_email.lower(),
            Case.stage != CaseStage.CLOSED.value,
            _older_than_case(case),
        )
    ).all()
    duplicate_identity = next(
        (
            candidate
            for candidate in same_contact_cases
            if normalize_business_name(candidate.legal_business_name)
            == normalize_business_name(case.legal_business_name)
        ),
        None,
    )
    if duplicate_identity:
        _add_finding(
            db,
            case.id,
            "DUPLICATE_BUSINESS_CONTACT",
            "HIGH",
            f"Business name and contact email match open case {duplicate_identity.reference}.",
            [
                {
                    "citation_id": f"case:{duplicate_identity.id}:contact_email",
                    "label": duplicate_identity.reference,
                }
            ],
        )

    for document in documents:
        duplicate_document = db.scalar(
            select(Document).where(
                Document.case_id != case.id,
                Document.sha256 == document.sha256,
                or_(
                    Document.uploaded_at < document.uploaded_at,
                    and_(Document.uploaded_at == document.uploaded_at, Document.id < document.id),
                ),
            )
        )
        if duplicate_document:
            _add_finding(
                db,
                case.id,
                "DUPLICATE_DOCUMENT",
                "HIGH",
                "A document has already been uploaded to another case.",
                [{"citation_id": document.id, "label": document.original_filename}],
            )
            break

    revenue_document = next(
        (doc for doc in documents if doc.document_type == "REVENUE_STATEMENT"),
        None,
    )
    if revenue_document and revenue_document.extraction_status == "EXTRACTED":
        metadata = revenue_document.metadata_json
        as_of_raw = metadata.get("as_of_date")
        if as_of_raw:
            age_days = (settings.demo_policy_as_of_date - date.fromisoformat(as_of_raw)).days
            if age_days < 0:
                _add_finding(
                    db,
                    case.id,
                    "FINANCIAL_DATE_INVALID",
                    "BLOCKING",
                    "Revenue evidence is dated after the configured demo review date.",
                    [
                        {
                            "citation_id": revenue_document.id,
                            "label": revenue_document.original_filename,
                        }
                    ],
                )
            elif age_days > DEMO_POLICY["financial_evidence_max_age_days"]:
                _add_finding(
                    db,
                    case.id,
                    "FINANCIAL_EVIDENCE_STALE",
                    "BLOCKING",
                    f"Revenue evidence is {age_days} days old; the demo policy allows 180 days.",
                    [
                        {
                            "citation_id": revenue_document.id,
                            "label": revenue_document.original_filename,
                        }
                    ],
                )
        declared = Decimal(str(metadata.get("declared_total", "0")))
        computed = Decimal(str(metadata.get("computed_total", "0")))
        tolerance = max(
            Decimal(str(DEMO_POLICY["revenue_total_tolerance"])),
            abs(declared) * Decimal("0.01"),
        )
        if abs(declared - computed) > tolerance:
            _add_finding(
                db,
                case.id,
                "REVENUE_TOTAL_MISMATCH",
                "HIGH",
                "The declared revenue total does not match the sum of the detail rows.",
                [
                    {
                        "citation_id": revenue_document.id,
                        "label": revenue_document.original_filename,
                        "declared": str(declared),
                        "computed": str(computed),
                    }
                ],
            )

    for document in documents:
        evidence_currency = str(document.metadata_json.get("currency", "")).upper()
        if evidence_currency and evidence_currency != case.currency:
            _add_finding(
                db,
                case.id,
                "CURRENCY_MISMATCH",
                "HIGH",
                "A financial document uses a currency that conflicts with the intake record.",
                [
                    {
                        "citation_id": document.id,
                        "label": document.original_filename,
                        "observed": evidence_currency,
                    }
                ],
            )

    if case.currency not in DEMO_POLICY["supported_currencies"]:
        _add_finding(
            db,
            case.id,
            "CURRENCY_NOT_SUPPORTED",
            "BLOCKING",
            f"{case.currency} is outside the currencies configured for this demo.",
            [
                {
                    "citation_id": f"case:{case.id}:currency",
                    "label": "Intake currency",
                }
            ],
        )

    db.flush()
    rule_codes = set(
        db.scalars(select(ValidationFinding.rule_code).where(ValidationFinding.case_id == case.id))
    )
    if rule_codes & MANUAL_RULES:
        return CaseStage.MANUAL_INVESTIGATION
    if rule_codes & NEEDS_INFORMATION_RULES or rule_codes:
        return CaseStage.NEEDS_INFORMATION
    return CaseStage.AGENT_REVIEW
