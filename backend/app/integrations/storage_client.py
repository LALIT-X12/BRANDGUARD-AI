import boto3
from botocore.client import Config

from app.config import get_settings


class StorageClient:
    """S3 / MinIO object storage adapter for uploaded files and extracted artifacts."""

    def __init__(self) -> None:
        settings = get_settings()
        self.bucket = settings.S3_BUCKET_NAME
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY.get_secret_value(),
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )

    def ensure_bucket(self) -> None:
        """Create the configured bucket if it does not exist."""
        existing = [b["Name"] for b in self._client.list_buckets().get("Buckets", [])]
        if self.bucket not in existing:
            self._client.create_bucket(Bucket=self.bucket)

    def upload_bytes(
        self, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        """Upload raw bytes to S3/MinIO and return the object key."""
        self.ensure_bucket()
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def download_bytes(self, key: str) -> bytes:
        """Download object bytes by key."""
        response = self._client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def generate_presigned_url(self, key: str, expires_in: int = 300) -> str:
        """Generate a short-lived pre-signed GET URL for authorised access."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
