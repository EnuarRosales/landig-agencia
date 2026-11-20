import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { CellPoolError, withTenantCellTransaction } from "../db/cell-client";
import { getDb } from "../db/client";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { clients } from "../db/schemas/admin/clients";
import {
  clientSharingProfiles,
  communityPlatformSettings,
  feedModerationEvents,
  feedPostReplies,
  feedPosts,
  organizationMembers,
  organizations,
  type ClientSharingProfile,
  type FeedModerationEvent,
  type FeedPost,
  type FeedPostReply,
} from "../db/schemas/admin/communities-and-cloning";
import { clientPlanOverrides, planLimits } from "../db/schemas/admin/plan-catalogs";
import { plans } from "../db/schemas/admin/plans";
import { cellClientMedia, cellClientUsage } from "../db/schemas/tenant/tenancy-catalog";
import { ok, err, type Result } from "../types/result";
import {
  extractPlainTextFromCommunityHtml,
  resolveSafeVideoEmbedUrl,
  sanitizeCommunityPostHtml,
} from "../utils/community-html";
import { appLogger } from "../utils/logger";
import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
import { S3StorageService } from "./s3-storage.service";

export const MAX_WALL_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const DEFAULT_FEED_RETENTION_DAYS = 90;
export const MAX_WALL_REPLY_CHARS = 1500;

export interface AuthorProfileSummary {
  clientId: string;
  displayName: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  socialLinks?: Record<string, string>;
}

export interface FeedPostReplyView {
  id: string;
  postId: string;
  authorClientId: string;
  authorDisplayName: string;
  body: string;
  createdAt: Date;
}

export interface FeedPostView {
  id: string;
  organizationId: string;
  organizationName?: string;
  body: string;
  bodyFormat: "plain" | "html";
  mediaId: string | null;
  imageUrl: string | null;
  videoEmbedUrl: string | null;
  isPinned: boolean;
  pinnedAt: Date | null;
  status: string;
  publishedAt: Date | null;
  createdAt?: Date;
  authorRole?: string;
  author: AuthorProfileSummary;
  replies: FeedPostReplyView[];
}

export interface ClientSharingProfileDto {
  clientId: string;
  sharePhone: boolean;
  shareEmail: boolean;
  shareAddress: boolean;
  shareSocialLinks: boolean;
}

export interface WallMediaUploadDto {
  mediaId: string;
  imageUrl: string;
  sizeBytes: number;
  mimeType: string;
}

export interface CommunityWallRetentionSettingsDto {
  feedRetentionDays: number | null;
  lastRetentionPurgeAt: string | null;
  lastRetentionPurgedCount: number;
  eligibleToPurgeCount: number;
}

export interface WallPurgeSummaryDto {
  purgedPostsCount: number;
  releasedMediaCount: number;
  releasedBytesTotal: number;
  skippedQuotaReleasesCount: number;
  executedAt: string;
}

export interface AuthorizedWallMediaBinary {
  buffer: Buffer;
  mimeType: string;
}

export interface UploadWallImageStorageResult {
  ok: true;
  data: WallMediaUploadDto;
}

export type UploadWallImageRepoResult =
  | UploadWallImageStorageResult
  | { ok: false; code: "STORAGE_QUOTA_EXCEEDED" | "CELL_UNAVAILABLE" | "S3_UPLOAD_FAILED"; error: string };

export interface ReleaseWallImageRepoResult {
  released: boolean;
  freedBytes: number;
  cellUnavailable?: boolean;
}

/**
 * Contrato de persistencia para el muro social enriquecido, fijación, respuestas, retención y privacidad (`SPEC-15`).
 */
export interface ICommunityFeedRepository {
  findOrganizationMembership(
    orgId: string,
    clientId: string,
  ): Promise<{ role: string; status: string } | null>;
  findOrganizationModerationMode(orgId: string): Promise<"pre" | "post" | "none" | null>;
  getSharingProfile(clientId: string): Promise<ClientSharingProfile | null>;
  createPost(data: {
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
    bodyFormat?: "plain" | "html";
    mediaId?: string | null;
    videoEmbedUrl?: string | null;
    status: "pending_review" | "published";
    publishedAt: Date | null;
  }): Promise<FeedPost>;
  findPostById(postId: string): Promise<FeedPost | null>;
  updatePostStatus(postId: string, status: "published" | "rejected" | "hidden"): Promise<void>;
  createModerationEvent(data: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
    action: "approve" | "reject" | "hide";
    reason?: string;
  }): Promise<FeedModerationEvent>;
  getPublishedPosts(orgId: string, limit?: number): Promise<FeedPost[]>;
  getClientDisplayName(clientId: string): Promise<string>;
  getClientContactEmail(clientId: string): Promise<string>;
  getClientPhone(clientId: string): Promise<string | null>;

  // Extensiones SPEC-15 (muro multi-comunidad, medios S3 con cuota, fijación, respuestas y retención)
  getClientPrivacySource?(clientId: string): Promise<{
    displayName: string;
    email: string;
    phone: string | null;
    address: string | null;
    socialLinks: Record<string, string>;
  } | null>;
  listPostsForOrganizations?(
    organizationIds: string[],
    includePendingForOrgIds: string[],
    authorClientId: string,
    limit: number,
  ): Promise<FeedPost[]>;
  upsertSharingProfile?(data: {
    clientId: string;
    sharePhone: boolean;
    shareEmail: boolean;
    shareAddress: boolean;
    shareSocialLinks: boolean;
    actorUserId: string;
  }): Promise<ClientSharingProfile>;
  listActiveMembershipsForClient?(
    clientId: string,
  ): Promise<Array<{ organizationId: string; organizationName: string; role: string }>>;
  getOrganizationRolesMap?(organizationIds: string[]): Promise<Map<string, string>>;

  verifyOwnedWallMedia?(clientId: string, mediaId: string): Promise<boolean>;
  uploadAndChargeWallImage?(params: {
    clientId: string;
    actorUserId: string;
    buffer: Buffer;
    mimeType: string;
    extension: string;
    originalFilename: string;
  }): Promise<UploadWallImageRepoResult>;
  releaseWallImageMedia?(
    clientId: string,
    mediaId: string,
    actorUserId: string,
  ): Promise<ReleaseWallImageRepoResult>;
  getAuthorizedWallMediaBinary?(
    clientId: string,
    mediaId: string,
  ): Promise<{ ok: true; data: AuthorizedWallMediaBinary } | { ok: false; code: "MEDIA_NOT_FOUND" | "FORBIDDEN" | "S3_READ_FAILED"; error: string }>;

  pinPostExclusive?(
    organizationId: string,
    postId: string,
    actorUserId: string,
  ): Promise<FeedPost | null>;
  unpinPost?(postId: string, actorUserId: string): Promise<FeedPost | null>;
  updatePostById?(
    postId: string,
    data: {
      body: string;
      bodyFormat: "plain" | "html";
      mediaId: string | null;
      videoEmbedUrl: string | null;
      status: "pending_review" | "published";
      publishedAt: Date | null;
      isPinned: boolean;
      pinnedAt: Date | null;
      pinnedByUserId: string | null;
      updatedBy: string;
    },
  ): Promise<FeedPost | null>;
  deletePostById?(postId: string): Promise<{ deleted: boolean; mediaId: string | null; authorClientId: string | null }>;

  createReply?(data: {
    postId: string;
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
  }): Promise<FeedPostReply>;
  listRepliesForPosts?(postIds: string[]): Promise<FeedPostReply[]>;

  getRetentionSettings?(): Promise<CommunityWallRetentionSettingsDto>;
  updateRetentionSettings?(
    feedRetentionDays: number | null,
    actorUserId: string,
  ): Promise<CommunityWallRetentionSettingsDto>;
  listExpiredPostsForPurge?(
    cutoffDate: Date,
  ): Promise<Array<{ id: string; authorClientId: string; mediaId: string | null }>>;
  recordRetentionPurgeStats?(purgedCount: number, executedAt: Date, actorUserId?: string): Promise<void>;
}

/**
 * Implementación Drizzle ORM sobre PostgreSQL (`Router Global`) + SeaweedFS S3 + cuota celular `storage_bytes` (`SPEC-15`).
 */
export class DrizzleCommunityFeedRepository implements ICommunityFeedRepository {
  constructor(
    private readonly dbProvider: () => any = () => getDb(),
    private readonly s3Storage: Pick<S3StorageService, "putObject" | "getObject" | "deleteObject"> = new S3StorageService(),
    private readonly cellTxRunner: typeof withTenantCellTransaction = withTenantCellTransaction,
  ) {}

