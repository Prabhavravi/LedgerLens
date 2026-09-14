from typing import Optional
import asyncpg
from app.schemas.budget import Budget, CreateBudgetInput, UpdateBudgetInput

BUDGET_COLUMNS = 'id, user_id AS "userId", category_id AS "categoryId", month, amount_cents AS "amountCents"'


def map_budget(row: asyncpg.Record) -> Budget:
    return Budget(
        id=str(row["id"]),
        userId=str(row["userId"]),
        categoryId=str(row["categoryId"]),
        month=row["month"],
        amountCents=int(row["amountCents"]),
    )


class BudgetRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def create(self, user_id: str, input_data: CreateBudgetInput) -> Budget:
        query = f"""
            INSERT INTO budgets (user_id, category_id, month, amount_cents)
            VALUES ($1, $2, $3, $4)
            RETURNING {BUDGET_COLUMNS}
        """
        row = await self.pool.fetchrow(
            query,
            user_id,
            input_data.categoryId,
            input_data.month,
            input_data.amountCents,
        )
        return map_budget(row)

    async def list_for_user_month(self, user_id: str, month: str) -> list[Budget]:
        query = f"SELECT {BUDGET_COLUMNS} FROM budgets WHERE user_id = $1 AND month = $2 ORDER BY category_id"
        rows = await self.pool.fetch(query, user_id, month)
        return [map_budget(r) for r in rows]

    async def find_for_user(self, user_id: str, budget_id: str) -> Optional[Budget]:
        query = f"SELECT {BUDGET_COLUMNS} FROM budgets WHERE id = $1 AND user_id = $2"
        row = await self.pool.fetchrow(query, budget_id, user_id)
        return map_budget(row) if row else None

    async def find_by_category_period(
        self, user_id: str, category_id: str, month: str
    ) -> Optional[Budget]:
        query = f"SELECT {BUDGET_COLUMNS} FROM budgets WHERE user_id = $1 AND category_id = $2 AND month = $3"
        row = await self.pool.fetchrow(query, user_id, category_id, month)
        return map_budget(row) if row else None

    async def update_for_user(
        self, user_id: str, budget_id: str, input_data: UpdateBudgetInput
    ) -> Optional[Budget]:
        query = f"""
            UPDATE budgets
            SET amount_cents = $1
            WHERE id = $2 AND user_id = $3
            RETURNING {BUDGET_COLUMNS}
        """
        row = await self.pool.fetchrow(query, input_data.amountCents, budget_id, user_id)
        return map_budget(row) if row else None

    async def delete_for_user(self, user_id: str, budget_id: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM budgets WHERE id = $1 AND user_id = $2",
            budget_id,
            user_id,
        )
        return result == "DELETE 1"

    async def spent_for_user_category_month(
        self, user_id: str, category_id: str, month: str
    ) -> int:
        query = """
            SELECT COALESCE(SUM(amount_cents), 0) AS spent
            FROM transactions
            WHERE user_id = $1 AND category_id = $2 AND type = 'expense' AND TO_CHAR(occurred_on, 'YYYY-MM') = $3
        """
        row = await self.pool.fetchrow(query, user_id, category_id, month)
        return int(row["spent"]) if row else 0
