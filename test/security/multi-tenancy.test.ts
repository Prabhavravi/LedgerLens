import { describe, expect, it, beforeEach } from "vitest";
import { TransactionService } from "@/server/services/transaction-service";
import { CategoryService } from "@/server/services/category-service";
import { BudgetService } from "@/server/services/budget-service";
import { GoalService } from "@/server/services/goal-service";
import { AnalyticsService } from "@/server/services/analytics-service";
import { createFinancialToolRegistry } from "@/server/ai/tools/financial-tools";
import type { AuthenticatedUser, Budget, Category, FinancialSummary, Goal, Transaction, TransactionListFilters } from "@/types/domain";
import type { AnalyticsRepository, BudgetRepository, CategoryRepository, GoalRepository, TransactionRepository } from "@/server/db/repositories";
import { AppError, ValidationError } from "@/server/errors/app-error";

const userA: AuthenticatedUser = { id: "user-a-1111-1111-1111-111111111111", email: "alice@example.com" };
const userB: AuthenticatedUser = { id: "user-b-2222-2222-2222-222222222222", email: "bob@example.com" };

class InMemoryTransactionRepository implements TransactionRepository {
  public items: Transaction[] = [];

  async create(userId: string, input: Omit<Transaction, "id" | "userId">): Promise<Transaction> {
    const tx: Transaction = { id: crypto.randomUUID(), userId, ...input };
    this.items.push(tx);
    return tx;
  }
  async listForUser(userId: string, _filters: TransactionListFilters, limit: number): Promise<Transaction[]> {
    return this.items.filter((item) => item.userId === userId).slice(0, limit);
  }
  async findForUser(userId: string, transactionId: string): Promise<Transaction | null> {
    return this.items.find((item) => item.userId === userId && item.id === transactionId) ?? null;
  }
  async updateForUser(userId: string, transactionId: string, input: Partial<Omit<Transaction, "id" | "userId">>): Promise<Transaction | null> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === transactionId);
    if (idx < 0) return null;
    this.items[idx] = { ...this.items[idx], ...input };
    return this.items[idx];
  }
  async deleteForUser(userId: string, transactionId: string): Promise<boolean> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === transactionId);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    return true;
  }
  async summaryForUser(userId: string, month: string): Promise<FinancialSummary> {
    const matches = this.items.filter((item) => item.userId === userId && item.occurredOn.startsWith(month));
    const incomeCents = matches.filter((i) => i.type === "income").reduce((sum, i) => sum + i.amountCents, 0);
    const expenseCents = matches.filter((i) => i.type === "expense").reduce((sum, i) => sum + i.amountCents, 0);
    return { month, incomeCents, expenseCents, netCents: incomeCents - expenseCents };
  }
}

class InMemoryCategoryRepository implements CategoryRepository {
  public items: Category[] = [
    { id: "cat-sys-groceries", userId: null, name: "Groceries", type: "expense" },
    { id: "cat-sys-salary", userId: null, name: "Salary", type: "income" },
  ];

  async listAvailableToUser(userId: string): Promise<Category[]> {
    return this.items.filter((item) => item.userId === null || item.userId === userId);
  }
  async findAvailableToUser(userId: string, categoryId: string): Promise<Category | null> {
    return this.items.find((item) => item.id === categoryId && (item.userId === null || item.userId === userId)) ?? null;
  }
  async createForUser(userId: string, input: Omit<Category, "id" | "userId">): Promise<Category> {
    const cat: Category = { id: crypto.randomUUID(), userId, ...input };
    this.items.push(cat);
    return cat;
  }
  async updatePrivateForUser(userId: string, categoryId: string, input: Partial<Pick<Category, "name" | "type">>): Promise<Category | null> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === categoryId);
    if (idx < 0) return null;
    this.items[idx] = { ...this.items[idx], ...input };
    return this.items[idx];
  }
  async deletePrivateForUser(userId: string, categoryId: string): Promise<boolean> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === categoryId);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    return true;
  }
}

class InMemoryBudgetRepository implements BudgetRepository {
  public items: Budget[] = [];

