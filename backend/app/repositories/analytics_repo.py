import asyncpg
from app.schemas.analytics import CategorySpending
from app.schemas.transaction import Transaction
from app.repositories.transaction_repo import TRANSACTION_COLUMNS, map_transaction


class AnalyticsRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def totals_for_user_period(self, user_id: str, month: str) -> tuple[int, int]:
        query = """
            SELECT
                COALESCE(SUM(amount_cents) FILTER (WHERE type = 'income'), 0) AS income,
                COALESCE(SUM(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense
            FROM transactions
            WHERE user_id = $1 AND TO_CHAR(occurred_on, 'YYYY-MM') = $2
        """
        row = await self.pool.fetchrow(query, user_id, month)
        income = int(row["income"]) if row else 0
        expense = int(row["expense"]) if row else 0
        return income, expense

    async def category_spending_for_user_period(
        self, user_id: str, month: str
    ) -> list[CategorySpending]:
        query = """
            SELECT
                t.category_id AS "categoryId",
                c.name AS "categoryName",
                SUM(t.amount_cents) AS "amountCents"
            FROM transactions t
            JOIN categories c ON c.id = t.category_id
            WHERE t.user_id = $1 AND t.type = 'expense' AND TO_CHAR(t.occurred_on, 'YYYY-MM') = $2
            GROUP BY t.category_id, c.name
            ORDER BY SUM(t.amount_cents) DESC
        """
        rows = await self.pool.fetch(query, user_id, month)
        return [
            CategorySpending(
                categoryId=str(r["categoryId"]),
                categoryName=r["categoryName"],
                amountCents=int(r["amountCents"]),
                percentageOfExpenses=0.0,  # Will be populated by service
            )
            for r in rows
        ]

    async def largest_expenses_for_user_period(
        self, user_id: str, month: str, limit: int = 5
    ) -> list[Transaction]:
        query = f"""
            SELECT {TRANSACTION_COLUMNS}
            FROM transactions
            WHERE user_id = $1 AND type = 'expense' AND TO_CHAR(occurred_on, 'YYYY-MM') = $2
            ORDER BY amount_cents DESC
            LIMIT $3
        """
        rows = await self.pool.fetch(query, user_id, month, limit)
        return [map_transaction(r) for r in rows]

    async def expense_total_for_user_period(self, user_id: str, month: str) -> int:
        query = """
            SELECT COALESCE(SUM(amount_cents), 0) AS amount
            FROM transactions
            WHERE user_id = $1 AND type = 'expense' AND TO_CHAR(occurred_on, 'YYYY-MM') = $2
        """
        row = await self.pool.fetchrow(query, user_id, month)
        return int(row["amount"]) if row else 0
