import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = await scrypt(password, salt, KEY_LENGTH) as Buffer; return `scrypt$${salt}$${key.toString("hex")}`; }
export async function verifyPassword(password: string, encoded: string) { const [algorithm, salt, expected] = encoded.split("$"); if (algorithm !== "scrypt" || !salt || !expected) return false; const actual = await scrypt(password, salt, KEY_LENGTH) as Buffer; const expectedBuffer = Buffer.from(expected, "hex"); return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer); }
