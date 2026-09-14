from typing import Optional
from app.services.analytics_service import AnalyticsService, previous_month
from app.schemas.insight import FinancialInsight, SupportingFigure


def rupees(cents: int) -> str:
    return f"₹{cents // 100:,}"


class InsightService:
    def __init__(
        self,
        analytics_service: AnalyticsService,
        category_surge_percent: float = 25.0,
        month_change_percent: float = 25.0,
        budget_approaching_percent: float = 80.0,
        savings_reduction_percent: float = 20.0,
    ):
        self.analytics_service = analytics_service
        self.category_surge_percent = category_surge_percent
        self.month_change_percent = month_change_percent
        self.budget_approaching_percent = budget_approaching_percent
        self.savings_reduction_percent = savings_reduction_percent

    async def get_insights(self, user_id: str, period: str) -> list[FinancialInsight]:
        prior = previous_month(period)
        current_categories = await self.analytics_service.get_category_breakdown(user_id, period)
        prior_categories = await self.analytics_service.get_category_breakdown(user_id, prior)
        trend = await self.analytics_service.get_spending_trends(user_id, period)
        budgets = await self.analytics_service.budget_service.list_statuses_for_user(user_id, period)

        insights: list[FinancialInsight] = []
        old_cat_map = {c.categoryId: c for c in prior_categories}

        for curr in current_categories:
            prev = old_cat_map.get(curr.categoryId)
            if not prev or prev.amountCents == 0 or curr.amountCents <= prev.amountCents:
                continue

            increase = curr.amountCents - prev.amountCents
            percent = round((increase / prev.amountCents) * 10000) / 100

            if percent >= self.category_surge_percent:
                insights.append(
                    FinancialInsight(
                        id=f"surge-{curr.categoryId}",
                        type="category_surge",
                        category=curr.categoryName,
                        currentValueCents=curr.amountCents,
                        previousValueCents=prev.amountCents,
                        percentageChange=percent,
                        severity="critical" if percent >= 50 else "warning",
                        explanation=f"{curr.categoryName} spending increased by {percent}% compared with the previous period.",
                        recommendation=f"Review the {rupees(increase)} increase and decide whether it is intentional.",
                        supportingFigures=[
                            SupportingFigure(label="Current spending", value=rupees(curr.amountCents)),
                            SupportingFigure(label="Previous spending", value=rupees(prev.amountCents)),
                            SupportingFigure(label="Increase", value=rupees(increase)),
                        ],
                    )
                )

                target = round(curr.amountCents * (self.savings_reduction_percent / 100))
                insights.append(
                    FinancialInsight(
                        id=f"saving-{curr.categoryId}",
                        type="savings_opportunity",
                        category=curr.categoryName,
                        currentValueCents=curr.amountCents,
                        previousValueCents=prev.amountCents,
                        percentageChange=percent,
                        severity="info",
                        explanation=f"The recommendation uses a {int(self.savings_reduction_percent)}% reduction target on current {curr.categoryName} spending after its increase.",
                        recommendation=f"Reducing current {curr.categoryName} spending by {int(self.savings_reduction_percent)}% would free about {rupees(target)}; this is an assumption, not an optimal target.",
                        supportingFigures=[
                            SupportingFigure(label="Current spending", value=rupees(curr.amountCents)),
                            SupportingFigure(label="Reduction target", value=f"{int(self.savings_reduction_percent)}%"),
                            SupportingFigure(label="Estimated amount", value=rupees(target)),
                        ],
                    )
                )

        for status in budgets:
            if status.exceeded:
                insights.append(
                    FinancialInsight(
                        id=f"overrun-{status.budget.id}",
                        type="budget_overrun",
                        category=status.category.name,
                        currentValueCents=status.spentCents,
                        previousValueCents=status.budget.amountCents,
                        percentageChange=status.percentageUsed,
                        severity="critical",
                        explanation=f"{status.category.name} spending is {status.percentageUsed}% of its budget.",
                        recommendation=f"Spending is {rupees(abs(status.remainingCents))} above the set budget; consider pausing discretionary purchases in this category for the period.",
                        supportingFigures=[
                            SupportingFigure(label="Spent", value=rupees(status.spentCents)),
                            SupportingFigure(label="Budget", value=rupees(status.budget.amountCents)),
                            SupportingFigure(label="Over budget", value=rupees(abs(status.remainingCents))),
                        ],
                    )
                )
            elif status.percentageUsed >= self.budget_approaching_percent:
                insights.append(
                    FinancialInsight(
                        id=f"approaching-{status.budget.id}",
                        type="budget_approaching",
                        category=status.category.name,
                        currentValueCents=status.spentCents,
                        previousValueCents=status.budget.amountCents,
                        percentageChange=status.percentageUsed,
                        severity="warning",
                        explanation=f"{status.category.name} has used {status.percentageUsed}% of its budget, meeting the {int(self.budget_approaching_percent)}% alert threshold.",
                        recommendation=f"There is {rupees(status.remainingCents)} remaining in this category budget for the period.",
                        supportingFigures=[
                            SupportingFigure(label="Spent", value=rupees(status.spentCents)),
                            SupportingFigure(label="Budget", value=rupees(status.budget.amountCents)),
                            SupportingFigure(label="Remaining", value=rupees(status.remainingCents)),
                        ],
                    )
                )

        if trend.changePercent is not None and abs(trend.changePercent) >= self.month_change_percent:
            direction = "increased" if trend.changePercent > 0 else "decreased"
            insights.append(
                FinancialInsight(
                    id=f"month-change-{period}",
                    type="month_over_month_change",
                    category=None,
                    currentValueCents=trend.expenseCents,
                    previousValueCents=trend.previousExpenseCents,
                    percentageChange=trend.changePercent,
                    severity="warning" if trend.changePercent > 0 else "info",
                    explanation=f"Total spending {direction} by {abs(trend.changePercent)}% compared with the previous period.",
                    recommendation=(
                        f"Review the category changes behind the {rupees(trend.changeCents)} increase."
                        if trend.changePercent > 0
                        else f"Spending is {rupees(abs(trend.changeCents))} below the previous period; confirm this pattern is sustainable."
                    ),
                    supportingFigures=[
                        SupportingFigure(label="Current spending", value=rupees(trend.expenseCents)),
                        SupportingFigure(label="Previous spending", value=rupees(trend.previousExpenseCents)),
                        SupportingFigure(label="Change", value=rupees(abs(trend.changeCents))),
                    ],
                )
            )

        return insights
