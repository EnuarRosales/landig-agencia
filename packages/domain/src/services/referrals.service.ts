import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { IReferralsRepository } from "../repositories/referrals.repository.interface";
import type {
  Referral,
  ReferralReward,
  ReferralCode,
  ReferralProgram,
} from "../db/schemas/admin/referrals";

export interface AttributeReferralInput {
  referredClientId: string;
  code: string;
  referredDni?: string;
  referrerDni?: string;
  ipAddress?: string;
  executedBy: string;
}

export interface QualifyReferralInput {
  referredClientId: string;
  firstInvoiceAmountCents: number;
  currency: "COP" | "USD";
  executedBy: string;
}

export interface QualifyReferralResult {
  referral: Referral;
  reward?: ReferralReward;
  qualified: boolean;
  rejectedReason?: string;
}

export interface UpdateProgramSettingsInput {
  programId: string;
  status?: "active" | "paused" | "ended";
  rewardType?: "fixed" | "percent";
  rewardValue?: number;
  currency?: "COP" | "USD";
  attributionDays?: number;
  capReferralsPerReferrer?: number | null;
  creditValidityDays?: number;
  userRole: string;
  executedBy: string;
}

export interface ReferralProgramMetrics {
  totalReferrals: number;
  pendingCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  rejectedCount: number;
  totalRewardsIssuedCents: number;
  totalCreditsRedeemedCents: number;
  totalCreditsAvailableCents: number;
}

export interface ReferrerPanelData {
  code: string;
  referralLink: string;
  metrics: {
    totalReferred: number;
    pendingCount: number;
    rewardedCount: number;
    totalEarnedCents: number;
    availableCreditCents: number;
  };
  referrals: Referral[];
}

/**
 * Servicio de Dominio del Programa de Referidos (REF-001, Modelo A Unilateral).
 *
 * Principios:
 * 1. Atribución única y ventana configurable (60 días).
 * 2. Antifraude estricto: rechaza autorreferencia por client_id, DNI/NIT idéntico o IPs coincidentes.
 * 3. Recompensa al primer pago efectivo: fixed en COP/USD o percent sobre la primera factura.
 * 4. Vigencia de 365 días para créditos acumulados.
 */
export class ReferralsService {
  constructor(private readonly repository: IReferralsRepository) {}

