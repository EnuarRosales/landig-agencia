import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import {
  clientSharingProfiles,
  feedModerationEvents,
  feedPosts,
  organizationMembers,
  organizations,
  type ClientSharingProfile,
  type FeedModerationEvent,
  type FeedPost,
} from "../db/schemas/admin/communities-and-cloning";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

export interface AuthorProfileSummary {
  clientId: string;
  displayName: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
  socialLinks?: Record<string, string>;
}

export interface FeedPostView {
  id: string;
  organizationId: string;
  organizationName?: string;
  body: string;
  status: string;
  publishedAt: Date | null;
  createdAt?: Date;
  authorRole?: string;
  author: AuthorProfileSummary;
}

export interface ClientSharingProfileDto {
  clientId: string;
  sharePhone: boolean;
  shareEmail: boolean;
  shareAddress: boolean;
  shareSocialLinks: boolean;
}

/**
 * Contrato de persistencia para el muro de novedades, moderación y privacidad comunitaria (`ADM-001 T-21/T-22`, `SPEC-15`).
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

  // Extensiones SPEC-15
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
  getOrganizationRolesMap?(
    organizationIds: string[],
  ): Promise<Map<string, string>>;
}

/**
 * Implementación Drizzle ORM sobre PostgreSQL (`Router Global`) para muro de novedades y privacidad (`SPEC-15`).
 */
export class DrizzleCommunityFeedRepository implements ICommunityFeedRepository {
  constructor(private readonly dbProvider: () => any = () => getDb()) {}

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
      .orderBy(desc(feedPosts.publishedAt), desc(feedPosts.createdAt))
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
      .orderBy(desc(feedPosts.createdAt))
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
}

/**
 * Servicio de muro de comunidad, moderación de publicaciones y perfiles de privacidad (`ADM-001 T-21/T-22`, `SPEC-15`).
 */
export class CommunityFeedService {
  constructor(private readonly repo: ICommunityFeedRepository) {}

  /**
   * Publica un mensaje en el muro de la comunidad respetando el modo de moderación de la organización (`ADM-001 T-22`).
   * En modo `pre`, los mensajes de `originator`/`co_leader` se publican de inmediato y los de miembros pasan a revisión.
   */
  async createPost(params: {
    organizationId: string;
    authorClientId: string;
    authorUserId: string;
    body: string;
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

      const isModerator = membership.role === "originator" || membership.role === "co_leader";
      const isPublishedImmediately =
        mode === "none" || mode === "post" || (mode === "pre" && isModerator && this.repo.listPostsForOrganizations !== undefined);
      const status = isPublishedImmediately ? "published" : "pending_review";
      const publishedAt = isPublishedImmediately ? new Date() : null;

      const post = await this.repo.createPost({
        organizationId: params.organizationId,
        authorClientId: params.authorClientId,
        authorUserId: params.authorUserId,
        body: params.body,
        status,
        publishedAt,
      });

      appLogger.info("[CommunityFeed] Publicación creada en el feed", {
        postId: post.id,
        organizationId: params.organizationId,
        status,
        mode,
      });

      return ok({ postId: post.id, status });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al crear publicación en feed: ${msg}`, error);
      return err(msg, "CREATE_POST_ERROR");
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
    const views: FeedPostView[] = [];
    for (const p of posts) {
      const profile = await this.repo.getSharingProfile(p.authorClientId);
      const privacySource = this.repo.getClientPrivacySource
        ? await this.repo.getClientPrivacySource(p.authorClientId)
        : null;

      const displayName =
        privacySource?.displayName ?? (await this.repo.getClientDisplayName(p.authorClientId));
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

      views.push({
        id: p.id,
        organizationId: p.organizationId,
        organizationName: orgNameMap.get(p.organizationId),
        body: p.body,
        status: p.status,
        publishedAt: p.publishedAt,
        createdAt: p.createdAt,
        authorRole: rolesMap?.get(`${p.organizationId}:${p.authorClientId}`),
        author,
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
