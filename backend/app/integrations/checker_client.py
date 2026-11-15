from typing import Any

import httpx

from app.config import get_settings
from app.core.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError

_checker_circuit_breaker: CircuitBreaker | None = None


def get_checker_circuit_breaker() -> CircuitBreaker:
    global _checker_circuit_breaker
    if _checker_circuit_breaker is None:
        settings = get_settings()
        _checker_circuit_breaker = CircuitBreaker(
            name="checker_engine",
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_SECONDS,
        )
    return _checker_circuit_breaker


class CheckerClient:
    """Adapter for deterministic rule-based checkers (terminology, accessibility, visual)."""

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.CHECKER_ENGINE_URL.rstrip("/")
        self.timeout = httpx.Timeout(
            connect=5.0,
            read=float(settings.AI_INTEGRATION_TIMEOUT_SECONDS),
            write=10.0,
            pool=5.0,
        )
        self.breaker = get_checker_circuit_breaker()

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.breaker.allow_request():
            raise CircuitBreakerOpenError("checker_engine")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(f"{self.base_url}{path}", json=payload)
                resp.raise_for_status()
                self.breaker.record_success()
                return resp.json()
        except Exception:
            self.breaker.record_failure()
            raise

    async def run_terminology_check(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Run deterministic glossary & prohibited-term checks."""
        return await self._post("/check/terminology", payload)

    async def run_visual_check(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Run deterministic visual/design checks."""
        return await self._post("/check/visual", payload)
