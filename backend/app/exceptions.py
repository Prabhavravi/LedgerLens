import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


logger = logging.getLogger(__name__)


class AppException(Exception):
    def __init__(self, code: str, status_code: int, message: str):
        self.code = code
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Authentication is required."):
        super().__init__(code="UNAUTHORIZED", status_code=401, message=message)


class ForbiddenException(AppException):
    def __init__(self, message: str = "You do not have permission to perform this action."):
        super().__init__(code="FORBIDDEN", status_code=403, message=message)


class ValidationException(AppException):
    def __init__(self, message: str = "Invalid request."):
        super().__init__(code="VALIDATION_ERROR", status_code=400, message=message)


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found."):
        super().__init__(code="NOT_FOUND", status_code=404, message=message)


async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "error": {"code": exc.code, "message": exc.message}},
    )


async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {}
    msg = first_error.get("msg", "Validation error")
    return JSONResponse(
        status_code=400,
        content={"ok": False, "error": {"code": "VALIDATION_ERROR", "message": msg}},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Keep full diagnostics on the server. The browser must not receive SQL
    # details, credentials, or internal implementation information.
    logger.exception("Unhandled request error: %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}},
    )
