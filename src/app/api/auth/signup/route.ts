import { NextResponse } from "next/server";
import { getAuthService } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/http";
import { signUpSchema } from "@/server/auth/schemas";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
export async function POST(request: Request) { try { const input = signUpSchema.safeParse(await request.json()); if (!input.success) throw new ValidationError("Invalid sign-up information."); const result = await getAuthService().signUp(input.data); const response = NextResponse.json({ ok: true, data: { user: result.user } }, { status: 201 }); setSessionCookie(response, result.token); return response; } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); } }
