import { describe, expect, it } from "vitest";
import { createFinancialToolRegistry } from "@/server/ai/tools/financial-tools";
import { AppError } from "@/server/errors/app-error";

const userA = { id: "user-a", email: "a@test.dev" };

function registryWithGoals(userId = "user-a") {
  const calls: Array<{ method: string; userId: string; input?: unknown }> = [];

  const mockGoal = {
    id: "goal-1",
    userId,
    name: "Save ₹1,00,000",
    targetAmountCents: 10_000_000,
    currentSavedCents: 4_200_000,
    targetDate: "2026-12-31",
    description: "Laptop fund",
  };

  const services = {
    transactions: {
      listForCurrentUser: async () => [],
      createForCurrentUser: async () => ({ id: "t-1" }),
      updateForCurrentUser: async () => ({ id: "t-1" }),
    },
    budgets: {
      listStatusesForUser: async () => [],
      createOrUpdateForCurrentUser: async () => ({ id: "b-1" }),
    },
    analytics: {
      getFinancialSummary: async () => ({ incomeCents: 5_000_000, expenseCents: 3_500_000, netSavingsCents: 1_500_000 }),
      getCategoryBreakdown: async () => [],
      getSpendingTrends: async () => ({ month: "2026-09", expenseCents: 0, previousExpenseCents: 0, changeCents: 0, changePercent: null }),
    },
    categories: {
      resolveForCurrentUser: async () => ({ id: "cat-1", name: "Dining", type: "expense" }),
    },
    goals: {
      listStatusesForCurrentUser: async () => {
        calls.push({ method: "listGoals", userId });
        return [{
          goal: mockGoal,
          remainingAmountCents: 5_800_000,
          percentageCompleted: 42,
          remainingMonths: 4,
          requiredMonthlySavingsCents: 1_450_000,
          status: "on_track",
        }];
      },
      listForCurrentUser: async () => [mockGoal],
      createForCurrentUser: async (input: unknown) => {
        calls.push({ method: "createGoal", userId, input });
        return { id: "goal-created", ...input as object };
      },
      updateForCurrentUser: async (id: string, input: unknown) => {
        if (id === "99999999-9999-4999-8999-999999999999") throw new AppError("NOT_FOUND", 404, "Goal not found.");
        calls.push({ method: "updateGoal", userId, input });
        return { id, ...input as object };
      },
      contributeForCurrentUser: async (id: string, amountCents: number) => {
        calls.push({ method: "contributeGoal", userId, input: { id, amountCents } });
        return { id, currentSavedCents: 5_000_000 };
      },
      getActionPlanForCurrentUser: async (goalId: string) => {
        calls.push({ method: "getActionPlan", userId, input: { goalId } });
        return {
          goal: mockGoal,
          calculatedFacts: {
            targetAmountCents: 10_000_000,
            currentSavedCents: 4_200_000,
            remainingAmountCents: 5_800_000,
            percentageCompleted: 42,
            remainingMonths: 4,
            requiredMonthlySavingsCents: 1_450_000,
            currentMonthlyNetSavingsCents: 1_500_000,
            savingsGapCents: 0,
            status: "on_track",
          },
          feasibilityAnalysis: { onTrack: true, summary: "On track." },
          spendingAdjustmentOpportunities: [
            { categoryId: "cat-1", categoryName: "Dining", currentMonthlyExpenseCents: 1_200_000, suggestedReductionPercent: 20, potentialMonthlySavingsCents: 240_000, explanation: "Save 20% on dining." }
          ],
          disclaimer: "Illustrative figures.",
        };
      },
    },
  };

  return { registry: createFinancialToolRegistry(() => services as never), calls };
}

describe("Goal AI Tools Registry & Security Boundary", () => {
  it("registers all 12 tools including 4 goal tools with valid JSON schemas", () => {
    const { registry } = registryWithGoals();
    const names = registry.metadata().map((tool) => tool.name);

    expect(names).toContain("get_my_financial_goals");
    expect(names).toContain("get_my_goal_action_plan");
    expect(names).toContain("create_my_financial_goal");
    expect(names).toContain("update_my_financial_goal");
    expect(registry.metadata().every((tool) => tool.parameters.type === "object")).toBe(true);
  });

  it("strictly rejects model-supplied userId / user_id to prevent prompt injection", async () => {
    const { registry } = registryWithGoals();

    await expect(
      registry.execute("get_my_financial_goals", { userId: "attacker-user-id" }, { user: userA })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      registry.execute("get_my_goal_action_plan", { user_id: "attacker-user-id" }, { user: userA })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      registry.execute("create_my_financial_goal", { name: "Hack", targetAmount: 1000, targetDate: "2026-12-31", user_id: "attacker" }, { user: userA })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("executes get_my_financial_goals and get_my_goal_action_plan with authenticated user context", async () => {
    const { registry, calls } = registryWithGoals();

    const goals = await registry.execute("get_my_financial_goals", {}, { user: userA });
    expect(goals).toBeDefined();
    expect(calls).toContainEqual({ method: "listGoals", userId: "user-a" });

    const plan = await registry.execute("get_my_goal_action_plan", {}, { user: userA });
    expect(plan).toBeDefined();
    expect(calls).toContainEqual({ method: "getActionPlan", userId: "user-a", input: { goalId: "goal-1" } });
  });

  it("converts decimal currency amounts to integer cents when creating a goal", async () => {
    const { registry, calls } = registryWithGoals();

    await registry.execute("create_my_financial_goal", {
      name: "Emergency Fund",
      targetAmount: 50000, // ₹50,000
      currentSaved: 10000, // ₹10,000
      targetDate: "2026-12-31",
      description: "Safety cushion",
    }, { user: userA });

    const createCall = calls.find((c) => c.method === "createGoal");
    expect(createCall).toBeDefined();
    expect(createCall?.input).toMatchObject({
      name: "Emergency Fund",
      targetAmountCents: 5_000_000, // 50,000 * 100
      currentSavedCents: 1_000_000, // 10,000 * 100
      targetDate: "2026-12-31",
    });
  });
});
