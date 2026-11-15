from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import CurrentUser, get_current_user, get_db
from app.models.tenant import Tenant
from app.schemas.auth import TenantCreate, TenantOut
from app.services.auth_service import create_tenant

router = APIRouter()


@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
def create_new_tenant(payload: TenantCreate, db: Session = Depends(get_db)) -> Tenant:
    """Create a new organisation tenant."""
    return create_tenant(db, payload)


@router.get("/current", response_model=TenantOut)
def get_current_tenant(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Tenant | None:
    """Return the authenticated user's tenant."""
    return db.scalar(select(Tenant).where(Tenant.id == current_user.tenant_id))

