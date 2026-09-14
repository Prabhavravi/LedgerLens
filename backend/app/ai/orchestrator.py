from typing import Optional
import re
from app.ai.prompts import FINANCIAL_ASSISTANT_SYSTEM_PROMPT
from app.ai.provider import AssistantModel, get_assistant_model
from app.ai.tool_registry import ToolRegistry
from app.ai.tools import create_financial_tool_registry
from app.schemas.ai import (
    Activity,
    AssistantMessage,
    AssistantReply,
    PendingAction,
)
from app.schemas.auth import User

WRITE_TOOLS = {
    "create_my_transaction",
    "update_my_transaction",
    "create_or_update_my_budget",
    "create_my_financial_goal",
    "update_my_financial_goal",
}
FINANCIAL_LANGUAGE = re.compile(r"\b(spend|spent|spending|income|expense|budget|transaction|saving|savings|goal|category|financial|trend|money)\b|₹", re.I)

TOOL_LABELS = {
    "get_my_transactions": "Checking your transactions…",
    "get_my_financial_summary": "Calculating your financial summary…",
    "get_my_category_spending": "Checking category spending…",
    "get_my_spending_trends": "Checking your spending trends…",
    "get_my_budget_status": "Checking your budgets…",
    "create_my_transaction": "Preparing a transaction…",
    "update_my_transaction": "Preparing a transaction update…",
    "create_or_update_my_budget": "Preparing a budget update…",
    "get_my_financial_goals": "Checking your financial goals…",
    "get_my_goal_action_plan": "Calculating your monthly action plan…",
    "create_my_financial_goal": "Preparing a savings goal…",
    "update_my_financial_goal": "Preparing a goal update…",
}

ACTION_TITLES = {
    "create_my_transaction": "Add transaction",
    "update_my_transaction": "Update transaction",
    "create_or_update_my_budget": "Create or update budget",
    "create_my_financial_goal": "Create financial goal",
    "update_my_financial_goal": "Update financial goal",
}


def get_tool_label(tool_name: str) -> str:
    return TOOL_LABELS.get(tool_name, "Checking your financial data…")


def get_action_title(tool_name: str) -> str:
    return ACTION_TITLES.get(tool_name, "Perform action")


class FinancialAssistantOrchestrator:
    def __init__(self, model: AssistantModel, tools: ToolRegistry):
        self.model = model
        self.tools = tools

    async def respond(
        self,
        user: User,
        history: list[AssistantMessage],
    ) -> AssistantReply:
        turn = await self.model.respond(
            instructions=FINANCIAL_ASSISTANT_SYSTEM_PROMPT,
            messages=history,
            tools=self.tools.metadata(),
        )

        activities: list[Activity] = []
        pending_actions: list[PendingAction] = []
        has_verified_tool_result = False

        for _ in range(5):
            if not turn.tool_calls:
                if FINANCIAL_LANGUAGE.search(history[-1].content if history else "") and not has_verified_tool_result:
                    return AssistantReply(message="I need to check your verified financial records before answering that. Please try again.", activities=activities, pendingActions=pending_actions)
                return AssistantReply(
                    message=turn.text or "I could not produce a grounded response.",
                    activities=activities,
                    pendingActions=pending_actions,
                )

            outputs: list[dict] = []
            for call in turn.tool_calls:
                name = call["name"]
                call_id = call["callId"]
                raw_input = call.get("input", {})

                if name in WRITE_TOOLS:
                    activities.append(
                        Activity(
                            tool=name,
                            label=get_tool_label(name),
                            status="awaiting_confirmation",
                        )
                    )
                    pending_actions.append(
                        PendingAction(
                            tool=name,
                            input=raw_input,
                            title=get_action_title(name),
                        )
                    )
                    continue

                try:
                    output = await self.tools.execute(name, raw_input, user)
                    has_verified_tool_result = True
                    activities.append(
                        Activity(
                            tool=name,
                            label=get_tool_label(name),
                            status="completed",
                        )
                    )
                    outputs.append({"callId": call_id, "output": output})
                except Exception:
                    activities.append(
                        Activity(
                            tool=name,
                            label=get_tool_label(name),
                            status="failed",
                        )
                    )
                    outputs.append(
                        {
                            "callId": call_id,
                            "output": {
                            "error": "The requested financial operation could not be completed."
                            },
                        }
                    )
                    # Do not give a model that attempted an unregistered or
                    # unauthorized tool another opportunity to repeat the
                    # request. The caller gets a safe, bounded refusal.
                    return AssistantReply(
                        message="I can only access your own financial data through approved tools.",
                        activities=activities,
                        pendingActions=pending_actions,
                    )

            if pending_actions:
                return AssistantReply(
                    message="I can make the proposed change after you confirm it.",
                    activities=activities,
                    pendingActions=pending_actions,
                )

            turn = await self.model.respond(
                instructions=FINANCIAL_ASSISTANT_SYSTEM_PROMPT,
                messages=history,
                tools=self.tools.metadata(),
                tool_outputs=outputs,
                previous_response_id=turn.response_id,
            )

        return AssistantReply(
            message="I reached the tool-call safety limit. Please narrow your request.",
            activities=activities,
            pendingActions=pending_actions,
        )


_assistant_instance: Optional[FinancialAssistantOrchestrator] = None


def get_financial_assistant(tools: Optional[ToolRegistry] = None) -> FinancialAssistantOrchestrator:
    if tools is not None:
        return FinancialAssistantOrchestrator(get_assistant_model(), tools)
    global _assistant_instance
    if _assistant_instance is None:
        # Fallback empty registry if accessed without pool
        _assistant_instance = FinancialAssistantOrchestrator(get_assistant_model(), ToolRegistry())
    return _assistant_instance


def init_financial_assistant(pool) -> FinancialAssistantOrchestrator:
    global _assistant_instance
    tools = create_financial_tool_registry(pool)
    _assistant_instance = FinancialAssistantOrchestrator(get_assistant_model(), tools)
    return _assistant_instance
