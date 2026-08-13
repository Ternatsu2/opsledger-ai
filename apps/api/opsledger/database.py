from collections.abc import Generator
from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from alembic import command

from .config import get_settings

settings = get_settings()
connect_args = (
    {"check_same_thread": False} if settings.normalized_database_url.startswith("sqlite") else {}
)
engine = create_engine(
    settings.normalized_database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)


if settings.normalized_database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def create_schema() -> None:
    url = make_url(settings.normalized_database_url)
    if url.get_backend_name() == "sqlite" and url.database not in {None, "", ":memory:"}:
        Path(url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)

    api_root = Path(__file__).resolve().parents[1]
    configuration = Config(str(api_root / "alembic.ini"))
    configuration.set_main_option("script_location", str(api_root / "alembic"))
    configuration.set_main_option(
        "sqlalchemy.url",
        settings.normalized_database_url.replace("%", "%%"),
    )
    command.upgrade(configuration, "head")
