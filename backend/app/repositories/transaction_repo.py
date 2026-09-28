from typing import Optional
import asyncpg
from app.db.tenant import TenantDatabase
from app.schemas.transaction import (
    CreateTransactionInput,
    Transaction,
    TransactionFilters,
    UpdateTransactionInput,
)

TRANSACTION_COLUMNS = """
    id, user_id AS "userId", category_id AS "categoryId",
    type, amount_cents AS "amountCents", description,
    TO_CHAR(occurred_on, 'YYYY-MM-DD') AS "occurredOn"
"""


def map_transaction(row: asyncpg.Record) -> Transaction:
    return Transaction(
        id=str(row["id"]),
        userId=str(row["userId"]),
        categoryId=str(row["categoryId"]),
        type=row["type"],
        amountCents=int(row["amountCents"]),
        description=row["description"],
        occurredOn=str(row["occurredOn"]),
    )


class TransactionRepository:
    def __init__(self, pool: TenantDatabase):
        self.pool = pool

    async def create(self, user_id: str, input_data: CreateTransactionInput) -> Transaction:
        query = f"""
            INSERT INTO transactions (user_id, category_id, type, amount_cents, description, occurred_on)
            VALUES ($1, $2, $3, $4, $5, $6::date)
            RETURNING {TRANSACTION_COLUMNS}
        """
        row = await self.pool.fetchrow(
            query,
            user_id,
            input_data.categoryId,
            input_data.type,
            input_data.amountCents,
            input_data.description,
            input_data.occurredOn,
        )
        return map_transaction(row)

    async def list_for_user(
        self, user_id: str, filters: TransactionFilters, limit: int = 100
    ) -> list[Transaction]:
        conditions = ["user_id = $1"]
        values: list = [user_id]

        if filters.type:
            values.append(filters.type)
            conditions.append(f"type = ${len(values)}")
        if filters.categoryId:
            values.append(filters.categoryId)
            conditions.append(f"category_id = ${len(values)}")
        if filters.query:
            values.append(f"%{filters.query}%")
            conditions.append(f"description ILIKE ${len(values)}")
        if filters.startDate:
            values.append(filters.startDate)
            conditions.append(f"occurred_on >= ${len(values)}::date")
        if filters.endDate:
            values.append(filters.endDate)
            conditions.append(f"occurred_on <= ${len(values)}::date")

        values.append(limit)

        order_map = {
            "newest": "occurred_on DESC, created_at DESC",
            "oldest": "occurred_on ASC, created_at ASC",
            "amount_desc": "amount_cents DESC",
            "amount_asc": "amount_cents ASC",
        }
        order_clause = order_map.get(filters.sort, "occurred_on DESC, created_at DESC")

        query = f"""
            SELECT {TRANSACTION_COLUMNS}
            FROM transactions
            WHERE {" AND ".join(conditions)}
            ORDER BY {order_clause}
            LIMIT ${len(values)}
        """
        rows = await self.pool.fetch(query, *values)
        return [map_transaction(r) for r in rows]

    async def find_for_user(self, user_id: str, transaction_id: str) -> Optional[Transaction]:
        query = f"SELECT {TRANSACTION_COLUMNS} FROM transactions WHERE id = $1 AND user_id = $2"
        row = await self.pool.fetchrow(query, transaction_id, user_id)
        return map_transaction(row) if row else None

    async def update_for_user(
        self, user_id: str, transaction_id: str, input_data: UpdateTransactionInput
    ) -> Optional[Transaction]:
        fields = []
        values = []

        if input_data.categoryId is not None:
            fields.append(f"category_id = ${len(values) + 1}")
            values.append(input_data.categoryId)
        if input_data.type is not None:
            fields.append(f"type = ${len(values) + 1}")
            values.append(input_data.type)
        if input_data.amountCents is not None:
            fields.append(f"amount_cents = ${len(values) + 1}")
            values.append(input_data.amountCents)
        if input_data.description is not None:
            fields.append(f"description = ${len(values) + 1}")
            values.append(input_data.description)
        if input_data.occurredOn is not None:
            fields.append(f"occurred_on = ${len(values) + 1}::date")
            values.append(input_data.occurredOn)

        if not fields:
            return await self.find_for_user(user_id, transaction_id)

        values.extend([transaction_id, user_id])
        query = f"""
            UPDATE transactions
            SET {", ".join(fields)}
            WHERE id = ${len(values) - 1} AND user_id = ${len(values)}
            RETURNING {TRANSACTION_COLUMNS}
        """
        row = await self.pool.fetchrow(query, *values)
        return map_transaction(row) if row else None

    async def delete_for_user(self, user_id: str, transaction_id: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM transactions WHERE id = $1 AND user_id = $2",
            transaction_id,
            user_id,
        )
        return result == "DELETE 1"
