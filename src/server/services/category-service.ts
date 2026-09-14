import "server-only";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { getDatabasePool } from "@/server/db/pool";
import { PostgresCategoryRepository } from "@/server/db/postgres-repositories";
import type { CategoryRepository } from "@/server/db/repositories";
import { AppError } from "@/server/errors/app-error";
import type { CategoryInput } from "@/server/validation/category";
import type { AuthenticatedUser, TransactionType } from "@/types/domain";
type CurrentUser = () => Promise<AuthenticatedUser>;
export class CategoryService {
  constructor(private readonly categories: CategoryRepository, private readonly currentUser: CurrentUser = requireAuthenticatedUser) {}
  async listForCurrentUser() { const user = await this.currentUser(); return this.categories.listAvailableToUser(user.id); }
  async resolveForCurrentUser(name: string, type: TransactionType) { const user = await this.currentUser(); const matches = (await this.categories.listAvailableToUser(user.id)).filter((category) => category.type === type && category.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase()); if (matches.length !== 1) throw new AppError("NOT_FOUND", 404, "A matching category was not found. Please choose a category."); return matches[0]; }
  async createForCurrentUser(input: CategoryInput) { const user = await this.currentUser(); return this.categories.createForUser(user.id, input); }
  async updateForCurrentUser(categoryId: string, input: Partial<CategoryInput>) { const user = await this.currentUser(); const category = await this.categories.updatePrivateForUser(user.id, categoryId, input); if (!category) throw new AppError("NOT_FOUND", 404, "Private category not found."); return category; }
  async deleteForCurrentUser(categoryId: string) { const user = await this.currentUser(); if (!(await this.categories.deletePrivateForUser(user.id, categoryId))) throw new AppError("NOT_FOUND", 404, "Private category not found."); }
}
let categoryService: CategoryService | undefined;
export function getCategoryService() { if (!categoryService) categoryService = new CategoryService(new PostgresCategoryRepository(getDatabasePool())); return categoryService; }
