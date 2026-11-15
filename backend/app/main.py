from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import (
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    get_prometheus_metrics,
)
from app.database.session import check_database_connection
from app.integrations.redis_client import check_redis_connection


def create_app() -> FastAPI:
    """Initialize and configure the BrandGuard FastAPI application."""
    settings = get_settings()
    setup_logging(settings.DEBUG)

    app = FastAPI(
        title=settings.APP_NAME,
        version="0.1.0",
        docs_url="/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/redoc" if settings.APP_ENV != "production" else None,
    )

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.TRUSTED_HOSTS,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/health/live", tags=["Health"])
    def liveness() -> dict[str, str]:
        return {"status": "alive"}

    @app.get("/health", tags=["Health"])
    @app.get("/health/ready", tags=["Health"])
    def readiness(response: Response) -> dict[str, object]:
        db_ok = check_database_connection()
        redis_ok = check_redis_connection()
        ready = db_ok and redis_ok
        if not ready:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "ok" if ready else "degraded",
            "database": "connected" if db_ok else "unavailable",
            "redis": "connected" if redis_ok else "unavailable",
        }

    @app.get("/metrics", tags=["Monitoring"], include_in_schema=False)
    def metrics() -> Response:
        return Response(content=get_prometheus_metrics(), media_type="text/plain; version=0.0.4")

    return app


app = create_app()
