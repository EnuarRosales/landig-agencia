import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  Organization,
  OrganizationMember,
} from "../db/schemas/admin/communities-and-cloning";

export interface ICommunitiesGovernanceRepository {
  findActiveMembership(clientId: string): Promise<OrganizationMember | null>;
  findOrganizationById(orgId: string): Promise<Organization | null>;
  createOrganization(data: {
    originatorClientId: string;
    name: string;
    moderationMode: "pre" | "post" | "none";
    createdByUserId: string;
  }): Promise<{ org: Organization; member: OrganizationMember }>;
  createJoinRequest(data: {
    organizationId: string;
    clientId: string;
    requestedByUserId: string;
  }): Promise<{ id: string; status: string }>;
  findJoinRequestById(requestId: string): Promise<{
    id: string;
    organizationId: string;
    clientId: string;
    status: string;
  } | null>;
  updateJoinRequestStatus(
    requestId: string,
    status: "accepted" | "rejected",
    decidedByUserId: string,
  ): Promise<void>;
  addMember(data: {
    organizationId: string;
    clientId: string;
    role: "originator" | "co_leader" | "member";
    createdByUserId: string;
  }): Promise<OrganizationMember>;
  createPromotion(data: {
    organizationId: string;
    targetClientId: string;
    promotedByClientId: string;
    createdByUserId: string;
  }): Promise<{ id: string; status: string }>;
  findPromotionById(promotionId: string): Promise<{
    id: string;
    organizationId: string;
    targetClientId: string;
    status: string;
  } | null>;
  updatePromotionStatus(
    promotionId: string,
    status: "accepted" | "rejected",
    acceptedByUserId: string,
  ): Promise<void>;
  updateMemberRole(
    organizationId: string,
    clientId: string,
    role: "co_leader" | "member",
  ): Promise<void>;
  setMemberLeft(organizationId: string, clientId: string): Promise<void>;
}

/**
 * Servicio de gobernanza de comunidades, membresías, admisiones y promociones (ADM-001 T-19, T-20, RF-08).
 */
export class CommunitiesGovernanceService {
  constructor(private readonly repo: ICommunitiesGovernanceRepository) {}

