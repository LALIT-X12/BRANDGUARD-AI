import json
from typing import Any

import redis

from app.config import get_settings

INGESTION_QUEUE = "brandguard:queue:ingestion"
REVIEW_QUEUE = "brandguard:queue:review"
FIX_QUEUE = "brandguard:queue:fix"


def get_redis_client() -> redis.Redis:
    """Return a configured Redis client."""
    settings = get_settings()
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def check_redis_connection() -> bool:
    """Verify Redis connectivity for health checks."""
    try:
        client = get_redis_client()
        return bool(client.ping())
    except Exception:
        return False


def enqueue_job(queue_name: str, payload: dict[str, Any]) -> None:
    """Push a JSON job payload onto a Redis list queue."""
    client = get_redis_client()
    client.rpush(queue_name, json.dumps(payload))

