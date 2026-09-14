from datetime import date
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, model_validator
from app.ai.tool_registry import ToolRegistry
from app.schemas.auth import User
from app.schemas.category import CategoryType
from app.schemas.transaction import CreateTransactionInput, TransactionFilters, UpdateTransactionInput
from app.schemas.budget import CreateBudgetInput
from app.schemas.goal import CreateGoalInput, UpdateGoalInput
from app.services.transaction_service import TransactionService
from app.services.budget_service import BudgetService
from app.services.category_service import CategoryService
from app.services.goal_service import GoalService
from app.services.analytics_service import AnalyticsService, previous_month
from app.repositories.transaction_repo import TransactionRepository
from app.repositories.category_repo import CategoryRepository
from app.repositories.budget_repo import BudgetRepository
from app.repositories.goal_repo import GoalRepository
from app.repositories.analytics_repo import AnalyticsRepository
import asyncpg


class GetTransactionsToolInput(BaseModel):
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    categoryId: Optional[str] = None
    type: Optional[CategoryType] = None
    limit: int = Field(default=25, ge=1, le=100)


class GetSummaryToolInput(BaseModel):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class GetCategorySpendingToolInput(BaseModel):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class GetSpendingTrendsToolInput(BaseModel):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    comparisonPeriods: int = Field(default=1, ge=1, le=6)


class GetBudgetStatusToolInput(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    categoryId: Optional[str] = None


class CreateTransactionToolInput(BaseModel):
    type: CategoryType
    amount: float = Field(gt=0, le=1_000_000)
    categoryId: Optional[str] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: str = Field(min_length=1, max_length=255)
    date: date

    @model_validator(mode="after")
    def category_required(self) -> "CreateTransactionToolInput":
        if not self.categoryId and not self.category:
            raise ValueError("A category or categoryId is required.")
        return self


class UpdateTransactionToolInput(BaseModel):
    transactionId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    type: Optional[CategoryType] = None
    amount: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    categoryId: Optional[str] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=255)
    date: Optional[date] = None

    @model_validator(mode="after")
    def at_least_one(self) -> "UpdateTransactionToolInput":
        if (
            self.type is None
            and self.amount is None
            and self.categoryId is None
            and self.description is None
            and self.date is None
        ):
            raise ValueError("At least one update field must be supplied.")
        return self


class CreateOrUpdateBudgetToolInput(BaseModel):
    categoryId: Optional[str] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    amount: float = Field(gt=0, le=1_000_000)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @model_validator(mode="after")
    def category_required(self) -> "CreateOrUpdateBudgetToolInput":
        if not self.categoryId and not self.category:
            raise ValueError("A category or categoryId is required.")
        return self


class GetFinancialGoalsToolInput(BaseModel):
    pass


class GetGoalActionPlanToolInput(BaseModel):
    goalId: Optional[str] = None


class CreateFinancialGoalToolInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    targetAmount: float = Field(gt=0, le=10_000_000)
    currentSaved: float = Field(default=0.0, ge=0, le=10_000_000)
    targetDate: date
    description: Optional[str] = Field(default=None, max_length=500)


class UpdateFinancialGoalToolInput(BaseModel):
    goalId: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    targetAmount: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    currentSaved: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    addSavedAmount: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    targetDate: Optional[date] = None
    description: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def at_least_one(self) -> "UpdateFinancialGoalToolInput":
        if (
            self.name is None
            and self.targetAmount is None
            and self.currentSaved is None
            and self.addSavedAmount is None
            and self.targetDate is None
            and self.description is None
        ):
            raise ValueError("At least one update field must be supplied.")
        return self


class ToolServices:
    def __init__(
        self,
        transactions: TransactionService,
        categories: CategoryService,
        budgets: BudgetService,
        goals: GoalService,
        analytics: AnalyticsService,
    ):
        self.transactions = transactions
        self.categories = categories
        self.budgets = budgets
        self.goals = goals
        self.analytics = analytics


