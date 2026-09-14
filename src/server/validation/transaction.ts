import { z } from "zod";
export const createTransactionSchema = z.object({
  categoryId: z.string().uuid(), type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(100_000_000), description: z.string().trim().min(1).max(255), occurredOn: z.string().date(),
}).strict();
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export const updateTransactionSchema = createTransactionSchema.partial().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
export const transactionFiltersSchema = z.object({ type: z.enum(["income", "expense"]).optional(), categoryId: z.string().uuid().optional(), query: z.string().trim().max(100).optional(), startDate: z.string().date().optional(), endDate: z.string().date().optional(), sort: z.enum(["newest", "oldest", "amount_desc", "amount_asc"]).default("newest") }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, "Start date must be before end date.");
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
