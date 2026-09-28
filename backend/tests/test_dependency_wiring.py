"""Exercise the real financial dependency chain without a live database."""

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.deps import get_auth_service, get_db, SESSION_COOKIE_NAME
from app.main import app
from app.schemas.auth import User


@pytest.fixture
def wired_backend():
    events = []

    class Connection:
        @asynccontextmanager
        async def transaction(self):
            events.append("begin")
            try:
                yield
            finally:
                events.append("end")

        async def execute(self, query, *args):
            events.append((query, args))

        async def fetch(self, query, *args):
            events.append((query, args))
            return []

    class Pool:
        @asynccontextmanager
        async def acquire(self):
            yield Connection()

    user = User(id="11111111-1111-4111-8111-111111111111", email="test@example.com")
    auth = SimpleNamespace(get_user_for_token=AsyncMock(return_value=user))
    app.dependency_overrides[get_db] = lambda: Pool()
    app.dependency_overrides[get_auth_service] = lambda: auth
    try:
        yield user, auth, events
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_financial_route_binds_verified_user_to_database(wired_backend):
    user, auth, events = wired_backend
    # ASGITransport does not run database startup; only the pool/auth adapters
    # are replaced. The route, session dependency, service, and repository run.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test",
        cookies={SESSION_COOKIE_NAME: "opaque-token"},
    ) as client:
        response = await client.get("/api/v1/categories")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "data": []}
    auth.get_user_for_token.assert_awaited_once_with("opaque-token")
    assert events[0] == "begin"
    assert events[1] == (
        "SELECT set_config('app.current_user_id', $1, true)", (user.id,)
    )
    assert "user_id = $1" in events[2][0]
    assert events[2][1] == (user.id,)
    assert events[3] == "end"


@pytest.mark.asyncio
async def test_financial_route_rejects_missing_session_before_query(wired_backend):
    _, auth, events = wired_backend
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test",
    ) as client:
        response = await client.get("/api/v1/categories")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    auth.get_user_for_token.assert_not_awaited()
    assert events == []
