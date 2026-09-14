import "server-only";
import { Pool } from "pg";
import { getServerEnv } from "@/server/env";
let pool: Pool | undefined;
export function getDatabasePool() { if (!pool) pool = new Pool({ connectionString: getServerEnv().DATABASE_URL }); return pool; }
