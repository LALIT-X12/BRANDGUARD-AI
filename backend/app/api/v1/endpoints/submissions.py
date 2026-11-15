import os
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import BrandGuardException, ForbiddenException, NotFoundException
from app.core.permissions import Permission, get_permissions_for_roles
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.submission import Submission
from app.schemas.submission import SubmissionOut, SubmissionTextCreate
from app.services.ingestion_service import ingest_submission

router = APIRouter()

_ALLOWED_UPLOAD_FORMATS = {"text", "markdown", "html", "docx", "pdf", "image"}


def _sanitize_filename(filename: str | None, fallback: str) -> str:
    if not filename:
        return fallback
    base = os.path.basename(filename)
    return re.sub(r"[^A-Za-z0-9._-]", "_", base)[:120] or fallback


def _can_access_sensitive(current_user: CurrentUser, sub: Submission) -> bool:
    if sub.sensitivity_label not in {"confidential", "regulated"}:
        return True
    if sub.creator_id == current_user.user_id:
        return True
    perms = get_permissions_for_roles(current_user.roles)
    if sub.sensitivity_label == "confidential":
        return Permission.REVIEW_CONFIDENTIAL in perms
    return Permission.REVIEW_REGULATED in perms


@router.post("/text", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def submit_text(
    payload: SubmissionTextCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.SUBMIT_CONTENT)),
    db: Session = Depends(get_db),
) -> Submission:
    """Submit inline text, markdown, HTML, or social post content."""
    return ingest_submission(
        db,
        tenant_id=current_user.tenant_id,
        creator_id=current_user.user_id,
        title=payload.title,
        channel=payload.channel,
        audience=payload.audience,
        intent=payload.intent,
        content_format=payload.content_format,
        sensitivity_label=payload.sensitivity_label,
        raw_text=payload.raw_text,
    )


@router.post("/upload", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def submit_file(
    title: str = Form(..., min_length=2, max_length=255),
    channel: str = Form(..., min_length=2, max_length=80),
    audience: str = Form(..., min_length=2, max_length=120),
    intent: str = Form(..., min_length=2),
    content_format: str = Form(...),
    sensitivity_label: str = Form("internal"),
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_permission(Permission.SUBMIT_CONTENT)),
    db: Session = Depends(get_db),
) -> Submission:
    """Submit a file (DOCX, PDF, HTML, Markdown, Text, or Image) via multipart upload."""
    if content_format.lower() not in _ALLOWED_UPLOAD_FORMATS:
        raise BrandGuardException(f"Unsupported upload format '{content_format}'")
    if sensitivity_label not in {"public", "internal", "confidential", "regulated"}:
        raise BrandGuardException(f"Invalid sensitivity_label '{sensitivity_label}'")

    max_bytes = get_settings().MAX_UPLOAD_SIZE_BYTES
    file_bytes = await file.read(max_bytes + 1)
    if len(file_bytes) > max_bytes:
        raise BrandGuardException(
            f"Uploaded file exceeds maximum allowed size of {max_bytes} bytes",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            error_code="PAYLOAD_TOO_LARGE",
        )

    safe_name = _sanitize_filename(file.filename, f"upload.{content_format}")
    return ingest_submission(
        db,
        tenant_id=current_user.tenant_id,
        creator_id=current_user.user_id,
        title=title,
        channel=channel,
        audience=audience,
        intent=intent,
        content_format=content_format,
        sensitivity_label=sensitivity_label,
        file_bytes=file_bytes,
        filename=safe_name,
        mime_type=file.content_type,
    )


@router.get("", response_model=list[SubmissionOut])
def list_submissions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Submission]:
    """List submissions belonging to the authenticated user's tenant, filtered by sensitivity."""
    rows = db.scalars(
        select(Submission)
        .where(Submission.tenant_id == current_user.tenant_id)
        .order_by(Submission.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [sub for sub in rows if _can_access_sensitive(current_user, sub)]


@router.get("/{submission_id}", response_model=SubmissionOut)
def get_submission(
    submission_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Submission:
    """Retrieve a single submission (tenant-isolated and sensitivity-checked)."""
    sub = db.scalar(
        select(Submission).where(
            Submission.id == submission_id, Submission.tenant_id == current_user.tenant_id
        )
    )
    if not sub:
        raise NotFoundException("Submission", str(submission_id))
    if not _can_access_sensitive(current_user, sub):
        raise ForbiddenException("Access denied for this sensitivity classification")
    return sub
