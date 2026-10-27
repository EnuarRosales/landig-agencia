import { check, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Canonical platform identity row (`users`). Owned by ADM-001 (D-34); AUTH-001 adds
 * credential and TOTP columns and its own tables on top of this definition.
 *
 * The row is global: it has no `client_id` and no RLS. `active_client_id` is the
 * single-membership pointer (ADM-001 D-15).
 */
export const users = adminSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** `router` or the UUID of the cell that holds the credentials (AUTH-001). */
    identityLocation: text("identity_location").notNull().default("router"),
    /**
     * Membership pointer. Intentionally has NO foreign key: `clients` does not exist
     * until ADM-001 T-06, which adds `users.active_client_id -> clients(id)` (ADM-001 D-34).
     */
    activeClientId: uuid("active_client_id"),
    status: text("status").notNull().default("active"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("users_email_lower_key").on(sql`lower(${table.email})`),
    check("users_email_lowercase_check", sql.raw("email = lower(email)")),
    check(
      "users_identity_location_check",
      sql.raw(
        "identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
      ),
    ),
    check("users_status_check", sql.raw("status IN ('active', 'disabled')")),
  ],
);
