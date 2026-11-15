import time
from enum import Enum

from app.core.exceptions import BrandGuardException


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(BrandGuardException):
    """Raised when an external service circuit breaker is open."""

    def __init__(self, service_name: str) -> None:
        super().__init__(
            f"Upstream service '{service_name}' is temporarily unavailable",
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
        )


class CircuitBreaker:
    """Lightweight async-compatible circuit breaker for external HTTP integrations."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.opened_at: float | None = None

    def allow_request(self) -> bool:
        """Check whether a call should be permitted."""
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            if self.opened_at is not None and (time.monotonic() - self.opened_at) >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                return True
            return False
        # HALF_OPEN allows a single probe
        return True

    def record_success(self) -> None:
        """Reset failure count and close the circuit."""
        self.failure_count = 0
        self.opened_at = None
        self.state = CircuitState.CLOSED

    def record_failure(self) -> None:
        """Increment failure count and open the circuit when threshold is reached."""
        self.failure_count += 1
        if self.failure_count >= self.failure_threshold or self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            self.opened_at = time.monotonic()

