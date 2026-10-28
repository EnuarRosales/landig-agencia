import { check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Consentimientos de tratamiento de datos de los usuarios de la plataforma (Ley 1581 de 2012, Colombia).
 * Append-only por otorgamiento: la revocación marca `revoked_at` y `status = 'revoked'` en la fila vigente
 * (AUTH-001 design §4.1).
 */
export const userConsents = adminSchema.table(
  "user_consents",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** `data_treatment` (required at registration) or `commercial_comms` (optional). */
    purpose: text("purpose").notNull(),
    /** Version of the privacy notice accepted by the user. */
    policyVersion: text("policy_version").notNull(),
    status: text("status").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Capture channel, for example `register_form` or `onboarding`. */
    channel: text("channel").notNull(),
    /** Reference to the evidence of the grant; never the raw form payload. */
    evidenceRef: text("evidence_ref"),
    ...auditColumns(),
  },
  (table) => [
    // Acceso: consentimiento vigente por usuario y propósito.
    index("user_consents_user_purpose_idx").on(table.userId, table.purpose),
    check(
      "user_consents_purpose_check",
      sql.raw("purpose IN ('data_treatment', 'commercial_comms')"),
    ),
    check("user_consents_status_check", sql.raw("status IN ('granted', 'revoked')")),
    check(
      "user_consents_revocation_check",
      sql.raw("(status = 'revoked') = (revoked_at IS NOT NULL)"),
    ),
  ],
);

export type UserConsent = typeof userConsents.$inferSelect;
export type NewUserConsent = typeof userConsents.$inferInsert;
