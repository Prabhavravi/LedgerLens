from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
import json
import logging
import re
from typing import Any, Optional
import uuid
import httpx
from pydantic import BaseModel
from app.config import settings
from app.schemas.ai import AssistantMessage

logger = logging.getLogger(__name__)


class ModelTurn:
    def __init__(
        self,
        text: str,
        tool_calls: list[dict[str, Any]],
        response_id: Optional[str] = None,
    ):
        self.text = text
        self.tool_calls = tool_calls
        self.response_id = response_id


class AssistantModel(ABC):
    @abstractmethod
    async def respond(
        self,
        instructions: str,
        messages: list[AssistantMessage],
        tools: list[dict[str, Any]],
        tool_outputs: Optional[list[dict[str, Any]]] = None,
        previous_response_id: Optional[str] = None,
    ) -> ModelTurn:
        pass


def _to_strict_json_schema(schema: Any) -> Any:
    """Recursively rewrite a JSON schema so it satisfies OpenAI's
    strict function-calling mode: every object node needs
    additionalProperties: false, and every property must be listed
    in required (OpenAI strict mode has no notion of optional
    properties — a field that's logically optional must instead be
    given a nullable type, e.g. {"type": ["string", "null"]}, while
    still appearing in required).
    """
    if isinstance(schema, list):
        return [_to_strict_json_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    result = {k: _to_strict_json_schema(v) for k, v in schema.items()}

    schema_type = result.get("type")
    is_object = schema_type == "object" or "properties" in result
    if is_object:
        result.setdefault("additionalProperties", False)
        properties = result.get("properties", {})
        result["required"] = list(properties.keys())

    if "items" in result:
        result["items"] = _to_strict_json_schema(result["items"])

    return result


def safe_parse_json(value: Optional[str]) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


class OpenAiResponsesModel(AssistantModel):
    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key
        self.model_name = model_name

    async def respond(
        self,
        instructions: str,
        messages: list[AssistantMessage],
        tools: list[dict[str, Any]],
        tool_outputs: Optional[list[dict[str, Any]]] = None,
        previous_response_id: Optional[str] = None,
    ) -> ModelTurn:
        formatted_tools = [
            {
                "type": "function",
                "name": t["name"],
                "description": t["description"],
                "parameters": _to_strict_json_schema(t["parameters"]),
                "strict": True,
            }
            for t in tools
        ]

        if tool_outputs:
            payload = {
                "model": self.model_name,
                "instructions": instructions,
                "previous_response_id": previous_response_id,
                "input": [
                    {
                        "type": "function_call_output",
                        "call_id": item["callId"],
                        "output": json.dumps(item["output"]),
                    }
                    for item in tool_outputs
                ],
                "tools": formatted_tools,
                "store": False,
            }
        else:
            payload = {
                "model": self.model_name,
                "instructions": instructions,
                "input": [{"role": m.role, "content": m.content} for m in messages],
                "tools": formatted_tools,
                "store": False,
            }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/responses",
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
                if not res.is_success:
                    # Log the real cause server-side only. The client-facing
                    # exception stays generic per the safe-error-response
                    # convention; never surface res.text() to the caller,
                    # since it may echo request content or provider internals.
                    logger.error(
                        "OpenAI request failed: status=%s body=%s",
                        res.status_code,
                        res.text,
                    )
                    raise RuntimeError("AI provider request failed.")
                data = res.json()
        except Exception as error:
            if isinstance(error, RuntimeError):
                raise
            logger.error("OpenAI request raised an exception", exc_info=True)
            raise RuntimeError("AI provider request failed.") from None

        tool_calls = []
        for item in data.get("output", []) if isinstance(data, dict) and isinstance(data.get("output"), list) else []:
            if item.get("type") == "function_call":
                tool_calls.append(
                    {
                        "callId": item.get("call_id") or str(uuid.uuid4()),
                        "name": item.get("name") or "",
                        "input": safe_parse_json(item.get("arguments")),
                    }
                )

        return ModelTurn(
            text=data.get("output_text") or "",
            tool_calls=tool_calls,
            response_id=data.get("id"),
        )


class AnthropicMessagesModel(AssistantModel):
    """Calls the Anthropic Messages API (Claude) with tool use."""

    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key
        self.model_name = model_name

    async def respond(
        self,
        instructions: str,
        messages: list[AssistantMessage],
        tools: list[dict[str, Any]],
        tool_outputs: Optional[list[dict[str, Any]]] = None,
        previous_response_id: Optional[str] = None,
    ) -> ModelTurn:
        formatted_tools = [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"],
            }
            for t in tools
        ]

        # Anthropic has no server-side "previous_response_id" continuation
        # like OpenAI's Responses API, so the orchestrator's conversation
        # history plus any pending tool outputs are sent as ordinary
        # messages each call. We reconstruct the tool-call/tool-result turn
        # locally using the callId's we handed out on the prior turn.
        anthropic_messages: list[dict[str, Any]] = [
            {"role": m.role, "content": m.content} for m in messages
        ]

        if tool_outputs:
            if not previous_response_id:
                raise RuntimeError(
                    "Missing prior tool-use turn; cannot attach tool results."
                )
            prior_tool_use_blocks = json.loads(previous_response_id)
            anthropic_messages.append(
                {"role": "assistant", "content": prior_tool_use_blocks}
            )
            anthropic_messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": item["callId"],
                            "content": json.dumps(item["output"]),
                        }
                        for item in tool_outputs
                    ],
                }
            )

        payload = {
            "model": self.model_name,
            "max_tokens": 2048,
            "system": instructions,
            "messages": anthropic_messages,
            "tools": formatted_tools,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                    json=payload,
                )
                if not res.is_success:
                    raise RuntimeError("AI provider request failed.")
                data = res.json()
        except Exception as error:
            if isinstance(error, RuntimeError):
                raise
            raise RuntimeError("AI provider request failed.") from None

        content_blocks = data.get("content", []) if isinstance(data, dict) else []

        text_parts = [
            block.get("text", "") for block in content_blocks if block.get("type") == "text"
        ]
        tool_use_blocks = [block for block in content_blocks if block.get("type") == "tool_use"]

        tool_calls = [
            {
                "callId": block.get("id") or str(uuid.uuid4()),
                "name": block.get("name") or "",
                "input": block.get("input") or {},
            }
            for block in tool_use_blocks
        ]

        # Stash the raw tool_use content blocks (keyed by callId) so the
        # *next* call can replay them as the assistant turn preceding the
        # tool_result message, since Anthropic requires the full
        # assistant/tool_use turn to be resent rather than referenced by id.
        response_id = json.dumps(content_blocks) if tool_use_blocks else None

        return ModelTurn(
            text="".join(text_parts),
            tool_calls=tool_calls,
            response_id=response_id,
        )


