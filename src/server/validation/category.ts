import { z } from "zod";
export const categorySchema = z.object({ name: z.string().trim().min(1).max(60), type: z.enum(["income", "expense"]) }).strict();
export type CategoryInput = z.infer<typeof categorySchema>;
export const updateCategorySchema = categorySchema.partial().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
