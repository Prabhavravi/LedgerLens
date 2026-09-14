import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/service";
import { loginSchema } from "@/server/auth/schemas";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
export async function POST(request: Request) { try { const input = loginSchema.safeParse(await request.json()); if (!input.success) throw new ValidationError("Invalid login information."); const result = await getAuthService().login(input.data); const response = NextResponse.json({ ok: true, data: { user: result.user } }); setSessionCookie(response, result.token); return response; } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); } }
