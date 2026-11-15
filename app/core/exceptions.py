class BrandGuardAIError(Exception):
    """Base exception for the BrandGuard AI service."""

    def __init__(self, message: str, status_code: int = 500, error_code: str = "AI_ERROR") -> None:
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)


class AIConfigurationError(BrandGuardAIError):
    def __init__(self, message: str = "Anthropic API key is not configured") -> None:
        super().__init__(message, status_code=500, error_code="AI_CONFIGURATION_ERROR")


class AIRateLimitError(BrandGuardAIError):
    def __init__(self, message: str = "Upstream AI rate limit exceeded") -> None:
        super().__init__(message, status_code=429, error_code="AI_RATE_LIMIT")


class AIUpstreamTimeoutError(BrandGuardAIError):
    def __init__(self, message: str = "Upstream AI request timed out") -> None:
        super().__init__(message, status_code=504, error_code="AI_TIMEOUT")


class MalformedAIResponseError(BrandGuardAIError):
    def __init__(self, message: str = "Claude returned malformed or invalid JSON output") -> None:
        super().__init__(message, status_code=502, error_code="MALFORMED_AI_RESPONSE")


class ServiceAuthError(BrandGuardAIError):
    def __init__(self, message: str = "Invalid or missing service authentication token") -> None:
        super().__init__(message, status_code=401, error_code="SERVICE_UNAUTHORIZED")

