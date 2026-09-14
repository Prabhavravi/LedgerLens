from datetime import datetime, timezone
import math
from typing import Optional
from app.exceptions import NotFoundException, ValidationException
from app.repositories.goal_repo import GoalRepository
from app.services.analytics_service import AnalyticsService
from app.schemas.goal import (
    CalculatedFacts,
    CreateGoalInput,
    FeasibilityAnalysis,
    Goal,
    GoalActionPlan,
    GoalAdjustmentOpportunity,
    GoalPaceStatus,
    GoalStatus,
    UpdateGoalInput,
)


def rupees(cents: int) -> str:
    return f"₹{cents // 100:,}"


def calculate_remaining_months(as_of_date: datetime, target_date_str: str) -> int:
    current_year = as_of_date.year
    current_month = as_of_date.month

    target_year, target_month = map(int, target_date_str.split("-")[:2])
    month_diff = (target_year - current_year) * 12 + (target_month - current_month)

    if month_diff < 0:
        return 0
    return month_diff + 1


def compute_goal_status(goal: Goal, as_of_date: Optional[datetime] = None) -> GoalStatus:
    as_of = as_of_date or datetime.now(timezone.utc)
    remaining_amount = max(0, goal.targetAmountCents - goal.currentSavedCents)

    if goal.targetAmountCents == 0:
        pct = 100.0
    else:
        pct = min(100.0, round((goal.currentSavedCents / goal.targetAmountCents) * 10000) / 100)

    remaining_months = calculate_remaining_months(as_of, goal.targetDate)

    required_savings = 0
    if remaining_amount > 0:
        if remaining_months <= 1:
            required_savings = remaining_amount
        else:
            required_savings = math.ceil(remaining_amount / remaining_months)

    status: GoalPaceStatus = "on_track"
    if remaining_amount == 0:
        status = "achieved"
    elif remaining_months == 0:
        status = "overdue"

    return GoalStatus(
        goal=goal,
        remainingAmountCents=remaining_amount,
        percentageCompleted=pct,
        remainingMonths=remaining_months,
        requiredMonthlySavingsCents=required_savings,
        status=status,
    )


