from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import IdempotencyRecord


def cached_response(
    db: Session,
    *,
    case_id: str,
    operation: str,
    key: str | None,
) -> dict[str, Any] | None:
    if not key:
        return None
    record = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.case_id == case_id,
            IdempotencyRecord.operation == operation,
            IdempotencyRecord.idempotency_key == key,
        )
    )
    return record.response_json if record else None


def save_response(
    db: Session,
    *,
    case_id: str,
    operation: str,
    key: str | None,
    response: dict[str, Any],
) -> None:
    if not key:
        return
    db.add(
        IdempotencyRecord(
            case_id=case_id,
            operation=operation,
            idempotency_key=key,
            response_json=response,
        )
    )
