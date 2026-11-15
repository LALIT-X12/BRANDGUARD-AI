import json
from typing import Any

from app.config import get_settings
from app.integrations.redis_client import get_redis_client


def get_cached_json(key: str) -> Any | None:
    """Fetch a JSON-serialized value from Redis cache, returning None on miss or error."""
    try:
        raw = get_redis_client().get(f"brandguard:cache:{key}")
        return json.loads(raw) if raw is not None else None
    except Exception:
        return None


def set_cached_json(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    """Store a JSON-serialized value in Redis cache."""
    ttl = ttl_seconds or get_settings().CACHE_TTL_SECONDS
    try:
        get_redis_client().setex(f"brandguard:cache:{key}", ttl, json.dumps(value, default=str))
    except Exception:
        pass


def invalidate_cache_key(key: str) -> None:
    """Delete a specific cache key."""
    try:
        get_redis_client().delete(f"brandguard:cache:{key}")
    except Exception:
        pass

