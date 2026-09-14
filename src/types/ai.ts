import type { z } from "zod";
import type { AuthenticatedUser } from "@/types/domain";
export interface ToolContext { user: AuthenticatedUser; }
export interface AppTool<TInput, TOutput> { name: string; description: string; schema: z.ZodType<TInput>; jsonSchema: Record<string, unknown>; execute(input: TInput, context: ToolContext): Promise<TOutput>; }
export interface LlmProvider { complete(input: { system: string; message: string; tools: ReadonlyArray<{ name: string; description: string; parameters: Record<string, unknown> }> }): Promise<{ text: string }>; }
