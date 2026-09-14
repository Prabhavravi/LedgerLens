from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.category import CategoryType

SortOrder = Literal["newest", "oldest", "amount_desc", "amount_asc"]


class Transaction(BaseModel):
    id: str
    userId: str
    categoryId: str
    type: CategoryType
    amountCents: int
    description: str
    occurredOn: str


class CreateTransactionInput(BaseModel):
    categoryId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    type: CategoryType
    amountCents: int = Field(gt=0, le=100_000_000)
    description: str = Field(min_length=1, max_length=255)
    occurredOn: date

    @field_validator("occurredOn", mode="after")
    @classmethod
    def validate_date(cls, v: date) -> date:
        # asyncpg binds PostgreSQL DATE parameters from datetime.date. Keep the
        # parsed value as a date rather than converting it to text here.
        return v


class UpdateTransactionInput(BaseModel):
    categoryId: Optional[str] = Field(default=None, pattern=r"^[0-9a-fA-F-]{36}$")
    type: Optional[CategoryType] = None
    amountCents: Optional[int] = Field(default=None, gt=0, le=100_000_000)
    description: Optional[str] = Field(default=None, min_length=1, max_length=255)
    occurredOn: Optional[date] = None

    @field_validator("occurredOn", mode="after")
    @classmethod
    def validate_date(cls, v: Optional[date]) -> Optional[date]:
        return v


class TransactionFilters(BaseModel):
    type: Optional[CategoryType] = None
    categoryId: Optional[str] = None
    query: Optional[str] = Field(default=None, max_length=100)
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    sort: SortOrder = "newest"

    @model_validator(mode="after")
    def validate_dates(self) -> "TransactionFilters":
        if self.startDate and self.endDate and self.startDate > self.endDate:
            raise ValueError("Start date must be before or equal to end date.")
        return self
