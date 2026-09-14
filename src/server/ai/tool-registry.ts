import "server-only";
import type { AppTool, ToolContext } from "@/types/ai";
import { AppError, ForbiddenError, ValidationError } from "@/server/errors/app-error";

export class ToolRegistry {
  private readonly tools = new Map<string, AppTool<unknown, unknown>>();
  register<TInput, TOutput>(tool: AppTool<TInput, TOutput>) { if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`); this.tools.set(tool.name, tool as unknown as AppTool<unknown, unknown>); }
  metadata() { return [...this.tools.values()].map(({ name, description, jsonSchema }) => ({ name, description, parameters: jsonSchema })); }
  async execute(name: string, rawInput: Record<string, unknown>, context: ToolContext) {
    if (containsIdentityKey(rawInput)) throw new ForbiddenError("AI tools cannot receive a user identifier.");
    const tool = this.tools.get(name); if (!tool) throw new ValidationError("Unknown AI tool.");
    const parsed = tool.schema.safeParse(rawInput); if (!parsed.success) throw new ValidationError("Invalid AI tool input.");
    const startedAt = Date.now(); const audit = { timestamp: new Date().toISOString(), userId: context.user.id, tool: name, actionType: name.startsWith("create_") || name.startsWith("update_") ? "write" : "read", inputKeys: Object.keys(rawInput) }; try { const output = await tool.execute(parsed.data, context); console.info("ai_tool_execution", { ...audit, outcome: "success", durationMs: Date.now() - startedAt }); return output; } catch (error) { const safe = error instanceof AppError ? error.code : "INTERNAL_ERROR"; console.warn("ai_tool_execution", { ...audit, outcome: "failure", code: safe, durationMs: Date.now() - startedAt }); throw error; }
  }
}
function containsIdentityKey(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsIdentityKey); if (!value || typeof value !== "object") return false; return Object.entries(value as Record<string, unknown>).some(([key, nested]) => key === "userId" || key === "user_id" || containsIdentityKey(nested)); }
