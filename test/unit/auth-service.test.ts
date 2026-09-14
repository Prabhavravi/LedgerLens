import { describe, expect, it } from "vitest";
import { AuthService, hashSessionToken } from "@/server/auth/service";
import type { AuthRecord, AuthStore, SessionRecord } from "@/server/auth/store";

class MemoryAuthStore implements AuthStore {
  users = new Map<string, AuthRecord>(); sessions = new Map<string, SessionRecord>();
  async findUserByEmail(email: string) { return this.users.get(email) ?? null; }
  async createUser(email: string, passwordHash: string) { const user = { id: `user-${this.users.size + 1}`, email, passwordHash }; this.users.set(email, user); return { id: user.id, email: user.email }; }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) { const user = [...this.users.values()].find((candidate) => candidate.id === userId)!; this.sessions.set(tokenHash, { user: { id: user.id, email: user.email }, tokenHash, expiresAt, revokedAt: null }); }
  async findSession(tokenHash: string) { return this.sessions.get(tokenHash) ?? null; }
  async revokeSession(tokenHash: string) { const session = this.sessions.get(tokenHash); if (session) session.revokedAt = new Date(); }
}
describe("AuthService", () => {
  it("signs up, logs in, and resolves the verified session user", async () => { const store = new MemoryAuthStore(); const auth = new AuthService(store); const account = await auth.signUp({ email: "USER@example.com", password: "correct-horse-battery" }); expect(account.user.email).toBe("user@example.com"); expect(await auth.getUserForToken(account.token)).toEqual(account.user); const login = await auth.login({ email: "user@example.com", password: "correct-horse-battery" }); expect(await auth.getUserForToken(login.token)).toEqual(account.user); });
  it("invalidates logout and expired sessions", async () => { const store = new MemoryAuthStore(); const auth = new AuthService(store); const account = await auth.signUp({ email: "user@example.com", password: "correct-horse-battery" }); await auth.logout(account.token); expect(await auth.getUserForToken(account.token)).toBeNull(); const expired = "expired-token"; await store.createSession(account.user.id, hashSessionToken(expired), new Date(Date.now() - 1)); expect(await auth.getUserForToken(expired)).toBeNull(); });
  it("does not authenticate an incorrect password", async () => { const auth = new AuthService(new MemoryAuthStore()); await auth.signUp({ email: "user@example.com", password: "correct-horse-battery" }); await expect(auth.login({ email: "user@example.com", password: "wrong-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" }); });
});
