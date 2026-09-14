import type { ApiFailure } from "@/types/api";
export class AppError extends Error { constructor(public readonly code: string, public readonly status: number, message: string) { super(message); } }
export class UnauthorizedError extends AppError { constructor() { super("UNAUTHORIZED", 401, "Authentication is required."); } }
export class ForbiddenError extends AppError { constructor(message = "You do not have permission to perform this action.") { super("FORBIDDEN", 403, message); } }
export class ValidationError extends AppError { constructor(message = "Invalid request.") { super("VALIDATION_ERROR", 400, message); } }
export function toApiFailure(error: unknown): ApiFailure { if (error instanceof AppError) return { ok: false, error: { code: error.code, message: error.message } }; console.error("Unhandled application error", error); return { ok: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } }; }
