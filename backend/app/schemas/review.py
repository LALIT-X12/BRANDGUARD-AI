import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ReviewSessionCreate(BaseModel):
    submission_id: uuid.UUID
    content_version_id: uuid.UUID | None = None


class ReviewSessionOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    submission_id: uuid.UUID
    content_version_id: uuid.UUID
    status: str
    risk_level: str | None
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ApprovalRequest(BaseModel):
    submission_id: uuid.UUID
    decision: str = Field(pattern=r"^(approved|rejected|changes_requested)$")
    notes: str | None = None


class ApprovalOut(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    content_version_id: uuid.UUID
    reviewer_id: uuid.UUID
    decision: str
    notes: str | None
    locked_version: bool
    created_at: datetime

    model_config = {"from_attributes": True}

