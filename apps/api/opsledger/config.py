from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "OpsLedger AI API"
    app_version: str = "0.1.0"
    demo_mode: bool = True
    seed_demo: bool = True
    database_url: str = f"sqlite:///{PROJECT_ROOT / 'data' / 'opsledger.db'}"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    app_base_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"
    log_level: str = "INFO"

    model_provider: str = "auto"
    codex_model: str = "gpt-5.6-luna"
    codex_reasoning_effort: str = "xhigh"
    codex_timeout_seconds: int = 120
    codex_binary: str | None = None
    model_strict: bool = False
    demo_policy_as_of_date: date = date(2026, 8, 13)

    max_upload_mb: int = 8
    max_pdf_pages: int = 50
    max_table_rows: int = 10_000
    local_data_dir: Path = PROJECT_ROOT / "data"
    storage_backend: str = "local"
    storage_bucket: str = "opsledger-demo"
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "auto"
    reviewer_token: str | None = None

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def normalized_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql+psycopg://", 1)
        if self.database_url.startswith("postgresql://"):
            return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return self.database_url

    @property
    def local_upload_dir(self) -> Path:
        return self.local_data_dir / "uploads"

    @property
    def export_dir(self) -> Path:
        return self.local_data_dir / "exports"


@lru_cache
def get_settings() -> Settings:
    return Settings()
