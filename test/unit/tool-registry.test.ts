import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "@/server/ai/tool-registry";
import { ForbiddenError } from "@/server/errors/app-error";
describe("ToolRegistry", () => {
  it("rejects model-supplied tenant IDs", async () => {
    const registry = new ToolRegistry();
    registry.register({ name: "safe", description: "safe", schema: z.object({}).strict(), jsonSchema: { type: "object" }, execute: async () => "ok" });
    await expect(registry.execute("safe", { userId: "attacker" }, { user: { id: "verified", email: "verified@test.dev" } })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
