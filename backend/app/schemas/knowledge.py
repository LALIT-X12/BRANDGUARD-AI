import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class GuidelineRuleCreate(BaseModel):
    rule_code: str = Field(min_length=2, max_length=80)
    category: str = Field(min_length=2, max_length=80)
    severity: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    title: str = Field(min_length=2, max_length=255)
    description: str
    channel_scope: str | None = None
    priority: int = 100


class GuidelineRuleOut(GuidelineRuleCreate):
    id: uuid.UUID
    guideline_id: uuid.UUID
    is_active: bool

    model_config = {"from_attributes": True}


class GuidelineCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    version: str = "1.0"
    description: str | None = None
    rules: list[GuidelineRuleCreate] = Field(default_factory=list)


class GuidelineOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    title: str
    version: str
    description: str | None
    storage_key: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class GlossaryCreate(BaseModel):
    term: str = Field(min_length=1, max_length=200)
    status: str = Field(pattern=r"^(approved|prohibited)$")
    preferred_term: str | None = None
    rationale: str | None = None
    category: str | None = None
    is_case_sensitive: bool = False


class GlossaryOut(GlossaryCreate):
    id: uuid.UUID
    tenant_id: uuid.UUID

    model_config = {"from_attributes": True}


class ClaimSourceCreate(BaseModel):
    source_title: str = Field(min_length=2, max_length=255)
    source_url: str | None = None
    citation_text: str | None = None


class ClaimCreate(BaseModel):
    claim_code: str = Field(min_length=2, max_length=80)
    statement: str
    scope: str | None = None
    owner_id: uuid.UUID | None = None
    expires_at: datetime | None = None
    is_regulated: bool = False
    sources: list[ClaimSourceCreate] = Field(default_factory=list)


class ClaimOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    claim_code: str
    statement: str
    scope: str | None
    owner_id: uuid.UUID | None
    expires_at: datetime | None
    is_regulated: bool
    is_active: bool

    model_config = {"from_attributes": True}


class VisualAssetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    asset_type: str = Field(pattern=r"^(logo|palette|font|template)$")
    description: str | None = None
    metadata_json: dict | None = None


class VisualAssetOut(VisualAssetCreate):
    id: uuid.UUID
    tenant_id: uuid.UUID
    storage_key: str | None
    mime_type: str | None

    model_config = {"from_attributes": True}

