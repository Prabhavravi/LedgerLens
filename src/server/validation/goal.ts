import { z } from "zod";

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Goal name is required.").max(100, "Goal name must be 100 characters or fewer."),
  targetAmountCents: z.number().int().positive("Target amount must be greater than zero.").max(1_000_000_000),
  currentSavedCents: z.number().int().min(0, "Current saved amount cannot be negative.").max(1_000_000_000).default(0),
  targetDate: z.string().date("Target date must be formatted as YYYY-MM-DD."),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer.").optional().nullable(),
}).strict();

export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  targetAmountCents: z.number().int().positive().max(1_000_000_000).optional(),
  currentSavedCents: z.number().int().min(0).max(1_000_000_000).optional(),
  targetDate: z.string().date("Target date must be formatted as YYYY-MM-DD.").optional(),
  description: z.string().trim().max(500).optional().nullable(),
}).strict().refine((value) => (
  value.name !== undefined ||
  value.targetAmountCents !== undefined ||
  value.currentSavedCents !== undefined ||
  value.targetDate !== undefined ||
  value.description !== undefined
), "At least one field must be provided for update.");

export const contributeGoalSchema = z.object({
  amountCents: z.number().int().positive("Contribution amount must be greater than zero.").max(1_000_000_000),
}).strict();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;
