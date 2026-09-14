from datetime import datetime
from typing import Optional
import asyncpg
from app.schemas.auth import User


class AuthRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def find_user_by_email(self, email: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            'SELECT id, email, password_hash AS "passwordHash" FROM users WHERE email = $1',
            email,
        )
        return dict(row) if row else None

    async def create_user(self, email: str, password_hash: str) -> User:
        row = await self.pool.fetchrow(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            email,
            password_hash,
        )
        return User(id=str(row["id"]), email=row["email"])

    async def create_session(self, user_id: str, token_hash: str, expires_at: datetime) -> None:
        await self.pool.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
            user_id,
            token_hash,
            expires_at,
        )

    async def find_session(self, token_hash: str) -> Optional[dict]:
        row = await self.pool.fetchrow(
            """
            SELECT u.id AS user_id, u.email, s.token_hash, s.expires_at, s.revoked_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = $1
            """,
            token_hash,
        )
        if not row:
            return None
        return {
            "user": User(id=str(row["user_id"]), email=row["email"]),
            "tokenHash": row["token_hash"],
            "expiresAt": row["expires_at"],
            "revokedAt": row["revoked_at"],
        }

    async def revoke_session(self, token_hash: str) -> None:
        await self.pool.execute(
            "UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
            token_hash,
        )
