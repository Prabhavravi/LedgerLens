import "server-only";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/server/auth/service";
export function setSessionCookie(response: NextResponse, token: string) { response.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DURATION_SECONDS }); }
export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 }); }
