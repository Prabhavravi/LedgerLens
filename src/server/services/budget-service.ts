import "server-only";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getDatabasePool } from "@/server/db/pool";
import { PostgresBudgetRepository, PostgresCategoryRepository } from "@/server/db/postgres-repositories";
import type { BudgetRepository, CategoryRepository } from "@/server/db/repositories";
import { AppError, ValidationError } from "@/server/errors/app-error";
import type { AuthenticatedUser, BudgetStatus } from "@/types/domain";
import type { CreateBudgetInput, UpdateBudgetInput } from "@/server/validation/budget";

type CurrentUser = () => Promise<AuthenticatedUser>;
export class BudgetService {
  constructor(private readonly budgets: BudgetRepository, private readonly categories: CategoryRepository, private readonly currentUser: CurrentUser = requireAuthenticatedUser) {}
  async createForCurrentUser(input: CreateBudgetInput) { const user = await this.currentUser(); await this.assertBudgetCategory(user.id, input.categoryId); if (await this.budgets.findByCategoryPeriod(user.id, input.categoryId, input.month)) throw new ValidationError("A budget already exists for this category and period."); return this.budgets.createForUser(user.id, input); }
  async updateForCurrentUser(budgetId: string, input: UpdateBudgetInput) { const user = await this.currentUser(); const updated = await this.budgets.updateForUser(user.id, budgetId, input); if (!updated) throw new AppError("NOT_FOUND", 404, "Budget not found."); return updated; }
  async createOrUpdateForCurrentUser(input: CreateBudgetInput) { const user = await this.currentUser(); await this.assertBudgetCategory(user.id, input.categoryId); const existing = await this.budgets.findByCategoryPeriod(user.id, input.categoryId, input.month); return existing ? this.updateForCurrentUser(existing.id, { amountCents: input.amountCents }) : this.budgets.createForUser(user.id, input); }
  async deleteForCurrentUser(budgetId: string) { const user = await this.currentUser(); if (!(await this.budgets.deleteForUser(user.id, budgetId))) throw new AppError("NOT_FOUND", 404, "Budget not found."); }
  async listStatusesForCurrentUser(month: string) { return this.listStatusesForUser(await this.currentUser(), month); }
  async listStatusesForUser(user: AuthenticatedUser, month: string) { const budgets = await this.budgets.listForUserMonth(user.id, month); return Promise.all(budgets.map((budget) => this.getBudgetStatus(user, budget.categoryId, month, budget))); }
  /** Reusable server-only contract for dashboards and future AI tools. The user must be server-authenticated. */
  async getBudgetStatus(user: AuthenticatedUser, categoryId: string, month: string, knownBudget?: { id: string; userId: string; categoryId: string; month: string; amountCents: number }): Promise<BudgetStatus> { const budget = knownBudget ?? await this.budgets.findByCategoryPeriod(user.id, categoryId, month); if (!budget) throw new AppError("NOT_FOUND", 404, "Budget not found."); const category = await this.assertBudgetCategory(user.id, categoryId); const spentCents = await this.budgets.spentForUserCategoryMonth(user.id, categoryId, month); const remainingCents = budget.amountCents - spentCents; const percentageUsed = Math.round((spentCents / budget.amountCents) * 10000) / 100; return { budget, category, spentCents, remainingCents, percentageUsed, exceeded: spentCents > budget.amountCents }; }
  private async assertBudgetCategory(userId: string, categoryId: string) { const category = await this.categories.findAvailableToUser(userId, categoryId); if (!category || category.type !== "expense") throw new ValidationError("Select an available expense category."); return category; }
}
let budgetService: BudgetService | undefined;
export function getBudgetService() { if (!budgetService) { const pool = getDatabasePool(); budgetService = new BudgetService(new PostgresBudgetRepository(pool), new PostgresCategoryRepository(pool)); } return budgetService; }
