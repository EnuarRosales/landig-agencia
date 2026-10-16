import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { leads, type Lead } from "./schema.js";
import type { LeadInput } from "./validation.js";

/**
 * PostgreSQL connection string. Falls back to a local development URL so
 * tooling (e.g. `db:generate`) and imports work without a live database;
 * production must always set `DATABASE_URL`.
 */
const connectionString = process.env.DATABASE_URL ?? "postgres://localhost:5432/mocter";

/** postgres-js client (lazy: the connection opens on first query, not at import). */
const client = postgres(connectionString);

/** Shared Drizzle instance over the postgres-js client. */
export const db = drizzle(client);

/**
 * Inserts a lead row as-is. Performs NO validation: callers must validate
 * with `leadSchema` first.
 */
export async function insertLead(input: LeadInput): Promise<Lead> {
  const rows = await db.insert(leads).values(input).returning();
  const row = rows[0];

  if (!row) {
    throw new Error("insertLead: insert into `leads` returned no rows");
  }

  return row;
}
