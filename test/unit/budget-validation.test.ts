import { describe, expect, it } from "vitest";
import { createBudgetSchema, updateBudgetSchema } from "@/server/validation/budget";
const valid = { categoryId: "11111111-1111-4111-8111-111111111111", month: "2026-09", amountCents: 1 };
describe("budget validation", () => { it("requires a positive amount, UUID category, and valid period", () => { expect(createBudgetSchema.safeParse({ ...valid, amountCents: 0 }).success).toBe(false); expect(createBudgetSchema.safeParse({ ...valid, categoryId: "not-a-uuid" }).success).toBe(false); expect(createBudgetSchema.safeParse({ ...valid, month: "2026-13" }).success).toBe(false); expect(updateBudgetSchema.safeParse({ amountCents: -1 }).success).toBe(false); }); });
