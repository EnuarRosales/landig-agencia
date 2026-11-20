import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CommunityFeedService,
  type ICommunityFeedRepository,
} from "./community-feed.service";
import {
  formatPlainPostHtmlWithLinks,
  sanitizeCommunityPostHtml,
} from "../utils/community-html";
import type { FeedPost } from "../db/schemas/admin/communities-and-cloning";

describe("ADM-001 T-21, T-22 · CommunityFeedService", () => {
  let mockRepo: ICommunityFeedRepository;
  let service: CommunityFeedService;

  const mockPost: FeedPost = {
    id: "post-1",
    organizationId: "org-1",
    authorClientId: "client-author",
    authorUserId: "user-author",
    body: "¡Bienvenidos a la nueva temporada de descuentos!",
    bodyFormat: "plain",
    mediaId: null,
    videoEmbedUrl: null,
    isPinned: false,
    pinnedAt: null,
    pinnedByUserId: null,
    status: "published",
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user-author",
    updatedBy: "user-author",
  };

  beforeEach(() => {
    mockRepo = {
      findOrganizationMembership: vi.fn().mockResolvedValue({ role: "member", status: "active" }),
      findOrganizationModerationMode: vi.fn().mockResolvedValue("pre"),
      getSharingProfile: vi.fn().mockResolvedValue({
        clientId: "client-author",
        sharePhone: false,
        shareEmail: true,
        shareAddress: false,
        shareSocialLinks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-author",
        updatedBy: "user-author",
      }),
      createPost: vi.fn().mockResolvedValue(mockPost),
      findPostById: vi.fn().mockResolvedValue(mockPost),
      updatePostStatus: vi.fn().mockResolvedValue(undefined),
      createModerationEvent: vi.fn().mockResolvedValue({
        id: "mod-1",
        postId: "post-1",
        actorClientId: "client-leader",
        actorUserId: "user-leader",
        action: "approve",
        reason: null,
        createdAt: new Date(),
      }),
      getPublishedPosts: vi.fn().mockResolvedValue([mockPost]),
      getClientDisplayName: vi.fn().mockResolvedValue("Boutique Paris"),
      getClientContactEmail: vi.fn().mockResolvedValue("contacto@boutiqueparis.co"),
      getClientPhone: vi.fn().mockResolvedValue("+573001234567"),
    };

    service = new CommunityFeedService(mockRepo);
  });

  describe("T-22 · Creación de publicaciones y modos de moderación", () => {
    it("queda en pending_review cuando el modo de la organización es 'pre'", async () => {
      mockRepo.findOrganizationModerationMode = vi.fn().mockResolvedValue("pre");

      const res = await service.createPost({
        organizationId: "org-1",
        authorClientId: "client-author",
        authorUserId: "user-author",
        body: "Texto a moderar",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.status).toBe("pending_review");
      expect(mockRepo.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "pending_review",
          publishedAt: null,
        }),
      );
    });

    it("se publica inmediatamente cuando el modo de la organización es 'post' o 'none'", async () => {
      mockRepo.findOrganizationModerationMode = vi.fn().mockResolvedValue("post");

      const res = await service.createPost({
        organizationId: "org-1",
        authorClientId: "client-author",
        authorUserId: "user-author",
        body: "Texto publicado al instante",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.status).toBe("published");
      expect(mockRepo.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "published",
        }),
      );
    });
  });

  describe("T-22 · Moderación de publicaciones por liderazgo", () => {
    it("permite a un co_leader o originator aprobar o rechazar publicaciones (RF-08.19)", async () => {
      mockRepo.findOrganizationMembership = vi.fn().mockResolvedValue({ role: "co_leader", status: "active" });

      const res = await service.moderatePost({
        postId: "post-1",
        actorClientId: "client-co-leader",
        actorUserId: "user-co-leader",
        action: "approve",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.status).toBe("published");
      expect(mockRepo.updatePostStatus).toHaveBeenCalledWith("post-1", "published");
      expect(mockRepo.createModerationEvent).toHaveBeenCalled();
    });

    it("bloquea a un miembro regular que intente moderar el feed (RF-08.19)", async () => {
      mockRepo.findOrganizationMembership = vi.fn().mockResolvedValue({ role: "member", status: "active" });

      const res = await service.moderatePost({
        postId: "post-1",
        actorClientId: "client-regular-member",
        actorUserId: "user-regular",
        action: "hide",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("UNAUTHORIZED_MODERATOR_ONLY");
    });
  });

  describe("T-21 · Perfiles de compartición y privacidad en el feed", () => {
    it("expone nombre y email por defecto pero oculta el teléfono sin opt-in (RF-08.10)", async () => {
      const res = await service.getFeed("org-1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const post = res.data[0];
      expect(post.author.displayName).toBe("Boutique Paris");
      expect(post.author.contactEmail).toBe("contacto@boutiqueparis.co");
      // Teléfono oculto porque sharePhone = false
      expect(post.author.phone).toBeUndefined();
    });

    it("expone el teléfono cuando el inquilino lo autoriza explícitamente en su perfil", async () => {
      mockRepo.getSharingProfile = vi.fn().mockResolvedValue({
        clientId: "client-author",
        sharePhone: true, // Opt-in concedido
        shareEmail: true,
        shareAddress: false,
        shareSocialLinks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-author",
        updatedBy: "user-author",
      });

      const res = await service.getFeed("org-1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data[0].author.phone).toBe("+573001234567");
    });
  });

  describe("SPEC-15-D11..D14 · Texto enriquecido, video embed, imagen con cuota, fijación, respuestas y retención", () => {
    it("sanitiza HTML manteniendo alineación segura y normaliza video de YouTube/Vimeo", async () => {
      mockRepo.findOrganizationModerationMode = vi.fn().mockResolvedValue("none");
      mockRepo.verifyOwnedWallMedia = vi.fn().mockResolvedValue(true);

      const res = await service.createPost({
        organizationId: "org-1",
        authorClientId: "client-author",
        authorUserId: "user-author",
        bodyFormat: "html",
        body: '<p style="text-align: center;"><strong>Lanzamiento</strong></p><script>alert(1)</script><a href="https://mocter.co" onclick="hack()">Ver</a>',
        videoUrl: "https://youtu.be/dQw4w9WgXcQ",
        mediaId: "media-1",
      });

      expect(res.ok).toBe(true);
      expect(mockRepo.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyFormat: "html",
          body: '<p style="text-align: center;"><strong>Lanzamiento</strong></p><a href="https://mocter.co/" target="_blank" rel="noopener noreferrer nofollow">Ver</a>',
          videoEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          mediaId: "media-1",
        }),
      );

      const invalidVideo = await service.createPost({
        organizationId: "org-1",
        authorClientId: "client-author",
        authorUserId: "user-author",
        body: "Video externo no permitido",
        videoUrl: "https://evil.example.com/video.mp4",
      });
      expect(invalidVideo.ok).toBe(false);
      if (!invalidVideo.ok) {
        expect(invalidVideo.code).toBe("INVALID_VIDEO_URL");
      }
    });

    it("valida magic bytes de imagen y respeta cuota storage_bytes al subir media al muro", async () => {
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      mockRepo.uploadAndChargeWallImage = vi.fn().mockResolvedValue({
        ok: true,
        data: {
          mediaId: "media-wall-1",
          imageUrl: "/api/tenant/community/posts/media/media-wall-1",
          sizeBytes: fakePng.byteLength,
          mimeType: "image/png",
        },
      });

      const okRes = await service.uploadWallImage({
        clientId: "client-author",
        actorUserId: "user-author",
        buffer: fakePng,
        mimeType: "image/png",
        originalFilename: "banner.png",
      });
      expect(okRes.ok).toBe(true);

      const badRes = await service.uploadWallImage({
        clientId: "client-author",
        actorUserId: "user-author",
        buffer: Buffer.from("not-an-image"),
        mimeType: "image/png",
        originalFilename: "fake.png",
      });
      expect(badRes.ok).toBe(false);
      if (!badRes.ok) {
        expect(badRes.code).toBe("INVALID_IMAGE_FORMAT");
      }

      mockRepo.uploadAndChargeWallImage = vi.fn().mockResolvedValue({
        ok: false,
        code: "STORAGE_QUOTA_EXCEEDED",
        error: "Cuota excedida",
      });
      const quotaRes = await service.uploadWallImage({
        clientId: "client-author",
        actorUserId: "user-author",
        buffer: fakePng,
        mimeType: "image/png",
        originalFilename: "banner.png",
      });
      expect(quotaRes.ok).toBe(false);
      if (!quotaRes.ok) {
        expect(quotaRes.code).toBe("STORAGE_QUOTA_EXCEEDED");
      }
    });

    it("fija exclusivamente 1 publicación por comunidad siendo moderador y bloquea a miembros regulares", async () => {
      mockRepo.findOrganizationMembership = vi
        .fn()
        .mockResolvedValueOnce({ role: "member", status: "active" })
        .mockResolvedValueOnce({ role: "originator", status: "active" });
      mockRepo.pinPostExclusive = vi.fn().mockResolvedValue({ ...mockPost, isPinned: true });

      const forbiddenPin = await service.pinPost({
        postId: "post-1",
        actorClientId: "client-member",
        actorUserId: "user-member",
      });
      expect(forbiddenPin.ok).toBe(false);
      if (!forbiddenPin.ok) expect(forbiddenPin.code).toBe("UNAUTHORIZED_MODERATOR_ONLY");

      const okPin = await service.pinPost({
        postId: "post-1",
        actorClientId: "client-leader",
        actorUserId: "user-leader",
      });
      expect(okPin.ok).toBe(true);
      expect(mockRepo.pinPostExclusive).toHaveBeenCalledWith("org-1", "post-1", "user-leader");
    });

    it("permite responder con texto y emojis, eliminar manualmente liberando cuota y purgar por retención", async () => {
      mockRepo.findOrganizationMembership = vi.fn().mockResolvedValue({ role: "member", status: "active" });
      mockRepo.createReply = vi.fn().mockResolvedValue({
        id: "reply-1",
        postId: "post-1",
        organizationId: "org-1",
        authorClientId: "client-member",
        authorUserId: "user-agent",
        body: "¡Excelente lanzamiento! 🚀🔥",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "user-agent",
        updatedBy: "user-agent",
      });

      const replyRes = await service.createReply({
        postId: "post-1",
        authorClientId: "client-member",
        authorUserId: "user-agent",
        body: "  ¡Excelente lanzamiento! 🚀🔥  ",
      });
      expect(replyRes.ok).toBe(true);
      if (replyRes.ok) {
        expect(replyRes.data.body).toBe("¡Excelente lanzamiento! 🚀🔥");
      }

      mockRepo.deletePostById = vi.fn().mockResolvedValue({
        deleted: true,
        mediaId: "media-99",
        authorClientId: "client-author",
      });
      mockRepo.releaseWallImageMedia = vi.fn().mockResolvedValue({
        released: true,
        freedBytes: 204800,
      });

      const delRes = await service.deletePost({
        postId: "post-1",
        actorClientId: "client-author",
        actorUserId: "user-author",
      });
      expect(delRes.ok).toBe(true);
      if (delRes.ok) {
        expect(delRes.data.freedBytes).toBe(204800);
      }

      mockRepo.getRetentionSettings = vi.fn().mockResolvedValue({
        feedRetentionDays: 30,
        lastRetentionPurgeAt: null,
        lastRetentionPurgedCount: 0,
        eligibleToPurgeCount: 1,
      });
      mockRepo.listExpiredPostsForPurge = vi.fn().mockResolvedValue([
        { id: "old-post-1", authorClientId: "client-author", mediaId: "media-old" },
      ]);
      mockRepo.recordRetentionPurgeStats = vi.fn().mockResolvedValue(undefined);

      const purgeRes = await service.purgeExpiredPosts({
        actorUserId: "admin-1",
        now: new Date("2026-11-20T00:00:00.000Z"),
      });
      expect(purgeRes.ok).toBe(true);
      if (purgeRes.ok) {
        expect(purgeRes.data.purgedPostsCount).toBe(1);
        expect(purgeRes.data.releasedMediaCount).toBe(1);
        expect(purgeRes.data.releasedBytesTotal).toBe(204800);
      }
    });

    it("T-11 · edita publicación del autor, libera media reemplazada y reenvía a pre-moderación si no es moderador", async () => {
      mockRepo.findPostById = vi.fn().mockResolvedValue({
        ...mockPost,
        mediaId: "media-old",
        isPinned: true,
        pinnedAt: new Date(),
        pinnedByUserId: "user-leader",
      });
      mockRepo.verifyOwnedWallMedia = vi.fn().mockResolvedValue(true);
      mockRepo.releaseWallImageMedia = vi.fn().mockResolvedValue({
        released: true,
        freedBytes: 409600,
      });
      mockRepo.updatePostById = vi.fn().mockImplementation(async (_postId, data) => ({
        ...mockPost,
        ...data,
      }));

      // Intento de tercero (no autor) rechazado
      const forbiddenRes = await service.updatePost({
        postId: "post-1",
        actorClientId: "client-other",
        actorUserId: "user-other",
        body: "<p>Intento indebido</p>",
        bodyFormat: "html",
      });
      expect(forbiddenRes.ok).toBe(false);
      if (!forbiddenRes.ok) {
        expect(forbiddenRes.code).toBe("FORBIDDEN_AUTHOR_ONLY");
      }

      // Autor miembro (no moderador) en comunidad con moderación 'pre' reemplaza imagen y texto con enlace
      mockRepo.findOrganizationMembership = vi
        .fn()
        .mockResolvedValue({ role: "member", status: "active" });
      mockRepo.findOrganizationModerationMode = vi.fn().mockResolvedValue("pre");

      const updateRes = await service.updatePost({
        postId: "post-1",
        actorClientId: "client-author",
        actorUserId: "user-author",
        body: "<p>Mira https://mocter.co/catalogo y <a href=\"https://ejemplo.com/guia\">la guía</a></p>",
        bodyFormat: "html",
        mediaId: "media-new",
        videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      });

      expect(updateRes.ok).toBe(true);
      if (updateRes.ok) {
        expect(updateRes.data.status).toBe("pending_review");
        expect(updateRes.data.freedBytes).toBe(409600);
      }

      expect(mockRepo.releaseWallImageMedia).toHaveBeenCalledWith(
        "client-author",
        "media-old",
        "user-author",
      );
      expect(mockRepo.updatePostById).toHaveBeenCalledWith(
        "post-1",
        expect.objectContaining({
          mediaId: "media-new",
          videoEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
          status: "pending_review",
          isPinned: false,
          pinnedAt: null,
          pinnedByUserId: null,
        }),
      );
    });

    it("T-11 · auto-vincula URLs crudas en HTML y texto plano sin dañar enlaces existentes ni abrir XSS", () => {
      const sanitizedHtml = sanitizeCommunityPostHtml(
        '<p>Catálogo https://mocter.co/demo. Revisa <a href="https://docs.mocter.co">Ver ficha</a><script>alert(1)</script></p>',
      );
      expect(sanitizedHtml).toContain(
        '<a href="https://mocter.co/demo" target="_blank" rel="noopener noreferrer nofollow">https://mocter.co/demo</a>.',
      );
      expect(sanitizedHtml).toContain(
        '<a href="https://docs.mocter.co/" target="_blank" rel="noopener noreferrer nofollow">Ver ficha</a>',
      );
      expect(sanitizedHtml).not.toContain("<script>");

      const formattedPlain = formatPlainPostHtmlWithLinks(
        "Visita https://mocter.co/ofertas para ver <descuentos>!",
      );
      expect(formattedPlain).toContain(
        '<a href="https://mocter.co/ofertas" target="_blank" rel="noopener noreferrer nofollow">https://mocter.co/ofertas</a>',
      );
      expect(formattedPlain).toContain("&lt;descuentos&gt;");
    });
  });
});
