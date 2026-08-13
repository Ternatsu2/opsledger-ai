from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from opsledger.config import Settings
from opsledger.database import Base


@dataclass
class TestContext:
    db: Session
    settings: Settings


@pytest.fixture
def context(tmp_path: Path) -> TestContext:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        expire_on_commit=False,
        autoflush=False,
    )
    with session_factory() as db:
        yield TestContext(
            db=db,
            settings=Settings(
                seed_demo=False,
                database_url="sqlite://",
                local_data_dir=tmp_path,
                model_provider="deterministic",
            ),
        )
    Base.metadata.drop_all(engine)
    engine.dispose()
