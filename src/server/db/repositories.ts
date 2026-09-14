import "server-only";
import type { Budget, Category, FinancialSummary, Goal, Transaction, TransactionListFilters } from "@/types/domain";

/** Every tenant operation takes a server-derived userId; implementations also set DB/RLS context. */
export interface TransactionRepository {
  create(userId: string, input: Omit<Transaction, "id" | "userId">): Promise<Transaction>;
  listForUser(userId: string, filters: TransactionListFilters, limit: number): Promise<Transaction[]>;
  findForUser(userId: string, transactionId: string): Promise<Transaction | null>;
  updateForUser(userId: string, transactionId: string, input: Partial<Omit<Transaction, "id" | "userId">>): Promise<Transaction | null>;
  deleteForUser(userId: string, transactionId: string): Promise<boolean>;
  summaryForUser(userId: string, month: string): Promise<FinancialSummary>;
}
export interface CategoryRepository { listAvailableToUser(userId: string): Promise<Category[]>; findAvailableToUser(userId: string, categoryId: string): Promise<Category | null>; createForUser(userId: string, input: Omit<Category, "id" | "userId">): Promise<Category>; updatePrivateForUser(userId: string, categoryId: string, input: Partial<Pick<Category, "name" | "type">>): Promise<Category | null>; deletePrivateForUser(userId: string, categoryId: string): Promise<boolean>; }
export interface BudgetRepository { createForUser(userId: string, input: Omit<Budget, "id" | "userId">): Promise<Budget>; listForUserMonth(userId: string, month: string): Promise<Budget[]>; findForUser(userId: string, budgetId: string): Promise<Budget | null>; findByCategoryPeriod(userId: string, categoryId: string, month: string): Promise<Budget | null>; updateForUser(userId: string, budgetId: string, input: Pick<Budget, "amountCents">): Promise<Budget | null>; deleteForUser(userId: string, budgetId: string): Promise<boolean>; spentForUserCategoryMonth(userId: string, categoryId: string, month: string): Promise<number>; }
export interface AnalyticsRepository { totalsForUserPeriod(userId: string, month: string): Promise<{ incomeCents: number; expenseCents: number }>; categorySpendingForUserPeriod(userId: string, month: string): Promise<Array<{ categoryId: string; categoryName: string; amountCents: number }>>; largestExpensesForUserPeriod(userId: string, month: string, limit: number): Promise<Transaction[]>; expenseTotalForUserPeriod(userId: string, month: string): Promise<number>; }
export interface GoalRepository { create(userId: string, input: Omit<Goal, "id" | "userId" | "createdAt">): Promise<Goal>; listForUser(userId: string): Promise<Goal[]>; findForUser(userId: string, goalId: string): Promise<Goal | null>; updateForUser(userId: string, goalId: string, input: Partial<Omit<Goal, "id" | "userId" | "createdAt">>): Promise<Goal | null>; deleteForUser(userId: string, goalId: string): Promise<boolean>; }
