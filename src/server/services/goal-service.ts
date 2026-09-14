import "server-only";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getDatabasePool } from "@/server/db/pool";
import { PostgresAnalyticsRepository, PostgresBudgetRepository, PostgresCategoryRepository, PostgresGoalRepository } from "@/server/db/postgres-repositories";
import type { GoalRepository } from "@/server/db/repositories";
import { AnalyticsService, getAnalyticsService } from "@/server/services/analytics-service";
import { AppError, ValidationError } from "@/server/errors/app-error";
import type { AuthenticatedUser, Goal, GoalActionPlan, GoalAdjustmentOpportunity, GoalPaceStatus, GoalStatus } from "@/types/domain";
import type { CreateGoalInput, UpdateGoalInput } from "@/server/validation/goal";

type CurrentUser = () => Promise<AuthenticatedUser>;

const rupees = (cents: number) => `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function calculateRemainingMonths(asOfDate: Date, targetDateStr: string): number {
  const currentYear = asOfDate.getUTCFullYear();
  const currentMonth = asOfDate.getUTCMonth() + 1; // 1-12

  const [targetYear, targetMonth] = targetDateStr.split("-").map(Number);
  const monthDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);

  if (monthDiff < 0) return 0;
  return monthDiff + 1;
}

export function computeGoalStatus(goal: Goal, asOfDate: Date = new Date()): GoalStatus {
  const remainingAmountCents = Math.max(0, goal.targetAmountCents - goal.currentSavedCents);
  const percentageCompleted = goal.targetAmountCents === 0
    ? 100
    : Math.min(100, Math.round((goal.currentSavedCents / goal.targetAmountCents) * 10000) / 100);

  const remainingMonths = calculateRemainingMonths(asOfDate, goal.targetDate);

  let requiredMonthlySavingsCents = 0;
  if (remainingAmountCents > 0) {
    if (remainingMonths <= 1) {
      requiredMonthlySavingsCents = remainingAmountCents;
    } else {
      requiredMonthlySavingsCents = Math.ceil(remainingAmountCents / remainingMonths);
    }
  }

  let status: GoalPaceStatus = "on_track";
  if (remainingAmountCents === 0) {
    status = "achieved";
  } else if (remainingMonths === 0) {
    status = "overdue";
  }

  return {
    goal,
    remainingAmountCents,
    percentageCompleted,
    remainingMonths,
    requiredMonthlySavingsCents,
    status,
  };
}

export class GoalService {
  constructor(
    private readonly goals: GoalRepository,
    private readonly analytics: AnalyticsService,
    private readonly currentUser: CurrentUser = requireAuthenticatedUser
  ) {}

  async createForCurrentUser(input: CreateGoalInput): Promise<Goal> {
    const user = await this.currentUser();
    return this.goals.create(user.id, {
      name: input.name,
      targetAmountCents: input.targetAmountCents,
      currentSavedCents: input.currentSavedCents ?? 0,
      targetDate: input.targetDate,
      description: input.description ?? null,
    });
  }

  async listForCurrentUser(): Promise<Goal[]> {
    const user = await this.currentUser();
    return this.goals.listForUser(user.id);
  }

  async listStatusesForCurrentUser(asOfDate: Date = new Date()): Promise<GoalStatus[]> {
    const goals = await this.listForCurrentUser();
    return goals.map((goal) => computeGoalStatus(goal, asOfDate));
  }

  async getGoalForCurrentUser(goalId: string): Promise<Goal> {
    const user = await this.currentUser();
    const goal = await this.goals.findForUser(user.id, goalId);
    if (!goal) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");
    return goal;
  }

  async updateForCurrentUser(goalId: string, input: UpdateGoalInput): Promise<Goal> {
    const user = await this.currentUser();
    const existing = await this.goals.findForUser(user.id, goalId);
    if (!existing) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");

    const updated = await this.goals.updateForUser(user.id, goalId, {
      name: input.name,
      targetAmountCents: input.targetAmountCents,
      currentSavedCents: input.currentSavedCents,
      targetDate: input.targetDate,
      description: input.description,
    });

    if (!updated) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");
    return updated;
  }

  async contributeForCurrentUser(goalId: string, amountCents: number): Promise<Goal> {
    const user = await this.currentUser();
    const existing = await this.goals.findForUser(user.id, goalId);
    if (!existing) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");
    if (amountCents <= 0) throw new ValidationError("Contribution amount must be greater than zero.");

    const newSaved = existing.currentSavedCents + amountCents;
    const updated = await this.goals.updateForUser(user.id, goalId, {
      currentSavedCents: newSaved,
    });

    if (!updated) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");
    return updated;
  }

  async deleteForCurrentUser(goalId: string): Promise<boolean> {
    const user = await this.currentUser();
    const deleted = await this.goals.deleteForUser(user.id, goalId);
    if (!deleted) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");
    return true;
  }

  /**
   * Builds a plan only for the current server-authenticated user. Callers never
   * provide a tenant identity, so a goal ID cannot be used to cross accounts.
   */
  async getActionPlanForCurrentUser(goalId: string, asOfDate: Date = new Date()): Promise<GoalActionPlan> {
    const user = await this.currentUser();
    const goal = await this.goals.findForUser(user.id, goalId);
    if (!goal) throw new AppError("NOT_FOUND", 404, "Financial goal not found.");

    const status = computeGoalStatus(goal, asOfDate);
    const currentMonth = `${asOfDate.getUTCFullYear()}-${String(asOfDate.getUTCMonth() + 1).padStart(2, "0")}`;

    const [summary, categoryBreakdown] = await Promise.all([
      this.analytics.getFinancialSummary(user, currentMonth),
      this.analytics.getCategoryBreakdown(user, currentMonth),
    ]);

    const currentMonthlyNetSavingsCents = summary.netSavingsCents;
    const requiredMonthlySavingsCents = status.requiredMonthlySavingsCents;

    let paceStatus: GoalPaceStatus = status.status;
    let onTrack = false;
    let savingsGapCents = 0;

    if (status.remainingAmountCents === 0) {
      paceStatus = "achieved";
      onTrack = true;
    } else if (status.remainingMonths === 0) {
      paceStatus = "overdue";
      onTrack = false;
      savingsGapCents = status.remainingAmountCents;
    } else {
      onTrack = currentMonthlyNetSavingsCents >= requiredMonthlySavingsCents;
      savingsGapCents = Math.max(0, requiredMonthlySavingsCents - currentMonthlyNetSavingsCents);
      paceStatus = onTrack ? "on_track" : "behind";
    }

    let summaryText = "";
    if (status.remainingAmountCents === 0) {
      summaryText = `Goal achieved! You have saved ${rupees(goal.currentSavedCents)} of your ${rupees(goal.targetAmountCents)} target.`;
    } else if (status.remainingMonths === 0) {
      summaryText = `This goal is overdue. The target deadline of ${goal.targetDate} has passed with ${rupees(status.remainingAmountCents)} remaining.`;
    } else if (onTrack) {
      summaryText = `On track! Your current monthly net savings (${rupees(currentMonthlyNetSavingsCents)}) exceed the required monthly savings of ${rupees(requiredMonthlySavingsCents)}.`;
    } else {
      summaryText = `Behind pace. You require ${rupees(requiredMonthlySavingsCents)}/month over the next ${status.remainingMonths} month(s), but your current monthly net savings are ${rupees(currentMonthlyNetSavingsCents)}. Monthly savings gap: ${rupees(savingsGapCents)}.`;
    }

    // Identify top adjustable discretionary spending categories
    const adjustableCategories = categoryBreakdown
      .filter((cat) => cat.amountCents > 0)
      .slice(0, 3)
      .map((cat): GoalAdjustmentOpportunity => {
        const suggestedReductionPercent = 20;
        const potentialMonthlySavingsCents = Math.round(cat.amountCents * (suggestedReductionPercent / 100));
        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          currentMonthlyExpenseCents: cat.amountCents,
          suggestedReductionPercent,
          potentialMonthlySavingsCents,
          explanation: `Current monthly spending in ${cat.categoryName} is ${rupees(cat.amountCents)} (${cat.percentageOfExpenses}% of monthly expenses). An illustrative ${suggestedReductionPercent}% reduction would free up approximately ${rupees(potentialMonthlySavingsCents)}/month toward your goal.`,
        };
      });

    return {
      goal,
      calculatedFacts: {
        targetAmountCents: goal.targetAmountCents,
        currentSavedCents: goal.currentSavedCents,
        remainingAmountCents: status.remainingAmountCents,
        percentageCompleted: status.percentageCompleted,
        remainingMonths: status.remainingMonths,
        requiredMonthlySavingsCents,
        currentMonthlyNetSavingsCents,
        savingsGapCents,
        status: paceStatus,
      },
      feasibilityAnalysis: {
        onTrack,
        summary: summaryText,
      },
      spendingAdjustmentOpportunities: adjustableCategories,
      disclaimer: "Action plan calculations and category adjustment suggestions are illustrative financial models based on actual user transactions. They do not represent guaranteed outcomes or mathematically optimal investment advice.",
    };
  }
}

let goalService: GoalService | undefined;

export function getGoalService(): GoalService {
  if (!goalService) {
    const pool = getDatabasePool();
    const categories = new PostgresCategoryRepository(pool);
    const budgets = new PostgresBudgetRepository(pool);
    const analyticsRepo = new PostgresAnalyticsRepository(pool);
    const analyticsService = new AnalyticsService(analyticsRepo, budgets, categories);
    const goalRepo = new PostgresGoalRepository(pool);
    goalService = new GoalService(goalRepo, analyticsService);
  }
  return goalService;
}
