import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { leads, type Lead } from "./schema";
import type { LeadInput } from "../validation";

let clientInstance: ReturnType<typeof postgres> | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Resolves the database connection string strictly from process.env.DATABASE_URL.
 * Warns immediately and throws if the variable is missing to prevent silent fallback misconfigurations.
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  console.log(`[Database URL] ${url}`);
  if (!url) {
    const errorMsg =
      "[Database Config Error] La variable de entorno DATABASE_URL no está definida. La conexión a la base de datos no puede inicializarse.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  return url;
}

/**
 * Lazy postgres client instance.
 */
export function getClient(): ReturnType<typeof postgres> {
  if (!clientInstance) {
    const url = getDatabaseUrl();
    clientInstance = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => { },
    });
  }
  return clientInstance;
}

/**
 * Lazy Drizzle ORM instance with full schema typing (enables db.query relational API).
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), { schema });
  }
  return dbInstance;
}

/**
 * Dynamic proxy for `db` ensuring backward compatibility while keeping
 * lazy initialization without hardcoded credentials.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (instance as any)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

/**
 * Verifies effective database connectivity and warns immediately in the log if unreachable.
 */
export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const client = getClient();
    await client`SELECT 1`;
    return { ok: true };
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    console.error(
      `[Database Healthcheck Failed] Error de conexión efectiva con PostgreSQL: ${details}`,
    );
    return { ok: false, error: details };
  }
}

/**
 * Inserts a lead row as-is. Performs NO validation: callers must validate
 * with `leadSchema` first.
 */
export async function insertLead(input: LeadInput): Promise<Lead> {
  try {
    const database = getDb();
    const rows = await database.insert(leads).values(input).returning();
    const row = rows[0];

    if (!row) {
      throw new Error("insertLead: insert into `leads` returned no rows");
    }

    return row;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[Database Insert Error] Falló la inserción del lead en PostgreSQL: ${msg}`,
    );
    throw error;
  }
}
