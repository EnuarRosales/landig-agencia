import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  FeedPost,
  FeedModerationEvent,
  ClientSharingProfile,
} from "../db/schemas/admin/communities-and-cloning";

export interface AuthorProfileSummary {
  clientId: string;
  displayName: string;
  contactEmail?: string;
  phone?: string;
}

export interface FeedPostView {
  id: string;
  organizationId: string;
  body: string;
  status: string;
  publishedAt: Date | null;
  author: AuthorProfileSummary;
}

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
}

/**
 * Servicio de feed de comunidad, moderación de publicaciones y perfiles de privacidad (ADM-001 T-21, T-22, RF-08).
 */
export class CommunityFeedService {
  constructor(private readonly repo: ICommunityFeedRepository) {}

  /**
   * Publica un mensaje en el feed de la comunidad respetando el modo de moderación de la organización (ADM-001 T-22).
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

      // Regla RF-08.13: En modo previa, no es visible hasta aprobar. En post o none, se publica de inmediato.
      const isPublishedImmediately = mode === "none" || mode === "post";
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
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al crear publicación en feed: ${msg}`, error);
      return err(msg, "CREATE_POST_ERROR");
    }
  }

  /**
   * Modera una publicación del feed (aprobar, rechazar, ocultar) (ADM-001 T-22, RF-08.19).
   * Capacidad exclusiva del inquilino líder (originator) o co-líder (co_leader).
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

      // Regla RF-08.19: Solo originator y co_leader moderan
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
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al moderar publicación: ${msg}`, error);
      return err(msg, "MODERATE_POST_ERROR");
    }
  }

  /**
   * Obtiene las publicaciones activas del feed aplicando las preferencias de privacidad del autor (ADM-001 T-21, RF-08.10).
   */
  async getFeed(
    organizationId: string,
    limit: number = 50,
  ): Promise<Result<FeedPostView[]>> {
    try {
      const posts = await this.repo.getPublishedPosts(organizationId, limit);
      const views: FeedPostView[] = [];

      for (const p of posts) {
        const profile = await this.repo.getSharingProfile(p.authorClientId);
        const displayName = await this.repo.getClientDisplayName(p.authorClientId);
        const contactEmail = await this.repo.getClientContactEmail(p.authorClientId);
        const rawPhone = await this.repo.getClientPhone(p.authorClientId);

        // Regla RF-08.10: Por defecto comparte nombre y correo; teléfono solo con opt-in
        const author: AuthorProfileSummary = {
          clientId: p.authorClientId,
          displayName,
          contactEmail: profile?.shareEmail ? contactEmail : undefined,
          phone: profile?.sharePhone ? (rawPhone ?? undefined) : undefined,
        };

        views.push({
          id: p.id,
          organizationId: p.organizationId,
          body: p.body,
          status: p.status,
          publishedAt: p.publishedAt,
          author,
        });
      }

      return ok(views);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunityFeed] Error al obtener feed: ${msg}`, error);
      return err(msg, "GET_FEED_ERROR");
    }
  }
}
