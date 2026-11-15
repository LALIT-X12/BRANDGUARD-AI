import json
import uuid

from sqlalchemy import select

from app.core.logging import get_logger, setup_logging
from app.database.session import SessionLocal
from app.integrations.redis_client import INGESTION_QUEUE, get_redis_client
from app.models.review import BackgroundJob

logger = get_logger(__name__)


def process_ingestion_job(payload: dict) -> None:
    """Mark asynchronous post-ingestion tasks complete."""
    job_id = uuid.UUID(payload["job_id"])
    with SessionLocal() as db:
        job = db.scalar(select(BackgroundJob).where(BackgroundJob.id == job_id))
        if job:
            job.status = "completed"
            job.progress = 1.0
            db.commit()


def run_worker_loop() -> None:
    setup_logging()
    redis_client = get_redis_client()
    logger.info("Ingestion worker listening on %s", INGESTION_QUEUE)
    while True:
        item = redis_client.blpop(INGESTION_QUEUE, timeout=5)
        if item is None:
            continue
        _, raw_payload = item
        process_ingestion_job(json.loads(raw_payload))


if __name__ == "__main__":
    run_worker_loop()

