from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.glossary import GlossaryEntry
from app.schemas.knowledge import GlossaryCreate, GlossaryOut
from app.services.knowledge_service import create_glossary_entry

router = APIRouter()


@router.post("", response_model=GlossaryOut, status_code=status.HTTP_201_CREATED)
def add_glossary_entry(
    payload: GlossaryCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_KNOWLEDGE)),
    db: Session = Depends(get_db),
) -> GlossaryEntry:
    """Create an approved or prohibited glossary entry."""
    return create_glossary_entry(db, current_user.tenant_id, current_user.user_id, payload)


@router.get("", response_model=list[GlossaryOut])
def list_glossary(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GlossaryEntry]:
    """List glossary entries for the current tenant."""
    return list(
        db.scalars(
            select(GlossaryEntry).where(GlossaryEntry.tenant_id == current_user.tenant_id)
        ).all()
    )