class LocalAssistantModel(AssistantModel):
    async def respond(
        self,
        instructions: str,
        messages: list[AssistantMessage],
        tools: list[dict[str, Any]],
        tool_outputs: Optional[list[dict[str, Any]]] = None,
        previous_response_id: Optional[str] = None,
    ) -> ModelTurn:
        if tool_outputs:
            # Application tools return typed Pydantic results. Convert only
            # these in-memory values for the local response formatter; this
            # preserves the same data boundary as the tool registry.
            normalized_outputs: list[dict[str, Any]] = []
            for item in tool_outputs:
                output = item.get("output")
                if isinstance(output, BaseModel):
                    output = output.model_dump()
                elif isinstance(output, list):
                    output = [entry.model_dump() if isinstance(entry, BaseModel) else entry for entry in output]
                normalized_outputs.append({**item, "output": output})

            prompt = messages[-1].content.lower() if messages else ""
            summaries: list[dict[str, Any]] = []
            category_breakdowns: list[list[dict[str, Any]]] = []
            budget_statuses: list[list[dict[str, Any]]] = []

            for item in normalized_outputs:
                out = item.get("output")
                if isinstance(out, dict) and "calculatedFacts" in out:
                    f = out["calculatedFacts"]
                    goal_name = out.get("goal", {}).get("name", "Goal")
                    opps = "\n".join(
                        f"• {o['categoryName']}: Current spending ₹{o['currentMonthlyExpenseCents'] / 100:.2f}. Suggested 20% adjustment frees ~₹{o['potentialMonthlySavingsCents'] / 100:.2f}/month."
                        for o in out.get("spendingAdjustmentOpportunities", [])
                    ) or "No discretionary categories recorded with expenses."

                    text = (
                        f"### Action Plan: {goal_name}\n\n"
                        f"**Calculated Facts:**\n"
                        f"- Target Amount: ₹{f['targetAmountCents'] / 100:.2f}\n"
                        f"- Current Saved: ₹{f['currentSavedCents'] / 100:.2f} ({f['percentageCompleted']}% completed)\n"
                        f"- Remaining Amount: ₹{f['remainingAmountCents'] / 100:.2f}\n"
                        f"- Remaining Period: {f['remainingMonths']} month(s)\n"
                        f"- Required Average Monthly Saving: ₹{f['requiredMonthlySavingsCents'] / 100:.2f}\n"
                        f"- Current Monthly Net Savings: ₹{f['currentMonthlyNetSavingsCents'] / 100:.2f} ({f['status'].replace('_', ' ').title()})\n\n"
                        f"**AI Suggestions (Not Guaranteed):**\n{opps}\n\n"
                        f"*Note: Action plan figures are deterministic calculations. Category reduction opportunities are illustrative targets based on past spending habits.*"
                    )
                    return ModelTurn(text=text, tool_calls=[])

                if isinstance(out, list) and out and isinstance(out[0], dict) and "remainingAmountCents" in out[0]:
                    lines = "\n".join(
                        f"• **{g['goal']['name']}**: ₹{g['goal']['currentSavedCents'] / 100:.2f} saved of ₹{g['goal']['targetAmountCents'] / 100:.2f} (₹{g['remainingAmountCents'] / 100:.2f} remaining across {g['remainingMonths']} mo, required: ₹{g['requiredMonthlySavingsCents'] / 100:.2f}/mo) - Status: {g['status']}"
                        for g in out
                    )
                    return ModelTurn(text=f"Here are your current financial savings goals:\n\n{lines}", tool_calls=[])

                if isinstance(out, dict) and "incomeCents" in out:
                    summaries.append(out)
                elif isinstance(out, list) and out and isinstance(out[0], dict) and "amountCents" in out[0]:
                    category_breakdowns.append(out)
                elif isinstance(out, list) and (not out or isinstance(out[0], dict) and "budget" in out[0]):
                    budget_statuses.append(out)
                elif isinstance(out, dict) and "message" in out:
                    return ModelTurn(text=str(out["message"]), tool_calls=[])

            if summaries:
                summary = summaries[0]
                income = summary["incomeCents"] / 100
                expenses = summary["expenseCents"] / 100
                savings = summary["netSavingsCents"] / 100
                rate = summary.get("savingsRate")

                if category_breakdowns and any(word in prompt for word in ("biggest", "largest", "category", "why")):
                    top = category_breakdowns[0][0]
                    return ModelTurn(
                        text=(
                            f"Your largest recorded spending category this period is **{top['categoryName']}** "
                            f"at ₹{top['amountCents'] / 100:.2f} ({top['percentageOfExpenses']}% of expenses). "
                            "This is a factual category total from your verified transactions."
                        ),
                        tool_calls=[],
                    )

                budget_note = ""
                if budget_statuses:
                    exceeded = [status for status in budget_statuses[0] if status.get("exceeded")]
                    budget_note = (
                        f" {len(exceeded)} budget(s) are currently exceeded."
                        if exceeded
                        else " No current budget overrun was found."
                    )
                rate_note = f" Your savings rate is {rate}%." if rate is not None else " Savings rate is unavailable because no income was recorded."
                return ModelTurn(
                    text=(
                        f"Based on your verified records for {summary.get('period', 'this period')}, "
                        f"income is ₹{income:.2f}, expenses are ₹{expenses:.2f}, and net savings are ₹{savings:.2f}."
                        f"{rate_note}{budget_note}"
                    ),
                    tool_calls=[],
                )

            return ModelTurn(
                text="I checked your verified financial records, but there is not enough matching data yet to answer that specifically.",
                tool_calls=[],
            )

        prompt = messages[-1].content.lower() if messages else ""
        spent_match = re.search(r"(?:spent|spend)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)", prompt)
        if spent_match:
            amount = float(spent_match.group(1))
            yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            category = "Dining" if ("dinner" in prompt or "lunch" in prompt) else "Groceries"
            description = "Dinner" if "dinner" in prompt else "Expense"
            date_str = yesterday if "yesterday" in prompt else today

            return ModelTurn(
                text="",
                tool_calls=[
                    {
                        "callId": str(uuid.uuid4()),
                        "name": "create_my_transaction",
                        "input": {
                            "type": "expense",
                            "amount": amount,
                            "category": category,
                            "description": description,
                            "date": date_str,
                        },
                    }
                ],
            )

        if any(w in prompt for w in ("goal", "save", "reach", "plan", "opportunity")):
            return ModelTurn(
                text="",
                tool_calls=[{"callId": str(uuid.uuid4()), "name": "get_my_goal_action_plan", "input": {}}],
            )

        if "spend" in prompt or "financially" in prompt:
            month = datetime.now(timezone.utc).strftime("%Y-%m")
            return ModelTurn(
                text="",
                tool_calls=[
                    {"callId": str(uuid.uuid4()), "name": "get_my_financial_summary", "input": {"period": month}},
                    {"callId": str(uuid.uuid4()), "name": "get_my_category_spending", "input": {"period": month}},
                    {"callId": str(uuid.uuid4()), "name": "get_my_budget_status", "input": {"month": month}},
                ],
            )

        return ModelTurn(
            text="I can review your transactions, financial summary, categories, trends, budgets, and savings goals using your verified data.",
            tool_calls=[],
        )


