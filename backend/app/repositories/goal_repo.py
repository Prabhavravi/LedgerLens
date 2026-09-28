from typing import Optional
import asyncpg
from app.db.tenant import TenantDatabase
from app.schemas.goal import CreateGoalInput, Goal, UpdateGoalInput

GOAL_COLUMNS = """
    id, user_id AS "userId", name, target_amount_cents AS "targetAmountCents",
    current_saved_cents AS "currentSavedCents",
    TO_CHAR(target_date, 'YYYY-MM-DD') AS "targetDate",
    description, created_at AS "createdAt"
"""


def map_goal(row: asyncpg.Record) -> Goal:
    return Goal(
        id=str(row["id"]),
        userId=str(row["userId"]),
        name=row["name"],
        targetAmountCents=int(row["targetAmountCents"]),
        currentSavedCents=int(row["currentSavedCents"]),
        targetDate=str(row["targetDate"]),
        description=row["description"],
        createdAt=str(row["createdAt"]) if row["createdAt"] else None,
    )


class GoalRepository:
    def __init__(self, pool: TenantDatabase):
        self.pool = pool

    async def create(self, user_id: str, input_data: CreateGoalInput) -> Goal:
        query = f"""
            INSERT INTO goals (user_id, name, target_amount_cents, current_saved_cents, target_date, description)
            VALUES ($1, $2, $3, $4, $5::date, $6)
            RETURNING {GOAL_COLUMNS}
        """
        row = await self.pool.fetchrow(
            query,
            user_id,
            input_data.name,
            input_data.targetAmountCents,
            input_data.currentSavedCents,
            input_data.targetDate,
            input_data.description,
        )
        return map_goal(row)

    async def list_for_user(self, user_id: str) -> list[Goal]:
        query = f"SELECT {GOAL_COLUMNS} FROM goals WHERE user_id = $1 ORDER BY target_date ASC, created_at ASC"
        rows = await self.pool.fetch(query, user_id)
        return [map_goal(r) for r in rows]

    async def find_for_user(self, user_id: str, goal_id: str) -> Optional[Goal]:
        query = f"SELECT {GOAL_COLUMNS} FROM goals WHERE id = $1 AND user_id = $2"
        row = await self.pool.fetchrow(query, goal_id, user_id)
        return map_goal(row) if row else None

    async def update_for_user(
        self, user_id: str, goal_id: str, input_data: UpdateGoalInput
    ) -> Optional[Goal]:
        fields = []
        values = []

        if input_data.name is not None:
            fields.append(f"name = ${len(values) + 1}")
            values.append(input_data.name)
        if input_data.targetAmountCents is not None:
            fields.append(f"target_amount_cents = ${len(values) + 1}")
            values.append(input_data.targetAmountCents)
        if input_data.currentSavedCents is not None:
            fields.append(f"current_saved_cents = ${len(values) + 1}")
            values.append(input_data.currentSavedCents)
        if input_data.targetDate is not None:
            fields.append(f"target_date = ${len(values) + 1}::date")
            values.append(input_data.targetDate)
        if input_data.description is not None:
            fields.append(f"description = ${len(values) + 1}")
            values.append(input_data.description)

        if not fields:
            return await self.find_for_user(user_id, goal_id)

        values.extend([goal_id, user_id])
        query = f"""
            UPDATE goals
            SET {", ".join(fields)}
            WHERE id = ${len(values) - 1} AND user_id = ${len(values)}
            RETURNING {GOAL_COLUMNS}
        """
        row = await self.pool.fetchrow(query, *values)
        return map_goal(row) if row else None

    async def delete_for_user(self, user_id: str, goal_id: str) -> bool:
        result = await self.pool.execute(
            "DELETE FROM goals WHERE id = $1 AND user_id = $2",
            goal_id,
            user_id,
        )
        return result == "DELETE 1"
