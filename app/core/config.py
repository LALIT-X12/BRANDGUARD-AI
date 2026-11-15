from functools import lru_cache
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings for the independent BrandGuard AI integration service."""

    APP_NAME: str = "BrandGuard AI Service"
    APP_ENV: str = "development"
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    ANTHROPIC_API_KEY: SecretStr = SecretStr("")
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"
    CLAUDE_VALIDATOR_MODEL: str = "claude-sonnet-4-20250514"
    CLAUDE_MAX_TOKENS: int = 2048
    CLAUDE_TEMPERATURE: float = 0.1
    CLAUDE_TIMEOUT_SECONDS: float = 30.0
    CLAUDE_MAX_RETRIES: int = 3

    SERVICE_AUTH_TOKEN: SecretStr = SecretStr("dev-service-token-change-in-production")

    # MongoDB for evaluation datasets & real submission records
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "brandguard_ai"

    INPUT_TOKEN_COST_PER_1M: float = 3.0
    OUTPUT_TOKEN_COST_PER_1M: float = 15.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()

