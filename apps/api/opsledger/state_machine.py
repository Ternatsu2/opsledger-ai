from sqlalchemy.orm import Session

from .audit import record_event
from .models import Case
from .schemas import CaseStage

ALLOWED_TRANSITIONS: dict[CaseStage, set[CaseStage]] = {
    CaseStage.DRAFT: {CaseStage.SUBMITTED, CaseStage.CLOSED},
    CaseStage.SUBMITTED: {CaseStage.INGESTING, CaseStage.CLOSED},
    CaseStage.INGESTING: {CaseStage.EXTRACTION_FAILED, CaseStage.VALIDATING},
    CaseStage.EXTRACTION_FAILED: {CaseStage.INGESTING, CaseStage.CLOSED},
    CaseStage.VALIDATING: {
        CaseStage.NEEDS_INFORMATION,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.AGENT_REVIEW,
    },
    CaseStage.NEEDS_INFORMATION: {
        CaseStage.INGESTING,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.READY_FOR_HUMAN_REVIEW,
        CaseStage.CLOSED,
    },
    CaseStage.AGENT_REVIEW: {
        CaseStage.READY_FOR_HUMAN_REVIEW,
        CaseStage.NEEDS_INFORMATION,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.CLOSED,
    },
    CaseStage.READY_FOR_HUMAN_REVIEW: {
        CaseStage.INGESTING,
        CaseStage.APPROVED_FOR_NEXT_STAGE,
        CaseStage.NEEDS_INFORMATION,
        CaseStage.MANUAL_INVESTIGATION,
        CaseStage.CLOSED,
    },
    CaseStage.MANUAL_INVESTIGATION: {
        CaseStage.INGESTING,
        CaseStage.NEEDS_INFORMATION,
        CaseStage.READY_FOR_HUMAN_REVIEW,
        CaseStage.CLOSED,
    },
    CaseStage.APPROVED_FOR_NEXT_STAGE: {CaseStage.CLOSED},
    CaseStage.CLOSED: set(),
}


class InvalidTransition(ValueError):
    pass


def transition_case(
    db: Session,
    case: Case,
    target: CaseStage,
    *,
    correlation_id: str,
    actor_type: str,
    actor_id: str,
    summary: str,
) -> None:
    current = CaseStage(case.stage)
    if target == current:
        return
    if target not in ALLOWED_TRANSITIONS[current]:
        record_event(
            db,
            case_id=case.id,
            correlation_id=correlation_id,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="TRANSITION_REJECTED",
            summary=f"Rejected transition from {current.value} to {target.value}",
            prior_state={"stage": current.value},
            new_state={"requested_stage": target.value},
        )
        raise InvalidTransition(f"Transition from {current.value} to {target.value} is not allowed")

    case.stage = target.value
    case.version += 1
    record_event(
        db,
        case_id=case.id,
        correlation_id=correlation_id,
        actor_type=actor_type,
        actor_id=actor_id,
        event_type="CASE_STAGE_CHANGED",
        summary=summary,
        prior_state={"stage": current.value},
        new_state={"stage": target.value},
    )
