from datetime import datetime, timezone
from typing import Optional
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import (
    get_analytics_service,
    get_auth_service,
    get_budget_service,
    get_category_service,
    get_current_user,
    get_goal_service,
    get_insight_service,
    get_transaction_service,
)
from app.schemas.analytics import CategorySpending
from app.schemas.auth import User
from app.schemas.budget import Budget, CreateBudgetInput, UpdateBudgetInput
from app.schemas.category import Category, CategoryInput, UpdateCategoryInput
from app.schemas.goal import CreateGoalInput, Goal, UpdateGoalInput
from app.schemas.transaction import (
    CreateTransactionInput,
    Transaction,
    TransactionFilters,
    UpdateTransactionInput,
)
from app.services.analytics_service import AnalyticsService
from app.services.auth_service import AuthService
from app.services.budget_service import BudgetService
from app.services.category_service import CategoryService
from app.services.goal_service import GoalService
from app.services.insight_service import InsightService
from app.services.transaction_service import TransactionService


class InMemoryAuthRepository:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.sessions: dict[str, dict] = {}

    async def find_user_by_email(self, email: str) -> Optional[dict]:
        for u in self.users.values():
            if u["email"].lower() == email.lower():
                return u
        return None

    async def create_user(self, email: str, password_hash: str) -> User:
        user_id = str(uuid.uuid4())
        record = {"id": user_id, "email": email, "passwordHash": password_hash}
        self.users[user_id] = record
        return User(id=user_id, email=email)

    async def find_session(self, token_hash: str) -> Optional[dict]:
        sess = self.sessions.get(token_hash)
        if not sess:
            return None
        user_rec = self.users.get(sess["userId"])
        if not user_rec:
            return None
        return {
            "id": sess["id"],
            "userId": sess["userId"],
            "tokenHash": sess["tokenHash"],
            "expiresAt": sess["expiresAt"],
            "revokedAt": sess["revokedAt"],
            "user": User(id=user_rec["id"], email=user_rec["email"]),
        }

    async def create_session(self, user_id: str, token_hash: str, expires_at: datetime) -> None:
        self.sessions[token_hash] = {
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "tokenHash": token_hash,
            "expiresAt": expires_at,
            "revokedAt": None,
        }

    async def revoke_session(self, token_hash: str) -> None:
        if token_hash in self.sessions:
            self.sessions[token_hash]["revokedAt"] = datetime.now(timezone.utc)


class InMemoryCategoryRepository:
    def __init__(self):
        self.categories: list[Category] = [
            Category(id="11111111-1111-4111-8111-111111111111", userId=None, name="Groceries", type="expense"),
            Category(id="22222222-2222-4222-8222-222222222222", userId=None, name="Dining", type="expense"),
            Category(id="33333333-3333-4333-8333-333333333333", userId=None, name="Salary", type="income"),
            Category(id="44444444-4444-4444-8444-444444444444", userId=None, name="Entertainment", type="expense"),
            Category(id="55555555-5555-4555-8555-555555555555", userId=None, name="Shopping", type="expense"),
        ]

    async def list_available_to_user(self, user_id: str) -> list[Category]:
        return [c for c in self.categories if c.userId is None or c.userId == user_id]

    async def list_available(self, user_id: str) -> list[Category]:
        return await self.list_available_to_user(user_id)

    async def find_available_to_user(self, user_id: str, category_id: str) -> Optional[Category]:
        for c in self.categories:
            if c.id == category_id and (c.userId is None or c.userId == user_id):
                return c
        return None

    async def find_available(self, user_id: str, category_id: str) -> Optional[Category]:
        return await self.find_available_to_user(user_id, category_id)

    async def create(self, user_id: str, input_data: CategoryInput) -> Category:
        new_cat = Category(
            id=str(uuid.uuid4()),
            userId=user_id,
            name=input_data.name,
            type=input_data.type,
        )
        self.categories.append(new_cat)
        return new_cat

    async def update_private(
        self, user_id: str, category_id: str, input_data: UpdateCategoryInput
    ) -> Optional[Category]:
        for idx, c in enumerate(self.categories):
            if c.id == category_id and c.userId == user_id:
                updated = Category(
                    id=c.id,
                    userId=c.userId,
                    name=input_data.name or c.name,
                    type=input_data.type or c.type,
                )
                self.categories[idx] = updated
                return updated
        return None

    async def delete_private(self, user_id: str, category_id: str) -> bool:
        for idx, c in enumerate(self.categories):
            if c.id == category_id and c.userId == user_id:
                self.categories.pop(idx)
                return True
        return False


