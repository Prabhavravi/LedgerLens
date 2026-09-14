import "server-only";
import type { LlmProvider, ToolContext } from "@/types/ai";
import type { ToolRegistry } from "@/server/ai/tool-registry";
export class AiOrchestrator {
  constructor(private readonly provider: LlmProvider, private readonly tools: ToolRegistry) {}
  async reply(message: string, context: ToolContext) {
    // Future provider adapters may request only ToolRegistry.metadata(); execution always remains here.
    return this.provider.complete({ system: "Use verified application tools for financial claims. Never invent financial data. The server injects the authenticated identity; never request a user ID.", message, tools: this.tools.metadata() });
  }
}
