import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getFinancialAssistant } from "@/server/ai/assistant-orchestrator";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
const requestSchema = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20) }).strict();
export async function POST(request: Request) { try { const body = requestSchema.safeParse(await request.json()); if (!body.success) throw new ValidationError("Invalid assistant message."); const user = await requireAuthenticatedUser(); const reply = await getFinancialAssistant().respond(user, body.data.messages); return NextResponse.json({ ok: true, data: reply }); } catch (error) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); } }
