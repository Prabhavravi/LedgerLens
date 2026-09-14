from typing import Literal

from pydantic import BaseModel, Field
from app.schemas.category import Category


class Budget(BaseModel):
    id: str
    userId: str
    categoryId: str
    month: str
    amountCents: int


class CreateBudgetInput(BaseModel):
    categoryId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    amountCents: int = Field(gt=0, le=100_000_000)


class UpdateBudgetInput(BaseModel):
    amountCents: int = Field(gt=0, le=100_000_000)


class BudgetStatus(BaseModel):
    budget: Budget
    category: Category
    spentCents: int
    remainingCents: int
    percentageUsed: float
    exceeded: bool
    status: Literal["on_track", "warning", "exceeded"]
