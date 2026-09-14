import { describe, expect, it } from "vitest";
import { calculateRemainingMonths, computeGoalStatus, GoalService } from "@/server/services/goal-service";
import { AppError } from "@/server/errors/app-error";
import type { GoalRepository } from "@/server/db/repositories";
import type { AnalyticsService } from "@/server/services/analytics-service";
import type { AuthenticatedUser, Goal } from "@/types/domain";

const userA: AuthenticatedUser = { id: "user-a", email: "a@test.dev" };
const userB: AuthenticatedUser = { id: "user-b", email: "b@test.dev" };

function createMockGoalRepo(initialGoals: Goal[] = []): GoalRepository {
  const store = new Map<string, Goal>(initialGoals.map((g) => [g.id, g]));
  return {
    async create(userId: string, input: Omit<Goal, "id" | "userId" | "createdAt">): Promise<Goal> {
      const goal: Goal = {
        id: `goal-${store.size + 1}`,
        userId,
        ...input,
        createdAt: new Date().toISOString(),
      };
      store.set(goal.id, goal);
      return goal;
    },
    async listForUser(userId: string): Promise<Goal[]> {
      return [...store.values()].filter((g) => g.userId === userId);
    },
    async findForUser(userId: string, goalId: string): Promise<Goal | null> {
      const g = store.get(goalId);
      return g && g.userId === userId ? g : null;
    },
    async updateForUser(userId: string, goalId: string, input: Partial<Omit<Goal, "id" | "userId" | "createdAt">>): Promise<Goal | null> {
      const g = store.get(goalId);
      if (!g || g.userId !== userId) return null;
      const updated: Goal = { ...g, ...input };
      store.set(goalId, updated);
      return updated;
    },
    async deleteForUser(userId: string, goalId: string): Promise<boolean> {
      const g = store.get(goalId);
      if (!g || g.userId !== userId) return false;
      return store.delete(goalId);
    },
  };
}

function createMockAnalyticsService(): AnalyticsService {
  return {
    async getFinancialSummary(_user: AuthenticatedUser, _period: string) {
      return {
        period: "2026-09",
        incomeCents: 5_000_000, // ₹50,000
        expenseCents: 3_500_000, // ₹35,000
        netSavingsCents: 1_500_000, // ₹15,000
        savingsRate: 30,
        averageDailyExpenseCents: 116_667,
      };
    },
    async getCategoryBreakdown(_user: AuthenticatedUser, _period: string) {
      return [
        { categoryId: "cat-dining", categoryName: "Dining", amountCents: 1_200_000, percentageOfExpenses: 34.29 },
        { categoryId: "cat-ent", categoryName: "Entertainment", amountCents: 800_000, percentageOfExpenses: 22.86 },
        { categoryId: "cat-groc", categoryName: "Groceries", amountCents: 1_500_000, percentageOfExpenses: 42.86 },
      ];
    },
  } as unknown as AnalyticsService;
}

