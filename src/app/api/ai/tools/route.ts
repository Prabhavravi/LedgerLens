import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { financialToolRegistry } from "@/server/ai/tools/financial-tools";
import { AuthenticatedToolOrchestrator } from "@/server/ai/tool-orchestrator";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
const requestSchema = z.object({ tool: z.string().min(1), input: z.record(z.unknown()) }).strict();
const orchestrator = new AuthenticatedToolOrchestrator(financialToolRegistry);
const readOnlyTools = new Set(["get_my_transactions", "get_my_financial_summary", "get_my_category_spending", "get_my_spending_trends", "get_my_budget_status", "get_my_financial_goals", "get_my_goal_action_plan"]);
export async function POST(request: Request) { try { const body = requestSchema.safeParse(await request.json()); if (!body.success) throw new ValidationError("Invalid tool request."); if (!readOnlyTools.has(body.data.tool)) throw new ValidationError("Write tools require the confirmed assistant action flow."); const user = await requireAuthenticatedUser(); const data = await orchestrator.execute(body.data.tool, body.data.input, user); return NextResponse.json({ ok: true, data }); } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); } }
export async function GET() { await requireAuthenticatedUser(); return NextResponse.json({ ok: true, data: orchestrator.metadata() }); }
