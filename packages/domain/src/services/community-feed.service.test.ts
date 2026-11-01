import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CommunityFeedService,
  type ICommunityFeedRepository,
} from "./community-feed.service";
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
});
