import "server-only";
import { Pool } from "pg";
import type { AuthenticatedUser } from "@/types/domain";

export interface AuthRecord extends AuthenticatedUser { passwordHash: string; }
export interface SessionRecord { user: AuthenticatedUser; tokenHash: string; expiresAt: Date; revokedAt: Date | null; }
interface SessionRow { id: string; email: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null; }
export interface AuthStore { findUserByEmail(email: string): Promise<AuthRecord | null>; createUser(email: string, passwordHash: string): Promise<AuthenticatedUser>; createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>; findSession(tokenHash: string): Promise<SessionRecord | null>; revokeSession(tokenHash: string): Promise<void>; }
export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}
  async findUserByEmail(email: string) { const result = await this.pool.query<AuthRecord>("SELECT id, email, password_hash AS \"passwordHash\" FROM users WHERE email = $1", [email]); return result.rows[0] ?? null; }
  async createUser(email: string, passwordHash: string) { const result = await this.pool.query<AuthenticatedUser>("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, passwordHash]); return result.rows[0]; }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) { await this.pool.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [userId, tokenHash, expiresAt]); }
  async findSession(tokenHash: string) { const result = await this.pool.query<SessionRow>("SELECT u.id, u.email, s.token_hash AS \"tokenHash\", s.expires_at AS \"expiresAt\", s.revoked_at AS \"revokedAt\" FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1", [tokenHash]); const row = result.rows[0]; return row ? { user: { id: row.id, email: row.email }, tokenHash: row.tokenHash, expiresAt: row.expiresAt, revokedAt: row.revokedAt } : null; }
  async revokeSession(tokenHash: string) { await this.pool.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash]); }
}
