import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings
from app.core.exceptions import UnauthorizedException
from app.integrations.redis_client import get_redis_client

REVOKED_TOKEN_PREFIX = "brandguard:revoked_jti:"


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against its bcrypt hash."""
    if not hashed_password or not hashed_password.startswith("$2"):
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8")
        )
    except ValueError:
        return False


def create_access_token(
    subject: str,
    tenant_id: str,
    roles: list[str],
    expires_delta: timedelta | None = None,
) -> str:
    """Generate a signed JWT access token containing subject, tenant, roles, and jti."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "tenant_id": tenant_id,
        "roles": roles,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(
        payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.JWT_ALGORITHM
    )


def create_refresh_token(subject: str, tenant_id: str) -> str:
    """Generate a signed JWT refresh token with jti."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": subject,
        "tenant_id": tenant_id,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }
    return jwt.encode(
        payload, settings.SECRET_KEY.get_secret_value(), algorithm=settings.JWT_ALGORITHM
    )


def revoke_token_jti(jti: str, ttl_seconds: int = 86400) -> None:
    """Store a revoked token JTI in Redis until expiry."""
    try:
        client = get_redis_client()
        client.setex(f"{REVOKED_TOKEN_PREFIX}{jti}", max(ttl_seconds, 1), "1")
    except Exception:
        pass


def is_token_revoked(jti: str | None) -> bool:
    """Check whether a token JTI has been revoked."""
    if not jti:
        return False
    try:
        client = get_redis_client()
        return bool(client.exists(f"{REVOKED_TOKEN_PREFIX}{jti}"))
    except Exception:
        return False


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token, checking signature, expiry, and revocation."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise UnauthorizedException("Invalid or expired authentication token") from exc

    if is_token_revoked(payload.get("jti")):
        raise UnauthorizedException("Token has been revoked")
    return payload
