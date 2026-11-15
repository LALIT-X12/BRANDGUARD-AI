import time
import uuid
from collections import defaultdict
from threading import Lock

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.core.logging import get_logger
from app.integrations.redis_client import get_redis_client

logger = get_logger("brandguard.http")

_metrics_lock = Lock()
_request_counts: dict[tuple[str, str, int], int] = defaultdict(int)
_request_latency_sum_ms: float = 0.0
_request_total: int = 0


def get_prometheus_metrics() -> str:
    """Render lightweight Prometheus-compatible text metrics."""
    with _metrics_lock:
        lines = [
            "# HELP brandguard_http_requests_total Total HTTP requests processed",
            "# TYPE brandguard_http_requests_total counter",
        ]
        for (method, path, code), count in sorted(_request_counts.items()):
            lines.append(
                f'brandguard_http_requests_total{{method="{method}",path="{path}",status="{code}"}} {count}'
            )
        lines.extend(
            [
                "# HELP brandguard_http_request_duration_ms_sum Sum of HTTP request durations in ms",
                "# TYPE brandguard_http_request_duration_ms_sum counter",
                f"brandguard_http_request_duration_ms_sum {_request_latency_sum_ms:.2f}",
                f"brandguard_http_requests_count {_request_total}",
            ]
        )
    return "\n".join(lines) + "\n"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-ID, record metrics, and emit structured access logs."""

    async def dispatch(self, request: Request, call_next) -> Response:
        global _request_latency_sum_ms, _request_total
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()

        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000.0

        with _metrics_lock:
            _request_counts[(request.method, request.url.path, response.status_code)] += 1
            _request_latency_sum_ms += duration_ms
            _request_total += 1

        response.headers["X-Request-ID"] = request_id
        logger.info(
            "method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply baseline HTTP security headers to all API responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-backed fixed-window rate limiter per client IP."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in {"/health", "/health/live", "/health/ready", "/metrics"}:
            return await call_next(request)

        settings = get_settings()
        limit = settings.RATE_LIMIT_REQUESTS_PER_MINUTE
        client_ip = request.client.host if request.client else "unknown"
        window = int(time.time() // 60)
        key = f"brandguard:rl:{client_ip}:{window}"

        try:
            client = get_redis_client()
            current = client.incr(key)
            if current == 1:
                client.expire(key, 60)
            if current > limit:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    headers={"Retry-After": "60"},
                    content={
                        "error": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": "Too many requests. Please retry later.",
                        }
                    },
                )
        except Exception:
            # Fail open on rate limiter if Redis is temporarily unreachable
            pass

        return await call_next(request)

