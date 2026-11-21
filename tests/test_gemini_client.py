import base64
from types import SimpleNamespace

import httpx
import pytest
from pydantic import BaseModel

from app.clients.gemini_client import GeminiClient
from app.core.config import Settings
from app.core.exceptions import (
    AIRateLimitError,
    AIUpstreamTimeoutError,
    MalformedAIResponseError,
)


class SampleOutput(BaseModel):
    answer: str


class FakeModels:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


class FakeAsyncClient:
    def __init__(self, models):
        self.models = models
        self.closed = False

    async def aclose(self):
        self.closed = True


def make_client(retries=1):
    settings = Settings(
        GEMINI_API_KEY="offline-test-key",
        GEMINI_MODEL="test-model",
        GEMINI_MAX_RETRIES=retries,
        GEMINI_MAX_TOKENS=256,
        GEMINI_TIMEOUT_SECONDS=5,
        GEMINI_TEMPERATURE=0.1,
    )
    return GeminiClient(settings=settings)


def fake_response(text='{"answer":"BrandGuard is working"}'):
    return SimpleNamespace(
        text=text,
        usage_metadata=SimpleNamespace(
            prompt_token_count=120,
            candidates_token_count=45,
        ),
    )


@pytest.mark.asyncio
async def test_complete_json_success_and_token_usage(monkeypatch):
    client = make_client()
    models = FakeModels(response=fake_response())
    fake = FakeAsyncClient(models)

    monkeypatch.setattr(client, "_get_async_client", lambda: fake)

    result, usage = await client.complete_json(
        system_prompt="Return a JSON answer.",
        user_content="Test BrandGuard.",
        response_model=SampleOutput,
        request_id="offline-success",
    )

    assert result.answer == "BrandGuard is working"
    assert usage.input_tokens == 120
    assert usage.output_tokens == 45
    assert usage.calls == 1
    assert len(models.calls) == 1
    assert models.calls[0]["model"] == "test-model"


def test_convert_content_preserves_image_and_text():
    client = make_client()
    image_bytes = b"brandguard-test-image"
    encoded = base64.b64encode(image_bytes).decode("ascii")

    parts = client._convert_content([
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": encoded,
            },
        },
        {
            "type": "text",
            "text": "Analyze this creative.",
        },
    ])

    assert len(parts) == 2
    assert parts[0].inline_data.mime_type == "image/png"
    assert parts[0].inline_data.data == image_bytes
    assert parts[1].text == "Analyze this creative."


@pytest.mark.asyncio
async def test_rate_limit_is_classified_correctly(monkeypatch):
    client = make_client(retries=1)

    class RateLimitError(Exception):
        code = 429

    models = FakeModels(error=RateLimitError("rate limited"))
    fake = FakeAsyncClient(models)
    monkeypatch.setattr(client, "_get_async_client", lambda: fake)

    with pytest.raises(AIRateLimitError):
        await client.complete_json(
            system_prompt="Return JSON.",
            user_content="Test.",
            response_model=SampleOutput,
        )


@pytest.mark.asyncio
async def test_http_timeout_is_classified_correctly(monkeypatch):
    client = make_client(retries=1)
    models = FakeModels(error=httpx.ReadTimeout("timed out"))
    fake = FakeAsyncClient(models)
    monkeypatch.setattr(client, "_get_async_client", lambda: fake)

    with pytest.raises(AIUpstreamTimeoutError):
        await client.complete_json(
            system_prompt="Return JSON.",
            user_content="Test.",
            response_model=SampleOutput,
        )


@pytest.mark.asyncio
async def test_invalid_json_is_rejected(monkeypatch):
    client = make_client()
    models = FakeModels(response=fake_response("not valid JSON"))
    fake = FakeAsyncClient(models)
    monkeypatch.setattr(client, "_get_async_client", lambda: fake)

    with pytest.raises(MalformedAIResponseError):
        await client.complete_json(
            system_prompt="Return JSON.",
            user_content="Test.",
            response_model=SampleOutput,
        )


@pytest.mark.asyncio
async def test_async_client_can_be_closed():
    client = make_client()
    fake = FakeAsyncClient(FakeModels())
    client._client = fake
    client._sdk_client = object()

    await client.aclose()

    assert fake.closed is True
    assert client._client is None
    assert client._sdk_client is None
