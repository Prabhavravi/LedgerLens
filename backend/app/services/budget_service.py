from typing import Optional
from app.exceptions import NotFoundException, ValidationException
from app.repositories.budget_repo import BudgetRepository
from app.repositories.category_repo import CategoryRepository
from app.schemas.budget import Budget, BudgetStatus, CreateBudgetInput, UpdateBudgetInput
from app.schemas.category import Category


class BudgetService:
    def __init__(self, budget_repo: BudgetRepository, cat_repo: CategoryRepository):
        self.budget_repo = budget_repo
        self.cat_repo = cat_repo

    async def create_for_user(self, user_id: str, input_data: CreateBudgetInput) -> Budget:
        await self.assert_budget_category(user_id, input_data.categoryId)
        existing = await self.budget_repo.find_by_category_period(
            user_id, input_data.categoryId, input_data.month
        )
        if existing:
            raise ValidationException("A budget already exists for this category and period.")
        return await self.budget_repo.create(user_id, input_data)

    async def update_for_user(
        self, user_id: str, budget_id: str, input_data: UpdateBudgetInput
    ) -> Budget:
        updated = await self.budget_repo.update_for_user(user_id, budget_id, input_data)
        if not updated:
            raise NotFoundException("Budget not found.")
        return updated

    async def create_or_update_for_user(
        self, user_id: str, input_data: CreateBudgetInput
    ) -> Budget:
        await self.assert_budget_category(user_id, input_data.categoryId)
        existing = await self.budget_repo.find_by_category_period(
            user_id, input_data.categoryId, input_data.month
        )
        if existing:
            return await self.update_for_user(
                user_id, existing.id, UpdateBudgetInput(amountCents=input_data.amountCents)
            )
        return await self.budget_repo.create(user_id, input_data)

    async def delete_for_user(self, user_id: str, budget_id: str) -> None:
        deleted = await self.budget_repo.delete_for_user(user_id, budget_id)
        if not deleted:
            raise NotFoundException("Budget not found.")

    async def list_statuses_for_user(self, user_id: str, month: str) -> list[BudgetStatus]:
        budgets = await self.budget_repo.list_for_user_month(user_id, month)
        statuses = []
        for b in budgets:
            status = await self.get_budget_status(user_id, b.categoryId, month, known_budget=b)
            statuses.append(status)
        return statuses

    async def get_budget_status(
        self,
        user_id: str,
        category_id: str,
        month: str,
        known_budget: Optional[Budget] = None,
    ) -> BudgetStatus:
        budget = known_budget or await self.budget_repo.find_by_category_period(
            user_id, category_id, month
        )
        if not budget:
            raise NotFoundException("Budget not found.")

        category = await self.assert_budget_category(user_id, category_id)
        spent_cents = await self.budget_repo.spent_for_user_category_month(
            user_id, category_id, month
        )
        remaining_cents = budget.amountCents - spent_cents
        percentage_used = (
            round((spent_cents / budget.amountCents) * 10000) / 100
            if budget.amountCents > 0
            else 0.0
        )
        exceeded = spent_cents > budget.amountCents
        status = "exceeded" if exceeded else "warning" if percentage_used >= 80 else "on_track"

        return BudgetStatus(
            budget=budget,
            category=category,
            spentCents=spent_cents,
            remainingCents=remaining_cents,
            percentageUsed=percentage_used,
            exceeded=exceeded,
            status=status,
        )

    async def assert_budget_category(self, user_id: str, category_id: str) -> Category:
        category = await self.cat_repo.find_available(user_id, category_id)
        if not category or category.type != "expense":
            raise ValidationException("Select an available expense category.")
        return category
