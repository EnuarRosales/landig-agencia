import { boolean, check, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Identidad federada (Google o Facebook) vinculada a un usuario de la plataforma.
 * Propiedad de AUTH-001 (design §4.1). No guarda access tokens, refresh tokens ni códigos OAuth.
 *
 * `provider_email` es el correo que devolvió el proveedor y puede diferir del correo del ancla;
 * la vinculación se decide por el correo verificado del ancla.
 */
export const identities = adminSchema.table(
  "identities",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    providerEmail: text("provider_email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("identities_provider_subject_unique").on(table.provider, table.providerUserId),
    uniqueIndex("identities_user_provider_unique").on(table.userId, table.provider),
    check("identities_provider_check", sql.raw("provider IN ('google', 'facebook')")),
  ],
);