def register_financial_tools(registry: ToolRegistry, services: ToolServices) -> ToolRegistry:
    async def get_txs(inp: GetTransactionsToolInput, user: User) -> Any:
        filters = TransactionFilters(
            startDate=inp.startDate,
            endDate=inp.endDate,
            categoryId=inp.categoryId,
            type=inp.type,
        )
        return await services.transactions.list_for_user(user.id, filters, limit=inp.limit)

    registry.register(
        "get_my_transactions",
        "List the authenticated user's transactions with optional date, category, type, and limit filters.",
        GetTransactionsToolInput,
        get_txs,
    )

    async def get_summary(inp: GetSummaryToolInput, user: User) -> Any:
        return await services.analytics.get_financial_summary(user.id, inp.period)

    registry.register(
        "get_my_financial_summary",
        "Get income, expenses, savings, and savings rate for the authenticated user and a month.",
        GetSummaryToolInput,
        get_summary,
    )

    async def get_cat_spending(inp: GetCategorySpendingToolInput, user: User) -> Any:
        return await services.analytics.get_category_breakdown(user.id, inp.period)

    registry.register(
        "get_my_category_spending",
        "Get authenticated-user expense totals and shares by category for a month.",
        GetCategorySpendingToolInput,
        get_cat_spending,
    )

    async def get_trends(inp: GetSpendingTrendsToolInput, user: User) -> Any:
        result = []
        cursor = inp.period
        for _ in range(inp.comparisonPeriods):
            result.append(await services.analytics.get_spending_trends(user.id, cursor))
            cursor = previous_month(cursor)
        return result

    registry.register(
        "get_my_spending_trends",
        "Compare the authenticated user's spending across recent monthly periods.",
        GetSpendingTrendsToolInput,
        get_trends,
    )

    async def get_budget_status(inp: GetBudgetStatusToolInput, user: User) -> Any:
        statuses = await services.budgets.list_statuses_for_user(user.id, inp.month)
        if inp.categoryId:
            return [s for s in statuses if s.category.id == inp.categoryId]
        return statuses

    registry.register(
        "get_my_budget_status",
        "Get the authenticated user's budget status for a month, optionally for one category.",
        GetBudgetStatusToolInput,
        get_budget_status,
    )

    async def create_tx(inp: CreateTransactionToolInput, user: User) -> Any:
        cat_id = inp.categoryId
        if not cat_id and inp.category:
            cat = await services.categories.resolve_for_user(user.id, inp.category, inp.type)
            cat_id = cat.id

        return await services.transactions.create_for_user(
            user.id,
            CreateTransactionInput(
                type=inp.type,
                amountCents=round(inp.amount * 100),
                categoryId=cat_id,
                description=inp.description,
                occurredOn=inp.date,
            ),
        )

    registry.register(
        "create_my_transaction",
        "Create an income or expense transaction for the authenticated user.",
        CreateTransactionToolInput,
        create_tx,
    )

    async def update_tx(inp: UpdateTransactionToolInput, user: User) -> Any:
        amount_cents = round(inp.amount * 100) if inp.amount is not None else None
        return await services.transactions.update_for_user(
            user.id,
            inp.transactionId,
            UpdateTransactionInput(
                type=inp.type,
                amountCents=amount_cents,
                categoryId=inp.categoryId,
                description=inp.description,
                occurredOn=inp.date,
            ),
        )

    registry.register(
        "update_my_transaction",
        "Update fields of an authenticated user's existing transaction.",
        UpdateTransactionToolInput,
        update_tx,
    )

    async def create_or_update_b(inp: CreateOrUpdateBudgetToolInput, user: User) -> Any:
        cat_id = inp.categoryId
        if not cat_id and inp.category:
            cat = await services.categories.resolve_for_user(user.id, inp.category, "expense")
            cat_id = cat.id

        return await services.budgets.create_or_update_for_user(
            user.id,
            CreateBudgetInput(
                categoryId=cat_id,
                amountCents=round(inp.amount * 100),
                month=inp.month,
            ),
        )

    registry.register(
        "create_or_update_my_budget",
        "Create or update an authenticated user's expense-category budget for a month.",
        CreateOrUpdateBudgetToolInput,
        create_or_update_b,
    )

    async def get_goals(inp: GetFinancialGoalsToolInput, user: User) -> Any:
        return await services.goals.list_statuses_for_user(user.id)

    registry.register(
        "get_my_financial_goals",
        "List all active savings goals for the authenticated user.",
        GetFinancialGoalsToolInput,
        get_goals,
    )

    async def get_goal_plan(inp: GetGoalActionPlanToolInput, user: User) -> Any:
        target_id = inp.goalId
        if not target_id:
            goals = await services.goals.list_for_user(user.id)
            if not goals:
                return {"message": "You have not set any financial goals yet."}
            target_id = goals[0].id
        return await services.goals.get_action_plan_for_goal(user.id, target_id)

    registry.register(
        "get_my_goal_action_plan",
        "Get a deterministic monthly action plan for a financial goal.",
        GetGoalActionPlanToolInput,
        get_goal_plan,
    )

    async def create_goal(inp: CreateFinancialGoalToolInput, user: User) -> Any:
        return await services.goals.create_for_user(
            user.id,
            CreateGoalInput(
                name=inp.name,
                targetAmountCents=round(inp.targetAmount * 100),
                currentSavedCents=round(inp.currentSaved * 100),
                targetDate=inp.targetDate,
                description=inp.description,
            ),
        )

    registry.register(
        "create_my_financial_goal",
        "Create a new savings goal for the authenticated user.",
        CreateFinancialGoalToolInput,
        create_goal,
    )

    async def update_goal(inp: UpdateFinancialGoalToolInput, user: User) -> Any:
        if inp.addSavedAmount is not None:
            return await services.goals.contribute_for_user(
                user.id, inp.goalId, round(inp.addSavedAmount * 100)
            )

        target_cents = round(inp.targetAmount * 100) if inp.targetAmount is not None else None
        saved_cents = round(inp.currentSaved * 100) if inp.currentSaved is not None else None
        return await services.goals.update_for_user(
            user.id,
            inp.goalId,
            UpdateGoalInput(
                name=inp.name,
                targetAmountCents=target_cents,
                currentSavedCents=saved_cents,
                targetDate=inp.targetDate,
                description=inp.description,
            ),
        )

    registry.register(
        "update_my_financial_goal",
        "Update an existing savings goal or record a contribution to it.",
        UpdateFinancialGoalToolInput,
        update_goal,
    )

    return registry


def create_financial_tool_registry(pool: asyncpg.Pool) -> ToolRegistry:
    tx_repo = TransactionRepository(pool)
    cat_repo = CategoryRepository(pool)
    budget_repo = BudgetRepository(pool)
    goal_repo = GoalRepository(pool)
    analytics_repo = AnalyticsRepository(pool)

    cat_service = CategoryService(cat_repo)
    tx_service = TransactionService(tx_repo, cat_repo)
    budget_service = BudgetService(budget_repo, cat_repo)
    analytics_service = AnalyticsService(analytics_repo, budget_service)
    # Goal action plans are grounded in the shared analytics service.
    goal_service = GoalService(goal_repo, analytics_service)

    services = ToolServices(
        transactions=tx_service,
        categories=cat_service,
        budgets=budget_service,
        goals=goal_service,
        analytics=analytics_service,
    )
    registry = ToolRegistry()
    return register_financial_tools(registry, services)
