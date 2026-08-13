from __future__ import annotations

import html
import io
from datetime import UTC, datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, selectinload

from .agent import run_agent_review
from .audit import record_event
from .config import Settings, get_settings
from .models import (
    AgentRun,
    AuditEvent,
    Case,
    Document,
    ReviewAction,
    ValidationFinding,
    new_id,
)
from .parsers import ExtractionFailed, extract_document
from .schemas import CaseCreate, CaseStage, ReviewActionCreate, ReviewActionType
from .state_machine import InvalidTransition, transition_case
from .storage import Storage, validate_upload
from .validation import run_validation

DOCUMENT_TYPES = {
    "REGISTRATION_EVIDENCE",
    "REVENUE_STATEMENT",
    "BANK_STATEMENT",
    "OWNERSHIP_DECLARATION",
}


def _next_reference(db: Session) -> str:
    year = datetime.now(UTC).year
    last = db.scalar(
        select(Case.reference)
        .where(Case.reference.like(f"OPS-{year}-%"))
        .order_by(Case.reference.desc())
        .limit(1)
    )
    sequence = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
    return f"OPS-{year}-{sequence:04d}"


def create_case(
    db: Session,
    payload: CaseCreate,
    *,
    correlation_id: str,
    reference: str | None = None,
) -> Case:
    case = Case(
        reference=reference or _next_reference(db),
        **payload.model_dump(),
    )
    db.add(case)
    db.flush()
    record_event(
        db,
        case_id=case.id,
        correlation_id=correlation_id,
        actor_type="user",
        actor_id="demo-operator",
        event_type="CASE_CREATED",
        summary=f"Created synthetic intake case {case.reference}",
        new_state={"stage": CaseStage.DRAFT.value, "reference": case.reference},
    )
    return case


def store_case_document(
    db: Session,
    case: Case,
    *,
    document_type: str,
    filename: str,
    mime_type: str,
    content: bytes,
    correlation_id: str,
    storage: Storage | None = None,
    settings: Settings | None = None,
) -> Document:
    settings = settings or get_settings()
    storage = storage or Storage(settings)
    if document_type not in DOCUMENT_TYPES:
        raise ValueError("Unsupported document type")
    safe_filename, sha256 = validate_upload(
        filename,
        mime_type,
        content,
        settings.max_upload_mb,
    )
    document_id = new_id()
    storage_key = f"{case.id}/{document_id}/{safe_filename}"
    storage.put(storage_key, content, mime_type)
    document = Document(
        id=document_id,
        case_id=case.id,
        original_filename=filename,
        safe_filename=safe_filename,
        document_type=document_type,
        mime_type=mime_type,
        sha256=sha256,
        storage_key=storage_key,
    )
    db.add(document)
    record_event(
        db,
        case_id=case.id,
        correlation_id=correlation_id,
        actor_type="user",
        actor_id="demo-operator",
        event_type="DOCUMENT_STORED",
        summary=f"Stored {document_type.replace('_', ' ').lower()} for {case.reference}",
        new_state={"document_id": document.id, "sha256": sha256},
    )
    return document


def process_case(
    db: Session,
    case: Case,
    *,
    correlation_id: str,
    storage: Storage | None = None,
    settings: Settings | None = None,
) -> Case:
    settings = settings or get_settings()
    storage = storage or Storage(settings)
    current = CaseStage(case.stage)
    if current == CaseStage.DRAFT:
        transition_case(
            db,
            case,
            CaseStage.SUBMITTED,
            correlation_id=correlation_id,
            actor_type="user",
            actor_id="demo-operator",
            summary="Submitted the financing-readiness package",
        )
        current = CaseStage.SUBMITTED

    if current not in {
        CaseStage.SUBMITTED,
        CaseStage.EXTRACTION_FAILED,
        CaseStage.NEEDS_INFORMATION,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.READY_FOR_HUMAN_REVIEW,
    }:
        raise InvalidTransition(f"Case cannot be processed from {current.value}")

    transition_case(
        db,
        case,
        CaseStage.INGESTING,
        correlation_id=correlation_id,
        actor_type="system",
        actor_id="processing-service",
        summary="Started document extraction",
    )
    db.flush()
    documents = db.scalars(select(Document).where(Document.case_id == case.id)).all()
    failures = 0
    for document in documents:
        try:
            extract_document(db, document, storage)
            record_event(
                db,
                case_id=case.id,
                correlation_id=correlation_id,
                actor_type="system",
                actor_id="document-parser",
                event_type="DOCUMENT_EXTRACTED",
                summary=f"Extracted {document.original_filename}",
                new_state={
                    "document_id": document.id,
                    "extraction_status": document.extraction_status,
                },
            )
        except ExtractionFailed as exc:
            failures += 1
            record_event(
                db,
                case_id=case.id,
                correlation_id=correlation_id,
                actor_type="system",
                actor_id="document-parser",
                event_type="DOCUMENT_EXTRACTION_FAILED",
                summary=str(exc),
                new_state={"document_id": document.id, "error_code": exc.code},
            )

    db.flush()

    if failures:
        transition_case(
            db,
            case,
            CaseStage.EXTRACTION_FAILED,
            correlation_id=correlation_id,
            actor_type="system",
            actor_id="processing-service",
            summary=f"Extraction stopped with {failures} failed document(s)",
        )
        return case

    transition_case(
        db,
        case,
        CaseStage.VALIDATING,
        correlation_id=correlation_id,
        actor_type="system",
        actor_id="validation-engine",
        summary="Started deterministic validation",
    )
    target = run_validation(db, case, settings)
    transition_case(
        db,
        case,
        target,
        correlation_id=correlation_id,
        actor_type="system",
        actor_id="validation-engine",
        summary=f"Deterministic validation routed the case to {target.value}",
    )
    finding_count = db.scalar(
        select(func.count(ValidationFinding.id)).where(ValidationFinding.case_id == case.id)
    )
    record_event(
        db,
        case_id=case.id,
        correlation_id=correlation_id,
        actor_type="system",
        actor_id="validation-engine",
        event_type="VALIDATION_COMPLETED",
        summary=f"Completed deterministic checks with {finding_count} finding(s)",
        new_state={
            "finding_count": finding_count,
            "completeness_score": case.completeness_score,
        },
    )
    return case


