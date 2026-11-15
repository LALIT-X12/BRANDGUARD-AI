import uuid
from typing import Any

from fastapi import Depends, FastAPI, Header, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.clients.claude_client import ClaudeClient
from app.clients.mongo_client import MongoDatasetStore
from app.core.config import get_settings
from app.core.exceptions import BrandGuardAIError, ServiceAuthError
from app.core.logging import get_logger, setup_logging
from app.pipelines.review_pipeline import run_review_pipeline
from app.schemas.contracts import (
    FixRequest,
    FixResponse,
    ResponseEnvelope,
    ReviewRequest,
    ReviewResponse,
    ValidationRequest,
    ValidationResponse,
    VisualAnalysisRequest,
    VisualAnalysisResponse,
)
from app.services.fix_generator import generate_minimal_fix
from app.services.visual_reviewer import analyze_visual_asset
from app.validators.fix_validator import validate_proposed_fix

logger = get_logger(__name__)
_claude_client = ClaudeClient()
_mongo_store = MongoDatasetStore()


class EvalCaseIn(BaseModel):
    case_id: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=80)
    expected_issue: bool
    text: str = Field(min_length=1, max_length=500_000)
    channel: str = "general"
    audience: str = "general"
    intent: str = "inform"


def get_claude_client() -> ClaudeClient:
    """Dependency provider for the shared ClaudeClient (overridable in tests)."""
    return _claude_client


def get_mongo_store() -> MongoDatasetStore:
    """Dependency provider for MongoDB dataset store (overridable in tests)."""
    return _mongo_store


def verify_service_token(x_service_token: str | None = Header(default=None)) -> None:
    """Enforce inter-service authentication in production or when token is provided."""
    settings = get_settings()
    expected = settings.SERVICE_AUTH_TOKEN.get_secret_value()
    if settings.APP_ENV.lower() == "production" and x_service_token != expected:
        raise ServiceAuthError()
    if x_service_token is not None and x_service_token != expected:
        raise ServiceAuthError()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.DEBUG)

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        docs_url="/docs" if settings.APP_ENV != "production" else None,
    )

    @app.exception_handler(BrandGuardAIError)
    async def ai_error_handler(_request: Request, exc: BrandGuardAIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.error_code, "message": exc.message}},
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled AI service error: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": {"code": "INTERNAL_ERROR", "message": "Unexpected AI service error"}},
        )

    @app.get("/health", tags=["Health"])
    async def health(store: MongoDatasetStore = Depends(get_mongo_store)) -> dict[str, str]:
        mongo_ok = await store.ping()
        return {
            "status": "ok",
            "model": settings.CLAUDE_MODEL,
            "mongodb": "connected" if mongo_ok else "unavailable",
        }

    @app.post("/analyze", response_model=ReviewResponse, tags=["Review"])
    async def analyze_endpoint(
        payload: ReviewRequest,
        _auth: None = Depends(verify_service_token),
        client: ClaudeClient = Depends(get_claude_client),
    ) -> ReviewResponse:
        """Backend-compatible endpoint for semantic review & claim verification."""
        return await run_review_pipeline(client=client, request=payload)

    @app.post("/review", response_model=ResponseEnvelope[ReviewResponse], tags=["Review"])
    async def review_endpoint(
        payload: ReviewRequest,
        _auth: None = Depends(verify_service_token),
        client: ClaudeClient = Depends(get_claude_client),
    ) -> ResponseEnvelope[ReviewResponse]:
        """Canonical enveloped review endpoint."""
        req_id = payload.request_id or str(uuid.uuid4())
        result = await run_review_pipeline(client=client, request=payload)
        return ResponseEnvelope(
            request_id=req_id,
            status="partial" if result.uncertainty_notes else "ok",
            data=result,
        )

    @app.post("/fixes/generate", response_model=FixResponse, tags=["Fixes"])
    async def generate_fix_endpoint(
        payload: FixRequest,
        _auth: None = Depends(verify_service_token),
        client: ClaudeClient = Depends(get_claude_client),
    ) -> FixResponse:
        """Generate a minimal-edit correction preserving creator intent."""
        resp, _ = await generate_minimal_fix(
            client=client, request=payload, request_id=str(uuid.uuid4())
        )
        return resp

    @app.post("/fixes/validate", response_model=ValidationResponse, tags=["Fixes"])
    async def validate_fix_endpoint(
        payload: ValidationRequest,
        _auth: None = Depends(verify_service_token),
        client: ClaudeClient = Depends(get_claude_client),
    ) -> ValidationResponse:
        """Independently validate a proposed fix before presenting it as safe."""
        resp, _ = await validate_proposed_fix(
            client=client, request=payload, request_id=str(uuid.uuid4())
        )
        return resp

    @app.post("/visual/analyze", response_model=VisualAnalysisResponse, tags=["Visual"])
    async def visual_analyze_endpoint(
        payload: VisualAnalysisRequest,
        _auth: None = Depends(verify_service_token),
        client: ClaudeClient = Depends(get_claude_client),
    ) -> VisualAnalysisResponse:
        """Run multimodal brand visual assessment."""
        resp, _ = await analyze_visual_asset(
            client=client, request=payload, request_id=str(uuid.uuid4())
        )
        return resp

    @app.get("/datasets/cases", tags=["Datasets"])
    async def list_dataset_cases(
        category: str | None = Query(default=None),
        limit: int = Query(100, ge=1, le=500),
        _auth: None = Depends(verify_service_token),
        store: MongoDatasetStore = Depends(get_mongo_store),
    ) -> list[dict[str, Any]]:
        """List real evaluation & submission cases stored in MongoDB."""
        return await store.list_eval_cases(category=category, limit=limit)

    @app.post("/datasets/cases", status_code=status.HTTP_201_CREATED, tags=["Datasets"])
    async def upsert_dataset_case(
        payload: EvalCaseIn,
        _auth: None = Depends(verify_service_token),
        store: MongoDatasetStore = Depends(get_mongo_store),
    ) -> dict[str, str]:
        """Store or update a real evaluation/submission case in MongoDB."""
        await store.upsert_eval_case(payload.model_dump())
        return {"status": "saved", "case_id": payload.case_id}

    @app.get("/datasets/runs", tags=["Datasets"])
    async def list_eval_runs(
        limit: int = Query(20, ge=1, le=100),
        _auth: None = Depends(verify_service_token),
        store: MongoDatasetStore = Depends(get_mongo_store),
    ) -> list[dict[str, Any]]:
        """List persisted evaluation runs from MongoDB."""
        return await store.list_eval_runs(limit=limit)

    return app


app = create_app()