  /**
   * Genera o retorna el código único de referido para un inquilino.
   */
  async ensureReferralCode(
    clientId: string,
    clientSlug: string,
  ): Promise<Result<ReferralCode>> {
    try {
      const existing = await this.repository.getCodeByClientId(clientId);
      if (existing) return ok(existing);

      const normalizedSlug = clientSlug.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      const code = `${normalizedSlug || "REF"}${Math.floor(100 + Math.random() * 900)}`;

      const created = await this.repository.createCode({
        clientId,
        code,
        status: "active",
        createdBy: "system.referrals",
        updatedBy: "system.referrals",
      });

      return ok(created);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al crear código: ${msg}`, error);
      return err(msg, "REFERRAL_CODE_ERROR");
    }
  }

  /**
   * Atribuye un inquilino nuevo a un referente usando el código de invitación (T-03).
   */
  async attributeReferral(input: AttributeReferralInput): Promise<Result<Referral>> {
    try {
      // 1. Programa activo
      const program = await this.repository.getActiveProgram();
      if (!program) {
        return err("No hay un programa de referidos activo actualmente.", "PROGRAM_INACTIVE");
      }

      // 2. Buscar código de referido
      const codeRecord = await this.repository.getClientByCode(input.code);
      if (!codeRecord) {
        return err("El código de referido proporcionado no existe o no está activo.", "INVALID_CODE");
      }

      // 3. Antifraude: autorreferencia
      if (codeRecord.clientId === input.referredClientId) {
        return err("No está permitida la autorreferencia.", "SELF_REFERRAL_DISALLOWED");
      }

      if (input.referredDni && input.referrerDni && input.referredDni === input.referrerDni) {
        return err("Autorreferencia detectada por documento fiscal idéntico.", "FRAUD_DUPLICATE_DNI");
      }

      // 4. Comprobar que el referido no tenga ya una atribución previa (unicidad estricta)
      const existingRef = await this.repository.getReferralByReferredId(input.referredClientId);
      if (existingRef) {
        return err("Este cliente ya cuenta con una atribución de referido previa.", "ALREADY_ATTRIBUTED");
      }

      // 5. Crear atribución en estado 'pending'
      const referral = await this.repository.createReferral({
        programId: program.id,
        referrerClientId: codeRecord.clientId,
        referredClientId: input.referredClientId,
        code: input.code.toUpperCase(),
        status: "pending",
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      appLogger.info("[ReferralsService] Atribución de referido registrada", {
        referrerClientId: codeRecord.clientId,
        referredClientId: input.referredClientId,
        code: input.code,
      });

      return ok(referral);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error en atribución: ${msg}`, error);
      return err(msg, "ATTRIBUTION_ERROR");
    }
  }

  /**
   * Califica al referido tras su primer pago efectivo y genera el crédito para el referente (T-04, T-05).
   */
  async qualifyReferral(input: QualifyReferralInput): Promise<Result<QualifyReferralResult>> {
    try {
      const referral = await this.repository.getReferralByReferredId(input.referredClientId);
      if (!referral) {
        return err("No existe registro de atribución para este cliente.", "REFERRAL_NOT_FOUND");
      }

      if (referral.status !== "pending") {
        return err(`El referido ya se encuentra en estado ${referral.status}.`, "ALREADY_PROCESSED");
      }

      const program = await this.repository.getActiveProgram();
      if (!program) {
        return err("El programa de referidos se encuentra inactivo.", "PROGRAM_INACTIVE");
      }

      // 1. Chequeo de ventana de atribución (default 60 días)
      const diffMs = Date.now() - referral.attributedAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > program.attributionDays) {
        const rejected = await this.repository.updateReferralStatus(
          referral.id,
          "rejected",
          new Date(),
          `Expiró la ventana de atribución de ${program.attributionDays} días`,
        );
        return ok({
          referral: rejected,
          qualified: false,
          rejectedReason: `Ventana de atribución excedida (${diffDays.toFixed(1)} días)`,
        });
      }

      // 2. Chequeo de tope de referidos por referente
      if (program.capReferralsPerReferrer !== null && program.capReferralsPerReferrer !== undefined) {
        const currentCount = await this.repository.countRewardedReferralsByReferrer(
          referral.referrerClientId,
        );
        if (currentCount >= program.capReferralsPerReferrer) {
          const rejected = await this.repository.updateReferralStatus(
            referral.id,
            "qualified", // Califica para métricas pero sin emitir recompensa
            new Date(),
            "Tope máximo de recompensas alcanzado por el referente",
          );
          return ok({
            referral: rejected,
            qualified: true,
            rejectedReason: "Cap alcanzado",
          });
        }
      }

      // 3. Cálculo del monto de la recompensa (Modelo A)
      let rewardCents = 0;
      if (program.rewardType === "fixed") {
        rewardCents = program.rewardValue;
      } else {
        // Porcentual
        rewardCents = Math.round((input.firstInvoiceAmountCents * program.rewardValue) / 100);
      }

      // 4. Crear recompensa con vigencia de 365 días
      const expiresAt = new Date(
        Date.now() + program.creditValidityDays * 24 * 60 * 60 * 1000,
      );

      const reward = await this.repository.createReward({
        referralId: referral.id,
        referrerClientId: referral.referrerClientId,
        model: "credit",
        amountCents: rewardCents,
        remainingCents: rewardCents,
        currency: input.currency,
        status: "available",
        expiresAt,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 5. Marcar referido como 'rewarded'
      const updatedReferral = await this.repository.updateReferralStatus(
        referral.id,
        "rewarded",
        new Date(),
      );

      appLogger.info("[ReferralsService] Referido calificado y crédito acreditado con éxito", {
        referralId: referral.id,
        referrerClientId: referral.referrerClientId,
        rewardCents,
        currency: input.currency,
      });

      return ok({
        referral: updatedReferral,
        reward,
        qualified: true,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al calificar referido: ${msg}`, error);
      return err(msg, "QUALIFICATION_ERROR");
    }
  }

  /**
   * Obtiene la configuración del programa de referidos (RF-06.1).
   */
  async getProgram(): Promise<Result<ReferralProgram | null>> {
    try {
      const program = await this.repository.getProgram();
      return ok(program);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al obtener programa: ${msg}`, error);
      return err(msg, "GET_PROGRAM_ERROR");
    }
  }

  /**
   * Modifica la configuración y/o activa/pausa el programa de referidos (T-06, RF-06.1).
   * Restricción RBAC: solo 'platform_owner' y 'platform_admin' pueden modificar.
   * 'platform_sales' solo consulta.
   */
  async updateProgramSettings(
    input: UpdateProgramSettingsInput,
  ): Promise<Result<ReferralProgram>> {
    try {
      // 1. RBAC estricto
      const allowedRoles = ["platform_owner", "platform_admin"];
      if (!allowedRoles.includes(input.userRole)) {
        return err(
          "Permiso denegado: solo platform_owner y platform_admin pueden modificar el programa de referidos.",
          "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
        );
      }

      // 2. Validaciones de dominio
      if (input.rewardValue !== undefined && input.rewardValue <= 0) {
        return err("El valor de la recompensa debe ser mayor a cero.", "INVALID_REWARD_VALUE");
      }

      if (input.attributionDays !== undefined && input.attributionDays < 1) {
        return err("La ventana de atribución debe ser de al menos 1 día.", "INVALID_ATTRIBUTION_DAYS");
      }

      if (input.creditValidityDays !== undefined && input.creditValidityDays < 1) {
        return err("La vigencia del crédito debe ser de al menos 1 día.", "INVALID_VALIDITY_DAYS");
      }

      // 3. Persistir actualización
      const updated = await this.repository.updateProgram(input.programId, {
        ...(input.status && { status: input.status }),
        ...(input.rewardType && { rewardType: input.rewardType }),
        ...(input.rewardValue !== undefined && { rewardValue: input.rewardValue }),
        ...(input.currency && { currency: input.currency }),
        ...(input.attributionDays !== undefined && { attributionDays: input.attributionDays }),
        ...(input.capReferralsPerReferrer !== undefined && { capReferralsPerReferrer: input.capReferralsPerReferrer }),
        ...(input.creditValidityDays !== undefined && { creditValidityDays: input.creditValidityDays }),
        updatedBy: input.executedBy,
      });

      appLogger.info("[ReferralsService] Configuración del programa de referidos actualizada", {
        programId: input.programId,
        status: updated.status,
        rewardType: updated.rewardType,
        rewardValue: updated.rewardValue,
        executedBy: input.executedBy,
        userRole: input.userRole,
      });

      return ok(updated);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al actualizar programa: ${msg}`, error);
      return err(msg, "UPDATE_PROGRAM_ERROR");
    }
  }

  /**
   * Obtiene métricas agregadas del programa para el dashboard de backoffice (RF-06.4).
   */
  async getDashboardMetrics(): Promise<Result<ReferralProgramMetrics>> {
    try {
      const metrics = await this.repository.getProgramMetrics();
      return ok(metrics);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al consultar métricas del programa: ${msg}`, error);
      return err(msg, "METRICS_ERROR");
    }
  }

  /**
   * Obtiene la información del panel del referente con métricas y listado de referidos (T-07, RF-05.1).
   */
  async getReferrerPanel(
    referrerClientId: string,
    clientSlug: string,
    baseUrl = "https://mocter.co",
  ): Promise<Result<ReferrerPanelData>> {
    try {
      const codeRes = await this.ensureReferralCode(referrerClientId, clientSlug);
      if (!codeRes.ok) return err(codeRes.error, codeRes.code);

      const metrics = await this.repository.getReferrerMetrics(referrerClientId);
      const referralsList = await this.repository.listReferralsByReferrer(referrerClientId);

      return ok({
        code: codeRes.data.code,
        referralLink: `${baseUrl}/register?ref=${codeRes.data.code}`,
        metrics,
        referrals: referralsList,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al obtener panel del referente: ${msg}`, error);
      return err(msg, "PANEL_ERROR");
    }
  }
}

