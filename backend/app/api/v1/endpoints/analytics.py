from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.services.analytics_service import get_dashboard_analytics

router = APIRouter()


@router.get("/dashboard")
def dashboard_analytics(
    current_user: CurrentUser = Depends(require_permission(Permission.VIEW_ANALYTICS)),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Return aggregated governance & compliance metrics for the dashboard."""
    return get_dashboard_analytics(db, current_user.tenant_id)

