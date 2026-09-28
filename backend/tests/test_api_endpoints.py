from datetime import date
from contextlib import asynccontextmanager
from fastapi.testclient import TestClient
import pytest

from app.ai.orchestrator import FinancialAssistantOrchestrator
from app.ai.provider import LocalAssistantModel
from app.ai.tool_registry import ToolRegistry
from app.ai.tools import ToolServices, register_financial_tools
from app.api.deps import (
    get_ai_orchestrator,
    get_analytics_service,
    get_auth_service,
    get_budget_service,
    get_category_service,
    get_current_user,
    get_goal_service,
    get_insight_service,
    get_transaction_service,
)
from app.main import app
from app.schemas.auth import User

TEST_USER = User(id="user-api-test-0001", email="testapi@example.com")


@pytest.fixture
def client(in_memory_services):
    app.dependency_overrides[get_auth_service] = lambda: in_memory_services["auth"]
    app.dependency_overrides[get_category_service] = lambda: in_memory_services["cat"]
    app.dependency_overrides[get_transaction_service] = lambda: in_memory_services["tx"]
    app.dependency_overrides[get_budget_service] = lambda: in_memory_services["budget"]
    app.dependency_overrides[get_goal_service] = lambda: in_memory_services["goal"]
    app.dependency_overrides[get_analytics_service] = lambda: in_memory_services["analytics"]
    app.dependency_overrides[get_insight_service] = lambda: in_memory_services["insight"]
    app.dependency_overrides[get_current_user] = lambda: TEST_USER

    tool_services = ToolServices(
        transactions=in_memory_services["tx"],
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=in_memory_services["analytics"],
    )
    registry = ToolRegistry()
    register_financial_tools(registry, tool_services)
    orchestrator = FinancialAssistantOrchestrator(LocalAssistantModel(), registry)

    app.dependency_overrides[get_ai_orchestrator] = lambda: orchestrator

    @asynccontextmanager
    async def test_lifespan(_app):
        # These tests replace every data dependency with in-memory services;
        # do not open the real Supabase connection pool during TestClient
        # startup or shutdown.
        yield

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = test_lifespan
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.router.lifespan_context = original_lifespan
        app.dependency_overrides.clear()


def test_health_check(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["service"] == "ai-powered-expense-tracker"


def test_unversioned_api_is_not_registered(client):
    assert client.get("/api/health").status_code == 404
    paths = client.get("/openapi.json").json()["paths"]
    assert all(path == "/" or path.startswith("/api/v1/") for path in paths)


def test_categories_api(client):
    # List initial system categories
    res = client.get("/api/v1/categories")
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert len(res.json()["data"]) >= 5

    # Create private category
    res = client.post("/api/v1/categories", json={"name": "Gaming", "type": "expense"})
    assert res.status_code == 201
    created = res.json()["data"]
    assert created["name"] == "Gaming"

    # Delete category
    del_res = client.delete(f"/api/v1/categories/{created['id']}")
    assert del_res.status_code == 204


def test_transactions_api(client):
    # Create transaction
    payload = {
        "type": "expense",
        "amountCents": 25000,
        "categoryId": "11111111-1111-4111-8111-111111111111",
        "description": "Weekly grocery",
        "occurredOn": "2026-09-10",
    }
    res = client.post("/api/v1/transactions", json=payload)
    assert res.status_code == 201
    created = res.json()["data"]
    assert created["amountCents"] == 25000

    # List transactions
    res = client.get("/api/v1/transactions")
    assert res.status_code == 200
    items = res.json()["data"]
    assert len(items) >= 1

    # Update transaction
    tx_id = created["id"]
    res = client.patch(
        f"/api/v1/transactions/{tx_id}", json={"description": "Updated grocery"}
    )
    assert res.status_code == 200
    assert res.json()["data"]["description"] == "Updated grocery"

    # Delete transaction
    res = client.delete(f"/api/v1/transactions/{tx_id}")
    assert res.status_code == 204


def test_budgets_api(client):
    payload = {
        "categoryId": "11111111-1111-4111-8111-111111111111",
        "amountCents": 500000,
        "month": "2026-09",
    }
    res = client.post("/api/v1/budgets", json=payload)
    assert res.status_code == 201

    res = client.get("/api/v1/budgets?month=2026-09")
    assert res.status_code == 200
    statuses = res.json()["data"]
    assert len(statuses) >= 1


def test_goals_and_action_plan_api(client):
    payload = {
        "name": "Trip to Japan",
        "targetAmountCents": 15000000,
        "currentSavedCents": 5000000,
        "targetDate": "2026-12-31",
    }
    res = client.post("/api/v1/goals", json=payload)
    assert res.status_code == 201
    goal = res.json()["data"]
    goal_id = goal["id"]

    # Quick contribution
    contrib_res = client.patch(f"/api/v1/goals/{goal_id}", json={"amountCents": 1000000})
    assert contrib_res.status_code == 200
    assert contrib_res.json()["data"]["currentSavedCents"] == 6000000

    # Action plan endpoint
    plan_res = client.get(f"/api/v1/goals/{goal_id}/plan")
    assert plan_res.status_code == 200
    plan_data = plan_res.json()["data"]
    assert plan_data["calculatedFacts"]["remainingAmountCents"] == 9000000


def test_analytics_and_insights_api(client):
    res = client.get("/api/v1/analytics/dashboard?month=2026-09")
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert "summary" in res.json()["data"]

    res = client.get("/api/v1/insights?month=2026-09")
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert isinstance(res.json()["data"], list)


def test_ai_assistant_api(client):
    res = client.post(
        "/api/v1/ai/assistant",
        json={"messages": [{"role": "user", "content": "Hello LedgerLens"}]},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert "message" in res.json()["data"]