class InMemoryTransactionRepository:
    def __init__(self):
        self.transactions: list[Transaction] = []

    async def create(self, user_id: str, input_data: CreateTransactionInput) -> Transaction:
        tx = Transaction(
            id=str(uuid.uuid4()),
            userId=user_id,
            categoryId=input_data.categoryId,
            type=input_data.type,
            amountCents=input_data.amountCents,
            description=input_data.description,
            occurredOn=str(input_data.occurredOn),
        )
        self.transactions.append(tx)
        return tx

    async def list_for_user(
        self, user_id: str, filters: TransactionFilters, limit: int = 100
    ) -> list[Transaction]:
        matches = [t for t in self.transactions if t.userId == user_id]
        if filters.type:
            matches = [t for t in matches if t.type == filters.type]
        if filters.categoryId:
            matches = [t for t in matches if t.categoryId == filters.categoryId]
        if filters.startDate:
            matches = [t for t in matches if t.occurredOn >= str(filters.startDate)]
        if filters.endDate:
            matches = [t for t in matches if t.occurredOn <= str(filters.endDate)]
        return matches[:limit]

    async def find_for_user(self, user_id: str, transaction_id: str) -> Optional[Transaction]:
        for t in self.transactions:
            if t.id == transaction_id and t.userId == user_id:
                return t
        return None

    async def update(
        self, user_id: str, transaction_id: str, input_data: UpdateTransactionInput
    ) -> Optional[Transaction]:
        for idx, t in enumerate(self.transactions):
            if t.id == transaction_id and t.userId == user_id:
                updated = Transaction(
                    id=t.id,
                    userId=t.userId,
                    categoryId=input_data.categoryId or t.categoryId,
                    type=input_data.type or t.type,
                    amountCents=input_data.amountCents if input_data.amountCents is not None else t.amountCents,
                    description=input_data.description or t.description,
                    occurredOn=str(input_data.occurredOn) if input_data.occurredOn else t.occurredOn,
                )
                self.transactions[idx] = updated
                return updated
        return None

    async def update_for_user(
        self, user_id: str, transaction_id: str, input_data: UpdateTransactionInput
    ) -> Optional[Transaction]:
        return await self.update(user_id, transaction_id, input_data)

    async def delete(self, user_id: str, transaction_id: str) -> bool:
        for idx, t in enumerate(self.transactions):
            if t.id == transaction_id and t.userId == user_id:
                self.transactions.pop(idx)
                return True
        return False

    async def delete_for_user(self, user_id: str, transaction_id: str) -> bool:
        return await self.delete(user_id, transaction_id)


