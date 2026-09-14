from typing import Optional
from pydantic import BaseModel
from app.schemas.transaction import Transaction
from app.schemas.budget import BudgetStatus


class FinancialSummary(BaseModel):
    period: str
    incomeCents: int
    expenseCents: int
    netSavingsCents: int
    savingsRate: Optional[float]
    averageDailyExpenseCents: int


class CategorySpending(BaseModel):
    categoryId: str
    categoryName: str
    amountCents: int
    percentageOfExpenses: float


class SpendingTrend(BaseModel):
    month: str
    expenseCents: int
    previousExpenseCents: int
    changeCents: int
    changePercent: Optional[float]


class FinancialAnalytics(BaseModel):
    summary: FinancialSummary
    categoryBreakdown: list[CategorySpending]
    spendingTrend: SpendingTrend
    largestTransactions: list[Transaction]
    budgetOverview: list[BudgetStatus]