  async findOrganizationMembership(
    orgId: string,
    clientId: string,
  ): Promise<{ role: string; status: string } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ role: organizationMembers.role, status: organizationMembers.status })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findOrganizationModerationMode(
    orgId: string,
  ): Promise<"pre" | "post" | "none" | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ moderationMode: organizations.moderationMode, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!row || row.status !== "active") return null;
    if (row.moderationMode === "post" || row.moderationMode === "none") {
      return row.moderationMode;
    }
    return "pre";
  }

  async getSharingProfile(clientId: string): Promise<ClientSharingProfile | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(clientSharingProfiles)
      .where(eq(clientSharingProfiles.clientId, clientId))
      .limit(1);
    return row ?? null;
  }

  async upsertSharingProfile(data: {
    clientId: string;
    sharePhone: boolean;
    shareEmail: boolean;
    shareAddress: boolean;
    shareSocialLinks: boolean;
    actorUserId: string;
  }): Promise<ClientSharingProfile> {
    const db = this.dbProvider();
    const now = new Date();
    const [row] = await db
      .insert(clientSharingProfiles)
      .values({
        clientId: data.clientId,
        sharePhone: data.sharePhone,
        shareEmail: data.shareEmail,
        shareAddress: data.shareAddress,
        shareSocialLinks: data.shareSocialLinks,
        createdBy: data.actorUserId,
        updatedBy: data.actorUserId,
      })
      .onConflictDoUpdate({
        target: [clientSharingProfiles.clientId],
        set: {
          sharePhone: data.sharePhone,
          shareEmail: data.shareEmail,
          shareAddress: data.shareAddress,
          shareSocialLinks: data.shareSocialLinks,
          updatedAt: now,
          updatedBy: data.actorUserId,
        },
      })
      .returning();
    return row;
  }

  async createPost(data: {
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
    bodyFormat?: "plain" | "html";
    mediaId?: string | null;
    videoEmbedUrl?: string | null;
    status: "pending_review" | "published";
    publishedAt: Date | null;
  }): Promise<FeedPost> {
    const db = this.dbProvider();
    const [created] = await db
      .insert(feedPosts)
      .values({
        organizationId: data.organizationId,
        authorClientId: data.authorClientId,
        authorUserId: data.authorUserId,
        body: data.body.trim(),
        bodyFormat: data.bodyFormat ?? "plain",
        mediaId: data.mediaId ?? null,
        videoEmbedUrl: data.videoEmbedUrl ?? null,
        isPinned: false,
        status: data.status,
        publishedAt: data.publishedAt,
        createdBy: data.authorUserId,
        updatedBy: data.authorUserId,
      })
      .returning();
    return created;
  }

  async findPostById(postId: string): Promise<FeedPost | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(feedPosts)
      .where(eq(feedPosts.id, postId))
      .limit(1);
    return row ?? null;
  }

  async updatePostStatus(
    postId: string,
    status: "published" | "rejected" | "hidden",
  ): Promise<void> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .update(feedPosts)
      .set({
        status,
        ...(status === "published" ? { publishedAt: now } : {}),
        ...(status === "rejected" || status === "hidden" ? { isPinned: false, pinnedAt: null, pinnedByUserId: null } : {}),
        updatedAt: now,
      })
      .where(eq(feedPosts.id, postId));
  }

  async createModerationEvent(data: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
    action: "approve" | "reject" | "hide";
    reason?: string;
  }): Promise<FeedModerationEvent> {
    const db = this.dbProvider();
    const [created] = await db
      .insert(feedModerationEvents)
      .values({
        postId: data.postId,
        actorClientId: data.actorClientId,
        actorUserId: data.actorUserId,
        action: data.action,
        reason: data.reason?.trim() || null,
      })
      .returning();
    return created;
  }

  async getPublishedPosts(orgId: string, limit: number = 50): Promise<FeedPost[]> {
    const db = this.dbProvider();
    return db
      .select()
      .from(feedPosts)
      .where(and(eq(feedPosts.organizationId, orgId), eq(feedPosts.status, "published")))
      .orderBy(
        desc(feedPosts.isPinned),
        desc(sql`COALESCE(${feedPosts.publishedAt}, ${feedPosts.createdAt})`),
        desc(feedPosts.createdAt),
      )
      .limit(limit);
  }

  async listPostsForOrganizations(
    organizationIds: string[],
    includePendingForOrgIds: string[],
    authorClientId: string,
    limit: number,
  ): Promise<FeedPost[]> {
    if (organizationIds.length === 0) return [];
    const db = this.dbProvider();
    const rows: FeedPost[] = await db
      .select()
      .from(feedPosts)
      .where(inArray(feedPosts.organizationId, organizationIds))
      .orderBy(
        desc(feedPosts.isPinned),
        desc(sql`COALESCE(${feedPosts.publishedAt}, ${feedPosts.createdAt})`),
        desc(feedPosts.createdAt),
      )
      .limit(limit * 2);

    const moderatorOrgSet = new Set(includePendingForOrgIds);
    return rows
      .filter((p) => {
        if (p.status === "published") return true;
        if (p.status === "pending_review") {
          return moderatorOrgSet.has(p.organizationId) || p.authorClientId === authorClientId;
        }
        return false;
      })
      .slice(0, limit);
  }

  async listActiveMembershipsForClient(
    clientId: string,
  ): Promise<Array<{ organizationId: string; organizationName: string; role: string }>> {
    const db = this.dbProvider();
    const rows = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        organizationName: organizations.name,
        orgStatus: organizations.status,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(
        and(
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
        ),
      );
    return rows
      .filter((r: any) => r.orgStatus === "active")
      .map((r: any) => ({
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        role: r.role,
      }));
  }

  async getOrganizationRolesMap(organizationIds: string[]): Promise<Map<string, string>> {
    if (organizationIds.length === 0) return new Map();
    const db = this.dbProvider();
    const rows = await db
      .select({
        organizationId: organizationMembers.organizationId,
        clientId: organizationMembers.clientId,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .where(
        and(
          inArray(organizationMembers.organizationId, organizationIds),
          eq(organizationMembers.status, "active"),
        ),
      );
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(`${r.organizationId}:${r.clientId}`, r.role);
    }
    return map;
  }

  async getClientPrivacySource(clientId: string) {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        displayName: clients.displayName,
        contactEmail: clients.contactEmail,
        commercialEmail: clients.commercialEmail,
        phone: clients.phone,
        addressLine: clients.addressLine,
        city: clients.city,
        country: clients.country,
        socialLinks: clients.socialLinks,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!row) return null;
    const addressParts = [row.addressLine, row.city, row.country].filter(Boolean);
    return {
      displayName: row.displayName,
      email: row.commercialEmail || row.contactEmail,
      phone: row.phone ?? null,
      address: addressParts.length > 0 ? addressParts.join(", ") : null,
      socialLinks: (row.socialLinks as Record<string, string>) || {},
    };
  }

  async getClientDisplayName(clientId: string): Promise<string> {
    const src = await this.getClientPrivacySource(clientId);
    return src?.displayName || "Comercio";
  }

  async getClientContactEmail(clientId: string): Promise<string> {
    const src = await this.getClientPrivacySource(clientId);
    return src?.email || "";
  }

  async getClientPhone(clientId: string): Promise<string | null> {
    const src = await this.getClientPrivacySource(clientId);
    return src?.phone ?? null;
  }

  private async getClientStorageQuota(
    clientId: string,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const db = this.dbProvider();
    const now = new Date();
    const [override] = await db
      .select({ value: clientPlanOverrides.value })
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          eq(clientPlanOverrides.dimension, "storage_bytes"),
          lte(clientPlanOverrides.validFrom, now),
          or(isNull(clientPlanOverrides.validTo), gt(clientPlanOverrides.validTo, now)),
        ),
      )
      .limit(1);

    if (override) {
      return {
        mode: "LIMITED",
        value: override.value !== null ? Number(override.value) : null,
      };
    }

    const [limitRow] = await db
      .select({ mode: planLimits.mode, value: planLimits.value })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id))
      .innerJoin(
        planLimits,
        and(eq(planLimits.planId, plans.id), eq(planLimits.dimension, "storage_bytes")),
      )
      .where(eq(clients.id, clientId))
      .limit(1);

    if (limitRow) {
      return {
        mode: limitRow.mode as "LIMITED" | "UNLIMITED",
        value: limitRow.value !== null ? Number(limitRow.value) : null,
      };
    }

    return { mode: "UNLIMITED", value: null };
  }

  async verifyOwnedWallMedia(clientId: string, mediaId: string): Promise<boolean> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ storagePoolId: mediaCatalog.storagePoolId })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.id, mediaId))
      .limit(1);
    if (!row) return false;
    return row.storagePoolId.startsWith(`tenant-wall:${clientId}:`);
  }

  async uploadAndChargeWallImage(params: {
    clientId: string;
    actorUserId: string;
    buffer: Buffer;
    mimeType: string;
    extension: string;
    originalFilename: string;
  }): Promise<UploadWallImageRepoResult> {
    const sizeBytes = params.buffer.byteLength;
    const quota = await this.getClientStorageQuota(params.clientId);

    // 1. Verificar consumo actual de storage_bytes en la celda del comercio
    let currentUsed = 0;
    try {
      currentUsed = await this.cellTxRunner(params.clientId, async (tx) => {
        const [usage] = await tx
          .select({ usedValue: cellClientUsage.usedValue })
          .from(cellClientUsage)
          .where(
            and(
              eq(cellClientUsage.clientId, params.clientId),
              eq(cellClientUsage.dimension, "storage_bytes"),
            ),
          )
          .limit(1);
        return usage?.usedValue !== undefined ? Number(usage.usedValue) : 0;
      });
    } catch (error: unknown) {
      if (error instanceof CellPoolError || (error instanceof Error && error.name === "CellPoolError")) {
        appLogger.warn("[CommunityFeed] Celda no disponible al verificar cuota storage_bytes", {
          clientId: params.clientId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ok: false,
          code: "CELL_UNAVAILABLE",
          error: "El almacenamiento de tu comercio no está disponible temporalmente. Intenta de nuevo en unos momentos.",
        };
      }
      throw error;
    }

    if (quota.mode === "LIMITED") {
      const limitValue = quota.value ?? 0;
      if (limitValue === 0 || currentUsed + sizeBytes > limitValue) {
        return {
          ok: false,
          code: "STORAGE_QUOTA_EXCEEDED",
          error: "No tienes capacidad de almacenamiento disponible en tu plan para subir esta imagen.",
        };
      }
    }

    // 2. Subir binario a SeaweedFS bajo prefijo aislado del comercio autor
    const mediaUuid = randomUUID();
    const contentHash = createHash("sha256").update(params.buffer).digest("hex");
    const storageKey = `tenants/${params.clientId}/community-posts/${mediaUuid}.${params.extension}`;
    const storagePoolId = `tenant-wall:${params.clientId}:${mediaUuid}`;

    try {
      const putRes = await this.s3Storage.putObject(storageKey, params.buffer, params.mimeType);
      if (!putRes.ok) {
        appLogger.warn("[CommunityFeed] Fallo subiendo imagen del muro a SeaweedFS", {
          clientId: params.clientId,
          storageKey,
          error: putRes.error,
        });
        return {
          ok: false,
          code: "S3_UPLOAD_FAILED",
          error: "No se pudo almacenar la imagen en este momento. Intenta nuevamente.",
        };
      }
    } catch (s3Err: unknown) {
      appLogger.error("[CommunityFeed] Error subiendo imagen del muro a SeaweedFS", s3Err, {
        clientId: params.clientId,
        storageKey,
      });
      return {
        ok: false,
        code: "S3_UPLOAD_FAILED",
        error: "No se pudo almacenar la imagen en este momento. Intenta nuevamente.",
      };
    }

    const db = this.dbProvider();
    let insertedMediaId: string | null = null;
    try {
      const [inserted] = await db
        .insert(mediaCatalog)
        .values({
          contentHash,
          storagePoolId,
          storageKey,
          sizeBytes,
          mediaKind: "image",
          mimeType: params.mimeType,
          sourceFormat: params.extension,
          originalFilename: params.originalFilename,
          processingStatus: "ready",
          storageType: "internal",
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        })
        .returning({ id: mediaCatalog.id });
      insertedMediaId = inserted.id;

      // 3. Registrar vínculo y sumar consumo storage_bytes en la celda del inquilino
      await this.cellTxRunner(params.clientId, async (tx) => {
        await tx.insert(cellClientMedia).values({
          clientId: params.clientId,
          mediaId: inserted.id,
          sizeBytes,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        });

        await tx
          .insert(cellClientUsage)
          .values({
            clientId: params.clientId,
            dimension: "storage_bytes",
            usedValue: sizeBytes,
            createdBy: params.actorUserId,
            updatedBy: params.actorUserId,
          })
          .onConflictDoUpdate({
            target: [cellClientUsage.clientId, cellClientUsage.dimension],
            set: {
              usedValue: sql`${cellClientUsage.usedValue} + ${sizeBytes}`,
              updatedAt: new Date(),
              updatedBy: params.actorUserId,
            },
          });
      });

      return {
        ok: true,
        data: {
          mediaId: inserted.id,
          imageUrl: `/api/tenant/community/posts/media/${inserted.id}`,
          sizeBytes,
          mimeType: params.mimeType,
        },
      };
    } catch (errPersist: unknown) {
      // Rollback best-effort si falló la transacción en celda tras subir a S3
      if (insertedMediaId) {
        await db.delete(mediaCatalog).where(eq(mediaCatalog.id, insertedMediaId)).catch(() => {});
      }
      await this.s3Storage.deleteObject(storageKey).catch(() => {});

      if (errPersist instanceof CellPoolError || (errPersist instanceof Error && errPersist.name === "CellPoolError")) {
        return {
          ok: false,
          code: "CELL_UNAVAILABLE",
          error: "El almacenamiento de tu comercio no está disponible temporalmente. Intenta de nuevo en unos momentos.",
        };
      }
      throw errPersist;
    }
  }

  async releaseWallImageMedia(
    clientId: string,
    mediaId: string,
    actorUserId: string,
  ): Promise<ReleaseWallImageRepoResult> {
    const db = this.dbProvider();
    const [refRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedPosts)
      .where(eq(feedPosts.mediaId, mediaId));
    if ((refRow?.count ?? 0) > 0) {
      return { released: false, freedBytes: 0 };
    }

    const [cat] = await db
      .select({
        id: mediaCatalog.id,
        storageKey: mediaCatalog.storageKey,
        storagePoolId: mediaCatalog.storagePoolId,
        sizeBytes: mediaCatalog.sizeBytes,
      })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.id, mediaId))
      .limit(1);

    if (!cat) {
      return { released: false, freedBytes: 0 };
    }

    let freedBytes = 0;
    try {
      freedBytes = await this.cellTxRunner(clientId, async (tx) => {
        const [deletedLink] = await tx
          .delete(cellClientMedia)
          .where(and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, mediaId)))
          .returning({ sizeBytes: cellClientMedia.sizeBytes });

        if (!deletedLink) return 0;

        await tx
          .update(cellClientUsage)
          .set({
            usedValue: sql`GREATEST(0, ${cellClientUsage.usedValue} - ${deletedLink.sizeBytes})`,
            updatedAt: new Date(),
            updatedBy: actorUserId,
          })
          .where(
            and(
              eq(cellClientUsage.clientId, clientId),
              eq(cellClientUsage.dimension, "storage_bytes"),
            ),
          );
        return Number(deletedLink.sizeBytes ?? 0);
      });
    } catch (error: unknown) {
      if (error instanceof CellPoolError || (error instanceof Error && error.name === "CellPoolError")) {
        appLogger.warn("[CommunityFeed] Celda no disponible al liberar cuota storage_bytes del muro", {
          clientId,
          mediaId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { released: false, freedBytes: 0, cellUnavailable: true };
      }
      throw error;
    }

    await db.delete(mediaCatalog).where(eq(mediaCatalog.id, mediaId));
    await this.s3Storage.deleteObject(cat.storageKey).catch((s3Err: unknown) => {
      appLogger.warn("[CommunityFeed] Fallo no bloqueante eliminando objeto S3 huérfano del muro", {
        clientId,
        mediaId,
        storageKey: cat.storageKey,
        error: s3Err instanceof Error ? s3Err.message : String(s3Err),
      });
    });

    return { released: true, freedBytes };
  }

  async getAuthorizedWallMediaBinary(
    clientId: string,
    mediaId: string,
  ): Promise<{ ok: true; data: AuthorizedWallMediaBinary } | { ok: false; code: "MEDIA_NOT_FOUND" | "FORBIDDEN" | "S3_READ_FAILED"; error: string }> {
    const db = this.dbProvider();
    const [cat] = await db
      .select({
        id: mediaCatalog.id,
        storagePoolId: mediaCatalog.storagePoolId,
        storageKey: mediaCatalog.storageKey,
        mimeType: mediaCatalog.mimeType,
      })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.id, mediaId))
      .limit(1);

    if (!cat) {
      return { ok: false, code: "MEDIA_NOT_FOUND", error: "Imagen no encontrada." };
    }

    let authorized = cat.storagePoolId.startsWith(`tenant-wall:${clientId}:`);
    if (!authorized) {
      const postsWithMedia = await db
        .select({
          organizationId: feedPosts.organizationId,
          authorClientId: feedPosts.authorClientId,
          status: feedPosts.status,
        })
        .from(feedPosts)
        .where(eq(feedPosts.mediaId, mediaId));

      if (postsWithMedia.length > 0) {
        const orgIds = postsWithMedia.map((p: { organizationId: string }) => p.organizationId);
        const memberships = await db
          .select({
            organizationId: organizationMembers.organizationId,
            role: organizationMembers.role,
          })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.clientId, clientId),
              inArray(organizationMembers.organizationId, orgIds),
              eq(organizationMembers.status, "active"),
            ),
          );

        const roleByOrg = new Map<string, string>(
          memberships.map((m: { organizationId: string; role: string }) => [m.organizationId, m.role]),
        );

        authorized = postsWithMedia.some(
          (p: { organizationId: string; authorClientId: string; status: string }) => {
            const role = roleByOrg.get(p.organizationId);
            if (!role) return false;
            if (p.status === "published") return true;
            if (p.status === "pending_review") {
              return p.authorClientId === clientId || role === "originator" || role === "co_leader";
            }
            return false;
          },
        );
      }
    }

    if (!authorized) {
      return { ok: false, code: "FORBIDDEN", error: "No tienes acceso a esta imagen de comunidad." };
    }

    try {
      const s3Res = await this.s3Storage.getObject(cat.storageKey);
      if (!s3Res.ok) {
        return {
          ok: false,
          code: s3Res.status === 404 ? "MEDIA_NOT_FOUND" : "S3_READ_FAILED",
          error: "No se pudo leer la imagen solicitada.",
        };
      }
      return {
        ok: true,
        data: {
          buffer: s3Res.buffer,
          mimeType: cat.mimeType || s3Res.contentType || "image/jpeg",
        },
      };
    } catch (error: unknown) {
      appLogger.error("[CommunityFeed] Error leyendo imagen del muro desde SeaweedFS", error, {
        mediaId,
        storageKey: cat.storageKey,
      });
      return { ok: false, code: "S3_READ_FAILED", error: "No se pudo leer la imagen solicitada." };
    }
  }

  async pinPostExclusive(
    organizationId: string,
    postId: string,
    actorUserId: string,
  ): Promise<FeedPost | null> {
    const db = this.dbProvider();
    const now = new Date();
    return await db.transaction(async (tx: any) => {
      await tx
        .update(feedPosts)
        .set({
          isPinned: false,
          pinnedAt: null,
          pinnedByUserId: null,
          updatedAt: now,
          updatedBy: actorUserId,
        })
        .where(and(eq(feedPosts.organizationId, organizationId), eq(feedPosts.isPinned, true)));

      const [pinned] = await tx
        .update(feedPosts)
        .set({
          isPinned: true,
          pinnedAt: now,
          pinnedByUserId: actorUserId,
          updatedAt: now,
          updatedBy: actorUserId,
        })
        .where(eq(feedPosts.id, postId))
        .returning();

      return pinned ?? null;
    });
  }

  async unpinPost(postId: string, actorUserId: string): Promise<FeedPost | null> {
    const db = this.dbProvider();
    const now = new Date();
    const [unpinned] = await db
      .update(feedPosts)
      .set({
        isPinned: false,
        pinnedAt: null,
        pinnedByUserId: null,
        updatedAt: now,
        updatedBy: actorUserId,
      })
      .where(eq(feedPosts.id, postId))
      .returning();
    return unpinned ?? null;
  }

  async updatePostById(
    postId: string,
    data: {
      body: string;
      bodyFormat: "plain" | "html";
      mediaId: string | null;
      videoEmbedUrl: string | null;
      status: "pending_review" | "published";
      publishedAt: Date | null;
      isPinned: boolean;
      pinnedAt: Date | null;
      pinnedByUserId: string | null;
      updatedBy: string;
    },
  ): Promise<FeedPost | null> {
    const db = this.dbProvider();
    const [updated] = await db
      .update(feedPosts)
      .set({
        body: data.body,
        bodyFormat: data.bodyFormat,
        mediaId: data.mediaId,
        videoEmbedUrl: data.videoEmbedUrl,
        status: data.status,
        publishedAt: data.publishedAt,
        isPinned: data.isPinned,
        pinnedAt: data.pinnedAt,
        pinnedByUserId: data.pinnedByUserId,
        updatedAt: new Date(),
        updatedBy: data.updatedBy,
      })
      .where(eq(feedPosts.id, postId))
      .returning();
    return updated ?? null;
  }

  async deletePostById(
    postId: string,
  ): Promise<{ deleted: boolean; mediaId: string | null; authorClientId: string | null }> {
    const db = this.dbProvider();
    const [deleted] = await db
      .delete(feedPosts)
      .where(eq(feedPosts.id, postId))
      .returning({
        id: feedPosts.id,
        mediaId: feedPosts.mediaId,
        authorClientId: feedPosts.authorClientId,
      });

    if (!deleted) {
      return { deleted: false, mediaId: null, authorClientId: null };
    }

    return {
      deleted: true,
      mediaId: deleted.mediaId ?? null,
      authorClientId: deleted.authorClientId ?? null,
    };
  }

  async createReply(data: {
    postId: string;
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
  }): Promise<FeedPostReply> {
    const db = this.dbProvider();
    const [created] = await db
      .insert(feedPostReplies)
      .values({
        postId: data.postId,
        organizationId: data.organizationId,
        authorClientId: data.authorClientId,
        authorUserId: data.authorUserId,
        body: data.body.trim(),
        createdBy: data.authorUserId,
        updatedBy: data.authorUserId,
      })
      .returning();
    return created;
  }

  async listRepliesForPosts(postIds: string[]): Promise<FeedPostReply[]> {
    if (postIds.length === 0) return [];
    const db = this.dbProvider();
    return db
      .select()
      .from(feedPostReplies)
      .where(inArray(feedPostReplies.postId, postIds))
      .orderBy(asc(feedPostReplies.createdAt));
  }

  async getRetentionSettings(): Promise<CommunityWallRetentionSettingsDto> {
    const db = this.dbProvider();
    const [row] = await db
      .select()
      .from(communityPlatformSettings)
      .where(eq(communityPlatformSettings.id, "default"))
      .limit(1);

    const feedRetentionDays = row ? (row.feedRetentionDays ?? null) : DEFAULT_FEED_RETENTION_DAYS;
    let eligibleToPurgeCount = 0;

    if (feedRetentionDays !== null && feedRetentionDays >= 1) {
      const cutoffDate = new Date(Date.now() - feedRetentionDays * 86_400_000);
      const [cnt] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(feedPosts)
        .where(lt(feedPosts.createdAt, cutoffDate));
      eligibleToPurgeCount = cnt?.count ?? 0;
    }

    return {
      feedRetentionDays,
      lastRetentionPurgeAt: row?.lastRetentionPurgeAt ? row.lastRetentionPurgeAt.toISOString() : null,
      lastRetentionPurgedCount: row?.lastRetentionPurgedCount ?? 0,
      eligibleToPurgeCount,
    };
  }

  async updateRetentionSettings(
    feedRetentionDays: number | null,
    actorUserId: string,
  ): Promise<CommunityWallRetentionSettingsDto> {
    const db = this.dbProvider();
    const now = new Date();
    await db
      .insert(communityPlatformSettings)
      .values({
        id: "default",
        feedRetentionDays,
        updatedAt: now,
        updatedByUserId: actorUserId,
      })
      .onConflictDoUpdate({
        target: [communityPlatformSettings.id],
        set: {
          feedRetentionDays,
          updatedAt: now,
          updatedByUserId: actorUserId,
        },
      });
    return this.getRetentionSettings();
  }

  async listExpiredPostsForPurge(
    cutoffDate: Date,
  ): Promise<Array<{ id: string; authorClientId: string; mediaId: string | null }>> {
    const db = this.dbProvider();
    const rows = await db
      .select({
        id: feedPosts.id,
        authorClientId: feedPosts.authorClientId,
        mediaId: feedPosts.mediaId,
      })
      .from(feedPosts)
      .where(lt(feedPosts.createdAt, cutoffDate))
      .orderBy(asc(feedPosts.createdAt));

    return rows.map((r: { id: string; authorClientId: string; mediaId: string | null }) => ({
      id: r.id,
      authorClientId: r.authorClientId,
      mediaId: r.mediaId ?? null,
    }));
  }

  async recordRetentionPurgeStats(
    purgedCount: number,
    executedAt: Date,
    actorUserId?: string,
  ): Promise<void> {
    const db = this.dbProvider();
    await db
      .insert(communityPlatformSettings)
      .values({
        id: "default",
        feedRetentionDays: DEFAULT_FEED_RETENTION_DAYS,
        lastRetentionPurgeAt: executedAt,
        lastRetentionPurgedCount: purgedCount,
        updatedAt: executedAt,
        updatedByUserId: actorUserId ?? null,
      })
      .onConflictDoUpdate({
        target: [communityPlatformSettings.id],
        set: {
          lastRetentionPurgeAt: executedAt,
          lastRetentionPurgedCount: purgedCount,
          updatedAt: executedAt,
          ...(actorUserId ? { updatedByUserId: actorUserId } : {}),
        },
      });
  }
}

