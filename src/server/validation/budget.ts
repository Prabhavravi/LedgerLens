import { z } from "zod";
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.");
export const createBudgetSchema = z.object({ categoryId: z.string().uuid(), month, amountCents: z.number().int().positive().max(100_000_000) }).strict();
export const updateBudgetSchema = z.object({ amountCents: z.number().int().positive().max(100_000_000) }).strict();
export const budgetMonthSchema = z.object({ month: month.default(() => new Date().toISOString().slice(0, 7)) });
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
