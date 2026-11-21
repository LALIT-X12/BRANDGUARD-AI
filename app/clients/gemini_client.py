
import asyncio
import base64
import binascii
import json
import time
import uuid
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.clients.claude_client import TokenUsage, _strip_code_fences
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


class GeminiClient:
    """Reusable asynchronous Gemini client for BrandGuard AI operations."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._sdk_client: Any | None = None
        self._client: Any | None = None

    def _get_async_client(self) -> Any:
        """Create and cache the Google Gen AI asynchronous client."""

        if self._client is not None:
            return self._client

        from google import genai
        from google.genai import types

        api_key = self.settings.GEMINI_API_KEY.get_secret_value()

        if not api_key or "replace-me" in api_key.lower():
            raise AIConfigurationError(
                "GEMINI_API_KEY is missing or unconfigured"
            )

        self._sdk_client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=int(self.settings.GEMINI_TIMEOUT_SECONDS * 1000)
            ),
        )

        self._client = self._sdk_client.aio
        return self._client

    async def aclose(self) -> None:
        """Close the underlying asynchronous SDK connection."""

        if self._client is None:
            return

        client = self._client
        self._client = None
        self._sdk_client = None

        close = getattr(client, "aclose", None)
        if close is not None:
            await close()

    def _convert_content(
        self,
        user_content: str | list[dict[str, Any]],
    ) -> Any:
        """Convert the existing text/image block format into Gemini parts."""

        from google.genai import types

        if isinstance(user_content, str):
            return user_content

        parts = []

        for block in user_content:
            block_type = block.get("type")

            if block_type == "text":
                text = block.get("text")
                if not isinstance(text, str):
                    raise ValueError("Text content block must contain text")

                parts.append(types.Part.from_text(text=text))

            elif block_type == "image":
                source = block.get("source", {})

                if source.get("type") != "base64":
                    raise ValueError("Unsupported image source format")

                encoded_data = source.get("data")
                media_type = source.get("media_type")

                if not isinstance(encoded_data, str) or not encoded_data:
                    raise ValueError("Image block is missing base64 data")

                if not isinstance(media_type, str) or not media_type.startswith("image/"):
                    raise ValueError("Image block has an invalid media type")

                try:
                    image_bytes = base64.b64decode(
                        encoded_data,
                        validate=True,
                    )
                except (binascii.Error, ValueError) as exc:
                    raise ValueError("Image block contains invalid base64 data") from exc

                parts.append(
                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type=media_type,
                    )
                )

            else:
                raise ValueError(
                    f"Unsupported content block type: {block_type}"
                )

        return parts

    @staticmethod
    def _get_status_code(exc: Exception) -> int | None:
        """Extract an HTTP status code from Google SDK or HTTP exceptions."""

        candidates = [
            getattr(exc, "code", None),
            getattr(exc, "status_code", None),
            getattr(exc, "status", None),
        ]

        response = getattr(exc, "response", None)

        if response is not None:
            candidates.append(getattr(response, "status_code", None))

        for candidate in candidates:
            if isinstance(candidate, int):
                return candidate

        return None

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
        """Generate structured JSON with Gemini and validate it using Pydantic."""

        req_id = request_id or str(uuid.uuid4())
        target_model = model or self.settings.GEMINI_MODEL
        start = time.perf_counter()
        usage = TokenUsage()

        client = self._get_async_client()

        from google.genai import types

        contents = self._convert_content(user_content)

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=(
                max_tokens
                if max_tokens is not None
                else self.settings.GEMINI_MAX_TOKENS
            ),
            temperature=(
                self.settings.GEMINI_TEMPERATURE
                if temperature is None
                else temperature
            ),
            response_mime_type="application/json",
            response_schema=response_model,
        )

        max_attempts = max(1, self.settings.GEMINI_MAX_RETRIES)
        response = None
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            try:
                response = await client.models.generate_content(
                    model=target_model,
                    contents=contents,
                    config=config,
                )
                break

            except (asyncio.TimeoutError, TimeoutError, httpx.TimeoutException) as exc:
                last_error = exc

                if attempt == max_attempts - 1:
                    logger.error(
                        "Gemini timeout after %d attempts [request_id=%s]",
                        max_attempts,
                        req_id,
                    )
                    raise AIUpstreamTimeoutError() from exc

            except Exception as exc:
                last_error = exc
                status_code = self._get_status_code(exc)

                if status_code == 429:
                    if attempt == max_attempts - 1:
                        logger.error(
                            "Gemini rate limit after %d attempts [request_id=%s]",
                            max_attempts,
                            req_id,
                        )
                        raise AIRateLimitError() from exc

                elif status_code in (401, 403):
                    logger.error(
                        "Gemini authentication failure [request_id=%s]",
                        req_id,
                    )
                    raise AIConfigurationError(
                        "Gemini rejected the configured API credentials"
                    ) from exc

                elif (
                    isinstance(exc, httpx.TransportError)
                    or (status_code is not None and status_code >= 500)
                ):
                    if attempt == max_attempts - 1:
                        logger.error(
                            "Gemini upstream unavailable [request_id=%s]",
                            req_id,
                        )
                        raise BrandGuardAIError(
                            "Gemini service is temporarily unavailable",
                            status_code=502,
                        ) from exc

                else:
                    logger.exception(
                        "Gemini API failure [request_id=%s]",
                        req_id,
                    )
                    raise BrandGuardAIError(
                        "Gemini request failed",
                        status_code=502,
                    ) from exc

            await asyncio.sleep(min(2 ** attempt, 8))

        if response is None:
            logger.error(
                "Gemini returned no response [request_id=%s]",
                req_id,
            )
            raise BrandGuardAIError(
                f"Gemini request failed: {type(last_error).__name__}",
                status_code=502,
            )

        metadata = getattr(response, "usage_metadata", None)

        if metadata is not None:
            usage.add(
                int(getattr(metadata, "prompt_token_count", 0) or 0),
                int(getattr(metadata, "candidates_token_count", 0) or 0),
            )

        try:
            raw_text = response.text
        except (AttributeError, ValueError):
            raw_text = None

        if not raw_text:
            raise MalformedAIResponseError(
                "Gemini returned no usable text content"
            )

        try:
            parsed = json.loads(_strip_code_fences(raw_text))
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning(
                "Invalid JSON from Gemini [request_id=%s]",
                req_id,
            )
            raise MalformedAIResponseError(
                "Gemini response was not valid JSON"
            ) from exc

        try:
            validated = response_model.model_validate(parsed)
        except ValidationError as exc:
            logger.warning(
                "Gemini schema mismatch [request_id=%s]: %s",
                req_id,
                exc,
            )
            raise MalformedAIResponseError(
                "Gemini JSON failed schema validation"
            ) from exc

        duration_ms = (time.perf_counter() - start) * 1000.0

        logger.info(
            "gemini_call request_id=%s model=%s input_tokens=%d "
            "output_tokens=%d duration_ms=%.2f",
            req_id,
            target_model,
            usage.input_tokens,
            usage.output_tokens,
            duration_ms,
        )

        return validated, usage
