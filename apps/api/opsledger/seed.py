from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import SessionLocal, create_schema
from .fixtures import demo_fixtures
from .models import Case
from .services import agent_review_case, create_case, process_case, store_case_document


def seed_demo_data(db: Session, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    if db.scalar(select(func.count(Case.id))):
        return False

    seed_settings = settings.model_copy(update={"model_provider": "deterministic"})
    for fixture in demo_fixtures():
        correlation_id = f"seed-{fixture.reference.lower()}"
        case = create_case(
            db,
            fixture.profile,
            correlation_id=correlation_id,
            reference=fixture.reference,
        )
        for fixture_document in fixture.documents:
            store_case_document(
                db,
                case,
                document_type=fixture_document.document_type,
                filename=fixture_document.filename,
                mime_type=fixture_document.mime_type,
                content=fixture_document.content,
                correlation_id=correlation_id,
                settings=settings,
            )
        db.flush()
        process_case(
            db,
            case,
            correlation_id=correlation_id,
            settings=settings,
        )
        agent_review_case(
            db,
            case,
            correlation_id=correlation_id,
            settings=seed_settings,
        )
        db.commit()
    return True


def main() -> None:
    create_schema()
    with SessionLocal() as db:
        created = seed_demo_data(db)
    print("Created the three OpsLedger demo cases." if created else "Demo data already exists.")


if __name__ == "__main__":
    main()