class InMemoryBudgetRepository:
    def __init__(self, tx_repo: InMemoryTransactionRepository):
        self.budgets: list[Budget] = []
        self.tx_repo = tx_repo

    async def create(self, user_id: str, input_data: CreateBudgetInput) -> Budget:
        b = Budget(
            id=str(uuid.uuid4()),
            userId=user_id,
            categoryId=input_data.categoryId,
            amountCents=input_data.amountCents,
            month=input_data.month,
        )
        self.budgets.append(b)
        return b

    async def list_for_user_month(self, user_id: str, month: str) -> list[Budget]:
        return [b for b in self.budgets if b.userId == user_id and b.month == month]

    async def find_for_user(self, user_id: str, budget_id: str) -> Optional[Budget]:
        for b in self.budgets:
            if b.id == budget_id and b.userId == user_id:
                return b
        return None

    async def find_by_category_period(
        self, user_id: str, category_id: str, month: str
    ) -> Optional[Budget]:
        for b in self.budgets:
            if b.userId == user_id and b.categoryId == category_id and b.month == month:
                return b
        return None

    async def update(
        self, user_id: str, budget_id: str, input_data: UpdateBudgetInput
    ) -> Optional[Budget]:
        for idx, b in enumerate(self.budgets):
            if b.id == budget_id and b.userId == user_id:
                updated = Budget(
                    id=b.id,
                    userId=b.userId,
                    categoryId=b.categoryId,
                    amountCents=input_data.amountCents,
                    month=b.month,
                )
                self.budgets[idx] = updated
                return updated
        return None

    async def update_for_user(
        self, user_id: str, budget_id: str, input_data: UpdateBudgetInput
    ) -> Optional[Budget]:
        return await self.update(user_id, budget_id, input_data)

    async def delete(self, user_id: str, budget_id: str) -> bool:
        for idx, b in enumerate(self.budgets):
            if b.id == budget_id and b.userId == user_id:
                self.budgets.pop(idx)
                return True
        return False

    async def delete_for_user(self, user_id: str, budget_id: str) -> bool:
        return await self.delete(user_id, budget_id)

    async def spent_for_user_category_month(
        self, user_id: str, category_id: str, month: str
    ) -> int:
        return sum(
            t.amountCents
            for t in self.tx_repo.transactions
            if t.userId == user_id
            and t.categoryId == category_id
            and t.type == "expense"
            and t.occurredOn.startswith(month)
        )


class InMemoryGoalRepository:
    def __init__(self):
        self.goals: list[Goal] = []

    async def create(self, user_id: str, input_data: CreateGoalInput) -> Goal:
        g = Goal(
            id=str(uuid.uuid4()),
            userId=user_id,
            name=input_data.name,
            targetAmountCents=input_data.targetAmountCents,
            currentSavedCents=input_data.currentSavedCents,
            targetDate=str(input_data.targetDate),
            description=input_data.description,
            createdAt=datetime.now(timezone.utc).isoformat(),
        )
        self.goals.append(g)
        return g

    async def list_for_user(self, user_id: str) -> list[Goal]:
        return [g for g in self.goals if g.userId == user_id]

    async def find_for_user(self, user_id: str, goal_id: str) -> Optional[Goal]:
        for g in self.goals:
            if g.id == goal_id and g.userId == user_id:
                return g
        return None

    async def update(
        self, user_id: str, goal_id: str, input_data: UpdateGoalInput
    ) -> Optional[Goal]:
        for idx, g in enumerate(self.goals):
            if g.id == goal_id and g.userId == user_id:
                updated = Goal(
                    id=g.id,
                    userId=g.userId,
                    name=input_data.name or g.name,
                    targetAmountCents=input_data.targetAmountCents if input_data.targetAmountCents is not None else g.targetAmountCents,
                    currentSavedCents=input_data.currentSavedCents if input_data.currentSavedCents is not None else g.currentSavedCents,
                    targetDate=str(input_data.targetDate) if input_data.targetDate else g.targetDate,
                    description=input_data.description if input_data.description is not None else g.description,
                    createdAt=g.createdAt,
                )
                self.goals[idx] = updated
                return updated
        return None

    async def update_for_user(
        self, user_id: str, goal_id: str, input_data: UpdateGoalInput
    ) -> Optional[Goal]:
        return await self.update(user_id, goal_id, input_data)

    async def delete(self, user_id: str, goal_id: str) -> bool:
        for idx, g in enumerate(self.goals):
            if g.id == goal_id and g.userId == user_id:
                self.goals.pop(idx)
                return True
        return False

    async def delete_for_user(self, user_id: str, goal_id: str) -> bool:
        return await self.delete(user_id, goal_id)


