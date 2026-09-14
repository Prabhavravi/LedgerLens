import { NextResponse } from "next/server";
import { z } from "zod";
import { getBudgetService } from "@/server/services/budget-service";
import { updateBudgetSchema } from "@/server/validation/budget";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
const idSchema = z.string().uuid();
function failure(error: unknown) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); }
export async function PATCH(request: Request, { params }: { params: { id: string } }) { try { const id = idSchema.safeParse(params.id); const body = updateBudgetSchema.safeParse(await request.json()); if (!id.success || !body.success) throw new ValidationError("Invalid budget update."); return NextResponse.json({ ok: true, data: await getBudgetService().updateForCurrentUser(id.data, body.data) }); } catch (error) { return failure(error); } }
export async function DELETE(_: Request, { params }: { params: { id: string } }) { try { const id = idSchema.safeParse(params.id); if (!id.success) throw new ValidationError("Invalid budget identifier."); await getBudgetService().deleteForCurrentUser(id.data); return new NextResponse(null, { status: 204 }); } catch (error) { return failure(error); } }
