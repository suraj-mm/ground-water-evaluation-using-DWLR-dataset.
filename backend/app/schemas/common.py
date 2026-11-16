from typing import Generic, List, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int = Field(..., ge=0, description="Total matching items")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, le=1000, description="Items per page")
    total_pages: int = Field(..., ge=0, description="Total pages")

class ErrorDetail(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    request_id: str