def get_assistant_model() -> AssistantModel:
    provider = getattr(settings, "AI_PROVIDER", None)

    if provider == "openai":
        openai_api_key = getattr(settings, "OPENAI_API_KEY", None)
        if not openai_api_key:
            raise RuntimeError(
                "AI_PROVIDER is 'openai' but OPENAI_API_KEY is not set. "
                "Set OPENAI_API_KEY in your environment/.env."
            )
        return OpenAiResponsesModel(openai_api_key, settings.AI_MODEL_NAME)

    if provider == "anthropic":
        anthropic_api_key = getattr(settings, "ANTHROPIC_API_KEY", None)
        if not anthropic_api_key:
            raise RuntimeError(
                "AI_PROVIDER is 'anthropic' but ANTHROPIC_API_KEY is not set. "
                "Set ANTHROPIC_API_KEY in your environment/.env."
            )
        return AnthropicMessagesModel(anthropic_api_key, settings.AI_MODEL_NAME)

    if provider == "local":
        # Explicit opt-in only: a deterministic, keyword-matching stub used
        # for offline dev/tests. Never selected implicitly.
        return LocalAssistantModel()

    raise RuntimeError(
        f"Unknown or unset AI_PROVIDER: {provider!r}. "
        "Set AI_PROVIDER to 'openai', 'anthropic', or 'local' (dev/test only), "
        "along with the matching API key, to enable the assistant."
    )
