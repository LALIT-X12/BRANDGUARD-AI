from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    approvals,
    assets,
    assignments,
    audit,
    auth,
    claims,
    disputes,
    fixes,
    glossary,
    guidelines,
    issues,
    reviews,
    submissions,
    tenants,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["Tenants"])
api_router.include_router(guidelines.router, prefix="/guidelines", tags=["Guidelines"])
api_router.include_router(glossary.router, prefix="/glossary", tags=["Glossary"])
api_router.include_router(claims.router, prefix="/claims", tags=["Claims"])
api_router.include_router(assets.router, prefix="/assets", tags=["Visual Assets"])
api_router.include_router(submissions.router, prefix="/submissions", tags=["Submissions"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["Reviews"])
api_router.include_router(issues.router, prefix="/issues", tags=["Issues"])
api_router.include_router(fixes.router, prefix="/fixes", tags=["Fixes"])
api_router.include_router(disputes.router, prefix="/disputes", tags=["Disputes"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["Assignments"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["Approvals"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])

