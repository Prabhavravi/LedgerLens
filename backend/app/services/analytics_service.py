import calendar
from typing import Optional
from app.repositories.analytics_repo import AnalyticsRepository
from app.services.budget_service import BudgetService
from app.schemas.analytics import (
    CategorySpending,
    FinancialAnalytics,
    FinancialSummary,
    SpendingTrend,
)


def previous_month(month_str: str) -> str:
    year, month = map(int, month_str.split("-"))
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def days_in_month(month_str: str) -> int:
    year, month = map(int, month_str.split("-"))
    return calendar.monthrange(year, month)[1]


class AnalyticsService:
    def __init__(self, analytics_repo: AnalyticsRepository, budget_service: BudgetService):
        self.analytics_repo = analytics_repo
        self.budget_service = budget_service

    async def get_financial_summary(self, user_id: str, period: str) -> FinancialSummary:
        income_cents, expense_cents = await self.analytics_repo.totals_for_user_period(
            user_id, period
        )
        net_savings_cents = income_cents - expense_cents
        savings_rate: Optional[float] = None
        if income_cents > 0:
            savings_rate = round(((income_cents - expense_cents) / income_cents) * 10000) / 100

        days = days_in_month(period)
        avg_daily = round(expense_cents / days) if days > 0 else 0

        return FinancialSummary(
            period=period,
            incomeCents=income_cents,
            expenseCents=expense_cents,
            netSavingsCents=net_savings_cents,
            savingsRate=savings_rate,
            averageDailyExpenseCents=avg_daily,
        )

    async def get_category_breakdown(self, user_id: str, period: str) -> list[CategorySpending]:
        items = await self.analytics_repo.category_spending_for_user_period(user_id, period)
        _, expense_cents = await self.analytics_repo.totals_for_user_period(user_id, period)

        for item in items:
            if expense_cents > 0:
                item.percentageOfExpenses = (
                    round((item.amountCents / expense_cents) * 10000) / 100
                )
            else:
                item.percentageOfExpenses = 0.0
        return items

    async def get_spending_trends(self, user_id: str, period: str) -> SpendingTrend:
        current_expense = await self.analytics_repo.expense_total_for_user_period(user_id, period)
        prior = previous_month(period)
        prior_expense = await self.analytics_repo.expense_total_for_user_period(user_id, prior)
        change_cents = current_expense - prior_expense

        change_percent: Optional[float] = None
        if prior_expense > 0:
            change_percent = round((change_cents / prior_expense) * 10000) / 100

        return SpendingTrend(
            month=period,
            expenseCents=current_expense,
            previousExpenseCents=prior_expense,
            changeCents=change_cents,
            changePercent=change_percent,
        )

    async def get_dashboard(self, user_id: str, period: str) -> FinancialAnalytics:
        summary = await self.get_financial_summary(user_id, period)
        category_breakdown = await self.get_category_breakdown(user_id, period)
        spending_trend = await self.get_spending_trends(user_id, period)
        largest = await self.analytics_repo.largest_expenses_for_user_period(user_id, period, 5)
        budgets = await self.budget_service.list_statuses_for_user(user_id, period)

        return FinancialAnalytics(
            summary=summary,
            categoryBreakdown=category_breakdown,
            spendingTrend=spending_trend,
            largestTransactions=largest,
            budgetOverview=budgets,
        )
