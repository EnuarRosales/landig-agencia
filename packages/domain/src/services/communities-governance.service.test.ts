import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CommunitiesGovernanceService,
  type ICommunitiesGovernanceRepository,
} from "./communities-governance.service";
import type {
  Organization,
  OrganizationMember,
} from "../db/schemas/admin/communities-and-cloning";

describe("ADM-001 T-19, T-20 · CommunitiesGovernanceService", () => {
  let mockRepo: ICommunitiesGovernanceRepository;
  let service: CommunitiesGovernanceService;

  const mockOrg: Organization = {
    id: "org-1",
    originatorClientId: "client-leader",
    name: "Comunidad Moda Colombia",
    moderationMode: "pre",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user-leader",
    updatedBy: "user-leader",
  };

  const mockMember: OrganizationMember = {
    id: "mem-1",
    organizationId: "org-1",
    clientId: "client-leader",
    role: "originator",
    status: "active",
    joinedAt: new Date(),
    leftAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "user-leader",
    updatedBy: "user-leader",
  };

  beforeEach(() => {
    mockRepo = {
      findActiveMembership: vi.fn().mockResolvedValue(null),
      findOrganizationById: vi.fn().mockResolvedValue(mockOrg),
      createOrganization: vi.fn().mockResolvedValue({ org: mockOrg, member: mockMember }),
      createJoinRequest: vi.fn().mockResolvedValue({ id: "req-1", status: "pending" }),
      findJoinRequestById: vi.fn().mockResolvedValue({
        id: "req-1",
        organizationId: "org-1",
        clientId: "client-applicant",
        status: "pending",
      }),
      updateJoinRequestStatus: vi.fn().mockResolvedValue(undefined),
      addMember: vi.fn().mockResolvedValue({
        ...mockMember,
        clientId: "client-applicant",
        role: "member",
      }),
      createPromotion: vi.fn().mockResolvedValue({ id: "promo-1", status: "pending" }),
      findPromotionById: vi.fn().mockResolvedValue({
        id: "promo-1",
        organizationId: "org-1",
        targetClientId: "client-target",
        status: "pending",
      }),
      updatePromotionStatus: vi.fn().mockResolvedValue(undefined),
      updateMemberRole: vi.fn().mockResolvedValue(undefined),
      setMemberLeft: vi.fn().mockResolvedValue(undefined),
    };

    service = new CommunitiesGovernanceService(mockRepo);
  });

  describe("T-19 · Creación de organizaciones y membresía única", () => {
    it("crea exitosamente una organización con inquilino originador", async () => {
      const res = await service.createOrganization({
        originatorClientId: "client-leader",
        name: "Comunidad Moda Colombia",
        createdByUserId: "user-leader",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.id).toBe("org-1");
      expect(res.data.originatorClientId).toBe("client-leader");
    });

    it("rechaza la creación si el inquilino ya pertenece a una comunidad activa", async () => {
      mockRepo.findActiveMembership = vi.fn().mockResolvedValue(mockMember);

      const res = await service.createOrganization({
        originatorClientId: "client-already-active",
        name: "Comunidad Duplicada",
        createdByUserId: "user-leader",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("TENANT_ALREADY_IN_COMMUNITY");
    });
  });

  describe("T-20 · Admisión y gobierno exclusivo por originador", () => {
    it("permite al originador aceptar solicitudes y agregar al nuevo miembro", async () => {
      const res = await service.decideJoinRequest({
        requestId: "req-1",
        decision: "accepted",
        deciderClientId: "client-leader", // Originador
        decidedByUserId: "user-leader",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.status).toBe("accepted");
      expect(mockRepo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          clientId: "client-applicant",
          role: "member",
        }),
      );
    });

    it("bloquea a un co-líder o tercero que intente admitir miembros (RF-08.6)", async () => {
      const res = await service.decideJoinRequest({
        requestId: "req-1",
        decision: "accepted",
        deciderClientId: "client-co-leader", // No es el originador
        decidedByUserId: "user-co-leader",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("UNAUTHORIZED_ORIGINATOR_ONLY");
      expect(mockRepo.addMember).not.toHaveBeenCalled();
    });

    it("requiere aceptación del tenant_owner promovido para activar el rol co_leader (RF-08.2)", async () => {
      // 1. Originador promueve
      const promoRes = await service.promoteMemberToCoLeader({
        organizationId: "org-1",
        originatorClientId: "client-leader",
        targetClientId: "client-target",
        promotedByUserId: "user-leader",
      });

      expect(promoRes.ok).toBe(true);

      // 2. Inquilino promovido acepta formalmente
      const acceptRes = await service.acceptPromotion({
        promotionId: "promo-1",
        targetClientId: "client-target",
        acceptedByUserId: "user-target",
      });

      expect(acceptRes.ok).toBe(true);
      expect(mockRepo.updateMemberRole).toHaveBeenCalledWith("org-1", "client-target", "co_leader");
    });

    it("permite la desvinculación voluntaria conservando histórico (RF-08.5)", async () => {
      const res = await service.leaveOrganization({
        organizationId: "org-1",
        clientId: "client-leaving",
      });

      expect(res.ok).toBe(true);
      expect(mockRepo.setMemberLeft).toHaveBeenCalledWith("org-1", "client-leaving");
    });
  });
});
