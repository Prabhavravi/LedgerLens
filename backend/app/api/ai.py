from typing import Any
from fastapi import APIRouter, Depends, status

from app.ai.orchestrator import WRITE_TOOLS, FinancialAssistantOrchestrator
from app.ai.tools import create_financial_tool_registry
from app.api.deps import get_ai_orchestrator, get_current_user, get_tenant_db
from app.db.tenant import TenantDatabase
from app.exceptions import ValidationException
from app.schemas.ai import (
    ActionConfirmationInput,
    AssistantChatRequest,
    DirectToolExecutionRequest,
)
from app.schemas.auth import User
import asyncpg

router = APIRouter(prefix="/ai", tags=["ai"])
READ_ONLY_TOOLS = {
    "get_my_transactions", "get_my_financial_summary", "get_my_category_spending",
    "get_my_spending_trends", "get_my_budget_status", "get_my_financial_goals",
    "get_my_goal_action_plan",
}


def format_action_result_message(tool: str, raw_input: dict[str, Any]) -> str:
    amount = ""
    if isinstance(raw_input.get("amount"), (int, float)):
        amount = f"₹{raw_input['amount']:,.2f}"
    category = str(raw_input.get("category") or "selected category")
    month = str(raw_input.get("month") or "the selected period")
    tx_type = str(raw_input.get("type") or "")
    tx_date = str(raw_input.get("date") or "the selected date")

    if tool == "create_my_transaction":
        return f"Transaction added successfully: {amount} {category} {tx_type} on {tx_date}."
    if tool == "update_my_transaction":
        return "Transaction updated successfully."
    if tool == "create_or_update_my_budget":
        return f"Budget saved successfully: {amount} for {category} in {month}."
    if tool == "create_my_financial_goal":
        target = f"{raw_input.get('targetAmount', 0):,.2f}"
        name = raw_input.get("name", "Goal")
        return f'Financial goal "{name}" created successfully with target ₹{target}.'
    return "Financial goal updated successfully."


@router.post("/assistant", status_code=status.HTTP_200_OK)
async def chat_assistant(
    request: AssistantChatRequest,
    user: User = Depends(get_current_user),
    orchestrator: FinancialAssistantOrchestrator = Depends(get_ai_orchestrator),
):
    reply = await orchestrator.respond(user, request.messages)
    return {"ok": True, "data": reply.model_dump()}


@router.post("/assistant/action", status_code=status.HTTP_200_OK)
async def confirm_assistant_action(
    request: ActionConfirmationInput,
    user: User = Depends(get_current_user),
    pool: TenantDatabase = Depends(get_tenant_db),
):
    if request.tool not in WRITE_TOOLS:
        raise ValidationException("Invalid action confirmation.")

    registry = create_financial_tool_registry(pool)
    result = await registry.execute(request.tool, request.input, user)
    message = format_action_result_message(request.tool, request.input)

    return {
        "ok": True,
        "data": {
            "tool": request.tool,
            "result": result,
            "message": message,
        },
    }


@router.get("/tools", status_code=status.HTTP_200_OK)
async def get_tool_metadata(
    user: User = Depends(get_current_user),
    pool: TenantDatabase = Depends(get_tenant_db),
):
    registry = create_financial_tool_registry(pool)
    return {"ok": True, "data": registry.metadata()}


@router.post("/tools", status_code=status.HTTP_200_OK)
async def execute_tool_directly(
    request: DirectToolExecutionRequest,
    user: User = Depends(get_current_user),
    pool: TenantDatabase = Depends(get_tenant_db),
):
    if request.tool not in READ_ONLY_TOOLS:
        raise ValidationException("Write tools require the confirmed assistant action flow.")
    registry = create_financial_tool_registry(pool)
    result = await registry.execute(request.tool, request.input, user)
    return {"ok": True, "data": result}
