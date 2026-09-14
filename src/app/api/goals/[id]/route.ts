import { NextResponse } from "next/server";
import { z } from "zod";
import { getGoalService } from "@/server/services/goal-service";
import { contributeGoalSchema, updateGoalSchema } from "@/server/validation/goal";
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
    const goal = await getGoalService().getGoalForCurrentUser(id.data);
    return NextResponse.json({ ok: true, data: goal });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const id = idSchema.safeParse(params.id);
    if (!id.success) throw new ValidationError("Invalid goal identifier.");
    const rawBody = await request.json();
    const service = getGoalService();

    // Check if this is a quick contribution
    if ("amountCents" in rawBody && Object.keys(rawBody).length === 1) {
      const contribution = contributeGoalSchema.safeParse(rawBody);
      if (!contribution.success) {
        throw new ValidationError(contribution.error.errors[0]?.message ?? "Invalid contribution amount.");
      }
      const updated = await service.contributeForCurrentUser(id.data, contribution.data.amountCents);
      return NextResponse.json({ ok: true, data: updated });
    }

    const update = updateGoalSchema.safeParse(rawBody);
    if (!update.success) {
      throw new ValidationError(update.error.errors[0]?.message ?? "Invalid goal update.");
    }
    const updated = await service.updateForCurrentUser(id.data, update.data);
    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const id = idSchema.safeParse(params.id);
    if (!id.success) throw new ValidationError("Invalid goal identifier.");
    await getGoalService().deleteForCurrentUser(id.data);
    return NextResponse.json({ ok: true, data: { message: "Goal deleted successfully." } });
  } catch (error) {
    return failure(error);
  }
}