class InMemoryAnalyticsRepository:
    def __init__(
        self, tx_repo: InMemoryTransactionRepository, cat_repo: InMemoryCategoryRepository
    ):
        self.tx_repo = tx_repo
        self.cat_repo = cat_repo

    async def totals_for_user_period(self, user_id: str, period: str) -> tuple[int, int]:
        income = sum(
            t.amountCents
            for t in self.tx_repo.transactions
            if t.userId == user_id and t.type == "income" and t.occurredOn.startswith(period)
        )
        expense = sum(
            t.amountCents
            for t in self.tx_repo.transactions
            if t.userId == user_id and t.type == "expense" and t.occurredOn.startswith(period)
        )
        return income, expense

    async def category_spending_for_user_period(
        self, user_id: str, period: str
    ) -> list[CategorySpending]:
        cat_map = {c.id: c.name for c in self.cat_repo.categories}
        totals: dict[str, int] = {}
        for t in self.tx_repo.transactions:
            if t.userId == user_id and t.type == "expense" and t.occurredOn.startswith(period):
                totals[t.categoryId] = totals.get(t.categoryId, 0) + t.amountCents

        all_expenses = sum(totals.values())
        result = []
        for cat_id, amt in totals.items():
            pct = round((amt / all_expenses) * 10000) / 100 if all_expenses > 0 else 0
            result.append(
                CategorySpending(
                    categoryId=cat_id,
                    categoryName=cat_map.get(cat_id, "Unknown"),
                    amountCents=amt,
                    percentageOfExpenses=pct,
                )
            )
        return sorted(result, key=lambda x: x.amountCents, reverse=True)

    async def largest_expenses_for_user_period(
        self, user_id: str, period: str, limit: int = 5
    ) -> list[Transaction]:
        txs = [
            t
            for t in self.tx_repo.transactions
            if t.userId == user_id and t.type == "expense" and t.occurredOn.startswith(period)
        ]
        txs.sort(key=lambda x: x.amountCents, reverse=True)
        return txs[:limit]

    async def expense_total_for_user_period(self, user_id: str, period: str) -> int:
        return sum(
            t.amountCents
            for t in self.tx_repo.transactions
            if t.userId == user_id and t.type == "expense" and t.occurredOn.startswith(period)
        )


@pytest.fixture
def in_memory_repos():
    auth_repo = InMemoryAuthRepository()
    cat_repo = InMemoryCategoryRepository()
    tx_repo = InMemoryTransactionRepository()
    budget_repo = InMemoryBudgetRepository(tx_repo)
    goal_repo = InMemoryGoalRepository()
    analytics_repo = InMemoryAnalyticsRepository(tx_repo, cat_repo)
    return {
        "auth": auth_repo,
        "cat": cat_repo,
        "tx": tx_repo,
        "budget": budget_repo,
        "goal": goal_repo,
        "analytics": analytics_repo,
    }


@pytest.fixture
def in_memory_services(in_memory_repos):
    auth_svc = AuthService(in_memory_repos["auth"])
    cat_svc = CategoryService(in_memory_repos["cat"])
    tx_svc = TransactionService(in_memory_repos["tx"], in_memory_repos["cat"])
    budget_svc = BudgetService(in_memory_repos["budget"], in_memory_repos["cat"])
    analytics_svc = AnalyticsService(in_memory_repos["analytics"], budget_svc)
    goal_svc = GoalService(in_memory_repos["goal"], analytics_svc)
    insight_svc = InsightService(analytics_svc)

    return {
        "auth": auth_svc,
        "cat": cat_svc,
        "tx": tx_svc,
        "budget": budget_svc,
        "goal": goal_svc,
        "analytics": analytics_svc,
        "insight": insight_svc,
    }
