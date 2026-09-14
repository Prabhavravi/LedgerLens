import "server-only";
import { z } from "zod";
const serverSchema = z.object({ DATABASE_URL: z.string().url(), APP_SECRET: z.string().min(32), AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"), OPENAI_API_KEY: z.string().optional(), AI_MODEL_NAME: z.string().default("gpt-4o-mini") });
export type ServerEnv = z.infer<typeof serverSchema>;
export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv { return serverSchema.parse(env); }
