import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CommunitiesGovernanceService,
  type ICommunitiesGovernanceRepository,
} from "./communities-governance.service";
import type {
  Organization,
  OrganizationMember,
} from "../db/schemas/admin/communities-and-cloning";

const mockDispatchTenantNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("./notification-dispatcher.service", async () => {
  const actual = await vi.importActual<typeof import("./notification-dispatcher.service")>(
    "./notification-dispatcher.service",
  );
  return {
    ...actual,
    getNotificationDispatcherService: () => ({
      dispatchTenantNotification: mockDispatchTenantNotification,
    }),
  };
});

describe("ADM-001 T-19, T-20 · CommunitiesGovernanceService", () => {
  let mockRepo: ICommunitiesGovernanceRepository;
  let service: CommunitiesGovernanceService;

  const mockOrg: Organization = {
    id: "org-1",
    originatorClientId: "client-leader",
    name: "Comunidad Moda Colombia",
    slug: "comunidad-moda-colombia",
    description: null,
    category: null,
    visibility: "private_invite",
    sharePolicy: "leaders_only",
    requireShareApproval: false,
    moderationMode: "pre",
    inviteCode: "MODA1234",
    status: "active",
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

  describe("SPEC-15 T-12 · Unicidad de invitaciones vigentes, expiración, reenvío y cancelación", () => {
    it("mantiene la invitación vigente sin duplicar y expira automáticamente una invitación caducada", async () => {
      mockDispatchTenantNotification.mockClear();
      mockRepo.findClientBySlugOrEmail = vi.fn().mockResolvedValue({
        id: "client-vitality",
        displayName: "Vitality Force",
        slug: "vitality-force",
        contactEmail: "hola@vitality.co",
      });
      mockRepo.findMembershipInOrg = vi.fn().mockResolvedValue(null);
      mockRepo.createInvitation = vi
        .fn()
        .mockResolvedValue({ id: "inv-new-1", status: "pending" });
      mockRepo.updateInvitationStatus = vi.fn().mockResolvedValue(undefined);
      mockRepo.getClientBasicInfo = vi.fn().mockResolvedValue({
        id: "client-vitality",
        displayName: "Vitality Force",
        slug: "vitality-force",
        contactEmail: "hola@vitality.co",
      });

      // Caso 1: Ya existe una invitación vigente -> la mantiene sin insertar duplicado
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      mockRepo.findPendingInvitationsForTarget = vi.fn().mockResolvedValue([
        {
          id: "inv-active-1",
          organizationId: "org-1",
          email: "hola@vitality.co",
          targetClientId: "client-vitality",
          role: "member",
          status: "pending",
          expiresAt: futureDate,
          createdAt: new Date(),
        },
      ]);

      const reuseRes = await service.inviteTenant({
        organizationId: "org-1",
        inviterClientId: "client-leader",
        inviterUserId: "user-leader",
        targetClientSlugOrEmail: "vitality-force",
        role: "member",
      });

      expect(reuseRes.ok).toBe(true);
      if (reuseRes.ok) {
        expect(reuseRes.data.invitationId).toBe("inv-active-1");
        expect(reuseRes.data.reusedExisting).toBe(true);
      }
      expect(mockRepo.createInvitation).not.toHaveBeenCalled();

      // Caso 2: Invitación previa caducada -> la marca 'expired' y crea una nueva
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockRepo.findPendingInvitationsForTarget = vi.fn().mockResolvedValue([
        {
          id: "inv-expired-0",
          organizationId: "org-1",
          email: "hola@vitality.co",
          targetClientId: "client-vitality",
          role: "member",
          status: "pending",
          expiresAt: pastDate,
          createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        },
      ]);

      const freshRes = await service.inviteTenant({
        organizationId: "org-1",
        inviterClientId: "client-leader",
        inviterUserId: "user-leader",
        targetClientSlugOrEmail: "vitality-force",
        role: "member",
      });

      expect(freshRes.ok).toBe(true);
      if (freshRes.ok) {
        expect(freshRes.data.invitationId).toBe("inv-new-1");
        expect(freshRes.data.reusedExisting).toBe(false);
      }
      expect(mockRepo.updateInvitationStatus).toHaveBeenCalledWith(
        "inv-expired-0",
        "expired",
        "user-leader",
      );
      expect(mockRepo.createInvitation).toHaveBeenCalledTimes(1);
    });

    it("permite al líder reenviar notificación con idempotencyKey fresca y cancelar (revoked) una invitación pendiente", async () => {
      mockDispatchTenantNotification.mockClear();
      const validExpiry = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
      mockRepo.findInvitationById = vi.fn().mockResolvedValue({
        id: "inv-pending-9",
        organizationId: "org-1",
        email: "hola@vitality.co",
        targetClientId: "client-vitality",
        role: "member",
        status: "pending",
        expiresAt: validExpiry,
      });
      mockRepo.updateInvitationStatus = vi.fn().mockResolvedValue(undefined);
      mockRepo.getClientBasicInfo = vi.fn().mockResolvedValue({
        id: "client-vitality",
        displayName: "Vitality Force",
        slug: "vitality-force",
        contactEmail: "hola@vitality.co",
      });

      // Solo el originador puede reenviar o cancelar
      const unauthorizedResend = await service.resendInvitationNotification({
        invitationId: "inv-pending-9",
        actorClientId: "client-co-leader",
        actorUserId: "user-co-leader",
      });
      expect(unauthorizedResend.ok).toBe(false);
      if (!unauthorizedResend.ok) {
        expect(unauthorizedResend.code).toBe("UNAUTHORIZED_ORIGINATOR_ONLY");
      }

      const resendRes = await service.resendInvitationNotification({
        invitationId: "inv-pending-9",
        actorClientId: "client-leader",
        actorUserId: "user-leader",
        baseUrl: "https://admin.mocter.co",
      });
      expect(resendRes.ok).toBe(true);
      expect(mockDispatchTenantNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-vitality",
          eventKey: "community.invited",
          idempotencyKey: expect.stringContaining("community-invite:inv-pending-9:resend:"),
        }),
      );

      const revokeRes = await service.revokeInvitation({
        invitationId: "inv-pending-9",
        actorClientId: "client-leader",
        actorUserId: "user-leader",
      });
      expect(revokeRes.ok).toBe(true);
      expect(mockRepo.updateInvitationStatus).toHaveBeenCalledWith(
        "inv-pending-9",
        "revoked",
        "user-leader",
      );
    });
  });
});
