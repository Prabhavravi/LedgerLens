import "server-only";
import { createHash, randomBytes } from "crypto";
import { getDatabasePool } from "@/server/db/pool";
import { UnauthorizedError, ValidationError } from "@/server/errors/app-error";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { loginSchema, signUpSchema, type LoginInput, type SignUpInput } from "@/server/auth/schemas";
import { PostgresAuthStore, type AuthStore } from "@/server/auth/store";
import type { AuthenticatedUser } from "@/types/domain";

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE_NAME = "ledgerlens_session";
export function hashSessionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export class AuthService {
  constructor(private readonly store: AuthStore) {}
  async signUp(input: SignUpInput) { const parsed = signUpSchema.parse(input); const existing = await this.store.findUserByEmail(parsed.email); if (existing) throw new ValidationError("Unable to create account with these credentials."); const user = await this.store.createUser(parsed.email, await hashPassword(parsed.password)); return { user, token: await this.issueSession(user.id) }; }
  async login(input: LoginInput) { const parsed = loginSchema.parse(input); const record = await this.store.findUserByEmail(parsed.email); if (!record || !(await verifyPassword(parsed.password, record.passwordHash))) throw new UnauthorizedError(); return { user: { id: record.id, email: record.email }, token: await this.issueSession(record.id) }; }
  async getUserForToken(token: string): Promise<AuthenticatedUser | null> { const session = await this.store.findSession(hashSessionToken(token)); if (!session || session.revokedAt || session.expiresAt <= new Date()) { if (session && !session.revokedAt) await this.store.revokeSession(session.tokenHash); return null; } return session.user; }
  async logout(token: string) { await this.store.revokeSession(hashSessionToken(token)); }
  private async issueSession(userId: string) { const token = randomBytes(32).toString("base64url"); await this.store.createSession(userId, hashSessionToken(token), new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)); return token; }
}
let service: AuthService | undefined;
export function getAuthService() { if (!service) service = new AuthService(new PostgresAuthStore(getDatabasePool())); return service; }
