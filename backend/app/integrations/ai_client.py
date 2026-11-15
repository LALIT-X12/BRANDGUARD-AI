from typing import Any

import httpx

from app.config import get_settings
from app.core.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError

_ai_circuit_breaker: CircuitBreaker | None = None


def get_ai_circuit_breaker() -> CircuitBreaker:
    global _ai_circuit_breaker
    if _ai_circuit_breaker is None:
        settings = get_settings()
        _ai_circuit_breaker = CircuitBreaker(
            name="ai_integration",
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_SECONDS,
        )
    return _ai_circuit_breaker


class AIIntegrationClient:
    """HTTP adapter to the independent AI integration service.

    Note: By architectural rule, no Claude prompts, model logic, or SDK calls
    live inside the backend. This client only exchanges structured JSON payloads.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.AI_INTEGRATION_URL.rstrip("/")
        self.service_token = (
            settings.AI_INTEGRATION_SERVICE_TOKEN.get_secret_value()
            if settings.AI_INTEGRATION_SERVICE_TOKEN
            else None
        )
        self.timeout = httpx.Timeout(
            connect=5.0,
            read=float(settings.AI_INTEGRATION_TIMEOUT_SECONDS),
            write=10.0,
            pool=5.0,
        )
        self.breaker = get_ai_circuit_breaker()

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.breaker.allow_request():
            raise CircuitBreakerOpenError("ai_integration")

        headers: dict[str, str] = {}
        if self.service_token:
            headers["X-Service-Token"] = self.service_token

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}{path}", json=payload, headers=headers
                )
                resp.raise_for_status()
                self.breaker.record_success()
                return resp.json()
        except Exception:
            self.breaker.record_failure()
            raise

    async def analyze_content(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Request AI tone, messaging, or claim analysis from the AI service."""
        return await self._post("/analyze", payload)

    async def generate_fix(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Request a minimal-edit fix proposal from the AI service."""
        return await self._post("/fixes/generate", payload)

    async def validate_fix(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Call the independent fix validator endpoint."""
        return await self._post("/fixes/validate", payload)
