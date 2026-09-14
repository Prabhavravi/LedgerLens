import { NextResponse } from "next/server";
import { getGoalService } from "@/server/services/goal-service";
import { createGoalSchema } from "@/server/validation/goal";
import { toApiFailure, ValidationError } from "@/server/errors/app-error";

function failure(error: unknown) {
  const body = toApiFailure(error);
  return NextResponse.json(body, {
    status: error instanceof Error && "status" in error ? (error as { status: number }).status : 500,
  });
}

export async function GET() {
  try {
    const goals = await getGoalService().listStatusesForCurrentUser();
    return NextResponse.json({ ok: true, data: goals });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createGoalSchema.safeParse(await request.json());
    if (!body.success) {
      throw new ValidationError(body.error.errors[0]?.message ?? "Invalid goal payload.");
    }
    const goal = await getGoalService().createForCurrentUser(body.data);
    return NextResponse.json({ ok: true, data: goal }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
