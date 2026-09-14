import "server-only";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getDatabasePool } from "@/server/db/pool";
import { PostgresAnalyticsRepository, PostgresBudgetRepository, PostgresCategoryRepository } from "@/server/db/postgres-repositories";
import type { AnalyticsRepository, BudgetRepository, CategoryRepository } from "@/server/db/repositories";
import type { AuthenticatedUser, CategorySpending, FinancialAnalytics } from "@/types/domain";
import { BudgetService } from "@/server/services/budget-service";
type CurrentUser = () => Promise<AuthenticatedUser>;
function previousMonth(month: string) { const [year, current] = month.split("-").map(Number); const date = new Date(Date.UTC(year, current - 2, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function daysInMonth(month: string) { const [year, current] = month.split("-").map(Number); return new Date(Date.UTC(year, current, 0)).getUTCDate(); }
export class AnalyticsService {
  private readonly budgets: BudgetService;
  constructor(private readonly analytics: AnalyticsRepository, budgetRepository: BudgetRepository, categoryRepository: CategoryRepository, private readonly currentUser: CurrentUser = requireAuthenticatedUser) { this.budgets = new BudgetService(budgetRepository, categoryRepository, currentUser); }
  async getFinancialSummary(user: AuthenticatedUser, period: string) { const totals = await this.analytics.totalsForUserPeriod(user.id, period); return { period, incomeCents: totals.incomeCents, expenseCents: totals.expenseCents, netSavingsCents: totals.incomeCents - totals.expenseCents, savingsRate: totals.incomeCents === 0 ? null : Math.round(((totals.incomeCents - totals.expenseCents) / totals.incomeCents) * 10000) / 100, averageDailyExpenseCents: Math.round(totals.expenseCents / daysInMonth(period)) }; }
  async getCategoryBreakdown(user: AuthenticatedUser, period: string): Promise<CategorySpending[]> { const [rows, totals] = await Promise.all([this.analytics.categorySpendingForUserPeriod(user.id, period), this.analytics.totalsForUserPeriod(user.id, period)]); return rows.map((row) => ({ ...row, percentageOfExpenses: totals.expenseCents === 0 ? 0 : Math.round((row.amountCents / totals.expenseCents) * 10000) / 100 })); }
  async getSpendingTrends(user: AuthenticatedUser, period: string) { const [expenseCents, previousExpenseCents] = await Promise.all([this.analytics.expenseTotalForUserPeriod(user.id, period), this.analytics.expenseTotalForUserPeriod(user.id, previousMonth(period))]); const changeCents = expenseCents - previousExpenseCents; return { month: period, expenseCents, previousExpenseCents, changeCents, changePercent: previousExpenseCents === 0 ? null : Math.round((changeCents / previousExpenseCents) * 10000) / 100 }; }
  async getBudgetOverview(user: AuthenticatedUser, period: string) { return this.budgets.listStatusesForUser(user, period); }
  async getDashboardForCurrentUser(period: string): Promise<FinancialAnalytics> { const user = await this.currentUser(); const [summary, categoryBreakdown, spendingTrend, largestTransactions, budgetOverview] = await Promise.all([this.getFinancialSummary(user, period), this.getCategoryBreakdown(user, period), this.getSpendingTrends(user, period), this.analytics.largestExpensesForUserPeriod(user.id, period, 5), this.getBudgetOverview(user, period)]); return { summary, categoryBreakdown, spendingTrend, largestTransactions, budgetOverview }; }
}
let analyticsService: AnalyticsService | undefined;
export function getAnalyticsService() { if (!analyticsService) { const pool = getDatabasePool(); analyticsService = new AnalyticsService(new PostgresAnalyticsRepository(pool), new PostgresBudgetRepository(pool), new PostgresCategoryRepository(pool)); } return analyticsService; }
