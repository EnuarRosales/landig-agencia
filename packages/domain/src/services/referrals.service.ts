import { createHmac } from "node:crypto";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { env } from "../utils/env";
import { DrizzleReferralsRepository } from "../repositories/drizzle-referrals.repository";
import type {
  IReferralsRepository,
  RedeemCreditsFefoResult,
} from "../repositories/referrals.repository.interface";
import type {
  Referral,
  ReferralReward,
  ReferralCode,
  ReferralProgram,
} from "../db/schemas/admin/referrals";
import { generateQrSvgDataUrl } from "./breb-qr.service";
import {
  buildAdminPortalUrl,
  getNotificationDispatcherService,
} from "./notification-dispatcher.service";

/**
 * Umbral máximo de atribuciones permitidas desde la misma IP hasheada por referente
 * dentro de la ventana de atribución (`SPEC-16 RN-SPEC-16-02`).
 */
export const MAX_REFERRALS_PER_IP_IN_WINDOW = 3;

export interface AttributeReferralInput {
  referredClientId: string;
  code: string;
  referredDni?: string;
  referrerDni?: string;
  ipAddress?: string;
  referrerIpHash?: string;
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
 * Parámetros de paginación y filtrado para el panel de referidos del inquilino (`SPEC-16 §9.1`).
 */
export interface TenantReferralsOverviewQuery {
  page?: number;
  limit?: number;
  status?: Referral["status"];
}

/**
 * Proyección segura de un comercio invitado para la tabla del referente (`RN-SPEC-16-04`).
 */
export interface TenantReferralMaskedItemDto {
  id: string;
  referredBusinessMasked: string;
  status: Referral["status"];
  attributedAt: string;
  qualifiedAt: string | null;
  rejectedReason: string | null;
  rewardAmountCents: number | null;
  rewardCurrency: string | null;
}

/**
 * Lote de crédito acumulado del inquilino con su fecha de expiración (`SPEC-16 §9.1`).
 */
export interface TenantReferralRewardDto {
  id: string;
  referralId: string;
  amountCents: number;
  remainingCents: number;
  currency: string;
  creditedAt: string;
  expiresAt: string;
  status: ReferralReward["status"];
}

/**
 * Movimiento del ledger de redenciones vinculado a una factura SaaS (`SPEC-16 D-02`).
 */
export interface TenantReferralRedemptionDto {
  id: string;
  rewardId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  redeemedAt: string;
}

/**
 * Respuesta completa del panel `/workspace/referrals` y `GET /api/tenant/referrals` (`SPEC-16 §9.1`).
 */
export interface TenantReferralsOverviewDto {
  program: {
    id: string;
    name: string;
    status: string;
    rewardType: string;
    rewardValue: number;
    currency: string;
    attributionDays: number;
    creditValidityDays: number;
    capReferralsPerReferrer: number | null;
  } | null;
  code: string | null;
  referralLink: string | null;
  qrSvgDataUrl: string | null;
  metrics: {
    totalReferred: number;
    pendingCount: number;
    rewardedCount: number;
    totalEarnedCents: number;
    availableCreditCents: number;
    currency: string;
  };
  referrals: {
    items: TenantReferralMaskedItemDto[];
    total: number;
    page: number;
    limit: number;
  };
  rewards: TenantReferralRewardDto[];
  redemptions: TenantReferralRedemptionDto[];
}

/**
 * Contrato de despacho de notificaciones transaccionales e in-app para eventos de referidos (`SPEC-14`, `SPEC-16 D-04`).
 */
export interface IReferralsNotificationDispatcher {
  dispatchReferralRegistered(params: {
    referrerClientId: string;
    referrerName: string;
    referredMaskedName: string;
    rewardSummary: string;
    referralId: string;
  }): Promise<void>;

