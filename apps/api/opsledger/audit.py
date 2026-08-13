from typing import Any

from sqlalchemy.orm import Session

from .models import AuditEvent


def record_event(
    db: Session,
    *,
    case_id: str | None,
    correlation_id: str,
    actor_type: str,
    actor_id: str,
    event_type: str,
    summary: str,
    prior_state: dict[str, Any] | None = None,
    new_state: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        case_id=case_id,
        correlation_id=correlation_id,
        actor_type=actor_type,
        actor_id=actor_id,
        event_type=event_type,
        summary=summary,
        prior_state_json=prior_state or {},
        new_state_json=new_state or {},
    )
    db.add(event)
    return event
