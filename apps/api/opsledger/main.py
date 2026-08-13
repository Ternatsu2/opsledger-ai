from __future__ import annotations

import hmac
import logging
import time
import uuid
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import desc, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from .audit import record_event
from .config import get_settings
from .database import SessionLocal, create_schema, get_db
from .idempotency import cached_response, save_response
from .models import AuditEvent, Case, Document, ValidationFinding
from .policy import DEMO_POLICY
from .schemas import (
    AgentRunRead,
    ApiErrorBody,
    AuditEventRead,
    CaseCreate,
    CaseDetail,
    CaseListItem,
    CaseRead,
    CaseStage,
    CaseUpdate,
    CommandResult,
    DashboardSummary,
    DocumentRead,
    ReviewActionCreate,
    ReviewActionRead,
)
from .seed import seed_demo_data
from .services import (
    agent_review_case,
    apply_review_action,
    build_case_packet,
    create_case,
    dashboard_data,
    get_case_detail,
    process_case,
    store_case_document,
)
from .state_machine import InvalidTransition
from .storage import FileRejected, Storage

logger = logging.getLogger("opsledger")
settings = get_settings()


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", str(uuid.uuid4()))


def _error(
    request: Request,
    *,
    code: str,
    message: str,
    status_code: int,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    payload = ApiErrorBody(
        code=code,
        message=message,
        correlation_id=_correlation_id(request),
        details=details,
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        supplied = request.headers.get("x-correlation-id", "")
        request.state.correlation_id = supplied[:64] if supplied else str(uuid.uuid4())
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        logger.info(
            "%s %s %s %.0fms",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, requests_per_minute: int = 180) -> None:
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.windows: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if request.url.path in {"/health", "/ready"}:
            return await call_next(request)
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = self.windows[client]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= self.requests_per_minute:
            return _error(
                request,
                code="RATE_LIMITED",
                message="Too many requests. Try again in a moment.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        window.append(now)
        return await call_next(request)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    create_schema()
    if settings.demo_mode and settings.seed_demo:
        with SessionLocal() as db:
            seed_demo_data(db, settings)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Evidence-grounded financing-readiness workflow for synthetic Caribbean MSME cases."
    ),
    lifespan=lifespan,
    docs_url="/api/docs" if settings.demo_mode else None,
    redoc_url=None,
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Idempotency-Key",
        "X-Correlation-ID",
        "X-Reviewer-Token",
    ],
    expose_headers=["X-Correlation-ID"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    details = {
        "fields": [
            {
                "path": ".".join(str(item) for item in error["loc"] if item != "body"),
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
    }
    return _error(
        request,
        code="REQUEST_INVALID",
        message="Check the highlighted fields and try again.",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        details=details,
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    message = detail.get("message") or (
        exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    )
    return _error(
        request,
        code=detail.get("code", "REQUEST_FAILED"),
        message=message,
        status_code=exc.status_code,
    )


@app.exception_handler(InvalidTransition)
async def transition_exception_handler(
    request: Request,
    exc: InvalidTransition,
) -> JSONResponse:
    return _error(
        request,
        code="INVALID_CASE_TRANSITION",
        message=str(exc),
        status_code=status.HTTP_409_CONFLICT,
    )


@app.exception_handler(FileRejected)
async def file_exception_handler(request: Request, exc: FileRejected) -> JSONResponse:
    return _error(
        request,
        code=exc.code,
        message=str(exc),
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


@app.exception_handler(IntegrityError)
async def integrity_exception_handler(
    request: Request,
    _: IntegrityError,
) -> JSONResponse:
    return _error(
        request,
        code="CONFLICT",
        message="That record conflicts with an existing case.",
        status_code=status.HTTP_409_CONFLICT,
    )


@app.exception_handler(ValueError)
async def operation_exception_handler(request: Request, _: ValueError) -> JSONResponse:
    return _error(
        request,
        code="OPERATION_INVALID",
        message="The requested operation is not valid for this case.",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


def _case_or_404(db: Session, case_id: str) -> Case:
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CASE_NOT_FOUND", "message": "Case not found."},
        )
    return case


def _detail_or_404(db: Session, case_id: str) -> Case:
    case = get_case_detail(db, case_id)
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CASE_NOT_FOUND", "message": "Case not found."},
        )
    return case


def _require_reviewer_token(
    x_reviewer_token: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.reviewer_token
    if expected and not (x_reviewer_token and hmac.compare_digest(x_reviewer_token, expected)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "REVIEWER_AUTH_REQUIRED",
                "message": "A valid reviewer token is required for this action.",
            },
        )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "opsledger-api"}


@app.get("/ready", tags=["system"])
def ready(db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/api/v1/system", tags=["system"])
def system_status() -> dict[str, Any]:
    return {
        "demo_mode": settings.demo_mode,
        "synthetic_data_only": True,
        "public_writes_locked": bool(settings.reviewer_token),
        "policy_version": DEMO_POLICY["version"],
        "model_provider": settings.model_provider,
        "model": settings.codex_model,
        "human_approval_required": True,
        "follow_up_auto_send": False,
    }


@app.get("/api/v1/dashboard", response_model=DashboardSummary, tags=["dashboard"])
def dashboard(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    return dashboard_data(db)


@app.get("/api/v1/cases", response_model=list[CaseListItem], tags=["cases"])
def list_cases(
    db: Annotated[Session, Depends(get_db)],
    stage: Annotated[CaseStage | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> list[CaseListItem]:
    statement = select(Case)
    if stage:
        statement = statement.where(Case.stage == stage.value)
    if q:
        term = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Case.reference.ilike(term),
                Case.legal_business_name.ilike(term),
                Case.registration_number.ilike(term),
            )
        )
    cases = list(db.scalars(statement.order_by(desc(Case.updated_at))))
    if not cases:
        return []

    case_ids = [case.id for case in cases]
    findings = db.scalars(
        select(ValidationFinding).where(
            ValidationFinding.case_id.in_(case_ids),
            ValidationFinding.status == "OPEN",
        )
    ).all()
    issue_codes: dict[str, set[str]] = defaultdict(set)
    for finding in findings:
        issue_codes[finding.case_id].add(finding.rule_code)

    newest_action: dict[str, str] = {}
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.case_id.in_(case_ids))
        .order_by(desc(AuditEvent.created_at))
    ).all()
    for event in events:
        if event.case_id:
            newest_action.setdefault(event.case_id, event.summary)

    return [
        CaseListItem(
            **CaseRead.model_validate(case).model_dump(),
            open_finding_count=sum(1 for finding in findings if finding.case_id == case.id),
            issue_codes=sorted(issue_codes[case.id]),
            last_action=newest_action.get(case.id),
        )
        for case in cases
    ]


@app.post(
    "/api/v1/cases",
    response_model=CaseRead,
    status_code=status.HTTP_201_CREATED,
    tags=["cases"],
    dependencies=[Depends(_require_reviewer_token)],
)
def create_case_endpoint(
    payload: CaseCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Case:
    case = create_case(db, payload, correlation_id=_correlation_id(request))
    db.commit()
    db.refresh(case)
    return case


@app.get("/api/v1/cases/{case_id}", response_model=CaseDetail, tags=["cases"])
def read_case(case_id: str, db: Annotated[Session, Depends(get_db)]) -> Case:
    return _detail_or_404(db, case_id)


@app.patch(
    "/api/v1/cases/{case_id}",
    response_model=CaseRead,
    tags=["cases"],
    dependencies=[Depends(_require_reviewer_token)],
)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Case:
    case = _case_or_404(db, case_id)
    previous = case.assigned_reviewer_id
    case.assigned_reviewer_id = payload.assigned_reviewer_id
    case.version += 1
    record_event(
        db,
        case_id=case.id,
        correlation_id=_correlation_id(request),
        actor_type="user",
        actor_id="demo-operator",
        event_type="CASE_ASSIGNMENT_CHANGED",
        summary="Updated the assigned reviewer",
        prior_state={"assigned_reviewer_id": previous},
        new_state={"assigned_reviewer_id": case.assigned_reviewer_id},
    )
    db.commit()
    return case


@app.post(
    "/api/v1/cases/{case_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    tags=["documents"],
    dependencies=[Depends(_require_reviewer_token)],
)
async def upload_document(
    case_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    document_type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
) -> Document:
    case = _case_or_404(db, case_id)
    content = await file.read((settings.max_upload_mb * 1024 * 1024) + 1)
    document = store_case_document(
        db,
        case,
        document_type=document_type,
        filename=file.filename or "document",
        mime_type=file.content_type or "application/octet-stream",
        content=content,
        correlation_id=_correlation_id(request),
    )
    db.commit()
    db.refresh(document)
    return document


@app.get(
    "/api/v1/cases/{case_id}/documents/{document_id}",
    response_model=None,
    tags=["documents"],
)
def download_document(
    case_id: str,
    document_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    document = db.scalar(
        select(Document).where(Document.id == document_id, Document.case_id == case_id)
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document not found."},
        )
    return Response(
        Storage().get(document.storage_key),
        media_type=document.mime_type,
        headers={"Content-Disposition": f'attachment; filename="{document.safe_filename}"'},
    )


@app.post(
    "/api/v1/cases/{case_id}/process",
    response_model=CommandResult,
    tags=["workflow"],
    dependencies=[Depends(_require_reviewer_token)],
)
def process_case_endpoint(
    case_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(max_length=120)] = None,
) -> CommandResult:
    cached = cached_response(
        db,
        case_id=case_id,
        operation="process",
        key=idempotency_key,
    )
    if cached:
        return CommandResult.model_validate(cached)
    case = _case_or_404(db, case_id)
    process_case(db, case, correlation_id=_correlation_id(request))
    result = CommandResult(
        case=CaseRead.model_validate(case),
        correlation_id=_correlation_id(request),
        message="Deterministic extraction and validation completed.",
    )
    save_response(
        db,
        case_id=case.id,
        operation="process",
        key=idempotency_key,
        response=result.model_dump(mode="json"),
    )
    db.commit()
    return result


@app.post(
    "/api/v1/cases/{case_id}/agent-review",
    response_model=CommandResult,
    tags=["workflow"],
    dependencies=[Depends(_require_reviewer_token)],
)
def run_agent_endpoint(
    case_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    idempotency_key: Annotated[str | None, Header(max_length=120)] = None,
) -> CommandResult:
    cached = cached_response(
        db,
        case_id=case_id,
        operation="agent-review",
        key=idempotency_key,
    )
    if cached:
        return CommandResult.model_validate(cached)
    case = _case_or_404(db, case_id)
    run = agent_review_case(db, case, correlation_id=_correlation_id(request))
    result = CommandResult(
        case=CaseRead.model_validate(case),
        agent_run=AgentRunRead.model_validate(run),
        correlation_id=_correlation_id(request),
        message="Bounded agent review completed and passed grounding checks.",
    )
    save_response(
        db,
        case_id=case.id,
        operation="agent-review",
        key=idempotency_key,
        response=result.model_dump(mode="json"),
    )
    db.commit()
    return result


@app.post(
    "/api/v1/cases/{case_id}/review-actions",
    response_model=ReviewActionRead,
    tags=["review"],
    dependencies=[Depends(_require_reviewer_token)],
)
def review_action_endpoint(
    case_id: str,
    payload: ReviewActionCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    case = _case_or_404(db, case_id)
    action = apply_review_action(
        db,
        case,
        payload,
        correlation_id=_correlation_id(request),
    )
    db.commit()
    db.refresh(action)
    return action


@app.get(
    "/api/v1/cases/{case_id}/packet.pdf",
    response_model=None,
    tags=["exports"],
)
def export_case_packet(
    case_id: str,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    case = _detail_or_404(db, case_id)
    return Response(
        build_case_packet(case),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{case.reference}-review-packet.pdf"'
        },
    )


@app.get("/api/v1/audit", response_model=list[AuditEventRead], tags=["audit"])
def audit_feed(
    db: Annotated[Session, Depends(get_db)],
    case_id: Annotated[str | None, Query()] = None,
    event_type: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[AuditEvent]:
    statement = select(AuditEvent)
    if case_id:
        statement = statement.where(AuditEvent.case_id == case_id)
    if event_type:
        statement = statement.where(AuditEvent.event_type == event_type)
    return list(db.scalars(statement.order_by(desc(AuditEvent.created_at)).limit(limit)))
