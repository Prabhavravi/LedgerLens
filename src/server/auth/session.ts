import "server-only";
import { cookies } from "next/headers";
import { UnauthorizedError } from "@/server/errors/app-error";
import type { AuthenticatedUser } from "@/types/domain";
import { getAuthService, SESSION_COOKIE_NAME } from "@/server/auth/service";
/** The sole server-side identity boundary. Never accepts a browser-provided user ID. */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> { const token = cookies().get(SESSION_COOKIE_NAME)?.value; return token ? getAuthService().getUserForToken(token) : null; }
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> { const user = await getAuthenticatedUser(); if (!user) throw new UnauthorizedError(); return user; }
