from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


class BrandGuardException(Exception):
    """Base application exception with HTTP status code and error code."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        error_code: str = "BRANDGUARD_ERROR",
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)


class NotFoundException(BrandGuardException):
    def __init__(self, resource: str, identifier: str | None = None) -> None:
        detail = f"{resource} not found" if not identifier else f"{resource} '{identifier}' not found"
        super().__init__(detail, status.HTTP_404_NOT_FOUND, "NOT_FOUND")


class UnauthorizedException(BrandGuardException):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED")


class ForbiddenException(BrandGuardException):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN, "FORBIDDEN")


class ConflictException(BrandGuardException):
    def __init__(self, message: str = "Resource conflict") -> None:
        super().__init__(message, status.HTTP_409_CONFLICT, "CONFLICT")


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers ensuring zero unhandled stack-trace leaks."""

    @app.exception_handler(BrandGuardException)
    async def brandguard_exception_handler(
        request: Request, exc: BrandGuardException
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                    "request_id": request_id,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request payload",
                    "details": exc.errors(),
                    "request_id": request_id,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.exception("Unhandled exception [request_id=%s]: %s", request_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred",
                    "request_id": request_id,
                }
            },
        )