describe("GoalService & Mathematical Calculations", () => {
  const asOf = new Date("2026-09-15T00:00:00Z");

  describe("Deterministic Math Formulas", () => {
    it("calculates remaining months precisely (September to December = 4 months)", () => {
      // Current: Sept 2026 (month 9). Target: Dec 2026 (month 12).
      // (12 - 9) + 1 = 4 months.
      expect(calculateRemainingMonths(asOf, "2026-12-31")).toBe(4);
    });

    it("handles target date in the same month (remaining months = 1)", () => {
      expect(calculateRemainingMonths(asOf, "2026-09-30")).toBe(1);
    });

    it("handles target date in the past (remaining months = 0, overdue)", () => {
      expect(calculateRemainingMonths(asOf, "2026-08-31")).toBe(0);
    });

    it("computes exact user example: ₹1,00,000 target, ₹42,000 saved, 4 months -> ₹14,500/mo", () => {
      const sampleGoal: Goal = {
        id: "goal-laptop",
        userId: "user-a",
        name: "Buy a laptop",
        targetAmountCents: 10_000_000, // ₹1,00,000
        currentSavedCents: 4_200_000,  // ₹42,000
        targetDate: "2026-12-31",
        description: "MacBook M3",
      };

      const status = computeGoalStatus(sampleGoal, asOf);

      // Remaining amount: 100,000 - 42,000 = 58,000
      expect(status.remainingAmountCents).toBe(5_800_000);
      expect(status.percentageCompleted).toBe(42);
      expect(status.remainingMonths).toBe(4);
      // Required monthly saving: 58,000 / 4 = 14,500
      expect(status.requiredMonthlySavingsCents).toBe(1_450_000);
      expect(status.status).toBe("on_track");
    });

    it("handles achieved goals with zero remaining and zero required monthly savings", () => {
      const achievedGoal: Goal = {
        id: "goal-achieved",
        userId: "user-a",
        name: "Emergency Fund",
        targetAmountCents: 5_000_000,
        currentSavedCents: 5_000_000,
        targetDate: "2026-12-31",
        description: null,
      };
      const status = computeGoalStatus(achievedGoal, asOf);
      expect(status.remainingAmountCents).toBe(0);
      expect(status.percentageCompleted).toBe(100);
      expect(status.requiredMonthlySavingsCents).toBe(0);
      expect(status.status).toBe("achieved");
    });
  });

  describe("Goal CRUD & Multitenancy", () => {
    it("creates, retrieves, updates, and deletes goals for current user", async () => {
      const repo = createMockGoalRepo();
      const analytics = createMockAnalyticsService();
      const service = new GoalService(repo, analytics, async () => userA);

      const created = await service.createForCurrentUser({
        name: "Save ₹1,00,000",
        targetAmountCents: 10_000_000,
        currentSavedCents: 4_200_000,
        targetDate: "2026-12-31",
        description: "Year-end target",
      });

      expect(created.id).toBe("goal-1");
      expect(created.userId).toBe("user-a");

      const list = await service.listStatusesForCurrentUser(asOf);
      expect(list).toHaveLength(1);
      expect(list[0].remainingAmountCents).toBe(5_800_000);

      // Contribute funds
      const contributed = await service.contributeForCurrentUser(created.id, 800_000); // +₹8,000
      expect(contributed.currentSavedCents).toBe(5_000_000);

      // Update goal
      const updated = await service.updateForCurrentUser(created.id, { name: "Save ₹1 Lakh (Updated)" });
      expect(updated.name).toBe("Save ₹1 Lakh (Updated)");

      // Delete
      await service.deleteForCurrentUser(created.id);
      const afterDelete = await service.listForCurrentUser();
      expect(afterDelete).toHaveLength(0);
    });

    it("enforces tenant isolation and prevents cross-user access", async () => {
      const repo = createMockGoalRepo([
        {
          id: "goal-user-b",
          userId: "user-b",
          name: "User B Private Goal",
          targetAmountCents: 5_000_000,
          currentSavedCents: 1_000_000,
          targetDate: "2026-12-31",
          description: "Private",
        },
      ]);
      const analytics = createMockAnalyticsService();
      // User A tries to access User B's goal
      const serviceUserA = new GoalService(repo, analytics, async () => userA);

      await expect(serviceUserA.getGoalForCurrentUser("goal-user-b")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(serviceUserA.updateForCurrentUser("goal-user-b", { name: "Hacked" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(serviceUserA.deleteForCurrentUser("goal-user-b")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(serviceUserA.getActionPlanForCurrentUser("goal-user-b", asOf)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Monthly Action Plan & Cash Flow Feasibility", () => {
    it("generates deterministic action plan with facts vs AI suggestions", async () => {
      const repo = createMockGoalRepo([
        {
          id: "goal-target",
          userId: "user-a",
          name: "Laptop Goal",
          targetAmountCents: 10_000_000,
          currentSavedCents: 4_200_000,
          targetDate: "2026-12-31",
          description: "MacBook",
        },
      ]);
      const analytics = createMockAnalyticsService();
      const service = new GoalService(repo, analytics, async () => userA);

      const plan = await service.getActionPlanForCurrentUser("goal-target", asOf);

      // Verified calculated facts
      expect(plan.calculatedFacts.remainingAmountCents).toBe(5_800_000);
      expect(plan.calculatedFacts.remainingMonths).toBe(4);
      expect(plan.calculatedFacts.requiredMonthlySavingsCents).toBe(1_450_000); // ₹14,500
      expect(plan.calculatedFacts.currentMonthlyNetSavingsCents).toBe(1_500_000); // ₹15,000 from analytics
      expect(plan.calculatedFacts.status).toBe("on_track");
      expect(plan.feasibilityAnalysis.onTrack).toBe(true);

      // Spending adjustment opportunities grounded in real categories
      expect(plan.spendingAdjustmentOpportunities.length).toBeGreaterThan(0);
      const topCat = plan.spendingAdjustmentOpportunities[0];
      expect(topCat.categoryName).toBe("Dining");
      expect(topCat.suggestedReductionPercent).toBe(20);
      // 20% of ₹12,000 = ₹2,400 (240,000 cents)
      expect(topCat.potentialMonthlySavingsCents).toBe(240_000);

      // Disclaimer explicitly separates facts from suggestions
      expect(plan.disclaimer).toContain("illustrative");
    });
  });
});
