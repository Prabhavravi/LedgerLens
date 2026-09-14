from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

GoalPaceStatus = Literal["on_track", "behind", "achieved", "overdue"]


class Goal(BaseModel):
    id: str
    userId: str
    name: str
    targetAmountCents: int
    currentSavedCents: int
    targetDate: str
    description: Optional[str] = None
    createdAt: Optional[str] = None


class CreateGoalInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    targetAmountCents: int = Field(gt=0, le=1_000_000_000)
    currentSavedCents: int = Field(default=0, ge=0, le=1_000_000_000)
    targetDate: date
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("targetDate", mode="after")
    @classmethod
    def validate_date(cls, v: date) -> date:
        # Preserve a native date for asyncpg's PostgreSQL DATE binding.
        return v

    @model_validator(mode="after")
    def saved_amount_cannot_exceed_target(self) -> "CreateGoalInput":
        if self.currentSavedCents > self.targetAmountCents:
            raise ValueError("Current saved amount cannot exceed the target amount.")
        return self


class UpdateGoalInput(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    targetAmountCents: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    currentSavedCents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    targetDate: Optional[date] = None
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("targetDate", mode="after")
    @classmethod
    def validate_date(cls, v: Optional[date]) -> Optional[date]:
        return v

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UpdateGoalInput":
        if (
            self.name is None
            and self.targetAmountCents is None
            and self.currentSavedCents is None
            and self.targetDate is None
            and self.description is None
        ):
            raise ValueError("At least one field must be provided for update.")
        return self


class ContributeGoalInput(BaseModel):
    amountCents: int = Field(gt=0, le=1_000_000_000)


class GoalStatus(BaseModel):
    goal: Goal
    remainingAmountCents: int
    percentageCompleted: float
    remainingMonths: int
    requiredMonthlySavingsCents: int
    status: GoalPaceStatus


class GoalAdjustmentOpportunity(BaseModel):
    categoryId: str
    categoryName: str
    currentMonthlyExpenseCents: int
    suggestedReductionPercent: int
    potentialMonthlySavingsCents: int
    explanation: str


class CalculatedFacts(BaseModel):
    targetAmountCents: int
    currentSavedCents: int
    remainingAmountCents: int
    percentageCompleted: float
    remainingMonths: int
    requiredMonthlySavingsCents: int
    currentMonthlyNetSavingsCents: int
    savingsGapCents: int
    status: GoalPaceStatus


class FeasibilityAnalysis(BaseModel):
    onTrack: bool
    summary: str


class GoalActionPlan(BaseModel):
    goal: Goal
    calculatedFacts: CalculatedFacts
    feasibilityAnalysis: FeasibilityAnalysis
    spendingAdjustmentOpportunities: list[GoalAdjustmentOpportunity]
    disclaimer: str
