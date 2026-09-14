import "server-only";
import { getServerEnv } from "@/server/env";

export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type ModelTool = { name: string; description: string; parameters: Record<string, unknown> };
export type ModelTurn = { text: string; toolCalls: Array<{ callId: string; name: string; input: Record<string, unknown> }>; responseId?: string };
export interface AssistantModel { respond(input: { instructions: string; messages: AssistantMessage[]; tools: ModelTool[]; toolOutputs?: Array<{ callId: string; output: unknown }>; previousResponseId?: string }): Promise<ModelTurn>; }

const AI_REQUEST_TIMEOUT_MS = 15_000;

function safeParseJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

type ProviderOutput = { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown };

export class OpenAiResponsesModel implements AssistantModel {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async respond(input: { instructions: string; messages: AssistantMessage[]; tools: ModelTool[]; toolOutputs?: Array<{ callId: string; output: unknown }>; previousResponseId?: string }): Promise<ModelTurn> {
    const tools = input.tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters, strict: true }));
    const body = input.toolOutputs
      ? { model: this.model, instructions: input.instructions, previous_response_id: input.previousResponseId, input: input.toolOutputs.map((item) => ({ type: "function_call_output", call_id: item.callId, output: JSON.stringify(item.output) })), tools, store: false }
      : { model: this.model, instructions: input.instructions, input: input.messages.map((message) => ({ role: message.role, content: message.content })), tools, store: false };

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error("AI provider request failed.");
    }
    if (!response.ok) throw new Error("AI provider request failed.");

    let data: { id?: unknown; output_text?: unknown; output?: unknown };
    try {
      data = await response.json() as { id?: unknown; output_text?: unknown; output?: unknown };
    } catch {
      throw new Error("AI provider request failed.");
    }
    const output = Array.isArray(data.output) ? data.output as ProviderOutput[] : [];
    return {
      text: typeof data.output_text === "string" ? data.output_text : "",
      responseId: typeof data.id === "string" ? data.id : undefined,
      toolCalls: output
        .filter((item) => item.type === "function_call")
        .map((item) => ({ callId: typeof item.call_id === "string" ? item.call_id : crypto.randomUUID(), name: typeof item.name === "string" ? item.name : "", input: safeParseJson(typeof item.arguments === "string" ? item.arguments : undefined) })),
    };
  }
}

export class LocalAssistantModel implements AssistantModel {
  async respond(input: { messages: AssistantMessage[]; toolOutputs?: Array<{ callId: string; output: unknown }> }): Promise<ModelTurn> {
    if (input.toolOutputs) {
      const plan = input.toolOutputs.map((item) => item.output).find((item) => typeof item === "object" && item !== null && "calculatedFacts" in item) as { goal: { name: string }; calculatedFacts: { targetAmountCents: number; currentSavedCents: number; remainingAmountCents: number; percentageCompleted: number; remainingMonths: number; requiredMonthlySavingsCents: number; currentMonthlyNetSavingsCents: number; status: string }; spendingAdjustmentOpportunities: Array<{ categoryName: string; currentMonthlyExpenseCents: number; potentialMonthlySavingsCents: number }> } | undefined;
      if (plan) {
        const f = plan.calculatedFacts;
        const opportunities = plan.spendingAdjustmentOpportunities.length > 0 ? plan.spendingAdjustmentOpportunities.map((item) => `• ${item.categoryName}: Current spending ₹${item.currentMonthlyExpenseCents / 100}. An illustrative 20% adjustment frees ~₹${item.potentialMonthlySavingsCents / 100}/month.`).join("\n") : "No categories with expenses were returned.";
        return { text: `### Action Plan: ${plan.goal.name}\n\n**Calculated facts:**\n- Target: ₹${f.targetAmountCents / 100}\n- Saved: ₹${f.currentSavedCents / 100} (${f.percentageCompleted}% complete)\n- Remaining: ₹${f.remainingAmountCents / 100}\n- Period: ${f.remainingMonths} month(s)\n- Required average monthly saving: ₹${f.requiredMonthlySavingsCents / 100}\n- Current monthly net savings: ₹${f.currentMonthlyNetSavingsCents / 100}\n\n**Illustrative suggestions, not guarantees:**\n${opportunities}`, toolCalls: [] };
      }
      const goals = input.toolOutputs.map((item) => item.output).find((item) => Array.isArray(item) && item.length > 0 && "remainingAmountCents" in item[0]) as Array<{ goal: { name: string; targetAmountCents: number; currentSavedCents: number }; remainingAmountCents: number; remainingMonths: number; requiredMonthlySavingsCents: number; status: string }> | undefined;
      if (goals) return { text: `Here are your current goals:\n\n${goals.map((goal) => `• **${goal.goal.name}**: ₹${goal.goal.currentSavedCents / 100} saved of ₹${goal.goal.targetAmountCents / 100}; ₹${goal.remainingAmountCents / 100} remaining across ${goal.remainingMonths} month(s), requiring ₹${goal.requiredMonthlySavingsCents / 100}/month.`).join("\n")}`, toolCalls: [] };
      const summary = input.toolOutputs.map((item) => item.output).find((item) => typeof item === "object" && item !== null && "incomeCents" in item) as { incomeCents: number; expenseCents: number; netSavingsCents: number } | undefined;
      return { text: summary ? `Based on verified records, income is ₹${summary.incomeCents / 100}, expenses are ₹${summary.expenseCents / 100}, and net savings are ₹${summary.netSavingsCents / 100}.` : "I checked your verified financial records. Configure an AI provider for more detailed explanations.", toolCalls: [] };
    }
    const prompt = input.messages.at(-1)?.content.toLowerCase() ?? "";
    const spent = prompt.match(/(?:spent|spend)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/);
    if (spent) { const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); return { text: "", toolCalls: [{ callId: crypto.randomUUID(), name: "create_my_transaction", input: { type: "expense", amount: Number(spent[1]), category: prompt.includes("dinner") || prompt.includes("lunch") ? "Dining" : "Groceries", description: prompt.includes("dinner") ? "Dinner" : "Expense", date: prompt.includes("yesterday") ? yesterday : new Date().toISOString().slice(0, 10) } }] }; }
    if (prompt.includes("goal") || prompt.includes("save") || prompt.includes("reach") || prompt.includes("plan") || prompt.includes("opportunity")) return { text: "", toolCalls: [{ callId: crypto.randomUUID(), name: "get_my_goal_action_plan", input: {} }] };
    if (prompt.includes("spend") || prompt.includes("financially")) return { text: "", toolCalls: [{ callId: crypto.randomUUID(), name: "get_my_financial_summary", input: { period: new Date().toISOString().slice(0, 7) } }, { callId: crypto.randomUUID(), name: "get_my_category_spending", input: { period: new Date().toISOString().slice(0, 7) } }, { callId: crypto.randomUUID(), name: "get_my_budget_status", input: { month: new Date().toISOString().slice(0, 7) } }] };
    return { text: "I can review your transactions, financial summary, categories, trends, budgets, and savings goals using verified data.", toolCalls: [] };
  }
}

export function getAssistantModel(): AssistantModel {
  const env = getServerEnv();
  return env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY ? new OpenAiResponsesModel(env.OPENAI_API_KEY, env.AI_MODEL_NAME) : new LocalAssistantModel();
}
