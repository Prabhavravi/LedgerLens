import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth/http";
import { getAuthService, SESSION_COOKIE_NAME } from "@/server/auth/service";
import { toApiFailure } from "@/server/errors/app-error";
export async function POST(request: Request) { try { const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1); if (token) await getAuthService().logout(token); const response = NextResponse.json({ ok: true, data: null }); clearSessionCookie(response); return response; } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: 500 }); } }
