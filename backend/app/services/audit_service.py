import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def record_audit_event(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    """Append an immutable audit log entry."""
    entry = AuditLog(
        tenant_id=tenant_id,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
    )
    db.add(entry)
    db.flush()
    return entry

