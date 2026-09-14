export type TransactionType = "income" | "expense";
export interface AuthenticatedUser { id: string; email: string; }
export interface Category { id: string; userId: string | null; name: string; type: TransactionType; }
export interface Transaction { id: string; userId: string; categoryId: string; type: TransactionType; amountCents: number; description: string; occurredOn: string; }
export interface Budget { id: string; userId: string; categoryId: string; month: string; amountCents: number; }
export interface BudgetStatus { budget: Budget; category: Category; spentCents: number; remainingCents: number; percentageUsed: number; exceeded: boolean; }
export interface FinancialSummary { month: string; incomeCents: number; expenseCents: number; netCents: number; }
export interface TransactionListFilters { type?: TransactionType; categoryId?: string; query?: string; startDate?: string; endDate?: string; sort?: "newest" | "oldest" | "amount_desc" | "amount_asc"; }
export interface CategorySpending { categoryId: string; categoryName: string; amountCents: number; percentageOfExpenses: number; }
export interface SpendingTrend { month: string; expenseCents: number; previousExpenseCents: number; changeCents: number; changePercent: number | null; }
export interface AnalyticsSummary { period: string; incomeCents: number; expenseCents: number; netSavingsCents: number; savingsRate: number | null; averageDailyExpenseCents: number; }
export interface FinancialAnalytics { summary: AnalyticsSummary; categoryBreakdown: CategorySpending[]; spendingTrend: SpendingTrend; largestTransactions: Transaction[]; budgetOverview: BudgetStatus[]; }
export type InsightType = "category_surge" | "budget_overrun" | "budget_approaching" | "month_over_month_change" | "savings_opportunity";
export type InsightSeverity = "info" | "warning" | "critical";
export interface FinancialInsight { id: string; type: InsightType; category: string | null; currentValueCents: number; previousValueCents: number | null; percentageChange: number | null; severity: InsightSeverity; explanation: string; recommendation: string; supportingFigures: Array<{ label: string; value: string }>; }
export interface Goal { id: string; userId: string; name: string; targetAmountCents: number; currentSavedCents: number; targetDate: string; description: string | null; createdAt?: string; }
export type GoalPaceStatus = "achieved" | "on_track" | "behind" | "overdue";
export interface GoalStatus { goal: Goal; remainingAmountCents: number; percentageCompleted: number; remainingMonths: number; requiredMonthlySavingsCents: number; status: GoalPaceStatus; }
export interface GoalAdjustmentOpportunity { categoryId: string; categoryName: string; currentMonthlyExpenseCents: number; suggestedReductionPercent: number; potentialMonthlySavingsCents: number; explanation: string; }
export interface GoalActionPlan { goal: Goal; calculatedFacts: { targetAmountCents: number; currentSavedCents: number; remainingAmountCents: number; percentageCompleted: number; remainingMonths: number; requiredMonthlySavingsCents: number; currentMonthlyNetSavingsCents: number; savingsGapCents: number; status: GoalPaceStatus; }; feasibilityAnalysis: { onTrack: boolean; summary: string; }; spendingAdjustmentOpportunities: GoalAdjustmentOpportunity[]; disclaimer: string; }

