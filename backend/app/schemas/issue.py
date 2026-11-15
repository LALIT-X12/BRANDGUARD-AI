import uuid
from pydantic import BaseModel


class IssueOut(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    content_version_id: uuid.UUID
    review_session_id: uuid.UUID
    category: str
    severity: str
    confidence: float
    evidence: str
    rule_ref: str
    source_ref: str | None
    suggested_fix: str | None
    checker_type: str
    status: str

    model_config = {"from_attributes": True}