def agent_review_case(
    db: Session,
    case: Case,
    *,
    correlation_id: str,
    settings: Settings | None = None,
) -> AgentRun:
    if CaseStage(case.stage) not in {
        CaseStage.AGENT_REVIEW,
        CaseStage.NEEDS_INFORMATION,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.READY_FOR_HUMAN_REVIEW,
    }:
        raise InvalidTransition(f"Agent review cannot run from {case.stage}")
    return run_agent_review(
        db,
        case,
        correlation_id=correlation_id,
        settings=settings,
    )


def apply_review_action(
    db: Session,
    case: Case,
    payload: ReviewActionCreate,
    *,
    correlation_id: str,
) -> ReviewAction:
    current = CaseStage(case.stage)
    targets = {
        ReviewActionType.APPROVE_FOR_NEXT_STAGE: CaseStage.APPROVED_FOR_NEXT_STAGE,
        ReviewActionType.REQUEST_INFORMATION: CaseStage.NEEDS_INFORMATION,
        ReviewActionType.SEND_TO_MANUAL_INVESTIGATION: CaseStage.MANUAL_INVESTIGATION,
        ReviewActionType.CLOSE_CASE: CaseStage.CLOSED,
    }
    target = targets.get(payload.action_type, current)
    if payload.action_type == ReviewActionType.EDIT_AGENT_DRAFT and not payload.edited_draft:
        raise ValueError("An edited draft is required")
    if payload.action_type == ReviewActionType.RECORD_RESOLUTION_NOTE and not payload.finding_id:
        raise ValueError("A finding ID is required for a resolution note")

    prior_stage = case.stage
    transition_case(
        db,
        case,
        target,
        correlation_id=correlation_id,
        actor_type="user",
        actor_id=payload.reviewer_id,
        summary=f"Reviewer recorded {payload.action_type.value}",
    )
    action = ReviewAction(
        case_id=case.id,
        reviewer_id=payload.reviewer_id,
        action_type=payload.action_type.value,
        edited_draft=payload.edited_draft,
        rationale=payload.rationale,
        prior_stage=prior_stage,
        resulting_stage=case.stage,
    )
    db.add(action)

    if payload.action_type == ReviewActionType.EDIT_AGENT_DRAFT:
        latest_run = db.scalar(
            select(AgentRun)
            .where(AgentRun.case_id == case.id, AgentRun.status == "COMPLETED")
            .order_by(AgentRun.started_at.desc())
            .limit(1)
        )
        if latest_run and latest_run.structured_output_json:
            updated = dict(latest_run.structured_output_json)
            updated["follow_up_draft"] = payload.edited_draft
            latest_run.structured_output_json = updated

    if payload.action_type == ReviewActionType.RECORD_RESOLUTION_NOTE:
        finding = db.scalar(
            select(ValidationFinding).where(
                ValidationFinding.id == payload.finding_id,
                ValidationFinding.case_id == case.id,
            )
        )
        if not finding:
            raise ValueError("Finding not found on this case")
        finding.status = "RESOLVED"
        finding.resolution_note = payload.rationale
        finding.resolved_by = payload.reviewer_id
        finding.resolved_at = datetime.now(UTC)

    record_event(
        db,
        case_id=case.id,
        correlation_id=correlation_id,
        actor_type="user",
        actor_id=payload.reviewer_id,
        event_type="HUMAN_REVIEW_ACTION",
        summary=f"Reviewer recorded {payload.action_type.value.replace('_', ' ').lower()}",
        prior_state={"stage": prior_stage},
        new_state={"stage": case.stage, "review_action_id": action.id},
    )
    return action


