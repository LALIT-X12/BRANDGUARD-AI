from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.audit import AuditLog

router = APIRouter()


@router.get("")
def list_audit_logs(
    current_user: CurrentUser = Depends(require_permission(Permission.VIEW_AUDIT)),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    """Return append-only audit history for the current tenant."""
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.tenant_id == current_user.tenant_id)
        .order_by(AuditLog.created_at.desc())
        .limit(200)
    ).all()
    return [
        {
            "id": str(log.id),
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

