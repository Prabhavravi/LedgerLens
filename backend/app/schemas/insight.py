from typing import Literal, Optional
from pydantic import BaseModel


class SupportingFigure(BaseModel):
    label: str
    value: str


class FinancialInsight(BaseModel):
    id: str
    type: str
    category: Optional[str] = None
    currentValueCents: int
    previousValueCents: int
    percentageChange: float
    severity: Literal["info", "warning", "critical"]
    explanation: str
    recommendation: str
    supportingFigures: list[SupportingFigure]