/**
 * Servicio de muro de comunidad enriquecido, imágenes con cuota, fijación, respuestas y retención (`SPEC-15`).
 */
export class CommunityFeedService {
  constructor(private readonly repo: ICommunityFeedRepository) {}

  /**
   * Carga 1 imagen destacada (`JPEG`/`PNG`/`WebP`, máx. 5 MB) hacia SeaweedFS descontando cuota `storage_bytes` del autor.
   */
  async uploadWallImage(params: {
    clientId: string;
    actorUserId: string;
    buffer: Buffer;
    mimeType: string;
    originalFilename: string;
  }): Promise<Result<WallMediaUploadDto>> {
    try {
      if (params.buffer.byteLength === 0) {
        return err("El archivo de imagen está vacío.", "EMPTY_FILE");
      }
      if (params.buffer.byteLength > MAX_WALL_IMAGE_BYTES) {
        return err("La imagen supera el peso máximo permitido de 5 MB.", "FILE_TOO_LARGE");
      }

      const magic = validateMediaMagicBytes(params.buffer);
      if (!magic.valid || magic.mediaKind !== "image" || !magic.detectedMime || !magic.ext) {
        return err(
          "Formato no admitido. Sube una imagen válida en formato JPG, PNG o WebP.",
          "INVALID_IMAGE_FORMAT",
        );
      }

      if (!this.repo.uploadAndChargeWallImage) {
        return err("Repositorio no soporta carga de imágenes para el muro.", "NOT_SUPPORTED");
      }

      const uploaded = await this.repo.uploadAndChargeWallImage({
        clientId: params.clientId,
        actorUserId: params.actorUserId,
        buffer: params.buffer,
        mimeType: magic.detectedMime,
        extension: magic.ext,
        originalFilename: params.originalFilename,
      });

      if (!uploaded.ok) {
        return err(uploaded.error, uploaded.code);
      }

      return ok(uploaded.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed.uploadWallImage] Error: ${msg}`, error);
      return err(msg, "UPLOAD_WALL_IMAGE_ERROR");
    }
  }

  /**
   * Descarta una imagen aún no publicada devolviendo su espacio `storage_bytes` al comercio autor.
   */
  async discardUnattachedWallMedia(params: {
    clientId: string;
    mediaId: string;
    actorUserId: string;
  }): Promise<Result<{ released: boolean; freedBytes: number }>> {
    try {
      if (!this.repo.verifyOwnedWallMedia || !this.repo.releaseWallImageMedia) {
        return err("Repositorio no soporta liberación de medios.", "NOT_SUPPORTED");
      }
      const isOwned = await this.repo.verifyOwnedWallMedia(params.clientId, params.mediaId);
      if (!isOwned) {
        return err("No tienes permisos sobre esta imagen.", "FORBIDDEN");
      }
      const res = await this.repo.releaseWallImageMedia(
        params.clientId,
        params.mediaId,
        params.actorUserId,
      );
      if (res.cellUnavailable) {
        return err(
          "El almacenamiento del comercio no está disponible temporalmente.",
          "CELL_UNAVAILABLE",
        );
      }
      return ok({ released: res.released, freedBytes: res.freedBytes });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "DISCARD_WALL_MEDIA_ERROR");
    }
  }

  /**
   * Obtiene los bytes binarios de una imagen del muro verificando membresía activa en la comunidad.
   */
  async getAuthorizedWallMediaBinary(params: {
    clientId: string;
    mediaId: string;
  }): Promise<Result<AuthorizedWallMediaBinary>> {
    try {
      if (!this.repo.getAuthorizedWallMediaBinary) {
        return err("Repositorio no soporta lectura de medios.", "NOT_SUPPORTED");
      }
      const res = await this.repo.getAuthorizedWallMediaBinary(params.clientId, params.mediaId);
      if (!res.ok) {
        return err(res.error, res.code);
      }
      return ok(res.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "READ_WALL_MEDIA_ERROR");
    }
  }

  /**
   * Valida, sanitiza y normaliza cuerpo enriquecido, video embebido y multimedia adjunta para creación o edición (`SPEC-15-D11`, `D14`).
   */
  private async validateAndSanitizePostContent(params: {
    authorClientId: string;
    body: string;
    bodyFormat?: "plain" | "html";
    mediaId?: string | null;
    videoUrl?: string | null;
    verifyMediaOwnership?: boolean;
  }): Promise<
    Result<{
      requestedFormat: "plain" | "html";
      sanitizedBody: string;
      cleanMediaId: string | null;
      normalizedVideoEmbedUrl: string | null;
    }>
  > {
    const requestedFormat = params.bodyFormat === "html" ? "html" : "plain";
    const sanitizedBody =
      requestedFormat === "html"
        ? sanitizeCommunityPostHtml(params.body)
        : params.body.trim();
    const plainText =
      requestedFormat === "html"
        ? extractPlainTextFromCommunityHtml(sanitizedBody)
        : sanitizedBody;

    let normalizedVideoEmbedUrl: string | null = null;
    if (params.videoUrl && params.videoUrl.trim().length > 0) {
      const videoRes = resolveSafeVideoEmbedUrl(params.videoUrl);
      if (!videoRes.ok) {
        return err(videoRes.error, "INVALID_VIDEO_URL");
      }
      normalizedVideoEmbedUrl = videoRes.embedUrl;
    }

    const cleanMediaId = params.mediaId?.trim() || null;
    if (
      cleanMediaId &&
      params.verifyMediaOwnership !== false &&
      this.repo.verifyOwnedWallMedia
    ) {
      const owned = await this.repo.verifyOwnedWallMedia(params.authorClientId, cleanMediaId);
      if (!owned) {
        return err(
          "La imagen adjunta no pertenece al comercio autor o ya no existe.",
          "INVALID_WALL_MEDIA",
        );
      }
    }

    if (plainText.length < 2 && !cleanMediaId && !normalizedVideoEmbedUrl) {
      return err(
        "Escribe un mensaje o adjunta una imagen o video para compartir en el muro.",
        "VALIDATION_ERROR",
      );
    }
    if (plainText.length > 4000) {
      return err("La publicación excede el límite de 4000 caracteres.", "VALIDATION_ERROR");
    }

    return ok({
      requestedFormat,
      sanitizedBody,
      cleanMediaId,
      normalizedVideoEmbedUrl,
    });
  }

  /**
   * Publica un mensaje en el muro de la comunidad respetando moderación, sanitización HTML, video embed y mediaId (`SPEC-15-D11`).
   */
  async createPost(params: {
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
    bodyFormat?: "plain" | "html";
    mediaId?: string | null;
    videoUrl?: string | null;
  }): Promise<Result<{ postId: string; status: string }>> {
    try {
      const membership = await this.repo.findOrganizationMembership(
        params.organizationId,
        params.authorClientId,
      );

      if (!membership || membership.status !== "active") {
        return err(
          "El autor debe ser miembro activo de la comunidad para publicar en el feed.",
          "UNAUTHORIZED_COMMUNITY_MEMBER",
        );
      }

      const mode = await this.repo.findOrganizationModerationMode(params.organizationId);
      if (!mode) {
        return err("Organización no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      const contentRes = await this.validateAndSanitizePostContent({
        authorClientId: params.authorClientId,
        body: params.body,
        bodyFormat: params.bodyFormat,
        mediaId: params.mediaId,
        videoUrl: params.videoUrl,
      });
      if (!contentRes.ok) {
        return contentRes;
      }
      const { requestedFormat, sanitizedBody, cleanMediaId, normalizedVideoEmbedUrl } =
        contentRes.data;

      const isModerator = membership.role === "originator" || membership.role === "co_leader";
      const isPublishedImmediately =
        mode === "none" ||
        mode === "post" ||
        (mode === "pre" && isModerator && this.repo.listPostsForOrganizations !== undefined);
      const status = isPublishedImmediately ? "published" : "pending_review";
      const publishedAt = isPublishedImmediately ? new Date() : null;

      const post = await this.repo.createPost({
        organizationId: params.organizationId,
        authorClientId: params.authorClientId,
        authorUserId: params.authorUserId,
        body: sanitizedBody,
        bodyFormat: requestedFormat,
        mediaId: cleanMediaId,
        videoEmbedUrl: normalizedVideoEmbedUrl,
        status,
        publishedAt,
      });

      appLogger.info("[CommunityFeed] Publicación creada en el feed", {
        postId: post.id,
        organizationId: params.organizationId,
        status,
        mode,
        hasMedia: Boolean(cleanMediaId),
        hasVideo: Boolean(normalizedVideoEmbedUrl),
      });

      return ok({ postId: post.id, status });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al crear publicación en feed: ${msg}`, error);
      return err(msg, "CREATE_POST_ERROR");
    }
  }

  /**
   * Edita una publicación existente del muro exclusiva para su autor (`SPEC-15-D11`, `SPEC-15-D14`).
   * Si se reemplaza o retira la imagen destacada, libera los bytes de la imagen anterior en SeaweedFS y `storage_bytes`.
   */
  async updatePost(params: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
    body: string;
    bodyFormat?: "plain" | "html";
    mediaId?: string | null;
    videoUrl?: string | null;
  }): Promise<Result<{ postId: string; status: string; freedBytes: number }>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      if (post.authorClientId !== params.actorClientId) {
        return err(
          "Solo el comercio autor puede editar su publicación del muro.",
          "FORBIDDEN_AUTHOR_ONLY",
        );
      }

      if (!this.repo.updatePostById) {
        return err("Repositorio no soporta edición de publicaciones.", "NOT_SUPPORTED");
      }

      const membership = await this.repo.findOrganizationMembership(
        post.organizationId,
        params.actorClientId,
      );
      if (!membership || membership.status !== "active") {
        return err(
          "El autor debe ser miembro activo de la comunidad para editar su publicación.",
          "UNAUTHORIZED_COMMUNITY_MEMBER",
        );
      }

      const mode = await this.repo.findOrganizationModerationMode(post.organizationId);
      if (!mode) {
        return err("Organización no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      const nextMediaCandidate =
        params.mediaId === undefined ? (post.mediaId ?? null) : (params.mediaId?.trim() || null);
      const isNewMedia = Boolean(nextMediaCandidate && nextMediaCandidate !== post.mediaId);

      const contentRes = await this.validateAndSanitizePostContent({
        authorClientId: params.actorClientId,
        body: params.body,
        bodyFormat: params.bodyFormat,
        mediaId: nextMediaCandidate,
        videoUrl: params.videoUrl,
        verifyMediaOwnership: isNewMedia,
      });
      if (!contentRes.ok) {
        return contentRes;
      }
      const { requestedFormat, sanitizedBody, cleanMediaId, normalizedVideoEmbedUrl } =
        contentRes.data;

      const isModerator = membership.role === "originator" || membership.role === "co_leader";
      const requiresPreReview = mode === "pre" && !isModerator;

      const status: "pending_review" | "published" = requiresPreReview
        ? "pending_review"
        : "published";
      const publishedAt = requiresPreReview ? null : (post.publishedAt ?? new Date());
      const isPinned = requiresPreReview ? false : Boolean(post.isPinned);
      const pinnedAt = isPinned ? (post.pinnedAt ?? null) : null;
      const pinnedByUserId = isPinned ? (post.pinnedByUserId ?? null) : null;

      const previousMediaId = post.mediaId ?? null;
      const updated = await this.repo.updatePostById(post.id, {
        body: sanitizedBody,
        bodyFormat: requestedFormat,
        mediaId: cleanMediaId,
        videoEmbedUrl: normalizedVideoEmbedUrl,
        status,
        publishedAt,
        isPinned,
        pinnedAt,
        pinnedByUserId,
        updatedBy: params.actorUserId,
      });

      if (!updated) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      let freedBytes = 0;
      if (
        previousMediaId &&
        previousMediaId !== cleanMediaId &&
        this.repo.releaseWallImageMedia
      ) {
        const releaseRes = await this.repo.releaseWallImageMedia(
          post.authorClientId,
          previousMediaId,
          params.actorUserId,
        );
        freedBytes = releaseRes.freedBytes;
      }

      appLogger.info("[CommunityFeed] Publicación editada por el autor", {
        postId: post.id,
        organizationId: post.organizationId,
        status,
        freedBytes,
        hasMedia: Boolean(cleanMediaId),
        hasVideo: Boolean(normalizedVideoEmbedUrl),
      });

      return ok({ postId: post.id, status, freedBytes });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al editar publicación en feed: ${msg}`, error);
      return err(msg, "UPDATE_POST_ERROR");
    }
  }

  /**
   * Fija una publicación publicada en primer lugar dentro de su comunidad, reemplazando cualquier fijación previa (`SPEC-15-D12`).
   */
  async pinPost(params: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
  }): Promise<Result<{ postId: string; isPinned: boolean }>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      const membership = await this.repo.findOrganizationMembership(
        post.organizationId,
        params.actorClientId,
      );
      if (!membership || !["originator", "co_leader"].includes(membership.role)) {
        return err(
          "Solo el líder originador o co-líderes pueden fijar publicaciones en esta comunidad.",
          "UNAUTHORIZED_MODERATOR_ONLY",
        );
      }

      if (post.status !== "published") {
        return err(
          "Solo se pueden fijar publicaciones aprobadas y visibles en el muro.",
          "POST_NOT_PUBLISHED",
        );
      }

      if (!this.repo.pinPostExclusive) {
        return err("Repositorio no soporta fijación de publicaciones.", "NOT_SUPPORTED");
      }

      const updated = await this.repo.pinPostExclusive(
        post.organizationId,
        post.id,
        params.actorUserId,
      );
      if (!updated) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      appLogger.info("[CommunityFeed] Publicación fijada en el muro", {
        postId: post.id,
        organizationId: post.organizationId,
        actorClientId: params.actorClientId,
      });

      return ok({ postId: post.id, isPinned: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "PIN_POST_ERROR");
    }
  }

  /**
   * Retira la fijación de una publicación del muro (`SPEC-15-D12`).
   */
  async unpinPost(params: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
  }): Promise<Result<{ postId: string; isPinned: boolean }>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      const membership = await this.repo.findOrganizationMembership(
        post.organizationId,
        params.actorClientId,
      );
      if (!membership || !["originator", "co_leader"].includes(membership.role)) {
        return err(
          "Solo el líder originador o co-líderes pueden desfijar publicaciones en esta comunidad.",
          "UNAUTHORIZED_MODERATOR_ONLY",
        );
      }

      if (!this.repo.unpinPost) {
        return err("Repositorio no soporta fijación de publicaciones.", "NOT_SUPPORTED");
      }

      await this.repo.unpinPost(post.id, params.actorUserId);
      return ok({ postId: post.id, isPinned: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UNPIN_POST_ERROR");
    }
  }

  /**
   * Elimina manualmente una publicación propia del muro, sus respuestas en cascada y libera cuota `storage_bytes` (`SPEC-15-D14`).
   */
  async deletePost(params: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
  }): Promise<Result<{ deleted: boolean; freedBytes: number }>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      if (post.authorClientId !== params.actorClientId) {
        return err(
          "Solo el comercio autor puede eliminar su publicación del muro.",
          "FORBIDDEN_AUTHOR_ONLY",
        );
      }

      if (!this.repo.deletePostById) {
        return err("Repositorio no soporta eliminación de publicaciones.", "NOT_SUPPORTED");
      }

      const removed = await this.repo.deletePostById(post.id);
      if (!removed.deleted) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      let freedBytes = 0;
      if (removed.mediaId && removed.authorClientId && this.repo.releaseWallImageMedia) {
        const releaseRes = await this.repo.releaseWallImageMedia(
          removed.authorClientId,
          removed.mediaId,
          params.actorUserId,
        );
        freedBytes = releaseRes.freedBytes;
      }

      appLogger.info("[CommunityFeed] Publicación eliminada manualmente por el autor", {
        postId: post.id,
        organizationId: post.organizationId,
        authorClientId: params.actorClientId,
        freedBytes,
      });

      return ok({ deleted: true, freedBytes });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al eliminar publicación: ${msg}`, error);
      return err(msg, "DELETE_POST_ERROR");
    }
  }

  /**
   * Registra una respuesta con texto y emojis sobre una publicación aprobada del muro (`SPEC-15-D13`).
   */
  async createReply(params: {
    postId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
  }): Promise<Result<FeedPostReplyView>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }
      if (post.status !== "published") {
        return err(
          "Solo es posible responder publicaciones visibles en el muro.",
          "POST_NOT_PUBLISHED",
        );
      }

      const membership = await this.repo.findOrganizationMembership(
        post.organizationId,
        params.authorClientId,
      );
      if (!membership || membership.status !== "active") {
        return err(
          "Debes ser miembro activo de esta comunidad para responder publicaciones.",
          "UNAUTHORIZED_COMMUNITY_MEMBER",
        );
      }

      const cleanBody = params.body.trim();
      if (cleanBody.length < 1) {
        return err("Escribe un mensaje o emoji para responder.", "VALIDATION_ERROR");
      }
      if (cleanBody.length > MAX_WALL_REPLY_CHARS) {
        return err(
          `La respuesta supera el límite de ${MAX_WALL_REPLY_CHARS} caracteres.`,
          "VALIDATION_ERROR",
        );
      }

      if (!this.repo.createReply) {
        return err("Repositorio no soporta respuestas en el muro.", "NOT_SUPPORTED");
      }

      const created = await this.repo.createReply({
        postId: post.id,
        organizationId: post.organizationId,
        authorClientId: params.authorClientId,
        authorUserId: params.authorUserId,
        body: cleanBody,
      });

      const authorDisplayName = await this.repo.getClientDisplayName(params.authorClientId);

      return ok({
        id: created.id,
        postId: created.postId,
        authorClientId: created.authorClientId,
        authorDisplayName,
        body: created.body,
        createdAt: created.createdAt,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "CREATE_REPLY_ERROR");
    }
  }

  /**
   * Modera una publicación del muro (aprobar, rechazar, ocultar) (`ADM-001 T-22, RF-08.19`).
   */
  async moderatePost(params: {
    postId: string;
    actorClientId: string;
    actorUserId: string;
    action: "approve" | "reject" | "hide";
    reason?: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const post = await this.repo.findPostById(params.postId);
      if (!post) {
        return err("Publicación no encontrada.", "POST_NOT_FOUND");
      }

      const membership = await this.repo.findOrganizationMembership(
        post.organizationId,
        params.actorClientId,
      );

      if (!membership || !["originator", "co_leader"].includes(membership.role)) {
        return err(
          "Solo el inquilino originador o co-líderes poseen permisos de moderación del feed.",
          "UNAUTHORIZED_MODERATOR_ONLY",
        );
      }

      const newStatus =
        params.action === "approve"
          ? "published"
          : params.action === "reject"
            ? "rejected"
            : "hidden";

      await this.repo.updatePostStatus(params.postId, newStatus);
      await this.repo.createModerationEvent({
        postId: params.postId,
        actorClientId: params.actorClientId,
        actorUserId: params.actorUserId,
        action: params.action,
        reason: params.reason,
      });

      appLogger.info("[CommunityFeed] Publicación moderada exitosamente", {
        postId: params.postId,
        action: params.action,
        newStatus,
        actorClientId: params.actorClientId,
      });

      return ok({ status: newStatus });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al moderar publicación: ${msg}`, error);
      return err(msg, "MODERATE_POST_ERROR");
    }
  }

  /**
   * Consulta la configuración global de retención de publicaciones del muro (`SPEC-15-D14`).
   */
  async getRetentionSettings(): Promise<Result<CommunityWallRetentionSettingsDto>> {
    try {
      if (!this.repo.getRetentionSettings) {
        return err("Repositorio no soporta configuración de retención.", "NOT_SUPPORTED");
      }
      return ok(await this.repo.getRetentionSettings());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "GET_RETENTION_SETTINGS_ERROR");
    }
  }

  /**
   * Actualiza los días de retención global del muro desde el Backoffice SaaS (`SPEC-15-D14`).
   */
  async updateRetentionSettings(params: {
    feedRetentionDays: number | null;
    actorUserId: string;
  }): Promise<Result<CommunityWallRetentionSettingsDto>> {
    try {
      if (
        params.feedRetentionDays !== null &&
        (!Number.isInteger(params.feedRetentionDays) ||
          params.feedRetentionDays < 1 ||
          params.feedRetentionDays > 3650)
      ) {
        return err(
          "El periodo de retención debe ser un entero entre 1 y 3650 días o nulo para conservar sin límite.",
          "INVALID_RETENTION_DAYS",
        );
      }

      if (!this.repo.updateRetentionSettings) {
        return err("Repositorio no soporta configuración de retención.", "NOT_SUPPORTED");
      }

      const updated = await this.repo.updateRetentionSettings(
        params.feedRetentionDays,
        params.actorUserId,
      );
      appLogger.info("[CommunityFeed] Periodo de retención actualizado", {
        feedRetentionDays: params.feedRetentionDays,
        actorUserId: params.actorUserId,
      });
      return ok(updated);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UPDATE_RETENTION_SETTINGS_ERROR");
    }
  }

  /**
   * Purga de forma idempotente las publicaciones vencidas según `feed_retention_days`,
   * eliminando respuestas en cascada y restituyendo `storage_bytes` al inquilino autor (`SPEC-15-D14`).
   */
  async purgeExpiredPosts(params?: {
    actorUserId?: string;
    now?: Date;
  }): Promise<Result<WallPurgeSummaryDto>> {
    try {
      if (
        !this.repo.getRetentionSettings ||
        !this.repo.listExpiredPostsForPurge ||
        !this.repo.deletePostById
      ) {
        return err("Repositorio no soporta purga por retención.", "NOT_SUPPORTED");
      }

      const settings = await this.repo.getRetentionSettings();
      const executedAt = params?.now ?? new Date();
      if (settings.feedRetentionDays === null || settings.feedRetentionDays < 1) {
        await this.repo.recordRetentionPurgeStats?.(0, executedAt, params?.actorUserId);
        return ok({
          purgedPostsCount: 0,
          releasedMediaCount: 0,
          releasedBytesTotal: 0,
          skippedQuotaReleasesCount: 0,
          executedAt: executedAt.toISOString(),
        });
      }

      const cutoffDate = new Date(
        executedAt.getTime() - settings.feedRetentionDays * 86_400_000,
      );
      const expiredPosts = await this.repo.listExpiredPostsForPurge(cutoffDate);

      let purgedPostsCount = 0;
      let releasedMediaCount = 0;
      let releasedBytesTotal = 0;
      let skippedQuotaReleasesCount = 0;

      for (const expired of expiredPosts) {
        const deleted = await this.repo.deletePostById(expired.id);
        if (!deleted.deleted) continue;
        purgedPostsCount += 1;

        if (deleted.mediaId && deleted.authorClientId && this.repo.releaseWallImageMedia) {
          const releaseRes = await this.repo.releaseWallImageMedia(
            deleted.authorClientId,
            deleted.mediaId,
            params?.actorUserId ?? "system.retention",
          );
          if (releaseRes.cellUnavailable) {
            skippedQuotaReleasesCount += 1;
          } else if (releaseRes.released) {
            releasedMediaCount += 1;
            releasedBytesTotal += releaseRes.freedBytes;
          }
        }
      }

      await this.repo.recordRetentionPurgeStats?.(
        purgedPostsCount,
        executedAt,
        params?.actorUserId,
      );

      appLogger.info("[CommunityFeed] Purga de retención completada", {
        feedRetentionDays: settings.feedRetentionDays,
        purgedPostsCount,
        releasedMediaCount,
        releasedBytesTotal,
        skippedQuotaReleasesCount,
      });

      return ok({
        purgedPostsCount,
        releasedMediaCount,
        releasedBytesTotal,
        skippedQuotaReleasesCount,
        executedAt: executedAt.toISOString(),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error en purga de retención: ${msg}`, error);
      return err(msg, "PURGE_EXPIRED_POSTS_ERROR");
    }
  }

  /**
   * Obtiene las publicaciones activas del feed de una organización aplicando privacidad del autor (`ADM-001 T-21`).
   */
  async getFeed(
    organizationId: string,
    limit: number = 50,
  ): Promise<Result<FeedPostView[]>> {
    try {
      const posts = await this.repo.getPublishedPosts(organizationId, limit);
      const views = await this.hydratePostViews(posts, new Map());
      return ok(views);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al obtener feed: ${msg}`, error);
      return err(msg, "GET_FEED_ERROR");
    }
  }

  /**
   * Obtiene el muro unificado multi-comunidad para el comercio autenticado (incluyendo pendientes para moderadores).
   */
  async getTenantWallPosts(params: {
    clientId: string;
    organizationId?: string;
    limit?: number;
  }): Promise<Result<FeedPostView[]>> {
    try {
      if (!this.repo.listActiveMembershipsForClient || !this.repo.listPostsForOrganizations) {
        if (params.organizationId) {
          return this.getFeed(params.organizationId, params.limit ?? 50);
        }
        return ok([]);
      }

      const memberships = await this.repo.listActiveMembershipsForClient(params.clientId);
      const filteredMemberships = params.organizationId
        ? memberships.filter((m) => m.organizationId === params.organizationId)
        : memberships;

      if (params.organizationId && filteredMemberships.length === 0) {
        return err("No perteneces a la comunidad solicitada.", "FORBIDDEN_NOT_COMMUNITY_MEMBER");
      }

      const orgIds = filteredMemberships.map((m) => m.organizationId);
      const moderatorOrgIds = filteredMemberships
        .filter((m) => m.role === "originator" || m.role === "co_leader")
        .map((m) => m.organizationId);
      const orgNameMap = new Map(filteredMemberships.map((m) => [m.organizationId, m.organizationName]));
      const rolesMap = this.repo.getOrganizationRolesMap
        ? await this.repo.getOrganizationRolesMap(orgIds)
        : new Map<string, string>();

      const posts = await this.repo.listPostsForOrganizations(
        orgIds,
        moderatorOrgIds,
        params.clientId,
        params.limit ?? 50,
      );

      const views = await this.hydratePostViews(posts, orgNameMap, rolesMap);
      return ok(views);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "GET_WALL_POSTS_ERROR");
    }
  }

  private async hydratePostViews(
    posts: FeedPost[],
    orgNameMap: Map<string, string>,
    rolesMap?: Map<string, string>,
  ): Promise<FeedPostView[]> {
    const postIds = posts.map((p) => p.id);
    const replyRows =
      this.repo.listRepliesForPosts && postIds.length > 0
        ? await this.repo.listRepliesForPosts(postIds)
        : [];

    const authorNameCache = new Map<string, string>();
    const resolveReplyAuthorName = async (clientId: string): Promise<string> => {
      const cached = authorNameCache.get(clientId);
      if (cached) return cached;
      const name = await this.repo.getClientDisplayName(clientId);
      authorNameCache.set(clientId, name);
      return name;
    };

    const repliesByPost = new Map<string, FeedPostReplyView[]>();
    for (const r of replyRows) {
      const list = repliesByPost.get(r.postId) ?? [];
      list.push({
        id: r.id,
        postId: r.postId,
        authorClientId: r.authorClientId,
        authorDisplayName: await resolveReplyAuthorName(r.authorClientId),
        body: r.body,
        createdAt: r.createdAt,
      });
      repliesByPost.set(r.postId, list);
    }

    const views: FeedPostView[] = [];
    for (const p of posts) {
      const profile = await this.repo.getSharingProfile(p.authorClientId);
      const privacySource = this.repo.getClientPrivacySource
        ? await this.repo.getClientPrivacySource(p.authorClientId)
        : null;

      const displayName =
        privacySource?.displayName ?? (await this.repo.getClientDisplayName(p.authorClientId));
      authorNameCache.set(p.authorClientId, displayName);

      const contactEmail =
        privacySource?.email ?? (await this.repo.getClientContactEmail(p.authorClientId));
      const rawPhone =
        privacySource?.phone ?? (await this.repo.getClientPhone(p.authorClientId));

      const shareEmail = profile ? profile.shareEmail : true;
      const sharePhone = profile ? profile.sharePhone : false;
      const shareAddress = profile ? profile.shareAddress : false;
      const shareSocialLinks = profile ? profile.shareSocialLinks : true;

      const author: AuthorProfileSummary = {
        clientId: p.authorClientId,
        displayName,
        contactEmail: shareEmail ? contactEmail : undefined,
        phone: sharePhone ? (rawPhone ?? undefined) : undefined,
        ...(shareAddress && privacySource?.address ? { address: privacySource.address } : {}),
        ...(shareSocialLinks && privacySource?.socialLinks
          ? { socialLinks: privacySource.socialLinks }
          : {}),
      };

      const bodyFormat = p.bodyFormat === "html" ? "html" : "plain";
      const safeBody = bodyFormat === "html" ? sanitizeCommunityPostHtml(p.body) : p.body;

      views.push({
        id: p.id,
        organizationId: p.organizationId,
        organizationName: orgNameMap.get(p.organizationId),
        body: safeBody,
        bodyFormat,
        mediaId: p.mediaId ?? null,
        imageUrl: p.mediaId ? `/api/tenant/community/posts/media/${p.mediaId}` : null,
        videoEmbedUrl: p.videoEmbedUrl ?? null,
        isPinned: Boolean(p.isPinned),
        pinnedAt: p.pinnedAt ?? null,
        status: p.status,
        publishedAt: p.publishedAt,
        createdAt: p.createdAt,
        authorRole: rolesMap?.get(`${p.organizationId}:${p.authorClientId}`),
        author,
        replies: repliesByPost.get(p.id) ?? [],
      });
    }
    return views;
  }

  /**
   * Consulta las preferencias de visibilidad del comercio en comunidades (`client_sharing_profiles`).
   */
  async getSharingProfileForClient(clientId: string): Promise<Result<ClientSharingProfileDto>> {
    try {
      const row = await this.repo.getSharingProfile(clientId);
      return ok({
        clientId,
        sharePhone: row?.sharePhone ?? false,
        shareEmail: row?.shareEmail ?? true,
        shareAddress: row?.shareAddress ?? false,
        shareSocialLinks: row?.shareSocialLinks ?? true,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "GET_SHARING_PROFILE_ERROR");
    }
  }

  /**
   * Actualiza las preferencias de visibilidad del comercio en comunidades (`SPEC-15`).
   */
  async updateSharingProfile(params: {
    clientId: string;
    sharePhone: boolean;
    shareEmail: boolean;
    shareAddress: boolean;
    shareSocialLinks: boolean;
    actorUserId: string;
  }): Promise<Result<ClientSharingProfileDto>> {
    try {
      if (!this.repo.upsertSharingProfile) {
        return err("Repositorio no soporta actualización de perfil de compartición.", "NOT_SUPPORTED");
      }
      const saved = await this.repo.upsertSharingProfile(params);
      return ok({
        clientId: saved.clientId,
        sharePhone: saved.sharePhone,
        shareEmail: saved.shareEmail,
        shareAddress: saved.shareAddress,
        shareSocialLinks: saved.shareSocialLinks,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UPDATE_SHARING_PROFILE_ERROR");
    }
  }
}

let defaultCommunityFeedService: CommunityFeedService | null = null;

/**
 * Retorna la instancia singleton de {@link CommunityFeedService} respaldada por PostgreSQL (`SPEC-15`).
 */
export function getCommunityFeedService(): CommunityFeedService {
  if (!defaultCommunityFeedService) {
    defaultCommunityFeedService = new CommunityFeedService(new DrizzleCommunityFeedRepository());
  }
  return defaultCommunityFeedService;
}