class GoalService:
    def __init__(self, goal_repo: GoalRepository, analytics_service: AnalyticsService):
        self.goal_repo = goal_repo
        self.analytics_service = analytics_service

    async def create_for_user(self, user_id: str, input_data: CreateGoalInput) -> Goal:
        return await self.goal_repo.create(user_id, input_data)

    async def list_for_user(self, user_id: str) -> list[Goal]:
        return await self.goal_repo.list_for_user(user_id)

    async def list_statuses_for_user(
        self, user_id: str, as_of_date: Optional[datetime] = None
    ) -> list[GoalStatus]:
        goals = await self.list_for_user(user_id)
        return [compute_goal_status(g, as_of_date) for g in goals]

    async def get_goal_for_user(self, user_id: str, goal_id: str) -> Goal:
        goal = await self.goal_repo.find_for_user(user_id, goal_id)
        if not goal:
            raise NotFoundException("Financial goal not found.")
        return goal

    async def update_for_user(
        self, user_id: str, goal_id: str, input_data: UpdateGoalInput
    ) -> Goal:
        existing = await self.goal_repo.find_for_user(user_id, goal_id)
        if not existing:
            raise NotFoundException("Financial goal not found.")

        # Keep the update path aligned with CreateGoalInput. The same service
        # is also used by confirmed AI actions, so this is the single place
        # where the goal amount invariant is enforced.
        target_amount = (
            input_data.targetAmountCents
            if input_data.targetAmountCents is not None
            else existing.targetAmountCents
        )
        current_saved = (
            input_data.currentSavedCents
            if input_data.currentSavedCents is not None
            else existing.currentSavedCents
        )
        if current_saved > target_amount:
            raise ValidationException("Current saved amount cannot exceed the target amount.")

        updated = await self.goal_repo.update_for_user(user_id, goal_id, input_data)
        if not updated:
            raise NotFoundException("Financial goal not found.")
        return updated

    async def contribute_for_user(self, user_id: str, goal_id: str, amount_cents: int) -> Goal:
        existing = await self.goal_repo.find_for_user(user_id, goal_id)
        if not existing:
            raise NotFoundException("Financial goal not found.")
        if amount_cents <= 0:
            raise ValidationException("Contribution amount must be greater than zero.")

        new_saved = existing.currentSavedCents + amount_cents
        if new_saved > existing.targetAmountCents:
            raise ValidationException("Contribution would exceed the target amount.")
        updated = await self.goal_repo.update_for_user(
            user_id, goal_id, UpdateGoalInput(currentSavedCents=new_saved)
        )
        if not updated:
            raise NotFoundException("Financial goal not found.")
        return updated

    async def delete_for_user(self, user_id: str, goal_id: str) -> None:
        deleted = await self.goal_repo.delete_for_user(user_id, goal_id)
        if not deleted:
            raise NotFoundException("Financial goal not found.")

    async def get_action_plan_for_goal(
        self, user_id: str, goal_id: str, as_of_date: Optional[datetime] = None
    ) -> GoalActionPlan:
        as_of = as_of_date or datetime.now(timezone.utc)
        goal = await self.get_goal_for_user(user_id, goal_id)
        status = compute_goal_status(goal, as_of)

        current_month = f"{as_of.year}-{as_of.month:02d}"
        summary = await self.analytics_service.get_financial_summary(user_id, current_month)
        categories = await self.analytics_service.get_category_breakdown(user_id, current_month)

        net_savings = summary.netSavingsCents
        required_monthly = status.requiredMonthlySavingsCents

        pace_status = status.status
        on_track = False
        savings_gap = 0

        if status.remainingAmountCents == 0:
            pace_status = "achieved"
            on_track = True
        elif status.remainingMonths == 0:
            pace_status = "overdue"
            on_track = False
            savings_gap = status.remainingAmountCents
        else:
            on_track = net_savings >= required_monthly
            savings_gap = max(0, required_monthly - net_savings)
            pace_status = "on_track" if on_track else "behind"

        if status.remainingAmountCents == 0:
            summary_text = f"Goal achieved! You have saved {rupees(goal.currentSavedCents)} of your {rupees(goal.targetAmountCents)} target."
        elif status.remainingMonths == 0:
            summary_text = f"This goal is overdue. The target deadline of {goal.targetDate} has passed with {rupees(status.remainingAmountCents)} remaining."
        elif on_track:
            summary_text = f"On track! Your current monthly net savings ({rupees(net_savings)}) exceed the required monthly savings of {rupees(required_monthly)}."
        else:
            summary_text = f"Behind pace. You require {rupees(required_monthly)}/month over the next {status.remainingMonths} month(s), but your current monthly net savings are {rupees(net_savings)}. Monthly savings gap: {rupees(savings_gap)}."

        adjustments = []
        for cat in [c for c in categories if c.amountCents > 0][:3]:
            potential = round(cat.amountCents * 0.20)
            adjustments.append(
                GoalAdjustmentOpportunity(
                    categoryId=cat.categoryId,
                    categoryName=cat.categoryName,
                    currentMonthlyExpenseCents=cat.amountCents,
                    suggestedReductionPercent=20,
                    potentialMonthlySavingsCents=potential,
                    explanation=f"Current monthly spending in {cat.categoryName} is {rupees(cat.amountCents)} ({cat.percentageOfExpenses}% of monthly expenses). An illustrative 20% reduction would free up approximately {rupees(potential)}/month toward your goal.",
                )
            )

        return GoalActionPlan(
            goal=goal,
            calculatedFacts=CalculatedFacts(
                targetAmountCents=goal.targetAmountCents,
                currentSavedCents=goal.currentSavedCents,
                remainingAmountCents=status.remainingAmountCents,
                percentageCompleted=status.percentageCompleted,
                remainingMonths=status.remainingMonths,
                requiredMonthlySavingsCents=required_monthly,
                currentMonthlyNetSavingsCents=net_savings,
                savingsGapCents=savings_gap,
                status=pace_status,
            ),
            feasibilityAnalysis=FeasibilityAnalysis(onTrack=on_track, summary=summary_text),
            spendingAdjustmentOpportunities=adjustments,
            disclaimer="Action plan calculations and category adjustment suggestions are illustrative financial models based on actual user transactions. They do not represent guaranteed outcomes or mathematically optimal investment advice.",
        )
