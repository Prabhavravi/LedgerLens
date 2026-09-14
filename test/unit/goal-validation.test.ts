import { describe, expect, it } from "vitest";
import { contributeGoalSchema, createGoalSchema, updateGoalSchema } from "@/server/validation/goal";

describe("Goal Validation Schemas", () => {
  it("validates a valid goal creation payload", () => {
    const input = {
      name: "Save ₹1,00,000",
      targetAmountCents: 10_000_000,
      currentSavedCents: 4_200_000,
      targetDate: "2026-12-31",
      description: "Laptop fund",
    };
    const parsed = createGoalSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive target amounts and negative saved amounts", () => {
    expect(createGoalSchema.safeParse({
      name: "Bad Goal",
      targetAmountCents: 0,
      targetDate: "2026-12-31",
    }).success).toBe(false);

    expect(createGoalSchema.safeParse({
      name: "Negative Target",
      targetAmountCents: -5000,
      targetDate: "2026-12-31",
    }).success).toBe(false);

    expect(createGoalSchema.safeParse({
      name: "Negative Saved",
      targetAmountCents: 10000,
      currentSavedCents: -100,
      targetDate: "2026-12-31",
    }).success).toBe(false);
  });

  it("enforces strict YYYY-MM-DD date format", () => {
    expect(createGoalSchema.safeParse({
      name: "Invalid Date",
      targetAmountCents: 50000,
      targetDate: "2026/12/31",
    }).success).toBe(false);

    expect(createGoalSchema.safeParse({
      name: "Invalid Month",
      targetAmountCents: 50000,
      targetDate: "2026-13-01",
    }).success).toBe(false);

    expect(createGoalSchema.safeParse({
      name: "Valid Date",
      targetAmountCents: 50000,
      targetDate: "2026-12-31",
    }).success).toBe(true);
  });

  it("validates updateGoalSchema and requires at least one field", () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
    expect(updateGoalSchema.safeParse({ name: "Updated Name" }).success).toBe(true);
    expect(updateGoalSchema.safeParse({ currentSavedCents: 50000 }).success).toBe(true);
  });

  it("validates contributeGoalSchema for positive contribution amounts", () => {
    expect(contributeGoalSchema.safeParse({ amountCents: 5000 }).success).toBe(true);
    expect(contributeGoalSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(contributeGoalSchema.safeParse({ amountCents: -1000 }).success).toBe(false);
  });
});
