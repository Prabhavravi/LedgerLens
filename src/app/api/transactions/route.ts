import { NextResponse } from "next/server";
import { getTransactionService } from "@/server/services/transaction-service";
import { createTransactionSchema, transactionFiltersSchema } from "@/server/validation/transaction";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
function failure(error: unknown) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); }
export async function GET(request: Request) { try { const url = new URL(request.url); const filters = transactionFiltersSchema.safeParse(Object.fromEntries(url.searchParams)); if (!filters.success) throw new ValidationError("Invalid transaction filters."); const items = await getTransactionService().listForCurrentUser(filters.data); return NextResponse.json({ ok: true, data: items }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const body = createTransactionSchema.safeParse(await request.json()); if (!body.success) throw new ValidationError("Invalid transaction."); const item = await getTransactionService().createForCurrentUser(body.data); return NextResponse.json({ ok: true, data: item }, { status: 201 }); } catch (error) { return failure(error); } }
