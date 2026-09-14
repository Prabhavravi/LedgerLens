import { describe, expect, it } from "vitest";
import { toApiFailure, UnauthorizedError, AppError } from "@/server/errors/app-error";
import { AuthService, hashSessionToken } from "@/server/auth/service";
import type { AuthStore, SessionRecord } from "@/server/auth/store";
import type { AuthenticatedUser } from "@/types/domain";
import { OpenAiResponsesModel } from "@/server/ai/assistant-provider";

describe("AUDIT 5 — Resilience & Error Handling", () => {
  describe("Database Outage & Sensitive Error Masking", () => {
    it("masks raw database error messages and stack traces from the client", () => {
      const dbError = new Error("connect ECONNREFUSED 127.0.0.1:5432 at TCPConnectWrap.afterConnect");
      const failure = toApiFailure(dbError);

      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("INTERNAL_ERROR");
      expect(failure.error.message).toBe("An unexpected error occurred.");
      // Crucial: ensure no database connection strings, hostnames, or credentials leak
      expect(JSON.stringify(failure)).not.toContain("ECONNREFUSED");
      expect(JSON.stringify(failure)).not.toContain("5432");
    });

    it("preserves safe AppError codes and user-facing messages", () => {
      const appError = new AppError("RESOURCE_LOCKED", 409, "This resource is temporarily locked.");
      const failure = toApiFailure(appError);

      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("RESOURCE_LOCKED");
      expect(failure.error.message).toBe("This resource is temporarily locked.");
    });
  });

  describe("Expired & Revoked Session Handling", () => {
    it("rejects and auto-revokes expired session tokens", async () => {
      const testUser: AuthenticatedUser = { id: "user-1", email: "user@example.com" };
      let revokedToken: string | null = null;

      const mockStore: AuthStore = {
        findUserByEmail: async () => null,
        createUser: async () => testUser,
        createSession: async () => {},
        findSession: async (tokenHash: string): Promise<SessionRecord | null> => {
          return {
            user: testUser,
            tokenHash,
            expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
            revokedAt: null,
          };
        },
        revokeSession: async (tokenHash: string) => {
          revokedToken = tokenHash;
        },
      };

      const authService = new AuthService(mockStore);
      const user = await authService.getUserForToken("expired-token");

      expect(user).toBeNull();
      // The expired session should be marked revoked in the store
      expect(revokedToken).toBe(hashSessionToken("expired-token"));
    });

    it("rejects explicitly revoked session tokens", async () => {
      const testUser: AuthenticatedUser = { id: "user-1", email: "user@example.com" };

      const mockStore: AuthStore = {
        findUserByEmail: async () => null,
        createUser: async () => testUser,
        createSession: async () => {},
        findSession: async (tokenHash: string): Promise<SessionRecord | null> => {
          return {
            user: testUser,
            tokenHash,
            expiresAt: new Date(Date.now() + 100000),
            revokedAt: new Date(), // Already revoked
          };
        },
        revokeSession: async () => {},
      };

      const authService = new AuthService(mockStore);
      const user = await authService.getUserForToken("revoked-token");

      expect(user).toBeNull();
    });

    it("returns HTTP 401 UNAUTHORIZED for unauthenticated requests", () => {
      const failure = toApiFailure(new UnauthorizedError());
      expect(failure.ok).toBe(false);
      expect(failure.error.code).toBe("UNAUTHORIZED");
      expect(failure.error.message).toBe("Authentication is required.");
    });
  });

  describe("AI Provider Resilience", () => {
    it("safely handles HTTP errors from the external AI provider", async () => {
      // Mock global fetch to return 500 error
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(JSON.stringify({ error: { message: "OpenAI rate limit exceeded" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });

      try {
        const model = new OpenAiResponsesModel("fake-key", "gpt-4o-mini");
        await expect(
          model.respond({ instructions: "test", messages: [{ role: "user", content: "hello" }], tools: [] })
        ).rejects.toThrow("AI provider request failed.");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("safely handles malformed non-JSON tool call arguments from the AI provider", async () => {
      const originalFetch = global.fetch;
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            id: "resp-1",
            output: [
              {
                type: "function_call",
                call_id: "call-1",
                name: "get_my_transactions",
                arguments: "{ malformed json: not valid ...",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const model = new OpenAiResponsesModel("fake-key", "gpt-4o-mini");
        const turn = await model.respond({ instructions: "test", messages: [{ role: "user", content: "hello" }], tools: [] });

        // Must not crash, but rather return empty object input which gets validated safely
        expect(turn.toolCalls).toHaveLength(1);
        expect(turn.toolCalls[0].input).toEqual({});
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("treats an unexpected provider response shape as an empty tool response", async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => new Response(JSON.stringify({ id: "resp-1", output_text: 42, output: { not: "an array" } }), { status: 200 });
      try {
        const model = new OpenAiResponsesModel("fake-key", "gpt-4o-mini");
        const turn = await model.respond({ instructions: "test", messages: [{ role: "user", content: "hello" }], tools: [] });
        expect(turn.text).toBe("");
        expect(turn.toolCalls).toEqual([]);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
