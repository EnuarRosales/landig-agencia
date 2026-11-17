import {
  boolean,
  check,
  index,
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
 * Organizaciones o comunidades de comercios (`admin.organizations`, ADM-001 T-19, SPEC-15).
 *
 * Soporta multi-comunidad total: un comercio habilitado como líder puede originar
 * múltiples comunidades diferenciadas por `slug`, visibilidad, política de compartición
 * y modo de moderación del muro.
 */
export const organizations = adminSchema.table(
  "organizations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    originatorClientId: uuid("originator_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 80 }),
    visibility: varchar("visibility", { length: 24 })
      .notNull()
      .default("private_invite"), // 'private_invite' | 'request_to_join'
    sharePolicy: varchar("share_policy", { length: 24 })
      .notNull()
      .default("leaders_only"), // 'leaders_only' | 'collaborative'
    requireShareApproval: boolean("require_share_approval").notNull().default(true),
    moderationMode: varchar("moderation_mode", { length: 20 })
      .notNull()
      .default("pre"), // 'pre' | 'post' | 'none'
    inviteCode: varchar("invite_code", { length: 32 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'suspended'
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("organizations_slug_unique").on(table.slug),
    uniqueIndex("organizations_invite_code_unique").on(table.inviteCode),
    index("organizations_originator_idx").on(table.originatorClientId),
    index("organizations_visibility_status_idx").on(table.visibility, table.status),
    check(
      "organizations_visibility_check",
      sql.raw("visibility IN ('private_invite', 'request_to_join')"),
    ),
    check(
      "organizations_share_policy_check",
      sql.raw("share_policy IN ('leaders_only', 'collaborative')"),
    ),
    check(
      "organizations_moderation_mode_check",
      sql.raw("moderation_mode IN ('pre', 'post', 'none')"),
    ),
    check(
      "organizations_status_check",
      sql.raw("status IN ('active', 'suspended')"),
    ),
  ],
);

/**
 * Autorizaciones de plataforma para crear y liderar comunidades (`admin.community_leader_authorizations`, SPEC-15).
 *
 * Todo comercio puede unirse como miembro según su plan (`community_feed`), pero crear comunidades
 * propias requiere solicitud o habilitación explícita aprobada por `platform_admin` / `platform_owner`.
 */
export const communityLeaderAuthorizations = adminSchema.table(
  "community_leader_authorizations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 24 }).notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'revoked'
    maxOwnedCommunities: integer("max_owned_communities"),
    proposedCommunityName: varchar("proposed_community_name", { length: 180 }),
    businessModel: text("business_model"),
    reviewNotes: text("review_notes"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("community_leader_authorizations_client_unique").on(table.clientId),
    index("community_leader_authorizations_status_idx").on(table.status),
    check(
      "community_leader_authorizations_status_check",
      sql.raw("status IN ('pending', 'approved', 'rejected', 'revoked')"),
    ),
    check(
      "community_leader_authorizations_max_owned_check",
      sql.raw("max_owned_communities IS NULL OR max_owned_communities > 0"),
    ),
  ],
);

/**
 * Miembros de organizaciones (`admin.organization_members`, ADM-001 T-19, SPEC-15).
 *
 * Permite pertenencia multi-comunidad: un comercio puede estar activo en múltiples
 * comunidades distintas, garantizando una única membresía activa por `(organization_id, client_id)`.
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
    uniqueIndex("organization_members_org_client_active_unique")
      .on(table.organizationId, table.clientId)
      .where(sql`status = 'active'`),
    index("organization_members_client_status_idx").on(table.clientId, table.status),
    check(
      "organization_members_role_check",
      sql.raw("role IN ('originator', 'co_leader', 'member')"),
    ),
    check(
      "organization_members_status_check",
      sql.raw("status IN ('active', 'left', 'suspended')"),
    ),
  ],
);

/**
 * Invitaciones directas a organizaciones (`admin.organization_invitations`, ADM-001 T-19, SPEC-15).
 */
export const organizationInvitations = adminSchema.table(
  "organization_invitations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    targetClientId: uuid("target_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    role: varchar("role", { length: 20 }).notNull().default("member"), // 'member' | 'co_leader'
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked'
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("organization_invitations_token_unique").on(table.tokenHash),
    index("organization_invitations_target_client_idx").on(table.targetClientId, table.status),
    check(
      "organization_invitations_role_check",
      sql.raw("role IN ('member', 'co_leader')"),
    ),
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
  (table) => [
    index("organization_join_requests_org_status_idx").on(table.organizationId, table.status),
    index("organization_join_requests_client_idx").on(table.clientId, table.status),
  ],
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
 * Productos compartidos con la comunidad (`admin.product_shares`, ADM-001 T-16, SPEC-15).
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
    moderationStatus: varchar("moderation_status", { length: 24 })
      .notNull()
      .default("approved"), // 'approved' | 'pending_review' | 'rejected'
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("product_shares_org_source_unique").on(
      table.organizationId,
      table.sourceProductId,
    ),
    index("product_shares_org_status_idx").on(
      table.organizationId,
      table.status,
      table.moderationStatus,
    ),
    check(
      "product_shares_moderation_status_check",
      sql.raw("moderation_status IN ('approved', 'pending_review', 'rejected')"),
    ),
  ],
);

/**
 * Versiones de productos compartidos (`admin.product_share_versions`, ADM-001 T-16, SPEC-15).
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
    changelog: text("changelog"),
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
    index("product_adoptions_share_active_idx").on(table.shareId, table.linkActive),
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

/**
 * Publicaciones en el feed de la comunidad (`admin.feed_posts`, ADM-001 T-22, RF-08.8, RF-08.13).
 */
export const feedPosts = adminSchema.table(
  "feed_posts",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorClientId: uuid("author_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending_review"), // 'pending_review' | 'published' | 'rejected' | 'hidden'
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    index("feed_posts_org_status_idx").on(table.organizationId, table.status),
  ],
);

/**
 * Eventos de moderación del feed (`admin.feed_moderation_events`, ADM-001 T-22, RF-08.19).
 */
export const feedModerationEvents = adminSchema.table(
  "feed_moderation_events",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    actorClientId: uuid("actor_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 20 }).notNull(), // 'approve' | 'reject' | 'hide'
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type Organization = typeof organizations.$inferSelect;
export type CommunityLeaderAuthorization = typeof communityLeaderAuthorizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type OrganizationJoinRequest = typeof organizationJoinRequests.$inferSelect;
export type OrganizationPromotion = typeof organizationPromotions.$inferSelect;
export type ProductShare = typeof productShares.$inferSelect;
export type ProductShareVersion = typeof productShareVersions.$inferSelect;
export type ProductAdoption = typeof productAdoptions.$inferSelect;
export type CloneSyncPolicy = typeof cloneSyncPolicies.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type FeedPost = typeof feedPosts.$inferSelect;
export type FeedModerationEvent = typeof feedModerationEvents.$inferSelect;
export type ClientSharingProfile = typeof clientSharingProfiles.$inferSelect;
