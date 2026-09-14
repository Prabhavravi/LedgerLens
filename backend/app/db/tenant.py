"""Per-operation PostgreSQL RLS context for authenticated application data."""

from typing import Any

import asyncpg


class TenantDatabase:
    """Expose the asyncpg methods repositories use with a bound tenant identity.

    Each operation gets a pooled connection and transaction-local identity. This
    is safe with Supabase/PgBouncer transaction pooling and prevents tenant
    state from leaking to the next pooled request.
    """

    def __init__(self, pool: asyncpg.Pool, user_id: str):
        self.pool = pool
        self.user_id = user_id

    async def _call(self, method: str, query: str, *args: Any) -> Any:
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute(
                    "SELECT set_config('app.current_user_id', $1, true)", self.user_id
                )
                return await getattr(connection, method)(query, *args)

    async def fetch(self, query: str, *args: Any) -> list[asyncpg.Record]:
        return await self._call("fetch", query, *args)

    async def fetchrow(self, query: str, *args: Any) -> asyncpg.Record | None:
        return await self._call("fetchrow", query, *args)

    async def fetchval(self, query: str, *args: Any) -> Any:
        return await self._call("fetchval", query, *args)

    async def execute(self, query: str, *args: Any) -> str:
        return await self._call("execute", query, *args)
