import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTransactionSchema, updateTransactionSchema, transactionFiltersSchema } from "@/server/validation/transaction";
import { createBudgetSchema, updateBudgetSchema, budgetMonthSchema } from "@/server/validation/budget";
import { createGoalSchema, updateGoalSchema, contributeGoalSchema } from "@/server/validation/goal";
import { financialToolRegistry } from "@/server/ai/tools/financial-tools";
import type { AuthenticatedUser } from "@/types/domain";
import { ValidationError } from "@/server/errors/app-error";

const sampleUuid = "11111111-1111-4111-8111-111111111111";
const authenticatedUser: AuthenticatedUser = {
  id: sampleUuid,
  email: "test@example.com",
};

describe("AUDIT 4 — Input Validation & Boundary Hardening", () => {
  describe("Amount Boundary & Sign Validations", () => {
    it("rejects negative, zero, non-integer, and giant amounts in transactions", () => {
      // Negative
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: -100,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "2026-09-11",
        }).success
      ).toBe(false);

      // Zero
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 0,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "2026-09-11",
        }).success
      ).toBe(false);

      // Float (non-integer cents)
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 10.5,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "2026-09-11",
        }).success
      ).toBe(false);

      // Giant value (> 100,000,000 cents)
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 100_000_001,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "2026-09-11",
        }).success
      ).toBe(false);
    });

    it("rejects negative, zero, and giant amounts in budgets", () => {
      expect(createBudgetSchema.safeParse({ categoryId: sampleUuid, month: "2026-09", amountCents: -500 }).success).toBe(false);
      expect(createBudgetSchema.safeParse({ categoryId: sampleUuid, month: "2026-09", amountCents: 0 }).success).toBe(false);
      expect(createBudgetSchema.safeParse({ categoryId: sampleUuid, month: "2026-09", amountCents: 100_000_001 }).success).toBe(false);

      expect(updateBudgetSchema.safeParse({ amountCents: -1 }).success).toBe(false);
      expect(updateBudgetSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    });

    it("rejects negative, zero, and giant amounts in financial goals", () => {
      // Target amount must be positive
      expect(createGoalSchema.safeParse({ name: "Goal", targetAmountCents: 0, targetDate: "2026-12-31" }).success).toBe(false);
      expect(createGoalSchema.safeParse({ name: "Goal", targetAmountCents: -1000, targetDate: "2026-12-31" }).success).toBe(false);
      expect(createGoalSchema.safeParse({ name: "Goal", targetAmountCents: 1_000_000_001, targetDate: "2026-12-31" }).success).toBe(false);

      // Current saved amount cannot be negative
      expect(createGoalSchema.safeParse({ name: "Goal", targetAmountCents: 1000, currentSavedCents: -1, targetDate: "2026-12-31" }).success).toBe(false);

      // Contribution must be positive
      expect(contributeGoalSchema.safeParse({ amountCents: 0 }).success).toBe(false);
      expect(contributeGoalSchema.safeParse({ amountCents: -500 }).success).toBe(false);
    });
  });

  describe("Date Format & Calendar Validity", () => {
    it("rejects non-calendar and malformed dates in transactions", () => {
      // Non-existent calendar day
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 1000,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "2026-02-31",
        }).success
      ).toBe(false);

      // Malformed date strings
      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 1000,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "09/11/2026",
        }).success
      ).toBe(false);

      expect(
        createTransactionSchema.safeParse({
          type: "expense",
          amountCents: 1000,
          categoryId: sampleUuid,
          description: "Test",
          occurredOn: "yesterday",
        }).success
      ).toBe(false);
    });

    it("rejects non-calendar and malformed dates in financial goals", () => {
      // Non-existent calendar day (Feb 31)
      expect(
        createGoalSchema.safeParse({
          name: "Goal",
          targetAmountCents: 1000,
          targetDate: "2026-02-31",
        }).success
      ).toBe(false);

      // Malformed format
      expect(
        createGoalSchema.safeParse({
          name: "Goal",
          targetAmountCents: 1000,
          targetDate: "31-12-2026",
        }).success
      ).toBe(false);
    });

    it("enforces start date before or equal to end date in transaction filters", () => {
      expect(
        transactionFiltersSchema.safeParse({
          startDate: "2026-09-15",
          endDate: "2026-09-01",
        }).success
      ).toBe(false);

      expect(
        transactionFiltersSchema.safeParse({
          startDate: "2026-09-01",
          endDate: "2026-09-15",
        }).success
      ).toBe(true);
    });

    it("enforces YYYY-MM month format in budgets", () => {
      expect(budgetMonthSchema.safeParse({ month: "2026-13" }).success).toBe(false);
      expect(budgetMonthSchema.safeParse({ month: "2026/09" }).success).toBe(false);
      expect(budgetMonthSchema.safeParse({ month: "September 2026" }).success).toBe(false);
      expect(budgetMonthSchema.safeParse({ month: "2026-09" }).success).toBe(true);
    });
  });

  describe("UUID & Identifier Validation", () => {
    const idSchema = z.string().uuid();

    it("rejects non-UUID strings and SQL injection attempts", () => {
      expect(idSchema.safeParse("123").success).toBe(false);
      expect(idSchema.safeParse("not-a-uuid").success).toBe(false);
      expect(idSchema.safeParse("'; DROP TABLE users; --").success).toBe(false);
      expect(idSchema.safeParse("admin' OR '1'='1").success).toBe(false);
      expect(idSchema.safeParse(sampleUuid).success).toBe(true);
    });
  });

  describe("AI Tool Argument Validation", () => {
    it("rejects malformed inputs in AI tools", async () => {
      // create_my_transaction without category
      await expect(
        financialToolRegistry.execute(
          "create_my_transaction",
          { type: "expense", amount: 100, description: "Dinner", date: "2026-09-11" },
          { user: authenticatedUser }
        )
      ).rejects.toThrow(ValidationError);

      // create_my_transaction with negative amount
      await expect(
        financialToolRegistry.execute(
          "create_my_transaction",
          { type: "expense", amount: -50, category: "Dining", description: "Dinner", date: "2026-09-11" },
          { user: authenticatedUser }
        )
      ).rejects.toThrow(ValidationError);

      // create_my_financial_goal with invalid targetDate
      await expect(
        financialToolRegistry.execute(
          "create_my_financial_goal",
          { name: "Laptop", targetAmount: 50000, targetDate: "invalid-date" },
          { user: authenticatedUser }
        )
      ).rejects.toThrow(ValidationError);
    });
  });
});
