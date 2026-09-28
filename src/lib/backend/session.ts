import "server-only";
import { cookies } from "next/headers";
import type { AuthenticatedUser } from "@/types/domain";

/** Thin frontend integration: FastAPI remains the canonical session validator. */
export async function getBackendAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const backend = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000/api/v1";
  const cookie = cookies().toString();
  try {
    const response = await fetch(`${backend}/auth/me`, { headers: cookie ? { cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json() as { data?: { user?: AuthenticatedUser } };
    return body.data?.user ?? null;
  } catch {
    return null;
  }
}