  dispatchReferralRewardCredited(params: {
    referrerClientId: string;
    referrerName: string;
    referredMaskedName: string;
    rewardAmountFormatted: string;
    currency: string;
    expiresAtFormatted: string;
    rewardId: string;
  }): Promise<void>;
}

/**
 * Enmascara el nombre comercial de un comercio referido para proteger su privacidad (`SPEC-16 RN-SPEC-16-04`).
 *
 * Ejemplos:
 * - `"Café Andes"` → `"Café An***"`
 * - `"Tienda Beta"` → `"Tienda Be***"`
 * - `"Acme"` → `"Ac***"`
 *
 * @param displayName - Nombre comercial original del comercio referido.
 * @returns Identificador abreviado y enmascarado seguro para mostrar al referente.
 */
export function maskBusinessName(displayName: string | null | undefined): string {
  const clean = (displayName || "").trim().replace(/\s+/g, " ");
  if (!clean) {
    return "Comercio ***";
  }

  const parts = clean.split(" ");
  if (parts.length >= 2) {
    const firstWord = parts[0];
    const secondPrefix = parts[1].slice(0, 2);
    return `${firstWord} ${secondPrefix}***`;
  }

  if (clean.length <= 2) {
    return `${clean[0]}***`;
  }

  return `${clean.slice(0, 2)}***`;
}

/**
 * Normaliza un documento tributario o de identidad (NIT / DNI / CC) para comparaciones antifraude exactas.
 *
 * @param doc - Cadena de documento tributario cruda.
 * @returns Cadena alfanumérica en mayúsculas o `null` si está vacía.
 */
export function normalizeTaxDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const normalized = doc.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

/**
 * Genera el hash HMAC-SHA256 irreversible de una IP de cliente para controles antifraude sin almacenar PII (`SPEC-16 D-03`).
 *
 * @param ipAddress - Dirección IP del cliente.
 * @param pepper - Secreto HMAC (por defecto `env.AUTH_RATE_LIMIT_PEPPER`).
 * @returns Digest hexadecimal SHA-256.
 */
export function hashReferralIp(ipAddress: string, pepper?: string): string {
  const secret = pepper?.trim() || env.AUTH_RATE_LIMIT_PEPPER || "mocter-dev-pepper";
  return createHmac("sha256", secret).update(ipAddress.trim().toLowerCase()).digest("hex");
}

function formatRewardAmount(cents: number, currency: string): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-CO", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "COP",
      maximumFractionDigits: currency === "USD" ? 2 : 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

function formatProgramRewardSummary(program: ReferralProgram): string {
  if (program.rewardType === "percent") {
    return `${program.rewardValue}%`;
  }
  return formatRewardAmount(Number(program.rewardValue), program.currency);
}

/**
 * Servicio de Dominio del Programa de Referidos (`REF-001`, `SPEC-16`, Modelo A Unilateral).
 *
 * Principios:
 * 1. Atribución única y ventana configurable (default 60 días).
 * 2. Antifraude estricto en atribución y calificación: autorreferencia por `client_id`,
 *    coincidencia de `tax_id`/`DNI` y control de abuso por IP hasheada HMAC.
 * 3. Recompensa al primer pago efectivo: `fixed` siempre en `program.currency` o `percent` sobre la primera factura.
 * 4. Vigencia configurable (default 365 días) con redención FEFO multi-lote idempotente.
 */
export class ReferralsService {
  constructor(
    private readonly repository: IReferralsRepository,
    private readonly notificationDispatcher?: IReferralsNotificationDispatcher,
  ) {}

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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al crear código: ${msg}`, error);
      return err(msg, "REFERRAL_CODE_ERROR");
    }
  }

  /**
   * Evalúa si existe coincidencia de documento fiscal (`clients.tax_id` / `client_billing_profiles.dni`)
   * entre referente y referido (`SPEC-16 RN-SPEC-16-02`).
   */
  private async hasMatchingTaxIdentity(
    referrerClientId: string,
    referredClientId: string,
    explicitReferrerDni?: string,
    explicitReferredDni?: string,
  ): Promise<boolean> {
    const referrerDocs = new Set<string>();
    const referredDocs = new Set<string>();

    const normExplicitReferrer = normalizeTaxDocument(explicitReferrerDni);
    const normExplicitReferred = normalizeTaxDocument(explicitReferredDni);
    if (normExplicitReferrer) referrerDocs.add(normExplicitReferrer);
    if (normExplicitReferred) referredDocs.add(normExplicitReferred);

    if (this.repository.getClientFraudFingerprint) {
      const [referrerFp, referredFp] = await Promise.all([
        this.repository.getClientFraudFingerprint(referrerClientId),
        this.repository.getClientFraudFingerprint(referredClientId),
      ]);

      for (const candidate of [referrerFp?.taxId, referrerFp?.billingDni]) {
        const norm = normalizeTaxDocument(candidate);
        if (norm) referrerDocs.add(norm);
      }
      for (const candidate of [referredFp?.taxId, referredFp?.billingDni]) {
        const norm = normalizeTaxDocument(candidate);
        if (norm) referredDocs.add(norm);
      }
    }

    for (const doc of referredDocs) {
      if (referrerDocs.has(doc)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Atribuye un inquilino nuevo a un referente usando el código de invitación (`REF-001 T-03`, `SPEC-16 D-01/D-03`).
   */
  async attributeReferral(input: AttributeReferralInput): Promise<Result<Referral>> {
    try {
      // 1. Programa activo
      const program = await this.repository.getActiveProgram();
      if (!program) {
        return err("No hay un programa de referidos activo actualmente.", "PROGRAM_INACTIVE");
      }

      // 2. Buscar código de referido
      const normalizedCode = input.code.trim().toUpperCase();
      const codeRecord = await this.repository.getClientByCode(normalizedCode);
      if (!codeRecord) {
        return err("El código de referido proporcionado no existe o no está activo.", "INVALID_CODE");
      }

      // 3. Antifraude: autorreferencia directa
      if (codeRecord.clientId === input.referredClientId) {
        appLogger.warn("referrals.fraud_rejected", {
          reason: "SELF_REFERRAL_DISALLOWED",
          clientId: codeRecord.clientId,
          referredClientId: input.referredClientId,
        });
        return err("No está permitida la autorreferencia.", "SELF_REFERRAL_DISALLOWED");
      }

      // 4. Comprobar que el referido no tenga ya una atribución previa (unicidad estricta)
      const existingRef = await this.repository.getReferralByReferredId(input.referredClientId);
      if (existingRef) {
        return err("Este cliente ya cuenta con una atribución de referido previa.", "ALREADY_ATTRIBUTED");
      }

      const ipHash = input.ipAddress?.trim() ? hashReferralIp(input.ipAddress) : null;

      // 5. Antifraude: coincidencia exacta de documento fiscal (tax_id / DNI)
      const duplicateTaxId = await this.hasMatchingTaxIdentity(
        codeRecord.clientId,
        input.referredClientId,
        input.referrerDni,
        input.referredDni,
      );
      if (duplicateTaxId) {
        const rejectionReason = "Autorreferencia detectada por documento fiscal idéntico.";
        await this.repository.createReferral({
          programId: program.id,
          referrerClientId: codeRecord.clientId,
          referredClientId: input.referredClientId,
          code: normalizedCode,
          status: "rejected",
          rejectedReason: rejectionReason,
          attributedIpHash: ipHash,
          createdBy: input.executedBy,
          updatedBy: input.executedBy,
        });
        appLogger.warn("referrals.fraud_rejected", {
          reason: "FRAUD_DUPLICATE_DNI",
          clientId: codeRecord.clientId,
          referredClientId: input.referredClientId,
        });
        return err(rejectionReason, "FRAUD_DUPLICATE_DNI");
      }

      // 6. Antifraude: misma IP hasheada o exceso de registros en la ventana de atribución
      if (ipHash) {
        const windowStart = new Date(
          Date.now() - program.attributionDays * 24 * 60 * 60 * 1000,
        );
        const directIpCollision =
          Boolean(input.referrerIpHash && input.referrerIpHash === ipHash) ||
          Boolean(
            this.repository.hasIpCollisionWithReferrer &&
              (await this.repository.hasIpCollisionWithReferrer(codeRecord.clientId, ipHash)),
          );
        const sameIpCount = this.repository.countReferralsByIpHash
          ? await this.repository.countReferralsByIpHash(codeRecord.clientId, ipHash, windowStart)
          : 0;

        if (directIpCollision || sameIpCount >= MAX_REFERRALS_PER_IP_IN_WINDOW) {
          const rejectionReason = directIpCollision
            ? "Antifraude: coincidencia de origen IP entre referente y referido."
            : "Antifraude: exceso de registros referidos desde el mismo origen IP en la ventana vigente.";
          await this.repository.createReferral({
            programId: program.id,
            referrerClientId: codeRecord.clientId,
            referredClientId: input.referredClientId,
            code: normalizedCode,
            status: "rejected",
            rejectedReason: rejectionReason,
            attributedIpHash: ipHash,
            createdBy: input.executedBy,
            updatedBy: input.executedBy,
          });
          appLogger.warn("referrals.fraud_rejected", {
            reason: "FRAUD_IP_ABUSE",
            clientId: codeRecord.clientId,
            referredClientId: input.referredClientId,
            sameIpCount,
          });
          return err(rejectionReason, "FRAUD_IP_ABUSE");
        }
      }

      // 7. Crear atribución válida en estado 'pending'
      const referral = await this.repository.createReferral({
        programId: program.id,
        referrerClientId: codeRecord.clientId,
        referredClientId: input.referredClientId,
        code: normalizedCode,
        status: "pending",
        attributedIpHash: ipHash,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      appLogger.info("referrals.attributed", {
        clientId: codeRecord.clientId,
        referrerClientId: codeRecord.clientId,
        referredClientId: input.referredClientId,
        code: normalizedCode,
      });

      // 8. Notificar al referente vía SPEC-14 (`referral.registered`, no bloqueante)
      if (this.notificationDispatcher) {
        try {
          const [referrerFp, referredFp] = this.repository.getClientFraudFingerprint
            ? await Promise.all([
                this.repository.getClientFraudFingerprint(codeRecord.clientId),
                this.repository.getClientFraudFingerprint(input.referredClientId),
              ])
            : [null, null];

          await this.notificationDispatcher.dispatchReferralRegistered({
            referrerClientId: codeRecord.clientId,
            referrerName: referrerFp?.displayName || "Comercio",
            referredMaskedName: maskBusinessName(referredFp?.displayName),
            rewardSummary: formatProgramRewardSummary(program),
            referralId: referral.id,
          });
        } catch (notifyErr: unknown) {
          appLogger.warn("[ReferralsService] Fallo no bloqueante al notificar referral.registered", {
            referralId: referral.id,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return ok(referral);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error en atribución: ${msg}`, error);
      return err(msg, "ATTRIBUTION_ERROR");
    }
  }

  /**
   * Califica al referido tras su primer pago efectivo y genera el crédito para el referente (`REF-001`, `SPEC-16 D-03/D-04`).
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

      // 2. Antifraude tardío al momento del primer pago: tax_id / DNI (`SPEC-16 D-03`)
      const duplicateTaxId = await this.hasMatchingTaxIdentity(
        referral.referrerClientId,
        referral.referredClientId,
      );
      if (duplicateTaxId) {
        const reason = "Antifraude: coincidencia de documento fiscal entre referente y referido.";
        const rejected = await this.repository.updateReferralStatus(
          referral.id,
          "rejected",
          new Date(),
          reason,
        );
        appLogger.warn("referrals.fraud_rejected", {
          reason: "FRAUD_DUPLICATE_DNI_ON_QUALIFY",
          clientId: referral.referrerClientId,
          referredClientId: referral.referredClientId,
          referralId: referral.id,
        });
        return ok({
          referral: rejected,
          qualified: false,
          rejectedReason: reason,
        });
      }

      // 3. Chequeo de tope de referidos por referente
      if (program.capReferralsPerReferrer !== null && program.capReferralsPerReferrer !== undefined) {
        const currentCount = await this.repository.countRewardedReferralsByReferrer(
          referral.referrerClientId,
        );
        if (currentCount >= program.capReferralsPerReferrer) {
          const qualifiedOnly = await this.repository.updateReferralStatus(
            referral.id,
            "qualified", // Califica para métricas pero sin emitir recompensa
            new Date(),
            "Tope máximo de recompensas alcanzado por el referente",
          );
          return ok({
            referral: qualifiedOnly,
            qualified: true,
            rejectedReason: "Cap alcanzado",
          });
        }
      }

      // 4. Cálculo seguro del monto y moneda de la recompensa (`SPEC-16 D-03`)
      //    - fixed: siempre en `program.currency` (nunca heredar USD cuando rewardValue está en COP)
      //    - percent: porcentaje sobre la primera factura en `input.currency`
      let rewardCents = 0;
      let rewardCurrency: "COP" | "USD" = input.currency;
      if (program.rewardType === "fixed") {
        rewardCents = Number(program.rewardValue);
        rewardCurrency = program.currency === "USD" ? "USD" : "COP";
      } else {
        rewardCents = Math.round((input.firstInvoiceAmountCents * Number(program.rewardValue)) / 100);
        rewardCurrency = input.currency;
      }

      // 5. Crear recompensa con vigencia configurable (default 365 días)
      const expiresAt = new Date(
        Date.now() + program.creditValidityDays * 24 * 60 * 60 * 1000,
      );

      const reward = await this.repository.createReward({
        referralId: referral.id,
        referrerClientId: referral.referrerClientId,
        model: "credit",
        amountCents: rewardCents,
        remainingCents: rewardCents,
        currency: rewardCurrency,
        status: "available",
        expiresAt,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 6. Marcar referido como 'rewarded'
      const updatedReferral = await this.repository.updateReferralStatus(
        referral.id,
        "rewarded",
        new Date(),
      );

      appLogger.info("referrals.reward_credited", {
        referralId: referral.id,
        clientId: referral.referrerClientId,
        referrerClientId: referral.referrerClientId,
        referredClientId: referral.referredClientId,
        rewardCents,
        currency: rewardCurrency,
      });

      // 7. Notificar al referente vía SPEC-14 (`referral.reward_credited`, no bloqueante)
      if (this.notificationDispatcher) {
        try {
          const [referrerFp, referredFp] = this.repository.getClientFraudFingerprint
            ? await Promise.all([
                this.repository.getClientFraudFingerprint(referral.referrerClientId),
                this.repository.getClientFraudFingerprint(referral.referredClientId),
              ])
            : [null, null];

          await this.notificationDispatcher.dispatchReferralRewardCredited({
            referrerClientId: referral.referrerClientId,
            referrerName: referrerFp?.displayName || "Comercio",
            referredMaskedName: maskBusinessName(referredFp?.displayName),
            rewardAmountFormatted: formatRewardAmount(rewardCents, rewardCurrency),
            currency: rewardCurrency,
            expiresAtFormatted: expiresAt.toISOString().slice(0, 10),
            rewardId: reward.id,
          });
        } catch (notifyErr: unknown) {
          appLogger.warn("[ReferralsService] Fallo no bloqueante al notificar referral.reward_credited", {
            referralId: referral.id,
            rewardId: reward.id,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return ok({
        referral: updatedReferral,
        reward,
        qualified: true,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al calificar referido: ${msg}`, error);
      return err(msg, "QUALIFICATION_ERROR");
    }
  }

  /**
   * Consulta el saldo disponible de créditos de referidos vigentes de un comercio para una moneda dada.
   */
  async getAvailableCreditBalance(
    clientId: string,
    currency?: "COP" | "USD",
  ): Promise<Result<{ availableCreditCents: number; currency: "COP" | "USD" }>> {
    try {
      const available = await this.repository.listAvailableRewardsByReferrer(clientId);
      const filtered = currency
        ? available.filter((r) => r.currency.toUpperCase() === currency)
        : available;
      const resolvedCurrency: "COP" | "USD" =
        currency ?? (filtered[0]?.currency === "USD" ? "USD" : "COP");
      const total = filtered
        .filter((r) => r.currency.toUpperCase() === resolvedCurrency)
        .reduce((acc, r) => acc + Number(r.remainingCents), 0);

      return ok({ availableCreditCents: total, currency: resolvedCurrency });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService.getAvailableCreditBalance] Error: ${msg}`, error);
      return err(msg, "AVAILABLE_CREDIT_ERROR");
    }
  }

  /**
   * Redime créditos disponibles en orden FEFO (`expires_at ASC`) para una factura confirmada (`SPEC-16 D-02`).
   */
  async redeemCreditsFefoForInvoice(params: {
    clientId: string;
    invoiceId: string;
    maxAmountCents: number;
    currency: "COP" | "USD";
    executedBy: string;
  }): Promise<Result<RedeemCreditsFefoResult>> {
    try {
      if (params.maxAmountCents <= 0) {
        return ok({ totalRedeemedCents: 0, allocations: [], alreadyRedeemed: false });
      }

      if (this.repository.redeemCreditsFefoForInvoice) {
        const res = await this.repository.redeemCreditsFefoForInvoice(params);
        if (res.totalRedeemedCents > 0 && !res.alreadyRedeemed) {
          appLogger.info("referrals.credits_redeemed", {
            clientId: params.clientId,
            invoiceId: params.invoiceId,
            totalRedeemedCents: res.totalRedeemedCents,
            allocationsCount: res.allocations.length,
            currency: params.currency,
          });
        }
        return ok(res);
      }

      // Fallback para repositorios mock en tests unitarios
      const available = await this.repository.listAvailableRewardsByReferrer(params.clientId);
      const sorted = available
        .filter((r) => r.currency === params.currency && Number(r.remainingCents) > 0)
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

      let remaining = params.maxAmountCents;
      let totalRedeemedCents = 0;
      const allocations: RedeemCreditsFefoResult["allocations"] = [];

      for (const reward of sorted) {
        if (remaining <= 0) break;
        const toDeduct = Math.min(Number(reward.remainingCents), remaining);
        const updated = await this.repository.deductRewardCredit(
          reward.id,
          toDeduct,
          params.invoiceId,
        );
        allocations.push({
          rewardId: reward.id,
          amountCents: toDeduct,
          remainingCents: Number(updated.remainingCents),
          status: updated.status,
        });
        totalRedeemedCents += toDeduct;
        remaining -= toDeduct;
      }

      return ok({ totalRedeemedCents, allocations, alreadyRedeemed: false });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService.redeemCreditsFefoForInvoice] Error: ${msg}`, error);
      return err(msg, "REFERRAL_CREDIT_REDEMPTION_ERROR");
    }
  }

  /**
   * Obtiene la configuración del programa de referidos (`RF-06.1`).
   */
  async getProgram(): Promise<Result<ReferralProgram | null>> {
    try {
      const program = await this.repository.getProgram();
      return ok(program);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al obtener programa: ${msg}`, error);
      return err(msg, "GET_PROGRAM_ERROR");
    }
  }

  /**
   * Modifica la configuración y/o activa/pausa el programa de referidos (`REF-001 T-06`).
   * Restricción RBAC: solo `platform_owner` y `platform_admin` pueden modificar.
   */
  async updateProgramSettings(
    input: UpdateProgramSettingsInput,
  ): Promise<Result<ReferralProgram>> {
    try {
      const allowedRoles = ["platform_owner", "platform_admin"];
      if (!allowedRoles.includes(input.userRole)) {
        return err(
          "Permiso denegado: solo platform_owner y platform_admin pueden modificar el programa de referidos.",
          "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
        );
      }

      if (input.rewardValue !== undefined && input.rewardValue <= 0) {
        return err("El valor de la recompensa debe ser mayor a cero.", "INVALID_REWARD_VALUE");
      }

      if (input.attributionDays !== undefined && input.attributionDays < 1) {
        return err("La ventana de atribución debe ser de al menos 1 día.", "INVALID_ATTRIBUTION_DAYS");
      }

      if (input.creditValidityDays !== undefined && input.creditValidityDays < 1) {
        return err("La vigencia del crédito debe ser de al menos 1 día.", "INVALID_VALIDITY_DAYS");
      }

      const updated = await this.repository.updateProgram(input.programId, {
        ...(input.status && { status: input.status }),
        ...(input.rewardType && { rewardType: input.rewardType }),
        ...(input.rewardValue !== undefined && { rewardValue: input.rewardValue }),
        ...(input.currency && { currency: input.currency }),
        ...(input.attributionDays !== undefined && { attributionDays: input.attributionDays }),
        ...(input.capReferralsPerReferrer !== undefined && {
          capReferralsPerReferrer: input.capReferralsPerReferrer,
        }),
        ...(input.creditValidityDays !== undefined && {
          creditValidityDays: input.creditValidityDays,
        }),
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al actualizar programa: ${msg}`, error);
      return err(msg, "UPDATE_PROGRAM_ERROR");
    }
  }

  /**
   * Obtiene métricas agregadas del programa para el dashboard de backoffice SaaS (`RF-06.4`).
   */
  async getDashboardMetrics(): Promise<Result<ReferralProgramMetrics>> {
    try {
      const metrics = await this.repository.getProgramMetrics();
      return ok(metrics);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al consultar métricas del programa: ${msg}`, error);
      return err(msg, "METRICS_ERROR");
    }
  }

  /**
   * Obtiene el panorama completo del programa de referidos para el propietario del comercio (`SPEC-16 §9.1`).
   *
   * Garantiza:
   * - Generación idempotente del código único solo cuando el programa está `active` (`RN-SPEC-16-01`).
   * - Construcción del enlace `{publicBaseUrl}/r/{code}` sin hardcodear dominio/puertos (`AGENTS.md §4.12`, `§4.16`).
   * - Enmascaramiento estricto de los comercios referidos (`RN-SPEC-16-04`).
   * - Inclusión de código QR SVG descargable, lotes de crédito con expiración y ledger de redenciones.
   */
  async getTenantReferralsOverview(
    clientId: string,
    clientSlug: string,
    publicBaseUrl: string,
    query: TenantReferralsOverviewQuery = {},
  ): Promise<Result<TenantReferralsOverviewDto>> {
    try {
      const page = Math.max(1, Math.trunc(query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 20)));
      const normalizedBase = publicBaseUrl.trim().replace(/\/+$/, "");

      const program = await this.repository.getProgram();

      // RN-SPEC-16-01: solo genera código nuevo si el programa está activo; si está pausado/finalizado, conserva el existente sin crear nuevos.
      let codeRecord: ReferralCode | null = null;
      if (program?.status === "active") {
        const ensured = await this.ensureReferralCode(clientId, clientSlug);
        if (!ensured.ok) {
          return err(ensured.error, ensured.code);
        }
        codeRecord = ensured.data;
      } else {
        codeRecord = await this.repository.getCodeByClientId(clientId);
      }

      const [metrics, paginatedReferrals, rewardsList, redemptionsList] = await Promise.all([
        this.repository.getReferrerMetrics(clientId),
        this.repository.listReferralsByReferrerPaginated
          ? this.repository.listReferralsByReferrerPaginated(clientId, {
              page,
              limit,
              status: query.status,
            })
          : this.repository.listReferralsByReferrer(clientId).then((all) => {
              const filtered = query.status ? all.filter((r) => r.status === query.status) : all;
              const slice = filtered.slice((page - 1) * limit, page * limit);
              return {
                total: filtered.length,
                items: slice.map((r) => ({
                  id: r.id,
                  referredClientId: r.referredClientId,
                  referredDisplayName: null,
                  code: r.code,
                  status: r.status,
                  attributedAt: r.attributedAt,
                  qualifiedAt: r.qualifiedAt ?? null,
                  rejectedReason: r.rejectedReason ?? null,
                  rewardAmountCents: null,
                  rewardCurrency: null,
                })),
              };
            }),
        this.repository.listRewardsByReferrer
          ? this.repository.listRewardsByReferrer(clientId)
          : this.repository.listAvailableRewardsByReferrer(clientId),
        this.repository.listRedemptionsByReferrer
          ? this.repository.listRedemptionsByReferrer(clientId, 50)
          : Promise.resolve([]),
      ]);

      const activeCode = codeRecord?.status === "active" ? codeRecord.code : codeRecord?.code ?? null;
      const referralLink =
        activeCode && normalizedBase ? `${normalizedBase}/r/${activeCode}` : null;
      const qrSvgDataUrl = referralLink ? generateQrSvgDataUrl(referralLink) : null;
      const primaryCurrency = program?.currency || rewardsList[0]?.currency || "COP";

      return ok({
        program: program
          ? {
              id: program.id,
              name: program.name,
              status: program.status,
              rewardType: program.rewardType,
              rewardValue: Number(program.rewardValue),
              currency: program.currency,
              attributionDays: program.attributionDays,
              creditValidityDays: program.creditValidityDays,
              capReferralsPerReferrer: program.capReferralsPerReferrer ?? null,
            }
          : null,
        code: activeCode,
        referralLink,
        qrSvgDataUrl,
        metrics: {
          totalReferred: metrics.totalReferred,
          pendingCount: metrics.pendingCount,
          rewardedCount: metrics.rewardedCount,
          totalEarnedCents: metrics.totalEarnedCents,
          availableCreditCents: metrics.availableCreditCents,
          currency: primaryCurrency,
        },
        referrals: {
          items: paginatedReferrals.items.map((item) => ({
            id: item.id,
            referredBusinessMasked: maskBusinessName(item.referredDisplayName),
            status: item.status,
            attributedAt: item.attributedAt.toISOString(),
            qualifiedAt: item.qualifiedAt ? item.qualifiedAt.toISOString() : null,
            rejectedReason: item.rejectedReason ?? null,
            rewardAmountCents: item.rewardAmountCents,
            rewardCurrency: item.rewardCurrency,
          })),
          total: paginatedReferrals.total,
          page,
          limit,
        },
        rewards: rewardsList.map((rew) => ({
          id: rew.id,
          referralId: rew.referralId,
          amountCents: Number(rew.amountCents),
          remainingCents: Number(rew.remainingCents),
          currency: rew.currency,
          creditedAt: rew.creditedAt.toISOString(),
          expiresAt: rew.expiresAt.toISOString(),
          status: rew.status,
        })),
        redemptions: redemptionsList.map((red) => ({
          id: red.id,
          rewardId: red.rewardId,
          invoiceId: red.invoiceId,
          invoiceNumber: red.invoiceNumber,
          amountCents: Number(red.amountCents),
          currency: red.currency,
          redeemedAt: red.redeemedAt.toISOString(),
        })),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService.getTenantReferralsOverview] Error: ${msg}`, error);
      return err(msg, "TENANT_REFERRALS_OVERVIEW_ERROR");
    }
  }

  /**
   * Obtiene la información del panel del referente (compatibilidad heredada `REF-001 T-07`).
   */
  async getReferrerPanel(
    referrerClientId: string,
    clientSlug: string,
    baseUrl?: string,
  ): Promise<Result<ReferrerPanelData>> {
    try {
      const codeRes = await this.ensureReferralCode(referrerClientId, clientSlug);
      if (!codeRes.ok) return err(codeRes.error, codeRes.code);

      const metrics = await this.repository.getReferrerMetrics(referrerClientId);
      const referralsList = await this.repository.listReferralsByReferrer(referrerClientId);
      const resolvedBase = (baseUrl || env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

      return ok({
        code: codeRes.data.code,
        referralLink: resolvedBase
          ? `${resolvedBase}/r/${codeRes.data.code}`
          : `/r/${codeRes.data.code}`,
        metrics,
        referrals: referralsList,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralsService] Error al obtener panel del referente: ${msg}`, error);
      return err(msg, "PANEL_ERROR");
    }
  }
}

let defaultReferralsServiceInstance: ReferralsService | null = null;

function createDefaultReferralsNotificationDispatcher(): IReferralsNotificationDispatcher {
  const dispatcher = getNotificationDispatcherService();
  const referralsUrl = buildAdminPortalUrl("/workspace/referrals");

  return {
    async dispatchReferralRegistered(params) {
      await dispatcher.dispatchTenantNotification({
        clientId: params.referrerClientId,
        eventKey: "referral.registered",
        variables: {
          referrer_name: params.referrerName,
          referred_name: params.referredMaskedName,
          reward_summary: params.rewardSummary,
        },
        idempotencyKey: `referral:registered:${params.referralId}`,
        inAppPayload: {
          title: "Nuevo comercio invitado registrado",
          body: `${params.referredMaskedName} se registró con tu enlace. Al confirmar su primer pago recibirás ${params.rewardSummary}.`,
          severity: "info",
          actionUrl: "/workspace/referrals",
        },
      });
    },

    async dispatchReferralRewardCredited(params) {
      await dispatcher.dispatchTenantNotification({
        clientId: params.referrerClientId,
        eventKey: "referral.reward_credited",
        variables: {
          referrer_name: params.referrerName,
          referred_name: params.referredMaskedName,
          reward_amount: params.rewardAmountFormatted,
          currency: params.currency,
          expires_at: params.expiresAtFormatted,
          referrals_url: referralsUrl,
        },
        idempotencyKey: `referral:reward_credited:${params.rewardId}`,
        inAppPayload: {
          title: `Crédito acreditado · ${params.rewardAmountFormatted}`,
          body: `${params.referredMaskedName} completó su primer pago y recibiste ${params.rewardAmountFormatted} para tu plan.`,
          severity: "success",
          actionUrl: "/workspace/referrals",
        },
      });
    },
  };
}

/**
 * Retorna la instancia singleton de {@link ReferralsService} conectada al control-plane y al despachador `SPEC-14`.
 */
export function getReferralsService(): ReferralsService {
  if (!defaultReferralsServiceInstance) {
    const repo = new DrizzleReferralsRepository(getDb());
    defaultReferralsServiceInstance = new ReferralsService(
      repo,
      createDefaultReferralsNotificationDispatcher(),
    );
  }
  return defaultReferralsServiceInstance;
}
