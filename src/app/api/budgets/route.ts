import { NextResponse } from "next/server";
import { getBudgetService } from "@/server/services/budget-service";
import { budgetMonthSchema, createBudgetSchema } from "@/server/validation/budget";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
function failure(error: unknown) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); }
export async function GET(request: Request) { try { const month = budgetMonthSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!month.success) throw new ValidationError("Invalid budget period."); return NextResponse.json({ ok: true, data: await getBudgetService().listStatusesForCurrentUser(month.data.month) }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const body = createBudgetSchema.safeParse(await request.json()); if (!body.success) throw new ValidationError("Invalid budget."); return NextResponse.json({ ok: true, data: await getBudgetService().createForCurrentUser(body.data) }, { status: 201 }); } catch (error) { return failure(error); } }
