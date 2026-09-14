from typing import Optional
import asyncpg
from app.schemas.category import Category, CategoryInput, UpdateCategoryInput


class CategoryRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def list_available(self, user_id: str) -> list[Category]:
        rows = await self.pool.fetch(
            """
            SELECT id, user_id AS "userId", name, type
            FROM categories
            WHERE user_id IS NULL OR user_id = $1
            ORDER BY type, name
            """,
            user_id,
        )
        return [
            Category(id=str(r["id"]), userId=str(r["userId"]) if r["userId"] else None, name=r["name"], type=r["type"])
            for r in rows
        ]

    async def find_available(self, user_id: str, category_id: str) -> Optional[Category]:
        row = await self.pool.fetchrow(
            """
            SELECT id, user_id AS "userId", name, type
            FROM categories
            WHERE id = $1 AND (user_id IS NULL OR user_id = $2)
            """,
            category_id,
            user_id,
        )
        if not row:
            return None
        return Category(
            id=str(row["id"]),
            userId=str(row["userId"]) if row["userId"] else None,
            name=row["name"],
            type=row["type"],
        )

    async def create(self, user_id: str, input_data: CategoryInput) -> Category:
        row = await self.pool.fetchrow(
            """
            INSERT INTO categories (user_id, name, type)
            VALUES ($1, $2, $3)
            RETURNING id, user_id AS "userId", name, type
            """,
            user_id,
            input_data.name,
            input_data.type,
        )
        return Category(
            id=str(row["id"]),
            userId=str(row["userId"]) if row["userId"] else None,
            name=row["name"],
            type=row["type"],
        )

    async def update_private(self, user_id: str, category_id: str, input_data: UpdateCategoryInput) -> Optional[Category]:
        fields = []
        values = []
        if input_data.name is not None:
            fields.append(f"name = ${len(values) + 1}")
            values.append(input_data.name)
        if input_data.type is not None:
            fields.append(f"type = ${len(values) + 1}")
            values.append(input_data.type)

        if not fields:
            return await self.find_available(user_id, category_id)

        values.extend([category_id, user_id])
        query = f"""
            UPDATE categories
            SET {", ".join(fields)}
            WHERE id = ${len(values) - 1} AND user_id = ${len(values)}
            RETURNING id, user_id AS "userId", name, type
        """
        row = await self.pool.fetchrow(query, *values)
        if not row:
            return None
        return Category(
            id=str(row["id"]),
            userId=str(row["userId"]) if row["userId"] else None,
            name=row["name"],
            type=row["type"],
        )

    async def delete_private(self, user_id: str, category_id: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM categories WHERE id = $1 AND user_id = $2",
            category_id,
            user_id,
        )
        # asyncpg returns "DELETE <count>"
        return result == "DELETE 1"
