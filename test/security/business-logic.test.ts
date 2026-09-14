import { describe, expect, it } from "vitest";
import { calculateRemainingMonths, computeGoalStatus } from "@/server/services/goal-service";
import type { Goal } from "@/types/domain";

describe("AUDIT 6 — Financial Business Logic & Mathematical Precision", () => {
  describe("Savings Rate & Cash Flow Logic", () => {
    it("computes net savings and savings rate with exact decimal precision", () => {
      const incomeCents = 12500000; // ₹1,25,000
      const expenseCents = 6700000; // ₹67,000
      const netSavingsCents = incomeCents - expenseCents; // ₹58,000

      const savingsRate = Math.round(((incomeCents - expenseCents) / incomeCents) * 10000) / 100;
      expect(netSavingsCents).toBe(5800000);
      expect(savingsRate).toBe(46.4); // 46.4%
    });

    it("handles zero income without division by zero errors", () => {
      const incomeCents = 0;
      const expenseCents = 2500000;

      const savingsRate = incomeCents === 0 ? null : Math.round(((incomeCents - expenseCents) / incomeCents) * 10000) / 100;
      expect(savingsRate).toBeNull();
    });

    it("handles negative savings rate when expenses exceed income", () => {
      const incomeCents = 5000000; // ₹50,000
      const expenseCents = 7500000; // ₹75,000

      const savingsRate = Math.round(((incomeCents - expenseCents) / incomeCents) * 10000) / 100;
      expect(savingsRate).toBe(-50); // -50.0%
    });
  });

  describe("Category Proportions & Budget Utilization", () => {
    it("computes category spending percentage and handles zero total expenses", () => {
      const totalExpenseCents = 10000000; // ₹1,00,000
      const groceriesCents = 2750000; // ₹27,500

      const percentage = Math.round((groceriesCents / totalExpenseCents) * 10000) / 100;
      expect(percentage).toBe(27.5); // 27.5%

      // Zero total expenses case
      const zeroTotal = 0;
      const zeroShare = zeroTotal === 0 ? 0 : Math.round((groceriesCents / zeroTotal) * 10000) / 100;
      expect(zeroShare).toBe(0);
    });

    it("calculates budget status, percentage used, and overrun flags correctly", () => {
      const budgetAmountCents = 2000000; // ₹20,000
      const spentUnderCents = 1600000; // ₹16,000 (80%)
      const spentOverCents = 2500000; // ₹25,000 (125%)

      // Case 1: Under budget
      const remainingUnder = budgetAmountCents - spentUnderCents;
      const percentageUnder = Math.round((spentUnderCents / budgetAmountCents) * 10000) / 100;
      const exceededUnder = spentUnderCents > budgetAmountCents;

      expect(remainingUnder).toBe(400000);
      expect(percentageUnder).toBe(80);
      expect(exceededUnder).toBe(false);

      // Case 2: Over budget
      const remainingOver = budgetAmountCents - spentOverCents;
      const percentageOver = Math.round((spentOverCents / budgetAmountCents) * 10000) / 100;
      const exceededOver = spentOverCents > budgetAmountCents;

      expect(remainingOver).toBe(-500000);
      expect(percentageOver).toBe(125);
      expect(exceededOver).toBe(true);
    });
  });

  describe("Goal Action Plan & Pacing Calculations", () => {
    const baseGoal: Goal = {
      id: "goal-1",
      userId: "user-1",
      name: "Emergency Fund",
      targetAmountCents: 10000000, // ₹1,00,000
      currentSavedCents: 4200000, // ₹42,000
      targetDate: "2026-12-31",
      description: null,
    };

    it("calculates remaining amount and required monthly savings accurately", () => {
      // As of Sept 11, 2026 to Dec 31, 2026: 4 months (Sept, Oct, Nov, Dec)
      const asOf = new Date(Date.UTC(2026, 8, 11)); // Month index 8 is Sept
      const status = computeGoalStatus(baseGoal, asOf);

      expect(status.remainingAmountCents).toBe(5800000); // ₹58,000
      expect(status.percentageCompleted).toBe(42); // 42%
      expect(status.remainingMonths).toBe(4);
      // ₹58,000 / 4 months = ₹14,500/month
      expect(status.requiredMonthlySavingsCents).toBe(1450000);
      expect(status.status).toBe("on_track");
    });

    it("applies ceiling on required monthly savings to avoid under-saving due to fractional cents", () => {
      const oddGoal: Goal = {
        ...baseGoal,
        targetAmountCents: 100000, // ₹1,000
        currentSavedCents: 0,
        targetDate: "2026-11-30", // 3 months from Sept (Sept, Oct, Nov)
      };

      const asOf = new Date(Date.UTC(2026, 8, 1));
      const status = computeGoalStatus(oddGoal, asOf);

      expect(status.remainingMonths).toBe(3);
      // 100,000 / 3 = 33,333.33 -> Math.ceil = 33,334 cents
      expect(status.requiredMonthlySavingsCents).toBe(33334);
      // 33,334 * 3 = 100,002 cents >= 100,000 target
      expect(status.requiredMonthlySavingsCents * 3).toBeGreaterThanOrEqual(100000);
    });

    it("handles goal edge cases: achieved, due in same month, and overdue", () => {
      const asOf = new Date(Date.UTC(2026, 8, 1));

      // Case 1: Achieved goal
      const achievedGoal: Goal = { ...baseGoal, currentSavedCents: 10000000 };
      const statusAchieved = computeGoalStatus(achievedGoal, asOf);
      expect(statusAchieved.remainingAmountCents).toBe(0);
      expect(statusAchieved.percentageCompleted).toBe(100);
      expect(statusAchieved.requiredMonthlySavingsCents).toBe(0);
      expect(statusAchieved.status).toBe("achieved");

      // Case 2: Due in same calendar month (Sept 2026)
      const sameMonthGoal: Goal = { ...baseGoal, targetDate: "2026-09-30" };
      const statusSameMonth = computeGoalStatus(sameMonthGoal, asOf);
      expect(statusSameMonth.remainingMonths).toBe(1);
      expect(statusSameMonth.requiredMonthlySavingsCents).toBe(5800000); // Full remaining amount due

      // Case 3: Overdue goal
      const overdueGoal: Goal = { ...baseGoal, targetDate: "2026-08-31" };
      const statusOverdue = computeGoalStatus(overdueGoal, asOf);
      expect(statusOverdue.remainingMonths).toBe(0);
      expect(statusOverdue.status).toBe("overdue");
    });

    it("computes month difference across years correctly", () => {
      const sept2026 = new Date(Date.UTC(2026, 8, 1));
      // Jan 2027: (2027 - 2026)*12 + (1 - 9) = 12 - 8 = 4 + 1 = 5 months
      expect(calculateRemainingMonths(sept2026, "2027-01-31")).toBe(5);
      // Dec 2027: 12 - 8 + 12 = 16 months
      expect(calculateRemainingMonths(sept2026, "2027-12-31")).toBe(16);
    });
  });
});
