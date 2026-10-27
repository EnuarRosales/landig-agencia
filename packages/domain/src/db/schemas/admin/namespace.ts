import { pgSchema } from "drizzle-orm/pg-core";

/**
 * `admin` schema of the Router Global. It is the privilege unit of mocter-admin
 * (ADM-001 D-25): the landing role has no access to it.
 */
export const adminSchema = pgSchema("admin");
