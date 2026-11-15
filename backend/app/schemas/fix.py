import uuid
from pydantic import BaseModel, Field


class FixRequest(BaseModel):
    issue_id: uuid.UUID


class FixDecisionRequest(BaseModel):
    decision: str = Field(pattern=r"^(accepted|edited|rejected)$")
    edited_content: str | None = None


class FixOut(BaseModel):
    id: uuid.UUID
    issue_id: uuid.UUID
    original_content: str
    proposed_content: str
    retry_count: int
    validation_status: str
    creator_decision: str | None
    requires_human_review: bool

    model_config = {"from_attributes": True}


class DisputeCreate(BaseModel):
    issue_id: uuid.UUID
    reason_code: str = Field(min_length=2, max_length=80)
    explanation: str = Field(min_length=5)


class DisputeResolve(BaseModel):
    status: str = Field(pattern=r"^(upheld|overturned)$")
    reviewer_outcome: str = Field(min_length=3)


class DisputeOut(BaseModel):
    id: uuid.UUID
    issue_id: uuid.UUID
    creator_id: uuid.UUID
    reason_code: str
    rule_ref: str
    explanation: str
    status: str
    reviewer_outcome: str | None

    model_config = {"from_attributes": True}

