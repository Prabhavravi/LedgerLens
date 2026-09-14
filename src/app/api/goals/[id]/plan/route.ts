import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getGoalService } from "@/server/services/goal-service";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";

const idSchema = z.string().uuid();

function failure(error: unknown) {
  const body = toApiFailure(error);
  return NextResponse.json(body, {
    status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500,
  });
}

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const id = idSchema.safeParse(params.id);
    if (!id.success) throw new ValidationError("Invalid goal identifier.");
    await requireAuthenticatedUser();
    const plan = await getGoalService().getActionPlanForCurrentUser(id.data);
    return NextResponse.json({ ok: true, data: plan });
  } catch (error) {
    return failure(error);
  }
}
