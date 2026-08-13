from __future__ import annotations

from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import select

import opsledger.agent as agent_module
from opsledger.database import get_db
from opsledger.main import app
from opsledger.models import AgentRun, Case
from opsledger.seed import seed_demo_data

from .conftest import TestContext


def test_api_exposes_cases_utc_dates_and_cors(context: TestContext) -> None:
    seed_demo_data(context.db, context.settings)

    def override_db() -> Generator:
        yield context.db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            health = client.get("/health")
            cases = client.get("/api/v1/cases")
            cors = client.options(
                "/api/v1/cases",
                headers={
                    "Origin": "http://127.0.0.1:3000",
                    "Access-Control-Request-Method": "GET",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert health.status_code == 200
    assert cases.status_code == 200
    assert len(cases.json()) == 3
    assert cases.json()[0]["created_at"].endswith("Z")
    assert isinstance(cases.json()[0]["open_finding_count"], int)
    assert isinstance(cases.json()[0]["issue_codes"], list)
    assert cases.json()[0]["last_action"]
    assert cors.status_code == 200
    assert cors.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"


def test_review_action_endpoint_requires_rationale(context: TestContext) -> None:
    seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0001"))
    assert case is not None

    def override_db() -> Generator:
        yield context.db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/cases/{case.id}/review-actions",
                json={
                    "reviewer_id": "TB",
                    "action_type": "APPROVE_FOR_NEXT_STAGE",
                    "rationale": "no",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["code"] == "REQUEST_INVALID"
    assert response.json()["correlation_id"]


def test_agent_review_idempotency_key_returns_one_saved_run(
    context: TestContext,
    monkeypatch,
) -> None:
    seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0001"))
    assert case is not None
    initial_count = len(
        list(context.db.scalars(select(AgentRun).where(AgentRun.case_id == case.id)))
    )

    def unavailable(_prompt, _settings):
        raise RuntimeError("local provider unavailable in the API contract test")

    monkeypatch.setattr(agent_module, "_run_codex", unavailable)

    def override_db() -> Generator:
        yield context.db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            first = client.post(
                f"/api/v1/cases/{case.id}/agent-review",
                headers={"Idempotency-Key": "same-review-run"},
            )
            second = client.post(
                f"/api/v1/cases/{case.id}/agent-review",
                headers={"Idempotency-Key": "same-review-run"},
            )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["agent_run"]["id"] == second.json()["agent_run"]["id"]
    final_count = len(
        list(context.db.scalars(select(AgentRun).where(AgentRun.case_id == case.id)))
    )
    assert final_count == initial_count + 1


def test_invalid_review_operation_returns_a_safe_error(context: TestContext) -> None:
    seed_demo_data(context.db, context.settings)
    case = context.db.scalar(select(Case).where(Case.reference == "OPS-2026-0002"))
    assert case is not None

    def override_db() -> Generator:
        yield context.db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/cases/{case.id}/review-actions",
                json={
                    "reviewer_id": "TB",
                    "action_type": "EDIT_AGENT_DRAFT",
                    "rationale": "Reviewer attempted to save an empty draft.",
                    "edited_draft": None,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["code"] == "OPERATION_INVALID"
    assert response.json()["message"] == "The requested operation is not valid for this case."
    assert response.json()["correlation_id"]
