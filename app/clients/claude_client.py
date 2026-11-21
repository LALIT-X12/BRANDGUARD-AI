import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    AIConfigurationError,
    AIRateLimitError,
    AIUpstreamTimeoutError,
    BrandGuardAIError,
    MalformedAIResponseError,
)
from app.core.logging import get_logger

logger = get_logger(__name__)
T = TypeVar("T", bound=BaseModel)


@dataclass
class TokenUsage:
    """Tracks input/output token counts and estimated USD cost for a call or pipeline."""

    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0

    def add(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.calls += 1

    def merge(self, other: "TokenUsage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.calls += other.calls

    def estimated_cost_usd(self, settings: Settings | None = None) -> float:
        cfg = settings or get_settings()
        return (
            (self.input_tokens / 1_000_000.0) * cfg.INPUT_TOKEN_COST_PER_1M
            + (self.output_tokens / 1_000_000.0) * cfg.OUTPUT_TOKEN_COST_PER_1M
        )


def _strip_code_fences(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


class ClaudeClient:
    """Reusable asynchronous Anthropic Claude client for all AI operations."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: Any | None = None
    def _get_async_client(self) -> Any:
        import anthropic

        api_key = self.settings.ANTHROPIC_API_KEY.get_secret_value()
        if not api_key or "replace-me" in api_key:
            raise AIConfigurationError("ANTHROPIC_API_KEY is missing or unconfigured")
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(
                api_key=api_key,
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=self.settings.CLAUDE_TIMEOUT_SECONDS,
                    write=10.0,
                    pool=5.0,
                ),
                max_retries=0,  # Managed explicitly via tenacity
            )
        return self._client

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
        response_model: type[T],
        model: str | None = None,
        request_id: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> tuple[T, TokenUsage]:
        """Call Claude and validate the returned JSON strictly against `response_model`."""
        req_id = request_id or str(uuid.uuid4())
        target_model = model or self.settings.CLAUDE_MODEL
        usage = TokenUsage()
        start = time.perf_counter()

        raw_text = await self._call_with_retry(
            system_prompt=system_prompt,
            user_content=user_content,
            model=target_model,
            max_tokens=max_tokens or self.settings.CLAUDE_MAX_TOKENS,
            temperature=self.settings.CLAUDE_TEMPERATURE if temperature is None else temperature,
            request_id=req_id,
            usage=usage,
        )

        cleaned = _strip_code_fences(raw_text)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("Invalid JSON from Claude [request_id=%s]: %s", req_id, exc)
            raise MalformedAIResponseError("Claude response was not valid JSON") from exc

        try:
            validated = response_model.model_validate(parsed)
        except ValidationError as exc:
            logger.warning("Schema mismatch from Claude [request_id=%s]: %s", req_id, exc)
            raise MalformedAIResponseError(f"Claude JSON failed schema validation: {exc}") from exc

        duration_ms = (time.perf_counter() - start) * 1000.0
        logger.info(
            "claude_call request_id=%s model=%s input_tokens=%d output_tokens=%d duration_ms=%.2f",
            req_id,
            target_model,
            usage.input_tokens,
            usage.output_tokens,
            duration_ms,
        )
        return validated, usage

    async def _call_with_retry(
        self,
        *,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
        model: str,
        max_tokens: int,
        temperature: float,
        request_id: str,
        usage: TokenUsage,
    ) -> str:
        import anthropic
        client = self._get_async_client()

        @retry(
            reraise=True,
            stop=stop_after_attempt(self.settings.CLAUDE_MAX_RETRIES),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            retry=retry_if_exception_type(
                (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError)
            ),
        )
        async def _invoke() -> anthropic.types.Message:
            return await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}],
            )

        try:
            message = await _invoke()
        except anthropic.RateLimitError as exc:
            logger.error("Anthropic rate limit exceeded [request_id=%s]", request_id)
            raise AIRateLimitError() from exc
        except anthropic.APITimeoutError as exc:
            logger.error("Anthropic timeout [request_id=%s]", request_id)
            raise AIUpstreamTimeoutError() from exc
        except anthropic.APIError as exc:
            logger.error("Anthropic API error [request_id=%s]: %s", request_id, exc)
            raise BrandGuardAIError(f"Upstream AI failure: {exc}", status_code=502) from exc

        if getattr(message, "usage", None) is not None:
            usage.add(
                int(getattr(message.usage, "input_tokens", 0) or 0),
                int(getattr(message.usage, "output_tokens", 0) or 0),
            )

        text_blocks = [
            block.text for block in message.content if getattr(block, "type", None) == "text"
        ]
        if not text_blocks:
            raise MalformedAIResponseError("Claude returned no text content")
        return "\n".join(text_blocks)