DETAIL_LOAD_OPTIONS = (
    selectinload(Case.documents),
    selectinload(Case.extracted_fields),
    selectinload(Case.findings),
    selectinload(Case.agent_runs),
    selectinload(Case.review_actions),
    selectinload(Case.audit_events),
)


def get_case_detail(db: Session, case_id: str) -> Case | None:
    return db.scalar(select(Case).where(Case.id == case_id).options(*DETAIL_LOAD_OPTIONS))


def dashboard_data(db: Session) -> dict[str, Any]:
    open_cases = (
        db.scalar(select(func.count(Case.id)).where(Case.stage != CaseStage.CLOSED.value)) or 0
    )
    stage_counts = dict(
        db.execute(select(Case.stage, func.count(Case.id)).group_by(Case.stage)).all()
    )
    average_latency = db.scalar(
        select(func.avg(AgentRun.latency_ms)).where(AgentRun.status == "COMPLETED")
    )
    top_reasons = db.execute(
        select(ValidationFinding.rule_code, func.count(ValidationFinding.id))
        .group_by(ValidationFinding.rule_code)
        .order_by(desc(func.count(ValidationFinding.id)))
        .limit(5)
    ).all()
    recent_activity = db.scalars(
        select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(10)
    ).all()
    return {
        "open_cases": open_cases,
        "ready_for_review": stage_counts.get(CaseStage.READY_FOR_HUMAN_REVIEW.value, 0),
        "needs_information": stage_counts.get(CaseStage.NEEDS_INFORMATION.value, 0),
        "manual_investigation": stage_counts.get(CaseStage.MANUAL_INVESTIGATION.value, 0),
        "approved": stage_counts.get(CaseStage.APPROVED_FOR_NEXT_STAGE.value, 0),
        "average_processing_seconds": (
            round(float(average_latency) / 1000, 2) if average_latency is not None else None
        ),
        "top_failure_reasons": [
            {"rule_code": rule_code, "count": count} for rule_code, count in top_reasons
        ],
        "recent_activity": recent_activity,
    }


def build_case_packet(case: Case) -> bytes:
    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"{case.reference} financing-readiness packet",
        author="OpsLedger AI",
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="PacketTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#17201d"),
            spaceAfter=10,
        )
    )
    story: list[Any] = [
        Paragraph("OpsLedger AI", styles["PacketTitle"]),
        Paragraph(
            f"{html.escape(case.reference)} · Synthetic financing-readiness packet",
            styles["Heading2"],
        ),
        Paragraph(
            "This packet supports a human workflow review. It does not contain a lending, "
            "credit, or eligibility decision.",
            styles["BodyText"],
        ),
        Spacer(1, 8 * mm),
    ]
    profile_rows = [
        ["Business", case.legal_business_name],
        ["Registration", case.registration_number],
        ["Jurisdiction", case.jurisdiction],
        ["Request", f"{case.currency} {case.requested_amount:,.2f}"],
        ["Stage", case.stage.replace("_", " ").title()],
        ["Readiness", f"{case.completeness_score}/100"],
    ]
    profile = Table(profile_rows, colWidths=[42 * mm, 115 * mm])
    profile.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#4f5d58")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d5dcd8")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef1ee")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend([profile, Spacer(1, 7 * mm)])

    story.append(Paragraph("Deterministic findings", styles["Heading2"]))
    if case.findings:
        for finding in case.findings:
            story.append(
                Paragraph(
                    f"<b>{html.escape(finding.rule_code)}</b>: {html.escape(finding.message)}",
                    styles["BodyText"],
                )
            )
    else:
        story.append(Paragraph("No open deterministic finding.", styles["BodyText"]))

    latest_run = max(case.agent_runs, key=lambda run: run.started_at, default=None)
    story.extend([Spacer(1, 6 * mm), Paragraph("Agent recommendation", styles["Heading2"])])
    if latest_run and latest_run.structured_output_json:
        output = latest_run.structured_output_json
        story.append(Paragraph(html.escape(output["case_summary"]), styles["BodyText"]))
        story.append(
            Paragraph(
                f"<b>Proposed workflow action:</b> {html.escape(output['recommended_action'])}",
                styles["BodyText"],
            )
        )
        story.append(
            Paragraph(
                f"<b>Reason:</b> {html.escape(output['recommendation_reason'])}",
                styles["BodyText"],
            )
        )
    else:
        story.append(Paragraph("No agent recommendation has been saved.", styles["BodyText"]))

    story.extend([Spacer(1, 6 * mm), Paragraph("Audit trail", styles["Heading2"])])
    for event in sorted(case.audit_events, key=lambda item: item.created_at):
        timestamp = event.created_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
        story.append(
            Paragraph(
                f"<b>{timestamp}</b> · {html.escape(event.actor_type)} · "
                f"{html.escape(event.summary)}",
                styles["BodyText"],
            )
        )

    document.build(story)
    return buffer.getvalue()
