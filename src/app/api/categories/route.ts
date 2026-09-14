import { NextResponse } from "next/server";
import { getCategoryService } from "@/server/services/category-service";
import { categorySchema } from "@/server/validation/category";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";
function failure(error: unknown) { const body = toApiFailure(error); return NextResponse.json(body, { status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500 }); }
export async function GET() { try { return NextResponse.json({ ok: true, data: await getCategoryService().listForCurrentUser() }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const body = categorySchema.safeParse(await request.json()); if (!body.success) throw new ValidationError("Invalid category."); return NextResponse.json({ ok: true, data: await getCategoryService().createForCurrentUser(body.data) }, { status: 201 }); } catch (error) { return failure(error); } }