  async createForUser(userId: string, input: Omit<Budget, "id" | "userId">): Promise<Budget> {
    const budget: Budget = { id: crypto.randomUUID(), userId, ...input };
    this.items.push(budget);
    return budget;
  }
  async listForUserMonth(userId: string, month: string): Promise<Budget[]> {
    return this.items.filter((item) => item.userId === userId && item.month === month);
  }
  async findForUser(userId: string, budgetId: string): Promise<Budget | null> {
    return this.items.find((item) => item.userId === userId && item.id === budgetId) ?? null;
  }
  async findByCategoryPeriod(userId: string, categoryId: string, month: string): Promise<Budget | null> {
    return this.items.find((item) => item.userId === userId && item.categoryId === categoryId && item.month === month) ?? null;
  }
  async updateForUser(userId: string, budgetId: string, input: Pick<Budget, "amountCents">): Promise<Budget | null> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === budgetId);
    if (idx < 0) return null;
    this.items[idx] = { ...this.items[idx], ...input };
    return this.items[idx];
  }
  async deleteForUser(userId: string, budgetId: string): Promise<boolean> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === budgetId);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    return true;
  }
  async spentForUserCategoryMonth(_userId: string, _categoryId: string, _month: string): Promise<number> {
    return 0;
  }
}

class InMemoryGoalRepository implements GoalRepository {
  public items: Goal[] = [];

  async create(userId: string, input: Omit<Goal, "id" | "userId" | "createdAt">): Promise<Goal> {
    const goal: Goal = { id: crypto.randomUUID(), userId, ...input, createdAt: new Date().toISOString() };
    this.items.push(goal);
    return goal;
  }
  async listForUser(userId: string): Promise<Goal[]> {
    return this.items.filter((item) => item.userId === userId);
  }
  async findForUser(userId: string, goalId: string): Promise<Goal | null> {
    return this.items.find((item) => item.userId === userId && item.id === goalId) ?? null;
  }
  async updateForUser(userId: string, goalId: string, input: Partial<Omit<Goal, "id" | "userId" | "createdAt">>): Promise<Goal | null> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === goalId);
    if (idx < 0) return null;
    this.items[idx] = { ...this.items[idx], ...input };
    return this.items[idx];
  }
  async deleteForUser(userId: string, goalId: string): Promise<boolean> {
    const idx = this.items.findIndex((item) => item.userId === userId && item.id === goalId);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    return true;
  }
}

class InMemoryAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly txRepo: InMemoryTransactionRepository) {}
  async totalsForUserPeriod(userId: string, month: string) {
    const txs = this.txRepo.items.filter((i) => i.userId === userId && i.occurredOn.startsWith(month));
    return {
      incomeCents: txs.filter((i) => i.type === "income").reduce((s, i) => s + i.amountCents, 0),
      expenseCents: txs.filter((i) => i.type === "expense").reduce((s, i) => s + i.amountCents, 0),
    };
  }
  async categorySpendingForUserPeriod(userId: string, month: string) {
    const txs = this.txRepo.items.filter((i) => i.userId === userId && i.type === "expense" && i.occurredOn.startsWith(month));
    const map = new Map<string, number>();
    for (const t of txs) {
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
    }
    return [...map.entries()].map(([categoryId, amountCents]) => ({
      categoryId,
      categoryName: categoryId,
      amountCents,
    }));
  }
  async largestExpensesForUserPeriod(userId: string, month: string, limit: number) {
    return this.txRepo.items.filter((i) => i.userId === userId && i.type === "expense" && i.occurredOn.startsWith(month)).slice(0, limit);
  }
  async expenseTotalForUserPeriod(userId: string, month: string) {
    return this.txRepo.items.filter((i) => i.userId === userId && i.type === "expense" && i.occurredOn.startsWith(month)).reduce((s, i) => s + i.amountCents, 0);
  }
}

