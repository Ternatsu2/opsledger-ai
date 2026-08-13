from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator


def _utc_iso(value: datetime) -> str:
    normalized = value if value.tzinfo else value.replace(tzinfo=UTC)
    return normalized.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    datetime,
    PlainSerializer(_utc_iso, return_type=str, when_used="json"),
]


class CaseStage(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    INGESTING = "INGESTING"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    VALIDATING = "VALIDATING"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    AGENT_REVIEW = "AGENT_REVIEW"
    READY_FOR_HUMAN_REVIEW = "READY_FOR_HUMAN_REVIEW"
    MANUAL_INVESTIGATION = "MANUAL_INVESTIGATION"
    APPROVED_FOR_NEXT_STAGE = "APPROVED_FOR_NEXT_STAGE"
    CLOSED = "CLOSED"


class CaseCreate(BaseModel):
    legal_business_name: str = Field(min_length=2, max_length=180)
    trading_name: str | None = Field(default=None, max_length=180)
    registration_number: str = Field(min_length=2, max_length=80)
    jurisdiction: str = Field(min_length=2, max_length=80)
    industry: str = Field(min_length=2, max_length=120)
    requested_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="XCD", min_length=3, max_length=3)
    funding_purpose: str = Field(min_length=10, max_length=1200)
    annual_revenue: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    contact_name: str = Field(min_length=2, max_length=160)
    contact_email: EmailStr

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class CaseUpdate(BaseModel):
    assigned_reviewer_id: str | None = Field(default=None, max_length=120)


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    original_filename: str
    document_type: str
    mime_type: str
    sha256: str
    upload_status: str
    extraction_status: str
    page_count: int | None
    metadata_json: dict[str, Any]
    uploaded_at: UtcDateTime
    extracted_at: UtcDateTime | None
    error_code: str | None
    error_message_safe: str | None


class ExtractedFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    field_name: str
    normalized_value: Any
    raw_value: str
    confidence: float
    source_page: int | None
    source_locator: str
    extraction_method: str
    verified_by_human: bool


class FindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    rule_code: str
    severity: str
    status: str
    message: str
    evidence_json: list[dict[str, Any]]
    detected_at: UtcDateTime
    resolved_at: UtcDateTime | None
    resolution_note: str | None
    resolved_by: str | None


class AgentRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workflow_name: str
    model_provider: str
    model_name: str
    prompt_version: str
    tool_calls_json: list[dict[str, Any]]
    structured_output_json: dict[str, Any] | None
    status: str
    started_at: UtcDateTime
    completed_at: UtcDateTime | None
    token_usage: dict[str, Any]
    latency_ms: int | None
    error_code: str | None


class ReviewActionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reviewer_id: str
    action_type: str
    edited_draft: str | None
    rationale: str
    prior_stage: str
    resulting_stage: str
    created_at: UtcDateTime


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str | None
    correlation_id: str
    actor_type: str
    actor_id: str
    event_type: str
    summary: str
    prior_state_json: dict[str, Any]
    new_state_json: dict[str, Any]
    created_at: UtcDateTime


class CaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    reference: str
    legal_business_name: str
    trading_name: str | None
    registration_number: str
    jurisdiction: str
    industry: str
    requested_amount: Decimal
    currency: str
    funding_purpose: str
    annual_revenue: Decimal
    contact_name: str
    contact_email: EmailStr
    stage: CaseStage
    completeness_score: int
    completeness_breakdown: list[dict[str, Any]]
    assigned_reviewer_id: str | None
    created_at: UtcDateTime
    updated_at: UtcDateTime
    version: int


class CaseDetail(CaseRead):
    documents: list[DocumentRead]
    extracted_fields: list[ExtractedFieldRead]
    findings: list[FindingRead]
    agent_runs: list[AgentRunRead]
    review_actions: list[ReviewActionRead]
    audit_events: list[AuditEventRead]


class CaseListItem(CaseRead):
    open_finding_count: int
    issue_codes: list[str]
    last_action: str | None


class ReviewActionType(StrEnum):
    APPROVE_FOR_NEXT_STAGE = "APPROVE_FOR_NEXT_STAGE"
    REQUEST_INFORMATION = "REQUEST_INFORMATION"
    SEND_TO_MANUAL_INVESTIGATION = "SEND_TO_MANUAL_INVESTIGATION"
    EDIT_AGENT_DRAFT = "EDIT_AGENT_DRAFT"
    RECORD_RESOLUTION_NOTE = "RECORD_RESOLUTION_NOTE"
    CLOSE_CASE = "CLOSE_CASE"


class ReviewActionCreate(BaseModel):
    reviewer_id: str = Field(min_length=2, max_length=120)
    action_type: ReviewActionType
    rationale: str = Field(min_length=5, max_length=1500)
    edited_draft: str | None = Field(default=None, max_length=4000)
    finding_id: str | None = None


class CommandResult(BaseModel):
    case: CaseRead
    correlation_id: str
    message: str
    agent_run: AgentRunRead | None = None


class DashboardSummary(BaseModel):
    open_cases: int
    ready_for_review: int
    needs_information: int
    manual_investigation: int
    approved: int
    average_processing_seconds: float | None
    top_failure_reasons: list[dict[str, Any]]
    recent_activity: list[AuditEventRead]


class ApiErrorBody(BaseModel):
    code: str
    message: str
    correlation_id: str
    details: dict[str, Any] | None = None
