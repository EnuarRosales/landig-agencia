import {
  boolean,
  check,
  foreignKey,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { cellUsers } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Identidad federada (Google o Facebook) vinculada a un usuario dentro de una celda de datos (`admin.identities` en `pg-cell-XX`).
 *
 * Propiedad de AUTH-001 (T-04, `design.md` §4.2 y §4.3). No almacena tokens OAuth ni códigos de autorización.
 *
 * Reglas arquitectónicas en la celda:
 * - Llave primaria compuesta `(client_id, id)` liderada por `client_id`.
 * - Integridad referencial intra-inquilino `(client_id, user_id) -> admin.users(client_id, id)` con `ON DELETE RESTRICT`.
 * - Unicidad por inquilino en `cell_identities_provider_subject_unique` y `cell_identities_user_provider_unique`.
 * - Aislamiento estricto con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` mediante `app.current_client_id`.
 */
export const cellIdentities = cellAdminSchema.table(
  "identities",
  {
    /** Identificador UUID de la identidad federada en la celda. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador UUID del inquilino propietario del registro bajo RLS. */
    clientId: uuid("client_id").notNull(),
    /** Identificador UUID del usuario en la celda (`admin.users.id`). */
    userId: uuid("user_id").notNull(),
    /** Proveedor federado (`google` o `facebook`). */
    provider: text("provider").notNull(),
    /** Identificador único del sujeto (`sub` / `id`) emitido por el proveedor. */
    providerUserId: text("provider_user_id").notNull(),
    /** Correo electrónico reportado por el proveedor (informativo). */
    providerEmail: text("provider_email"),
    /** Indica si el proveedor certificó el correo electrónico como verificado. */
    emailVerified: boolean("email_verified").notNull().default(false),
    /** Nombre visible reportado por el proveedor. */
    displayName: text("display_name"),
    /** URL de avatar provista por el proveedor. */
    avatarUrl: text("avatar_url"),
    /** Instante en que se vinculó la identidad federada al usuario. */
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    /** Instante del último inicio de sesión exitoso mediante esta identidad. */
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_identities_pkey", columns: [table.clientId, table.id] }),
    foreignKey({
      name: "cell_identities_client_user_fk",
      columns: [table.clientId, table.userId],
      foreignColumns: [cellUsers.clientId, cellUsers.id],
    }).onDelete("restrict"),
    uniqueIndex("cell_identities_provider_subject_unique").on(
      table.clientId,
      table.provider,
      table.providerUserId,
    ),
    uniqueIndex("cell_identities_user_provider_unique").on(
      table.clientId,
      table.userId,
      table.provider,
    ),
    check("cell_identities_provider_check", sql.raw("provider IN ('google', 'facebook')")),
  ],
);

/** Tipo inferido de lectura para un registro de `admin.identities` en una celda de datos. */
export type CellIdentity = typeof cellIdentities.$inferSelect;

/** Tipo inferido de inserción para un registro de `admin.identities` en una celda de datos. */
export type NewCellIdentity = typeof cellIdentities.$inferInsert;

