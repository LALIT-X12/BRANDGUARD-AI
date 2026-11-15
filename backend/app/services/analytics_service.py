import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.integrations.cache import get_cached_json, set_cached_json
from app.models.claim import ClaimRegistry
from app.models.dispute import Dispute
from app.models.issue import Issue
from app.models.review import Approval
from app.models.submission import Submission


def get_dashboard_analytics(db: Session, tenant_id: uuid.UUID) -> dict[str, object]:
    """Compute aggregated governance & compliance metrics for the dashboard (Redis-cached)."""
    cache_key = f"analytics:{tenant_id}"
    cached = get_cached_json(cache_key)
    if cached is not None:
        return cached
    top_violated_rules = db.execute(
        select(Issue.rule_ref, func.count(Issue.id).label("count"))
        .where(Issue.tenant_id == tenant_id)
        .group_by(Issue.rule_ref)
        .order_by(func.count(Issue.id).desc())
        .limit(10)
    ).all()

    violations_by_channel = db.execute(
        select(Submission.channel, func.count(Issue.id).label("count"))
        .join(Submission, Submission.id == Issue.submission_id)
        .where(Issue.tenant_id == tenant_id)
        .group_by(Submission.channel)
    ).all()

    total_issues = db.scalar(
        select(func.count(Issue.id)).where(Issue.tenant_id == tenant_id)
    ) or 0
    total_disputes = db.scalar(
        select(func.count(Dispute.id)).where(Dispute.tenant_id == tenant_id)
    ) or 0
    overturned_disputes = db.scalar(
        select(func.count(Dispute.id)).where(
            Dispute.tenant_id == tenant_id, Dispute.status == "overturned"
        )
    ) or 0

    stale_claims_count = db.scalar(
        select(func.count(ClaimRegistry.id)).where(
            ClaimRegistry.tenant_id == tenant_id,
            ClaimRegistry.is_active.is_(True),
            ClaimRegistry.expires_at.is_not(None),
            ClaimRegistry.expires_at < datetime.now(timezone.utc),
        )
    ) or 0

    total_approvals = db.scalar(
        select(func.count(Approval.id)).where(Approval.tenant_id == tenant_id)
    ) or 0

    result = {
        "most_violated_guidelines": [
            {"rule_ref": row.rule_ref, "count": row.count} for row in top_violated_rules
        ],
        "violations_by_channel": [
            {"channel": row.channel, "count": row.count} for row in violations_by_channel
        ],
        "dispute_rate": (total_disputes / total_issues) if total_issues else 0.0,
        "override_rate": (overturned_disputes / total_disputes) if total_disputes else 0.0,
        "stale_claims_count": stale_claims_count,
        "total_approvals": total_approvals,
    }
    set_cached_json(cache_key, result, ttl_seconds=60)
    return result

