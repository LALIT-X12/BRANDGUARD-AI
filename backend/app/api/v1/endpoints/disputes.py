import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.dispute import Dispute
from app.models.issue import Issue
from app.schemas.fix import DisputeCreate, DisputeOut, DisputeResolve
from app.services.audit_service import record_audit_event

router = APIRouter()


@router.post("", response_model=DisputeOut, status_code=status.HTTP_201_CREATED)
def create_dispute(
    payload: DisputeCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.DISPUTE_ISSUE)),
    db: Session = Depends(get_db),
) -> Dispute:
    """Submit a creator dispute against an issue."""
    issue = db.scalar(
        select(Issue).where(Issue.id == payload.issue_id, Issue.tenant_id == current_user.tenant_id)
    )
    if not issue:
        raise NotFoundException("Issue", str(payload.issue_id))

    dispute = Dispute(
        tenant_id=current_user.tenant_id,
        issue_id=issue.id,
        creator_id=current_user.user_id,
        reason_code=payload.reason_code,
        rule_ref=issue.rule_ref,
        explanation=payload.explanation,
        status="open",
    )
    issue.status = "disputed"
    db.add(dispute)
    db.flush()
    record_audit_event(
        db,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.user_id,
        action="dispute.created",
        resource_type="dispute",
        resource_id=str(dispute.id),
        details={"issue_id": str(issue.id), "reason_code": payload.reason_code},
    )
    db.commit()
    db.refresh(dispute)
    return dispute


@router.post("/{dispute_id}/resolve", response_model=DisputeOut)
def resolve_dispute(
    dispute_id: uuid.UUID,
    payload: DisputeResolve,
    current_user: CurrentUser = Depends(require_permission(Permission.REVIEW_LOW_RISK)),
    db: Session = Depends(get_db),
) -> Dispute:
    """Resolve an open dispute with reviewer outcome."""
    dispute = db.scalar(
        select(Dispute).where(
            Dispute.id == dispute_id, Dispute.tenant_id == current_user.tenant_id
        )
    )
    if not dispute:
        raise NotFoundException("Dispute", str(dispute_id))

    dispute.status = payload.status
    dispute.reviewer_outcome = payload.reviewer_outcome
    dispute.resolved_by = current_user.user_id

    record_audit_event(
        db,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.user_id,
        action="dispute.resolved",
        resource_type="dispute",
        resource_id=str(dispute.id),
        details={"status": payload.status},
    )
    db.commit()
    db.refresh(dispute)
    return dispute

