import asyncio
import json
import uuid

from app.core.logging import get_logger, setup_logging
from app.database.session import SessionLocal
from app.integrations.redis_client import FIX_QUEUE, get_redis_client
from app.services.fix_workflow import request_and_validate_fix

logger = get_logger(__name__)


def process_fix_job(payload: dict) -> None:
    """Run asynchronous fix generation and validation workflow."""
    with SessionLocal() as db:
        asyncio.run(
            request_and_validate_fix(
                db,
                tenant_id=uuid.UUID(payload["tenant_id"]),
                actor_id=uuid.UUID(payload["actor_id"]),
                issue_id=uuid.UUID(payload["issue_id"]),
            )
        )


def run_worker_loop() -> None:
    setup_logging()
    redis_client = get_redis_client()
    logger.info("Fix worker listening on %s", FIX_QUEUE)
    while True:
        item = redis_client.blpop(FIX_QUEUE, timeout=5)
        if item is None:
            continue
        _, raw_payload = item
        process_fix_job(json.loads(raw_payload))


if __name__ == "__main__":
    run_worker_loop()

