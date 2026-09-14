import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getInsightService } from "@/server/services/insight-service";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export async function GET(request: Request) { try { const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7); if (!monthPattern.test(month)) throw new ValidationError("Invalid insight period."); return NextResponse.json({ ok: true, data: await getInsightService().getInsightsForCurrentUser(month) }); } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); } }
