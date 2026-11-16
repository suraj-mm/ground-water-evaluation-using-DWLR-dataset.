from typing import Optional
from fastapi import Request
from fastapi.responses import JSONResponse

class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str,
        error_type: str = "about:blank"
    ):
        super().__init__(detail)
        self.status_code = status_code
        self.title = title
        self.detail = detail
        self.error_type = error_type

class NotFoundError(AppException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(
            status_code=404,
            title="Not Found",
            detail=detail,
            error_type="https://errors.cgwb.gov.in/not-found"
        )

class BadRequestError(AppException):
    def __init__(self, detail: str = "Invalid request"):
        super().__init__(
            status_code=400,
            title="Bad Request",
            detail=detail,
            error_type="https://errors.cgwb.gov.in/bad-request"
        )

async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    request_id = request.headers.get("x-request-id", "unknown")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": exc.error_type,
            "title": exc.title,
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": str(request.url),
            "request_id": request_id,
        }
    )

async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.headers.get("x-request-id", "unknown")
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://errors.cgwb.gov.in/internal-error",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc),
            "instance": str(request.url),
            "request_id": request_id,
        }
    )

