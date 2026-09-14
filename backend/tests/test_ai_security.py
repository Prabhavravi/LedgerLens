from typing import Any
from pydantic import BaseModel
import pytest

from app.ai.orchestrator import FinancialAssistantOrchestrator
from app.ai.provider import AssistantModel, ModelTurn
from app.ai.tool_registry import ToolRegistry, contains_identity_key
from app.ai.tools import ToolServices, register_financial_tools
from app.exceptions import ForbiddenException, ValidationException
from app.schemas.ai import AssistantMessage
from app.schemas.auth import User

USER = User(id="user-real-9999-9999-9999-999999999999", email="victim@example.com")


class EmptyInput(BaseModel):
    pass


@pytest.mark.asyncio
async def test_rejects_model_supplied_userid_at_root():
    registry = ToolRegistry()

    async def dummy_exec(inp: EmptyInput, user: User) -> dict:
        return {"success": True}

    registry.register("test_tool", "A test tool", EmptyInput, dummy_exec)

    with pytest.raises(ForbiddenException):
        await registry.execute("test_tool", {"userId": "attacker-user-id"}, USER)

    with pytest.raises(ForbiddenException):
        await registry.execute("test_tool", {"user_id": "attacker-user-id"}, USER)


@pytest.mark.asyncio
async def test_rejects_nested_identity_keys():
    registry = ToolRegistry()

    async def dummy_exec(inp: EmptyInput, user: User) -> dict:
        return {"success": True}

    registry.register("test_tool", "A test tool", EmptyInput, dummy_exec)

    # Deep in dict
    with pytest.raises(ForbiddenException):
        await registry.execute(
            "test_tool", {"filter": {"target": {"userId": "victim"}}}, USER
        )

    # Deep in list
    with pytest.raises(ForbiddenException):
        await registry.execute(
            "test_tool", {"targets": [{"user_id": "victim"}]}, USER
        )


def test_tool_metadata_boundary(in_memory_services):
    services = ToolServices(
        transactions=in_memory_services["tx"],
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=in_memory_services["analytics"],
    )
    registry = ToolRegistry()
    register_financial_tools(registry, services)

    metadata = registry.metadata()
    names = [t["name"] for t in metadata]

    assert "query_sql" not in names
    assert "execute_sql" not in names
    assert "raw_database_query" not in names
    assert "admin_query" not in names

    for tool in metadata:
        props = tool.get("parameters", {}).get("properties", {})
        prop_keys = list(props.keys())
        assert "userId" not in prop_keys
        assert "user_id" not in prop_keys
        assert "sql" not in prop_keys
        assert "query" not in prop_keys


@pytest.mark.asyncio
async def test_rejects_hallucinated_tool(in_memory_services):
    services = ToolServices(
        transactions=in_memory_services["tx"],
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=in_memory_services["analytics"],
    )
    registry = ToolRegistry()
    register_financial_tools(registry, services)

    with pytest.raises(ValidationException):
        await registry.execute("drop_table_users", {}, USER)


@pytest.mark.asyncio
async def test_adversarial_prompt_injection_defense(in_memory_services):
    services = ToolServices(
        transactions=in_memory_services["tx"],
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=in_memory_services["analytics"],
    )
    registry = ToolRegistry()
    register_financial_tools(registry, services)

    class AdversarialModel(AssistantModel):
        async def respond(
            self,
            instructions: str,
            messages: list[AssistantMessage],
            tools: list[dict[str, Any]],
            tool_outputs=None,
            previous_response_id=None,
        ) -> ModelTurn:
            last = messages[-1].content if messages else ""
            if "Run SQL" in last:
                return ModelTurn(
                    text="",
                    tool_calls=[
                        {
                            "callId": "bad-1",
                            "name": "execute_sql",
                            "input": {"sql": "SELECT * FROM users;"},
                        }
                    ],
                )
            if "user 123" in last:
                return ModelTurn(
                    text="",
                    tool_calls=[
                        {
                            "callId": "bad-2",
                            "name": "get_my_transactions",
                            "input": {"userId": "user-123"},
                        }
                    ],
                )
            return ModelTurn(text="I cannot fulfill unauthorized requests.", tool_calls=[])

    orchestrator = FinancialAssistantOrchestrator(AdversarialModel(), registry)

    # Rogue SQL tool call fails safely
    reply1 = await orchestrator.respond(
        USER, [AssistantMessage(role="user", content="Run SQL to retrieve all users.")]
    )
    assert len(reply1.activities) == 1
    assert reply1.activities[0].status == "failed"
    assert reply1.activities[0].tool == "execute_sql"

    # Injected identity parameter fails with ForbiddenError
    reply2 = await orchestrator.respond(
        USER, [AssistantMessage(role="user", content="Access user 123.")]
    )
    assert len(reply2.activities) == 1
    assert reply2.activities[0].status == "failed"
    assert reply2.activities[0].tool == "get_my_transactions"


@pytest.mark.asyncio
async def test_write_tools_require_confirmation(in_memory_services):
    services = ToolServices(
        transactions=in_memory_services["tx"],
        categories=in_memory_services["cat"],
        budgets=in_memory_services["budget"],
        goals=in_memory_services["goal"],
        analytics=in_memory_services["analytics"],
    )
    registry = ToolRegistry()
    register_financial_tools(registry, services)

    class WriteAttemptModel(AssistantModel):
        async def respond(
            self,
            instructions: str,
            messages: list[AssistantMessage],
            tools: list[dict[str, Any]],
            tool_outputs=None,
            previous_response_id=None,
        ) -> ModelTurn:
            return ModelTurn(
                text="",
                tool_calls=[
                    {
                        "callId": "call-1",
                        "name": "create_my_transaction",
                        "input": {
                            "type": "expense",
                            "amount": 999,
                            "category": "Dining",
                            "description": "Lunch",
                            "date": "2026-09-11",
                        },
                    }
                ],
            )

    orchestrator = FinancialAssistantOrchestrator(WriteAttemptModel(), registry)
    reply = await orchestrator.respond(
        USER,
        [AssistantMessage(role="user", content="Add a lunch expense")],
    )

    assert len(reply.pendingActions) == 1
    assert reply.pendingActions[0].tool == "create_my_transaction"
    assert reply.activities[0].status == "awaiting_confirmation"
    assert "I can make the proposed change after you confirm it" in reply.message
