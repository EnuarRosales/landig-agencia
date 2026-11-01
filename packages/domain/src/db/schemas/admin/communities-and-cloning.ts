import {
  boolean,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { users } from "./users";
import { auditColumns } from "../shared/audit-columns";

/**
 * Organizaciones o comunidades de inquilinos (`admin.organizations`, ADM-001 T-19, RF-08.1).
 */
export const organizations = adminSchema.table(
  "organizations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    originatorClientId: uuid("originator_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    moderationMode: varchar("moderation_mode", { length: 20 })
      .notNull()
      .default("pre"), // 'pre' | 'post' | 'none'
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("organizations_originator_unique").on(table.originatorClientId),
  ],
);

/**
 * Miembros de organizaciones (`admin.organization_members`, ADM-001 T-19, RF-08.2, RF-08.3).
 * Restricción: un inquilino pertenece como máximo a una organización activa.
 */
export const organizationMembers = adminSchema.table(
  "organization_members",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 20 }).notNull().default("member"), // 'originator' | 'co_leader' | 'member'
    status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'left' | 'suspended'
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("organization_members_one_active_per_client")
      .on(table.clientId)
      .where(sql`status = 'active'`),
  ],
);

/**
 * Invitaciones directas a organizaciones (`admin.organization_invitations`, ADM-001 T-19).
 */
export const organizationInvitations = adminSchema.table(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'expired' | 'revoked'
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("organization_invitations_token_unique").on(table.tokenHash),
  ],
);

/**
 * Solicitudes de unión a organizaciones (`admin.organization_join_requests`, ADM-001 T-20, RF-08.6).
 */
export const organizationJoinRequests = adminSchema.table(
  "organization_join_requests",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'rejected'
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...auditColumns(),
  },
);

/**
 * Promociones de inquilinos a co-líderes (`admin.organization_promotions`, ADM-001 T-20, RF-08.2).
 */
export const organizationPromotions = adminSchema.table(
  "organization_promotions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    targetClientId: uuid("target_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    promotedByClientId: uuid("promoted_by_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'rejected'
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...auditColumns(),
  },
);

/**
 * Perfiles de visibilidad y datos compartidos en comunidad (`admin.client_sharing_profiles`, ADM-001 RF-08.10).
 */
export const clientSharingProfiles = adminSchema.table(
  "client_sharing_profiles",
  {
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    sharePhone: boolean("share_phone").notNull().default(false),
    shareEmail: boolean("share_email").notNull().default(true),
    shareAddress: boolean("share_address").notNull().default(false),
    shareSocialLinks: boolean("share_social_links").notNull().default(true),
    ...auditColumns(),
  },
);

/**
 * Productos compartidos con la comunidad (`admin.product_shares`, ADM-001 T-16, RF-08.11, RF-08.14).
 */
export const productShares = adminSchema.table(
  "product_shares",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sharerClientId: uuid("sharer_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sourceProductId: uuid("source_product_id").notNull(),
    sourceCellId: varchar("source_cell_id", { length: 64 }).notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'archived'
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("product_shares_org_source_unique").on(
      table.organizationId,
      table.sourceProductId,
    ),
  ],
);

/**
 * Versiones de productos compartidos (`admin.product_share_versions`, ADM-001 T-16, RF-08.15).
 */
export const productShareVersions = adminSchema.table(
  "product_share_versions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    shareId: uuid("share_id")
      .notNull()
      .references(() => productShares.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    changedAttributes: jsonb("changed_attributes").$type<string[]>().default([]),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_share_versions_share_version_unique").on(
      table.shareId,
      table.version,
    ),
  ],
);

/**
 * Adopciones y clones de producto en celdas (`admin.product_adoptions`, ADM-001 T-17, RF-06.1, RF-06.2).
 */
export const productAdoptions = adminSchema.table(
  "product_adoptions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    shareId: uuid("share_id")
      .notNull()
      .references(() => productShares.id, { onDelete: "cascade" }),
    adopterClientId: uuid("adopter_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cloneProductId: uuid("clone_product_id").notNull(),
    cloneCellId: varchar("clone_cell_id", { length: 64 }).notNull(),
    adoptedVersion: integer("adopted_version").notNull(),
    linkActive: boolean("link_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("product_adoptions_client_clone_unique").on(
      table.adopterClientId,
      table.cloneProductId,
    ),
  ],
);

/**
 * Políticas de sincronización por atributo (`admin.clone_sync_policies`, ADM-001 T-18, RF-08.16).
 */
export const cloneSyncPolicies = adminSchema.table(
  "clone_sync_policies",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    adoptionId: uuid("adoption_id")
      .notNull()
      .references(() => productAdoptions.id, { onDelete: "cascade" }),
    attributeKey: varchar("attribute_key", { length: 64 }).notNull(),
    autoSync: boolean("auto_sync").notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("clone_sync_policies_adoption_attr_unique").on(
      table.adoptionId,
      table.attributeKey,
    ),
  ],
);

/**
 * Registros de ejecuciones de sincronización (`admin.sync_runs`, ADM-001 T-18).
 */
export const syncRuns = adminSchema.table("sync_runs", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  adoptionId: uuid("adoption_id")
    .notNull()
    .references(() => productAdoptions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  mode: varchar("mode", { length: 20 }).notNull().default("manual"), // 'manual' | 'auto'
  attributes: jsonb("attributes").$type<string[]>().default([]),
  status: varchar("status", { length: 20 }).notNull().default("success"), // 'success' | 'failed'
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type ProductShare = typeof productShares.$inferSelect;
export type ProductShareVersion = typeof productShareVersions.$inferSelect;
export type ProductAdoption = typeof productAdoptions.$inferSelect;
export type CloneSyncPolicy = typeof cloneSyncPolicies.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;