describe("AUDIT 1 — Multi-Tenancy & Authorization Security Invariants", () => {
  let txRepo: InMemoryTransactionRepository;
  let catRepo: InMemoryCategoryRepository;
  let budgetRepo: InMemoryBudgetRepository;
  let goalRepo: InMemoryGoalRepository;
  let analyticsRepo: InMemoryAnalyticsRepository;

  let txServiceUserA: TransactionService;
  let txServiceUserB: TransactionService;
  let catServiceUserA: CategoryService;
  let catServiceUserB: CategoryService;
  let budgetServiceUserA: BudgetService;
  let budgetServiceUserB: BudgetService;
  let goalServiceUserA: GoalService;
  let goalServiceUserB: GoalService;
  let analyticsServiceUserA: AnalyticsService;
  let analyticsServiceUserB: AnalyticsService;

  beforeEach(async () => {
    txRepo = new InMemoryTransactionRepository();
    catRepo = new InMemoryCategoryRepository();
    budgetRepo = new InMemoryBudgetRepository();
    goalRepo = new InMemoryGoalRepository();
    analyticsRepo = new InMemoryAnalyticsRepository(txRepo);

    txServiceUserA = new TransactionService(txRepo, catRepo, async () => userA);
    txServiceUserB = new TransactionService(txRepo, catRepo, async () => userB);

    catServiceUserA = new CategoryService(catRepo, async () => userA);
    catServiceUserB = new CategoryService(catRepo, async () => userB);

    budgetServiceUserA = new BudgetService(budgetRepo, catRepo, async () => userA);
    budgetServiceUserB = new BudgetService(budgetRepo, catRepo, async () => userB);

    analyticsServiceUserA = new AnalyticsService(analyticsRepo, budgetRepo, catRepo, async () => userA);
    analyticsServiceUserB = new AnalyticsService(analyticsRepo, budgetRepo, catRepo, async () => userB);

    goalServiceUserA = new GoalService(goalRepo, analyticsServiceUserA, async () => userA);
    goalServiceUserB = new GoalService(goalRepo, analyticsServiceUserB, async () => userB);
  });

  describe("Transaction Multi-Tenancy", () => {
    it("prevents User B from reading, modifying, or deleting User A's transaction using manipulated IDs", async () => {
      const aliceTx = await txServiceUserA.createForCurrentUser({
        type: "expense",
        amountCents: 500000,
        categoryId: "cat-sys-groceries",
        description: "Alice Grocery",
        occurredOn: "2026-09-01",
      });

      // User B lists transactions: should see 0
      const bobList = await txServiceUserB.listForCurrentUser();
      expect(bobList).toHaveLength(0);

      // User B attempts to update Alice's transaction ID
      await expect(
        txServiceUserB.updateForCurrentUser(aliceTx.id, { description: "Hacked by Bob" })
      ).rejects.toThrow(AppError);

      // Verify Alice's transaction description was not altered
      const aliceList = await txServiceUserA.listForCurrentUser();
      expect(aliceList[0].description).toBe("Alice Grocery");

      // User B attempts to delete Alice's transaction ID
      await expect(
        txServiceUserB.deleteForCurrentUser(aliceTx.id)
      ).rejects.toThrow(AppError);

      // Alice's transaction still exists
      expect(await txServiceUserA.listForCurrentUser()).toHaveLength(1);
    });
  });

  describe("Category Isolation & Poisoning Defense", () => {
    it("prevents User B from modifying or deleting User A's private category", async () => {
      const alicePrivateCat = await catServiceUserA.createForCurrentUser({
        name: "Alice Private Stash",
        type: "expense",
      });

      // User B lists categories: should only see system categories, NOT Alice's private category
      const bobCategories = await catServiceUserB.listForCurrentUser();
      expect(bobCategories.some((c) => c.id === alicePrivateCat.id)).toBe(false);

      // User B attempts to update Alice's private category
      await expect(
        catServiceUserB.updateForCurrentUser(alicePrivateCat.id, { name: "Bob Overwrite" })
      ).rejects.toThrow(AppError);

      // User B attempts to delete Alice's private category
      await expect(
        catServiceUserB.deleteForCurrentUser(alicePrivateCat.id)
      ).rejects.toThrow(AppError);
    });

    it("rejects User B creating transactions or budgets with User A's private category ID", async () => {
      const alicePrivateCat = await catServiceUserA.createForCurrentUser({
        name: "Alice Secret Project",
        type: "expense",
      });

      // User B attempts transaction with Alice's category ID
      await expect(
        txServiceUserB.createForCurrentUser({
          type: "expense",
          amountCents: 10000,
          categoryId: alicePrivateCat.id,
          description: "Unauthorized transaction",
          occurredOn: "2026-09-02",
        })
      ).rejects.toThrow(ValidationError);

      // User B attempts budget with Alice's category ID
      await expect(
        budgetServiceUserB.createForCurrentUser({
          categoryId: alicePrivateCat.id,
          amountCents: 50000,
          month: "2026-09",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Budget Multi-Tenancy", () => {
    it("prevents User B from accessing, modifying, or deleting User A's budgets", async () => {
      const aliceBudget = await budgetServiceUserA.createForCurrentUser({
        categoryId: "cat-sys-groceries",
        amountCents: 3000000,
        month: "2026-09",
      });

      // User B lists budgets: empty
      const bobBudgets = await budgetServiceUserB.listStatusesForCurrentUser("2026-09");
      expect(bobBudgets).toHaveLength(0);

      // User B attempts to update Alice's budget
      await expect(
        budgetServiceUserB.updateForCurrentUser(aliceBudget.id, { amountCents: 100 })
      ).rejects.toThrow(AppError);

      // User B attempts to delete Alice's budget
      await expect(
        budgetServiceUserB.deleteForCurrentUser(aliceBudget.id)
      ).rejects.toThrow(AppError);
    });
  });

  describe("Financial Goal Multi-Tenancy", () => {
    it("prevents User B from viewing, updating, contributing to, or deleting User A's goals", async () => {
      const aliceGoal = await goalServiceUserA.createForCurrentUser({
        name: "Alice Emergency Fund",
        targetAmountCents: 10000000,
        currentSavedCents: 4200000,
        targetDate: "2026-12-31",
      });

      // User B lists goals: empty
      const bobGoals = await goalServiceUserB.listForCurrentUser();
      expect(bobGoals).toHaveLength(0);

      // User B attempts to read Alice's goal
      await expect(
        goalServiceUserB.getGoalForCurrentUser(aliceGoal.id)
      ).rejects.toThrow(AppError);

      // User B attempts to update Alice's goal
      await expect(
        goalServiceUserB.updateForCurrentUser(aliceGoal.id, { name: "Bob Goal Stolen" })
      ).rejects.toThrow(AppError);

      // User B attempts to contribute to Alice's goal
      await expect(
        goalServiceUserB.contributeForCurrentUser(aliceGoal.id, 50000)
      ).rejects.toThrow(AppError);

      // User B attempts to delete Alice's goal
      await expect(
        goalServiceUserB.deleteForCurrentUser(aliceGoal.id)
      ).rejects.toThrow(AppError);

      // User B attempts to fetch an Action Plan for Alice's goal
      await expect(
        goalServiceUserB.getActionPlanForCurrentUser(aliceGoal.id)
      ).rejects.toThrow(AppError);
    });
  });

  describe("Analytics & AI Tool Isolation", () => {
    it("guarantees analytics and AI tools execute solely against the session context", async () => {
      // Alice has ₹1,00,000 income and ₹40,000 expenses
      await txServiceUserA.createForCurrentUser({
        type: "income",
        amountCents: 10000000,
        categoryId: "cat-sys-salary",
        description: "Alice Salary",
        occurredOn: "2026-09-01",
      });
      await txServiceUserA.createForCurrentUser({
        type: "expense",
        amountCents: 4000000,
        categoryId: "cat-sys-groceries",
        description: "Alice Groceries",
        occurredOn: "2026-09-05",
      });

      // Bob's analytics summary must reflect 0, not Alice's numbers
      const bobSummary = await analyticsServiceUserB.getFinancialSummary(userB, "2026-09");
      expect(bobSummary.incomeCents).toBe(0);
      expect(bobSummary.expenseCents).toBe(0);
      expect(bobSummary.netSavingsCents).toBe(0);

      // AI Tool Registry instantiated for Bob
      const registry = createFinancialToolRegistry((context) => {
        const u = context.user;
        const txS = u.id === userA.id ? txServiceUserA : txServiceUserB;
        const bS = u.id === userA.id ? budgetServiceUserA : budgetServiceUserB;
        const anS = u.id === userA.id ? analyticsServiceUserA : analyticsServiceUserB;
        const cS = u.id === userA.id ? catServiceUserA : catServiceUserB;
        const gS = u.id === userA.id ? goalServiceUserA : goalServiceUserB;
        return { transactions: txS, budgets: bS, analytics: anS, categories: cS, goals: gS };
      });

      // Bob calls get_my_transactions: returns 0 transactions
      const bobTxs = await registry.execute("get_my_transactions", {}, { user: userB }) as Transaction[];
      expect(bobTxs).toHaveLength(0);

      // Bob calls get_my_financial_summary: returns 0 income / 0 expense
      const bobAiSummary = await registry.execute("get_my_financial_summary", { period: "2026-09" }, { user: userB }) as { incomeCents: number };
      expect(bobAiSummary.incomeCents).toBe(0);
    });
  });
});
