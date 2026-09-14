import "server-only";
import type { AuthenticatedUser } from "@/types/domain";
import type { ToolRegistry } from "@/server/ai/tool-registry";
/** Server-side bridge between authenticated endpoints and allow-listed application tools. */
export class AuthenticatedToolOrchestrator {
  constructor(private readonly registry: ToolRegistry) {}
  execute(tool: string, input: Record<string, unknown>, user: AuthenticatedUser) { return this.registry.execute(tool, input, { user }); }
  metadata() { return this.registry.metadata(); }
}
