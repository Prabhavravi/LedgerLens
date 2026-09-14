import "server-only";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getDatabasePool } from "@/server/db/pool";
import { PostgresCategoryRepository, PostgresTransactionRepository } from "@/server/db/postgres-repositories";
import type { CategoryRepository, TransactionRepository } from "@/server/db/repositories";
import { ValidationError, AppError } from "@/server/errors/app-error";
import type { CreateTransactionInput, TransactionFilters, UpdateTransactionInput } from "@/server/validation/transaction";
import type { AuthenticatedUser } from "@/types/domain";
type CurrentUser = () => Promise<AuthenticatedUser>;
export class TransactionService {
  constructor(private readonly transactions: TransactionRepository, private readonly categories: CategoryRepository, private readonly currentUser: CurrentUser = requireAuthenticatedUser) {}
  async createForCurrentUser(input: CreateTransactionInput) { const user = await this.currentUser(); await this.assertCategory(user.id, input.categoryId, input.type); return this.transactions.create(user.id, input); }
  async listForCurrentUser(filters: Partial<TransactionFilters> = {}, limit = 100) { const user = await this.currentUser(); return this.transactions.listForUser(user.id, filters, limit); }
  async updateForCurrentUser(transactionId: string, input: UpdateTransactionInput) { const user = await this.currentUser(); const existing = await this.transactions.findForUser(user.id, transactionId); if (!existing) throw new AppError("NOT_FOUND", 404, "Transaction not found."); const categoryId = input.categoryId ?? existing.categoryId; const type = input.type ?? existing.type; await this.assertCategory(user.id, categoryId, type); const updated = await this.transactions.updateForUser(user.id, transactionId, input); if (!updated) throw new AppError("NOT_FOUND", 404, "Transaction not found."); return updated; }
  async deleteForCurrentUser(transactionId: string) { const user = await this.currentUser(); if (!(await this.transactions.deleteForUser(user.id, transactionId))) throw new AppError("NOT_FOUND", 404, "Transaction not found."); }
  private async assertCategory(userId: string, categoryId: string, type: "income" | "expense") { const category = await this.categories.findAvailableToUser(userId, categoryId); if (!category || category.type !== type) throw new ValidationError("Select a valid category for this transaction type."); }
}
let transactionService: TransactionService | undefined;
export function getTransactionService() { if (!transactionService) { const pool = getDatabasePool(); transactionService = new TransactionService(new PostgresTransactionRepository(pool), new PostgresCategoryRepository(pool)); } return transactionService; }
