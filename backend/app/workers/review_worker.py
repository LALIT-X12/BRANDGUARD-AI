import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.logging import get_logger, setup_logging
from app.database.session import SessionLocal
from app.integrations.redis_client import REVIEW_QUEUE, enqueue_job, get_redis_client

REVIEW_DLQ = "brandguard:queue:review:dlq"
MAX_JOB_ATTEMPTS = 3
from app.models.review import BackgroundJob, CheckerResult, ReviewSession
from app.models.submission import Submission
from app.services.review_orchestrator import run_deterministic_terminology_check
from app.services.routing_service import assign_reviewer

logger = get_logger(__name__)


def process_review_job(payload: dict) -> None:
    """Execute deterministic checkers and update review session state."""
    session_id = uuid.UUID(payload["review_session_id"])
    tenant_id = uuid.UUID(payload["tenant_id"])
    job_id = uuid.UUID(payload["job_id"])

    with SessionLocal() as db:
        job = db.scalar(select(BackgroundJob).where(BackgroundJob.id == job_id))
        session = db.scalar(
            select(ReviewSession).where(
                ReviewSession.id == session_id, ReviewSession.tenant_id == tenant_id
            )
        )
        if not session:
            return

        if job:
            job.status = "running"
            job.attempts += 1

        session.status = "running"
        db.commit()

        try:
            run_deterministic_terminology_check(db, tenant_id=tenant_id, review_session=session)
            term_result = db.scalar(
                select(CheckerResult).where(
                    CheckerResult.review_session_id == session.id,
                    CheckerResult.checker_name == "terminology_checker",
                )
            )
            if term_result:
                term_result.status = "completed"

            session.status = "completed"
            session.completed_at = datetime.now(timezone.utc)

            submission = db.scalar(
                select(Submission).where(
                    Submission.id == session.submission_id, Submission.tenant_id == tenant_id
                )
            )
            if submission:
                assign_reviewer(db, tenant_id=tenant_id, submission=submission, review_session=session)

            if job:
                job.status = "completed"
                job.progress = 1.0
            db.commit()
        except Exception as exc:
            logger.exception("Review job %s failed", job_id)
            session.status = "failed"
            attempts = job.attempts if job else MAX_JOB_ATTEMPTS
            if job:
                job.status = "retrying" if attempts < MAX_JOB_ATTEMPTS else "dead_lettered"
                job.error_message = str(exc)
            db.commit()

            if attempts < MAX_JOB_ATTEMPTS:
                enqueue_job(REVIEW_QUEUE, payload)
            else:
                enqueue_job(REVIEW_DLQ, {**payload, "error": str(exc)})


def run_worker_loop() -> None:
    """Block on Redis REVIEW_QUEUE and process incoming review jobs."""
    setup_logging()
    redis_client = get_redis_client()
    logger.info("Review worker listening on %s", REVIEW_QUEUE)
    while True:
        item = redis_client.blpop(REVIEW_QUEUE, timeout=5)
        if item is None:
            continue
        _, raw_payload = item
        process_review_job(json.loads(raw_payload))


if __name__ == "__main__":
    run_worker_loop()

