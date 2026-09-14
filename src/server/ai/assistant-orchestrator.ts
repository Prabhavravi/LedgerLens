import "server-only";
import type { AuthenticatedUser } from "@/types/domain";
import { FINANCIAL_ASSISTANT_SYSTEM_PROMPT } from "@/server/ai/prompts/financial-assistant";
import type { AssistantMessage, AssistantModel } from "@/server/ai/assistant-provider";
import { getAssistantModel } from "@/server/ai/assistant-provider";
import type { ToolRegistry } from "@/server/ai/tool-registry";
import { financialToolRegistry } from "@/server/ai/tools/financial-tools";

const WRITE_TOOLS = new Set(["create_my_transaction", "update_my_transaction", "create_or_update_my_budget", "create_my_financial_goal", "update_my_financial_goal"]);
const FINANCIAL_LANGUAGE = /\b(spend|spent|spending|income|expense|budget|transaction|saving|savings|goal|category|financial|trend|money)\b|₹/i;

export type AssistantReply = {
  message: string;
  activities: Array<{ tool: string; label: string; status: "completed" | "awaiting_confirmation" | "failed" }>;
  pendingActions: Array<{ tool: string; input: Record<string, unknown>; title: string }>;
};

const toolLabel = (tool: string) => ({
  get_my_transactions: "Checking your transactions…",
  get_my_financial_summary: "Calculating your financial summary…",
  get_my_category_spending: "Checking category spending…",
  get_my_spending_trends: "Checking your spending trends…",
  get_my_budget_status: "Checking your budgets…",
  create_my_transaction: "Preparing a transaction…",
  update_my_transaction: "Preparing a transaction update…",
  create_or_update_my_budget: "Preparing a budget update…",
  get_my_financial_goals: "Checking your financial goals…",
  get_my_goal_action_plan: "Calculating your monthly action plan…",
  create_my_financial_goal: "Preparing a savings goal…",
  update_my_financial_goal: "Preparing a goal update…",
}[tool] ?? "Checking your financial data…");

function needsVerifiedFinancialData(history: AssistantMessage[]) {
  return FINANCIAL_LANGUAGE.test(history.at(-1)?.content ?? "");
}

export class FinancialAssistantOrchestrator {
  constructor(private readonly model: AssistantModel, private readonly tools: ToolRegistry) {}

  async respond(user: AuthenticatedUser, history: AssistantMessage[]): Promise<AssistantReply> {
    let turn = await this.model.respond({ instructions: FINANCIAL_ASSISTANT_SYSTEM_PROMPT, messages: history, tools: this.tools.metadata() });
    const activities: AssistantReply["activities"] = [];
    const pendingActions: AssistantReply["pendingActions"] = [];
    let hasVerifiedToolResult = false;

    for (let iteration = 0; iteration < 5; iteration += 1) {
      if (!turn.toolCalls.length) {
        if (needsVerifiedFinancialData(history) && !hasVerifiedToolResult) {
          return { message: "I need to check your verified financial records before answering that. Please try again.", activities, pendingActions };
        }
        return { message: turn.text || "I could not produce a grounded response.", activities, pendingActions };
      }

      const outputs: Array<{ callId: string; output: unknown }> = [];
      for (const call of turn.toolCalls) {
        if (WRITE_TOOLS.has(call.name)) {
          activities.push({ tool: call.name, label: toolLabel(call.name), status: "awaiting_confirmation" });
          pendingActions.push({ tool: call.name, input: call.input, title: call.name === "create_my_transaction" ? "Add transaction" : call.name === "update_my_transaction" ? "Update transaction" : call.name === "create_or_update_my_budget" ? "Create or update budget" : call.name === "create_my_financial_goal" ? "Create financial goal" : "Update financial goal" });
          continue;
        }
        try {
          const output = await this.tools.execute(call.name, call.input, { user });
          activities.push({ tool: call.name, label: toolLabel(call.name), status: "completed" });
          hasVerifiedToolResult = true;
          outputs.push({ callId: call.callId, output });
        } catch {
          activities.push({ tool: call.name, label: toolLabel(call.name), status: "failed" });
          outputs.push({ callId: call.callId, output: { error: "The requested financial operation could not be completed." } });
        }
      }
      if (pendingActions.length) return { message: "I can make the proposed change after you confirm it.", activities, pendingActions };
      turn = await this.model.respond({ instructions: FINANCIAL_ASSISTANT_SYSTEM_PROMPT, messages: history, tools: this.tools.metadata(), toolOutputs: outputs, previousResponseId: turn.responseId });
    }
    return { message: "I reached the tool-call safety limit. Please narrow your request.", activities, pendingActions };
  }
}

let assistant: FinancialAssistantOrchestrator | undefined;
export function getFinancialAssistant() {
  if (!assistant) assistant = new FinancialAssistantOrchestrator(getAssistantModel(), financialToolRegistry);
  return assistant;
}
