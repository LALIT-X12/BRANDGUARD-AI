import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class SubmissionTextCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    channel: str = Field(min_length=2, max_length=80)
    audience: str = Field(min_length=2, max_length=120)
    intent: str = Field(min_length=2)
    content_format: str = Field(default="text", pattern=r"^(text|markdown|html|social)$")
    sensitivity_label: str = Field(
        default="internal", pattern=r"^(public|internal|confidential|regulated)$"
    )
    raw_text: str = Field(min_length=1)


class SubmissionOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    creator_id: uuid.UUID
    title: str
    channel: str
    audience: str
    intent: str
    content_format: str
    sensitivity_label: str
    status: str
    current_version_number: int
    is_locked: bool
    created_at: datetime

    model_config = {"from_attributes": True}