  /**
   * Crea una nueva organización de comunidad con el inquilino originador (ADM-001 T-19, RF-08.1).
   */
  async createOrganization(params: {
    originatorClientId: string;
    name: string;
    moderationMode?: "pre" | "post" | "none";
    createdByUserId: string;
  }): Promise<Result<Organization>> {
    try {
      // Regla RF-08.3: Un inquilino pertenece a una sola comunidad activa
      const existing = await this.repo.findActiveMembership(params.originatorClientId);
      if (existing) {
        return err(
          "El inquilino ya pertenece a una comunidad activa. Debe desvincularse primero.",
          "TENANT_ALREADY_IN_COMMUNITY",
        );
      }

      const res = await this.repo.createOrganization({
        originatorClientId: params.originatorClientId,
        name: params.name,
        moderationMode: params.moderationMode ?? "pre",
        createdByUserId: params.createdByUserId,
      });

      appLogger.info("[CommunitiesGovernance] Organización de comunidad creada con éxito", {
        organizationId: res.org.id,
        originatorClientId: params.originatorClientId,
      });

      return ok(res.org);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al crear organización: ${msg}`, error);
      return err(msg, "CREATE_ORGANIZATION_ERROR");
    }
  }

  /**
   * Solicita admisión para unirse a una comunidad (ADM-001 T-20).
   */
  async requestJoin(params: {
    organizationId: string;
    clientId: string;
    requestedByUserId: string;
  }): Promise<Result<{ requestId: string; status: string }>> {
    try {
      const active = await this.repo.findActiveMembership(params.clientId);
      if (active) {
        return err("El inquilino ya pertenece a una comunidad activa.", "TENANT_ALREADY_IN_COMMUNITY");
      }

      const request = await this.repo.createJoinRequest({
        organizationId: params.organizationId,
        clientId: params.clientId,
        requestedByUserId: params.requestedByUserId,
      });

      return ok({ requestId: request.id, status: request.status });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al solicitar unión: ${msg}`, error);
      return err(msg, "JOIN_REQUEST_ERROR");
    }
  }

  /**
   * Decide sobre una solicitud de admisión (ADM-001 T-20, RF-08.6).
   * Solo el tenant_owner del originador puede aceptar solicitudes.
   */
  async decideJoinRequest(params: {
    requestId: string;
    decision: "accepted" | "rejected";
    deciderClientId: string;
    decidedByUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const request = await this.repo.findJoinRequestById(params.requestId);
      if (!request || request.status !== "pending") {
        return err("Solicitud de admisión no encontrada o ya resuelta.", "REQUEST_NOT_FOUND");
      }

      const org = await this.repo.findOrganizationById(request.organizationId);
      if (!org) {
        return err("Organización no encontrada.", "ORGANIZATION_NOT_FOUND");
      }

      // Regla RF-08.6: Solo el originador acepta solicitudes (los co-líderes no admiten)
      if (org.originatorClientId !== params.deciderClientId) {
        return err(
          "Solo el inquilino originador posee permisos para admitir nuevos miembros.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }

      await this.repo.updateJoinRequestStatus(
        params.requestId,
        params.decision,
        params.decidedByUserId,
      );

      if (params.decision === "accepted") {
        await this.repo.addMember({
          organizationId: org.id,
          clientId: request.clientId,
          role: "member",
          createdByUserId: params.decidedByUserId,
        });
      }

      appLogger.info("[CommunitiesGovernance] Solicitud de admisión resuelta", {
        requestId: params.requestId,
        decision: params.decision,
        clientId: request.clientId,
      });

      return ok({ status: params.decision });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al decidir solicitud de admisión: ${msg}`, error);
      return err(msg, "DECIDE_REQUEST_ERROR");
    }
  }

  /**
   * Promueve un miembro a co-líder (ADM-001 T-20, RF-08.2).
   * Solo el inquilino originador puede iniciar la promoción.
   */
  async promoteMemberToCoLeader(params: {
    organizationId: string;
    originatorClientId: string;
    targetClientId: string;
    promotedByUserId: string;
  }): Promise<Result<{ promotionId: string; status: string }>> {
    try {
      const org = await this.repo.findOrganizationById(params.organizationId);
      if (!org || org.originatorClientId !== params.originatorClientId) {
        return err(
          "Solo el inquilino originador puede promover miembros a co-líderes.",
          "UNAUTHORIZED_ORIGINATOR_ONLY",
        );
      }

      const promo = await this.repo.createPromotion({
        organizationId: params.organizationId,
        targetClientId: params.targetClientId,
        promotedByClientId: params.originatorClientId,
        createdByUserId: params.promotedByUserId,
      });

      return ok({ promotionId: promo.id, status: promo.status });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al promover a co-líder: ${msg}`, error);
      return err(msg, "PROMOTION_ERROR");
    }
  }

  /**
   * Acepta formalmente la promoción a co-líder (ADM-001 T-20, RF-08.2).
   * Requiere aceptación expresa del tenant_owner del inquilino promovido.
   */
  async acceptPromotion(params: {
    promotionId: string;
    targetClientId: string;
    acceptedByUserId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      const promo = await this.repo.findPromotionById(params.promotionId);
      if (!promo || promo.status !== "pending") {
        return err("Propuesta de promoción no encontrada o ya resuelta.", "PROMOTION_NOT_FOUND");
      }

      if (promo.targetClientId !== params.targetClientId) {
        return err("No está autorizado para responder a esta promoción.", "UNAUTHORIZED_TARGET_MISMATCH");
      }

      await this.repo.updatePromotionStatus(params.promotionId, "accepted", params.acceptedByUserId);
      await this.repo.updateMemberRole(promo.organizationId, promo.targetClientId, "co_leader");

      appLogger.info("[CommunitiesGovernance] Promoción a co-líder aceptada formalmente", {
        organizationId: promo.organizationId,
        clientId: promo.targetClientId,
      });

      return ok({ status: "accepted" });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al aceptar promoción: ${msg}`, error);
      return err(msg, "ACCEPT_PROMOTION_ERROR");
    }
  }

  /**
   * Desvinculación voluntaria de una comunidad conservando datos y clones (ADM-001 RF-08.5).
   */
  async leaveOrganization(params: {
    organizationId: string;
    clientId: string;
  }): Promise<Result<{ status: string }>> {
    try {
      await this.repo.setMemberLeft(params.organizationId, params.clientId);

      appLogger.info("[CommunitiesGovernance] Inquilino desvinculado de la comunidad", {
        organizationId: params.organizationId,
        clientId: params.clientId,
      });

      return ok({ status: "left" });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CommunitiesGovernance] Error al desvincularse de organización: ${msg}`, error);
      return err(msg, "LEAVE_ORGANIZATION_ERROR");
    }
  }
}
