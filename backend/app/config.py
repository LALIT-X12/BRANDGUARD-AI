from functools import lru_cache
from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "BrandGuard Backend"
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # API Gateway / Proxy / Security
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://localhost:3000",
        ]
    )
    TRUSTED_HOSTS: list[str] = Field(default_factory=lambda: ["*"])
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 120
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # Database
    DATABASE_URL: str = "postgresql+psycopg://brandguard:brandguard@localhost:5432/brandguard"
    DATABASE_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # Redis & Caching
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 300

    # Security / JWT / OIDC
    SECRET_KEY: SecretStr = SecretStr("change-me-in-production-use-a-long-random-secret")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    OIDC_ISSUER: str | None = None
    OIDC_CLIENT_ID: str | None = None
    OIDC_CLIENT_SECRET: SecretStr | None = None

    # S3 / MinIO
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: SecretStr = SecretStr("minioadmin")
    S3_BUCKET_NAME: str = "brandguard-assets"
    S3_REGION: str = "us-east-1"

    # External Integration Adapters & Circuit Breaker
    AI_INTEGRATION_URL: str = "http://localhost:8001"
    AI_INTEGRATION_SERVICE_TOKEN: SecretStr | None = None
    AI_INTEGRATION_TIMEOUT_SECONDS: int = 30
    CHECKER_ENGINE_URL: str = "http://localhost:8002"
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_SECONDS: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.APP_ENV.lower() == "production":
            secret = self.SECRET_KEY.get_secret_value()
            if "change-me" in secret or len(secret) < 32:
                raise ValueError(
                    "SECRET_KEY must be a strong secret (>= 32 chars) in production"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
