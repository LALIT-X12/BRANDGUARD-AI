import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import VisualAsset
from app.models.claim import ClaimRegistry, ClaimSource
from app.models.glossary import GlossaryEntry
from app.models.guideline import BrandGuideline, GuidelineRule
from app.schemas.knowledge import (
    ClaimCreate,
    GlossaryCreate,
    GuidelineCreate,
    VisualAssetCreate,
)
from app.services.audit_service import record_audit_event


def create_guideline(
    db: Session, tenant_id: uuid.UUID, actor_id: uuid.UUID, payload: GuidelineCreate
) -> BrandGuideline:
    """Create a brand guideline and its structured rules."""
    guideline = BrandGuideline(
        tenant_id=tenant_id,
        title=payload.title,
        version=payload.version,
        description=payload.description,
        created_by=actor_id,
    )
    db.add(guideline)
    db.flush()

    for rule_in in payload.rules:
        db.add(
            GuidelineRule(
                tenant_id=tenant_id,
                guideline_id=guideline.id,
                rule_code=rule_in.rule_code,
                category=rule_in.category,
                severity=rule_in.severity,
                title=rule_in.title,
                description=rule_in.description,
                channel_scope=rule_in.channel_scope,
                priority=rule_in.priority,
            )
        )

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="guideline.created",
        resource_type="brand_guideline",
        resource_id=str(guideline.id),
        details={"title": guideline.title, "rule_count": len(payload.rules)},
    )
    db.commit()
    db.refresh(guideline)
    return guideline


def create_glossary_entry(
    db: Session, tenant_id: uuid.UUID, actor_id: uuid.UUID, payload: GlossaryCreate
) -> GlossaryEntry:
    """Add an approved or prohibited terminology entry."""
    entry = GlossaryEntry(tenant_id=tenant_id, **payload.model_dump())
    db.add(entry)
    db.flush()
    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="glossary.created",
        resource_type="glossary_entry",
        resource_id=str(entry.id),
        details={"term": entry.term, "status": entry.status},
    )
    db.commit()
    db.refresh(entry)
    return entry


def create_claim(
    db: Session, tenant_id: uuid.UUID, actor_id: uuid.UUID, payload: ClaimCreate
) -> ClaimRegistry:
    """Register an approved claim with owner, expiry, and supporting sources."""
    claim = ClaimRegistry(
        tenant_id=tenant_id,
        claim_code=payload.claim_code,
        statement=payload.statement,
        scope=payload.scope,
        owner_id=payload.owner_id or actor_id,
        expires_at=payload.expires_at,
        is_regulated=payload.is_regulated,
    )
    db.add(claim)
    db.flush()

    for src in payload.sources:
        db.add(
            ClaimSource(
                tenant_id=tenant_id,
                claim_id=claim.id,
                source_title=src.source_title,
                source_url=src.source_url,
                citation_text=src.citation_text,
            )
        )

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="claim.created",
        resource_type="claim_registry",
        resource_id=str(claim.id),
        details={"claim_code": claim.claim_code, "is_regulated": claim.is_regulated},
    )
    db.commit()
    db.refresh(claim)
    return claim


def create_visual_asset(
    db: Session,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    payload: VisualAssetCreate,
    storage_key: str | None = None,
    mime_type: str | None = None,
) -> VisualAsset:
    """Register a brand visual asset (logo, palette, font, or template)."""
    asset = VisualAsset(
        tenant_id=tenant_id,
        name=payload.name,
        asset_type=payload.asset_type,
        description=payload.description,
        metadata_json=payload.metadata_json,
        storage_key=storage_key,
        mime_type=mime_type,
    )
    db.add(asset)
    db.flush()
    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="asset.created",
        resource_type="visual_asset",
        resource_id=str(asset.id),
        details={"name": asset.name, "asset_type": asset.asset_type},
    )
    db.commit()
    db.refresh(asset)
    return asset


def get_stale_claims(db: Session, tenant_id: uuid.UUID) -> list[ClaimRegistry]:
    """Return active claims whose expiry date has passed."""
    now = datetime.now(timezone.utc)
    stmt = select(ClaimRegistry).where(
        ClaimRegistry.tenant_id == tenant_id,
        ClaimRegistry.is_active.is_(True),
        ClaimRegistry.expires_at.is_not(None),
        ClaimRegistry.expires_at < now,
    )
    return list(db.scalars(stmt).all())

