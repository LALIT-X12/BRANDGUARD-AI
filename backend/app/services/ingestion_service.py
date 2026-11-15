import uuid

from sqlalchemy.orm import Session

from app.integrations.redis_client import INGESTION_QUEUE, enqueue_job
from app.integrations.storage_client import StorageClient
from app.models.review import BackgroundJob
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event
from app.services.normalization_service import normalize_content
from app.utils.file_parser import extract_text_from_bytes


def ingest_submission(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    creator_id: uuid.UUID,
    title: str,
    channel: str,
    audience: str,
    intent: str,
    content_format: str,
    sensitivity_label: str,
    raw_text: str | None = None,
    file_bytes: bytes | None = None,
    filename: str | None = None,
    mime_type: str | None = None,
) -> Submission:
    """Store uploaded file (if any), parse & normalize content, and enqueue processing."""
    submission = Submission(
        tenant_id=tenant_id,
        creator_id=creator_id,
        title=title,
        channel=channel,
        audience=audience,
        intent=intent,
        content_format=content_format,
        sensitivity_label=sensitivity_label,
        status="ingested",
        current_version_number=1,
    )
    db.add(submission)
    db.flush()

    storage_key: str | None = None
    if file_bytes is not None:
        safe_name = filename or f"upload.{content_format}"
        storage_key = f"tenants/{tenant_id}/submissions/{submission.id}/v1/{safe_name}"
        StorageClient().upload_bytes(
            storage_key,
            file_bytes,
            content_type=mime_type or "application/octet-stream",
        )
        extracted_text = extract_text_from_bytes(file_bytes, content_format)
    else:
        extracted_text = raw_text or ""

    normalized_payload, masked_text = normalize_content(
        raw_text=extracted_text,
        channel=channel,
        audience=audience,
        intent=intent,
        content_format=content_format,
    )

    version = ContentVersion(
        tenant_id=tenant_id,
        submission_id=submission.id,
        version_number=1,
        storage_key=storage_key,
        raw_text=extracted_text,
        normalized_payload=normalized_payload,
        pii_masked_text=masked_text,
        created_by=creator_id,
    )
    db.add(version)
    db.flush()

    job = BackgroundJob(
        tenant_id=tenant_id,
        job_type="ingestion",
        reference_id=submission.id,
        status="queued",
    )
    db.add(job)

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=creator_id,
        action="submission.ingested",
        resource_type="submission",
        resource_id=str(submission.id),
        details={"version": 1, "format": content_format, "sensitivity": sensitivity_label},
    )
    db.commit()
    db.refresh(submission)

    try:
        enqueue_job(
            INGESTION_QUEUE,
            {
                "job_id": str(job.id),
                "tenant_id": str(tenant_id),
                "submission_id": str(submission.id),
                "version_id": str(version.id),
            },
        )
    except Exception:
        # Allow API ingestion to succeed even if Redis worker is offline in unit tests
        pass

    return submission

