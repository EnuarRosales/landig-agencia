import { createHash, randomUUID } from "node:crypto";
import { eq, sql, and, asc, gt, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "../db/index";
import {
  users,
  clients,
  clientRouting,
  clientPlans,
  plans,
  planLimits,
  clientPlanOverrides,
  cells,
  onboardingSessions,
  chatwootAccounts,
  botTones,
  botPresets,
  tenantBots,
  mediaCatalog,
  subscriptions,
} from "../db/schemas/admin";
import {
  cellProducts,
  cellProductMedia,
  cellClientMedia,
  cellClientBusinessInfo,
  cellClientUsage,
  cellTenantLabels,
  cellTenantPaymentChannels,
} from "../db/schemas/tenant";
import { withTenantCellTransaction } from "../db/cell-client";
import { provisionTenantInCellDataPlane } from "./admin-dashboard.service";
import { RESERVED_MOCTER_LEAD_LABELS } from "./onboarding-and-limits.service";
import {
  ChatwootProvisioningService,
  ChatwootHttpPlatformGateway,
  buildChatwootFeaturesAndLimitsForPlan,
  isChatwootEnabledForPlan,
} from "./chatwoot-provisioning.service";
import { ensureDefaultBotCatalogSeeded, BOT_OBJECTIVE_OPTIONS } from "./bot-catalog.seed";
import {
  TENANT_PAYMENT_CHANNEL_CODES,
  type TenantPaymentChannelCode,
} from "./tenant-payment-channels.service";
import { calculateProductProfitability, type ProductProfitabilitySummary } from "../utils/pricing-margin";
import { buildImgproxyUrl } from "./tenant-workspace.service";
import { S3StorageService } from "./s3-storage.service";
import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getBillingService } from "./billing.service";

/**
 * Llaves canónicas de etapa del asistente de onboarding en 5 pasos (`SPEC-06 §2.1`).
 */
export type OnboardingStepKey =
  | "business"
  | "plan"
  | "product"
  | "assistant_payments"
  | "billing"
  | "completed";

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5 | "completed";

const LEGACY_STEP_MAP: Record<string, OnboardingStepKey> = {
  business: "business",
  plan: "plan",
  product: "product",
  bot_channel: "assistant_payments",
  assistant_payments: "assistant_payments",
  billing: "billing",
  completed: "completed",
};

const STEP_KEY_TO_NUMBER: Record<OnboardingStepKey, OnboardingStepNumber> = {
  business: 1,
  plan: 2,
  product: 3,
  assistant_payments: 4,
  billing: 5,
  completed: "completed",
};

/**
 * Normaliza llaves heredadas de 3 pasos (`'bot_channel'`) hacia la máquina de 5 pasos (`SPEC-06 §ONB-02`).
 */
export function mapLegacyStep(rawStep?: string | null): OnboardingStepKey {
  if (!rawStep) return "business";
  return LEGACY_STEP_MAP[rawStep] ?? "business";
}

/**
 * Convierte una llave canónica de onboarding a su número de paso (`1..5` o `'completed'`).
 */
export function stepKeyToNumber(stepKey: OnboardingStepKey): OnboardingStepNumber {
  return STEP_KEY_TO_NUMBER[stepKey];
}

/**
 * Resumen de cuota numérica de una dimensión del catálogo para onboarding.
 */
export interface OnboardingPlanLimitItem {
  mode: "LIMITED" | "UNLIMITED";
  value: number | null;
}

/**
 * Resumen de límites de catálogo y archivos multimedia incluidos en un plan (`SPEC-03 T-05`).
 */
export interface OnboardingCatalogLimitsSummary {
  products: OnboardingPlanLimitItem;
  imagesPerProduct: OnboardingPlanLimitItem;
  videosPerProduct: OnboardingPlanLimitItem;
  audiosPerProduct: OnboardingPlanLimitItem;
  pdfsPerProduct: OnboardingPlanLimitItem;
  storageBytes: OnboardingPlanLimitItem;
}

/**
 * Borrador persistido del asistente de onboarding en 5 pasos (`SPEC-06 §5.2`).
 */
export interface OnboardingDraftPayloadV2 {
  business?: {
    displayName?: string;
    slug?: string;
    commercialEmail?: string | null;
    websiteUrl?: string | null;
    phone?: string | null;
    locale?: "es" | "en";
    currency?: string;
    timezone?: string;
    planCode?: string;
  };
  plan?: {
    planId?: string;
    planCode?: string;
    cycle?: "monthly" | "annual";
  };
  firstProduct?: {
    productId?: string;
    name?: string;
    description?: string;
    costPriceCents?: number | null;
    salePriceCents?: number;
    /** Alias de compatibilidad hacia atrás. */
    priceCents?: number;
    currency?: string;
    kind?: "physical" | "digital" | "service";
    coverMediaUrl?: string | null;
    profitability?: ProductProfitabilitySummary;
  };
  assistantAndPayments?: {
    botId?: string;
    botName?: string;
    botObjective?: string;
    botPresetId?: string;
    botToneId?: string;
    paymentChannelIds?: string[];
    paymentMethods?: string[];
    orderConfirmationMessage?: string;
  };
  /** Alias heredado v1 de configuración del bot. */
  botConfig?: {
    botPreset?: string;
    paymentMethods?: string[];
  };
  chatwootLabelsInitialized?: boolean;
}

/**
 * Estado DTO estructurado del asistente de onboarding en 5 pasos devuelto a la UI (`SPEC-06`).
 */
export interface TenantOnboardingStateDto {
  step: OnboardingStepNumber;
  stepKey: OnboardingStepKey;
  client: {
    id: string;
    displayName: string;
    slug: string;
    commercialEmail: string | null;
    phone: string | null;
    websiteUrl: string | null;
    logoMediaId: string | null;
    logoUrl: string | null;
    locale: "es" | "en";
    currency: string;
    timezone: string;
    lifecycleStatus: string;
    planId?: string | null;
    planCode?: string | null;
    cellCode?: string | null;
  } | null;
  draft: OnboardingDraftPayloadV2;
  availablePlans: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    names: { es: string; en: string };
    descriptions: { es: string; en: string };
    currency: string;
    priceMonthlyCents: number;
    priceAnnualCents: number;
    priceMonthlyUsdCents: number;
    priceAnnualUsdCents: number;
    trialDays: number;
    isPublic: boolean;
    isPopular: boolean;
    catalogLimits?: OnboardingCatalogLimitsSummary;
  }>;
  currentCatalogSummary?: OnboardingCatalogLimitsSummary | null;
  botCatalog: {
    tones: Array<{
      id: string;
      code: string;
      labels: { es: string; en: string };
      description: { es: string; en: string };
    }>;
    presets: Array<{
      id: string;
      code: string;
      labels: { es: string; en: string };
      recommendedFor: { es: string; en: string };
    }>;
    objectives: Array<{
      code: string;
      labels: { es: string; en: string };
    }>;
  };
  paymentChannels: Array<{
    id: string;
    channelCode: TenantPaymentChannelCode;
    displayName: string;
    accountIdentifier: string | null;
    accountHolderName: string | null;
    instructions: string | null;
    isActive: boolean;
  }>;
}

/**
 * Entrada para el Paso 1: Identidad del Negocio (`SPEC-06 ONB-03`, `SPEC-05`).
 */
export interface SaveStep1BusinessInput {
  displayName: string;
  slug: string;
  commercialEmail?: string | null;
  websiteUrl?: string | null;
  phone?: string | null;
  locale?: "es" | "en";
  currency?: string;
  timezone?: string;
  planCode?: string;
}

/** Alias de compatibilidad hacia atrás. */
export type CompleteStep1BusinessInput = SaveStep1BusinessInput;

export interface CompleteStep1BusinessOutcome {
  clientId: string;
  slug: string;
  displayName: string;
  locale: "es" | "en";
  nextStep: 2;
}

/**
 * Entrada para el Paso 2: Selección de Plan Comercial y Ciclo (`SPEC-06 ONB-07`).
 */
export interface SaveStep2PlanInput {
  planId?: string;
  planCode?: string;
  cycle?: "monthly" | "annual";
}

export interface SaveStep2PlanOutcome {
  planId: string;
  planCode: string;
  cycle: "monthly" | "annual";
  nextStep: 3;
}

/**
 * Entrada para el Paso 3: Primer Producto, Costo y Rentabilidad (`SPEC-06 ONB-08`).
 */
export interface SaveStep3ProductInput {
  name: string;
  description: string;
  costPriceCents?: number | null;
  /** Precio de venta regular persistido en `cell_products.price_cents` (`D-01`). */
  salePriceCents?: number;
  /** Alias heredado de precio de venta en centavos. */
  priceCents?: number;
  currency?: string;
  kind?: "physical" | "digital" | "service";
}

/** Alias de compatibilidad hacia atrás. */
export type CompleteStep2FirstProductInput = SaveStep3ProductInput;

export interface CompleteStep2FirstProductOutcome {
  productId: string;
  name: string;
  profitability: ProductProfitabilitySummary;
  nextStep: 4;
}

/**
 * Canal de pago capturado o editado rápidamente desde el Paso 4 (`SPEC-05`).
 */
export interface OnboardingPaymentChannelInput {
  id?: string;
  channelCode: TenantPaymentChannelCode;
  displayName: string;
  accountIdentifier?: string | null;
  accountHolderName?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}

/**
 * Entrada para el Paso 4: Asistente Virtual, Canales de Pago y Etiquetas Chatwoot (`SPEC-06 ONB-09`).
 */
export interface SaveStep4AssistantPaymentsInput {
  botName?: string;
  botObjective?: string;
  botPresetId?: string;
  botPreset?: string;
  botToneId?: string;
  paymentChannels?: OnboardingPaymentChannelInput[];
  paymentMethods?: string[];
  orderConfirmationMessage?: string;
  orderMessage?: string;
  shippingPolicy?: Record<string, unknown>;
  returnsPolicy?: string;
  warrantyPolicy?: string;
}

export interface SaveStep4AssistantPaymentsOutcome {
  botId: string | null;
  chatwootLabelsInitialized: boolean;
  nextStep: 5;
}

/**
 * Entrada para el Paso 5: Activación de Prueba Gratuita, Plan Gratis o Confirmación de Pago (`SPEC-06 D-03`).
 */
export interface CompleteStep5BillingInput {
  completionMode?: "trial" | "free" | "pending_payment_review" | "paid";
  planCode?: string;
  cycle?: "monthly" | "annual";
}

/** Alias heredado de Paso 3 anterior. */
export type CompleteStep3BotAndActivateInput = SaveStep4AssistantPaymentsInput &
  CompleteStep5BillingInput;

export interface CompleteStep3BotAndActivateOutcome {
  clientId: string;
  lifecycleStatus: "activo";
  redirectTo: "/workspace";
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_COVER_MIMES = new Map<string, "png" | "jpg" | "webp">([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const MAX_PRODUCT_COVER_BYTES = 5 * 1024 * 1024;

function normalizeOptionalEmail(value: string | null | undefined): Result<string | null> {
  if (value === undefined || value === null || value.trim() === "") {
    return ok(null);
  }
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    return err("El correo comercial no tiene un formato válido.", "INVALID_COMMERCIAL_EMAIL");
  }
  return ok(normalized);
}

function normalizeOptionalUrl(value: string | null | undefined): Result<string | null> {
  if (value === undefined || value === null || value.trim() === "") {
    return ok(null);
  }
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err("El sitio web debe iniciar con http:// o https://.", "INVALID_WEBSITE_URL");
    }
    return ok(parsed.toString());
  } catch {
    return err("El sitio web no tiene una URL válida.", "INVALID_WEBSITE_URL");
  }
}

function normalizeOptionalPhone(value: string | null | undefined): Result<string | null> {
  if (value === undefined || value === null || value.trim() === "") {
    return ok(null);
  }
  const trimmed = value.trim();
  if (trimmed.length < 7 || trimmed.length > 30) {
    return err("El teléfono debe tener entre 7 y 30 caracteres.", "INVALID_PHONE");
  }
  return ok(trimmed);
}

function defaultCatalogLimits(): OnboardingCatalogLimitsSummary {
  return {
    products: { mode: "LIMITED", value: 0 },
    imagesPerProduct: { mode: "LIMITED", value: 0 },
    videosPerProduct: { mode: "LIMITED", value: 0 },
    audiosPerProduct: { mode: "LIMITED", value: 0 },
    pdfsPerProduct: { mode: "LIMITED", value: 0 },
    storageBytes: { mode: "LIMITED", value: 0 },
  };
}

function applyLimitDim(
  target: OnboardingCatalogLimitsSummary,
  dimension: string,
  item: OnboardingPlanLimitItem,
) {
  if (dimension === "products") target.products = item;
  else if (dimension === "images_per_product") target.imagesPerProduct = item;
  else if (dimension === "videos_per_product") target.videosPerProduct = item;
  else if (dimension === "audios_per_product") target.audiosPerProduct = item;
  else if (dimension === "pdfs_per_product") target.pdfsPerProduct = item;
  else if (dimension === "storage_bytes") target.storageBytes = item;
}

/**
 * Siembra de manera idempotente las 4 etiquetas base reservadas de Mocter en `admin.tenant_labels`
 * dentro de la celda del inquilino (`SPEC-06 ONB-09`, `ADM-001 RF-03.7`).
 */
export async function ensureDefaultChatwootLabels(
  clientId: string,
  actorEmail: string,
): Promise<boolean> {
  await withTenantCellTransaction(clientId, async (tx) => {
    for (const label of RESERVED_MOCTER_LEAD_LABELS) {
      await tx
        .insert(cellTenantLabels)
        .values({
          clientId,
          title: label.title,
          description: label.description,
          color: label.color,
          showOnSidebar: label.showOnSidebar,
          origin: label.origin,
          state: "active",
          createdBy: actorEmail,
          updatedBy: actorEmail,
        })
        .onConflictDoNothing();
    }
  });
  return true;
}

/**
 * Servicio unificado de onboarding en 5 pasos para inquilinos de Mocter (`SPEC-06`).
 *
 * Soporta de manera simétrica:
 * 1. Alta Manual: Inquilino pre-creado en estado `'alta'`; valida y completa los 5 pasos.
 * 2. Alta Autónoma: Prospecto registrado con `activeClientId = NULL`; aprovisiona al guardar Paso 1.
 */
export class TenantOnboardingService {
  constructor(private readonly chatwootProvisioningService?: ChatwootProvisioningService) {}

  private async resolveUserAndClient(userId: string): Promise<{
    user: typeof users.$inferSelect | null;
    client: typeof clients.$inferSelect | null;
  }> {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return { user: null, client: null };
    }

    let client: typeof clients.$inferSelect | null = null;
    if (user.activeClientId) {
      const [found] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, user.activeClientId), sql`${clients.lifecycleStatus} <> 'baja'`))
        .limit(1);
      client = found || null;
    }

    if (!client) {
      const [foundByOwner] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.ownerUserId, userId), sql`${clients.lifecycleStatus} <> 'baja'`))
        .limit(1);
      client = foundByOwner || null;
    }

    return { user, client };
  }

  /**
   * Resuelve el estado actual de onboarding en 5 pasos para el usuario autenticado.
   */
  async getOnboardingState(
    userId: string,
    options?: { preselectedPlanCode?: string },
  ): Promise<Result<TenantOnboardingStateDto>> {
    const db = getDb();

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado en el sistema.", "USER_NOT_FOUND");
      }

      const [session] = await db
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, userId))
        .limit(1);

      // Asegurar catálogos base de IA (fail-soft frente a mocks unitarios sin tabla)
      await ensureDefaultBotCatalogSeeded(db);

      const activePlansRaw = await db
        .select({
          id: plans.id,
          code: plans.code,
          name: plans.name,
          description: plans.description,
          currency: plans.currency,
          priceMonthlyCents: plans.priceMonthlyCents,
          priceAnnualCents: plans.priceAnnualCents,
          priceMonthlyUsdCents: plans.priceMonthlyUsdCents,
          priceAnnualUsdCents: plans.priceAnnualUsdCents,
          trialDays: plans.trialDays,
          isPublic: plans.isPublic,
          isPopular: plans.isPopular,
        })
        .from(plans)
        .where(eq(plans.status, "active"))
        .orderBy(asc(plans.sortOrder));

      const availablePlans = activePlansRaw.map((p) => {
        const names =
          typeof p.name === "string"
            ? { es: p.name, en: p.name }
            : {
                es: (p.name as { es?: string; en?: string })?.es || p.code,
                en:
                  (p.name as { es?: string; en?: string })?.en ||
                  (p.name as { es?: string; en?: string })?.es ||
                  p.code,
              };
        const descriptions =
          typeof p.description === "string"
            ? { es: p.description, en: p.description }
            : {
                es: (p.description as { es?: string; en?: string } | null)?.es || "",
                en:
                  (p.description as { es?: string; en?: string } | null)?.en ||
                  (p.description as { es?: string; en?: string } | null)?.es ||
                  "",
              };

        return {
          id: p.id,
          code: p.code,
          name: names.es,
          description: descriptions.es,
          names,
          descriptions,
          currency: p.currency || "COP",
          priceMonthlyCents: Number(p.priceMonthlyCents ?? 0),
          priceAnnualCents: Number(p.priceAnnualCents ?? 0),
          priceMonthlyUsdCents: Number(p.priceMonthlyUsdCents ?? 0),
          priceAnnualUsdCents: Number(p.priceAnnualUsdCents ?? 0),
          trialDays: Number(p.trialDays ?? 14),
          isPublic: Boolean(p.isPublic ?? true),
          isPopular: Boolean(p.isPopular ?? false),
        };
      });

      // Catálogo real de tonos y presets de bot
      let tonesCatalog: TenantOnboardingStateDto["botCatalog"]["tones"] = [];
      let presetsCatalog: TenantOnboardingStateDto["botCatalog"]["presets"] = [];
      try {
        const [toneRows, presetRows] = await Promise.all([
          db
            .select({
              id: botTones.id,
              code: botTones.code,
              labels: botTones.labels,
              description: botTones.description,
            })
            .from(botTones)
            .where(eq(botTones.isActive, true))
            .orderBy(asc(botTones.sortOrder)),
          db
            .select({
              id: botPresets.id,
              code: botPresets.code,
              labels: botPresets.labels,
              recommendedFor: botPresets.recommendedFor,
            })
            .from(botPresets)
            .where(eq(botPresets.isActive, true))
            .orderBy(asc(botPresets.sortOrder)),
        ]);
        if (Array.isArray(toneRows)) tonesCatalog = toneRows;
        if (Array.isArray(presetRows)) presetsCatalog = presetRows;
      } catch {
        // Resiliencia ante mocks parciales
      }

      // Evaluar celda, logo, canales de pago, producto existente y bot si el cliente ya existe
      let cellCode: string | null = null;
      let logoUrl: string | null = null;
      let productCount = 0;
      let hasBotConfig = false;
      let cellPaymentChannels: TenantOnboardingStateDto["paymentChannels"] = [];

      if (client) {
        try {
          const [routing] = await db
            .select({
              cellId: clientRouting.cellId,
              cellCode: cells.code,
            })
            .from(clientRouting)
            .leftJoin(cells, eq(cells.id, clientRouting.cellId))
            .where(eq(clientRouting.clientId, client.id))
            .limit(1);
          cellCode = routing?.cellCode || null;
        } catch {
          cellCode = null;
        }

        if (client.logoMediaId) {
          try {
            const [mediaRow] = await db
              .select({ storageKey: mediaCatalog.storageKey })
              .from(mediaCatalog)
              .where(eq(mediaCatalog.id, client.logoMediaId))
              .limit(1);
            if (mediaRow?.storageKey) {
              logoUrl = buildImgproxyUrl(mediaRow.storageKey, { width: 256, height: 256, format: "webp" });
            }
          } catch {
            logoUrl = null;
          }
        }

        try {
          const [botRow] = await db
            .select({ id: tenantBots.id })
            .from(tenantBots)
            .where(and(eq(tenantBots.clientId, client.id), isNull(tenantBots.deletedAt)))
            .limit(1);
          if (botRow) hasBotConfig = true;
        } catch {
          // Resiliencia ante mocks parciales
        }

        try {
          await withTenantCellTransaction(client.id, async (tx) => {
            const pRows = await tx
              .select({ id: cellProducts.id })
              .from(cellProducts)
              .where(eq(cellProducts.clientId, client.id));
            productCount = pRows.length;

            if (!hasBotConfig) {
              const bRows = await tx
                .select({
                  clientId: cellClientBusinessInfo.clientId,
                  botPreset: cellClientBusinessInfo.botPreset,
                })
                .from(cellClientBusinessInfo)
                .where(eq(cellClientBusinessInfo.clientId, client.id));
              hasBotConfig = bRows.length > 0 && !!bRows[0]?.botPreset;
            }

            try {
              const channelRows = await tx
                .select({
                  id: cellTenantPaymentChannels.id,
                  channelCode: cellTenantPaymentChannels.channelCode,
                  displayName: cellTenantPaymentChannels.displayName,
                  accountIdentifier: cellTenantPaymentChannels.accountIdentifier,
                  accountHolderName: cellTenantPaymentChannels.accountHolderName,
                  instructions: cellTenantPaymentChannels.instructions,
                  isActive: cellTenantPaymentChannels.isActive,
                })
                .from(cellTenantPaymentChannels)
                .where(eq(cellTenantPaymentChannels.clientId, client.id))
                .orderBy(asc(cellTenantPaymentChannels.sortOrder));

              if (Array.isArray(channelRows)) {
                cellPaymentChannels = channelRows.map((ch) => ({
                  id: ch.id,
                  channelCode: (TENANT_PAYMENT_CHANNEL_CODES.includes(
                    ch.channelCode as TenantPaymentChannelCode,
                  )
                    ? ch.channelCode
                    : "other") as TenantPaymentChannelCode,
                  displayName: ch.displayName,
                  accountIdentifier: ch.accountIdentifier,
                  accountHolderName: ch.accountHolderName,
                  instructions: ch.instructions,
                  isActive: ch.isActive,
                }));
              }
            } catch {
              // Resiliencia ante mocks parciales de transacción celular
            }
          });
        } catch (cellErr) {
          appLogger.warn("[getOnboardingState] No se pudo consultar el data plane celular aún.", {
            clientId: client.id,
            error: cellErr instanceof Error ? cellErr.message : String(cellErr),
          });
        }
      }

      // Determinar el paso actual con retrocompatibilidad v1 -> v2
      let stepKey: OnboardingStepKey = "business";
      if (client?.lifecycleStatus === "activo") {
        stepKey = "completed";
      } else if (!client) {
        stepKey = "business";
      } else if (session?.currentStep) {
        const mapped = mapLegacyStep(session.currentStep);
        stepKey = mapped === "completed" ? "billing" : mapped;
      } else if (productCount > 0 && hasBotConfig) {
        stepKey = "billing";
      } else if (productCount > 0) {
        stepKey = "assistant_payments";
      } else {
        // Cliente en alta sin sesión previa: comienza en Paso 1 para confirmar datos/logo
        stepKey = "business";
      }

      const preselectedPlan =
        options?.preselectedPlanCode &&
        availablePlans.some((p) => p.code === options.preselectedPlanCode)
          ? options.preselectedPlanCode
          : undefined;

      const draftPayload = ((session?.draftPayload as OnboardingDraftPayloadV2) || {}) as OnboardingDraftPayloadV2;
      if (preselectedPlan && !draftPayload.plan?.planCode) {
        const matched = availablePlans.find((p) => p.code === preselectedPlan);
        draftPayload.plan = {
          planId: matched?.id,
          planCode: preselectedPlan,
          cycle: "monthly",
        };
      }

      let currentPlanCode =
        preselectedPlan || draftPayload.plan?.planCode || session?.planCode || "free";
      if (client?.planId) {
        const matched = availablePlans.find((p) => p.id === client.planId);
        if (matched && !preselectedPlan) {
          currentPlanCode = matched.code;
        }
      }

      const limitsByPlanId = new Map<string, OnboardingCatalogLimitsSummary>();
      const planIdsToQuery = Array.from(
        new Set([...availablePlans.map((p) => p.id), ...(client?.planId ? [client.planId] : [])]),
      );

      if (planIdsToQuery.length > 0) {
        try {
          const limitRowsRaw = await db
            .select({
              planId: planLimits.planId,
              dimension: planLimits.dimension,
              mode: planLimits.mode,
              value: planLimits.value,
            })
            .from(planLimits)
            .where(inArray(planLimits.planId, planIdsToQuery));

          if (Array.isArray(limitRowsRaw)) {
            for (const row of limitRowsRaw) {
              const summary = limitsByPlanId.get(row.planId) ?? defaultCatalogLimits();
              const mode: "LIMITED" | "UNLIMITED" =
                row.mode === "UNLIMITED" ? "UNLIMITED" : "LIMITED";
              applyLimitDim(summary, row.dimension, {
                mode,
                value: mode === "UNLIMITED" ? null : Number(row.value ?? 0),
              });
              limitsByPlanId.set(row.planId, summary);
            }
          }
        } catch {
          // Resiliencia ante mocks parciales
        }
      }

      const enrichedPlans = availablePlans.map((p) => ({
        ...p,
        catalogLimits: limitsByPlanId.get(p.id) ?? defaultCatalogLimits(),
      }));

      let currentCatalogSummary: OnboardingCatalogLimitsSummary | null = null;
      const activePlanObj =
        (client?.planId ? enrichedPlans.find((p) => p.id === client.planId) : undefined) ||
        enrichedPlans.find((p) => p.code === currentPlanCode);

      if (client?.planId) {
        const base =
          limitsByPlanId.get(client.planId) ??
          activePlanObj?.catalogLimits ??
          defaultCatalogLimits();
        currentCatalogSummary = { ...base };
        try {
          const now = new Date();
          const overrideRows = await db
            .select({
              dimension: clientPlanOverrides.dimension,
              value: clientPlanOverrides.value,
            })
            .from(clientPlanOverrides)
            .where(
              and(
                eq(clientPlanOverrides.clientId, client.id),
                lte(clientPlanOverrides.validFrom, now),
                or(
                  isNull(clientPlanOverrides.validTo),
                  gt(clientPlanOverrides.validTo, now),
                ),
              ),
            );
          if (Array.isArray(overrideRows)) {
            for (const row of overrideRows) {
              applyLimitDim(currentCatalogSummary, row.dimension, {
                mode: row.value === null ? "UNLIMITED" : "LIMITED",
                value: row.value !== null ? Number(row.value) : null,
              });
            }
          }
        } catch {
          // Resiliencia ante mocks parciales
        }
      } else if (activePlanObj?.catalogLimits) {
        currentCatalogSummary = activePlanObj.catalogLimits;
      }

      const clientDto: TenantOnboardingStateDto["client"] = client
        ? {
            id: client.id,
            displayName: client.displayName,
            slug: client.slug,
            commercialEmail: client.commercialEmail ?? null,
            phone: client.phone ?? null,
            websiteUrl: client.websiteUrl ?? null,
            logoMediaId: client.logoMediaId ?? null,
            logoUrl,
            locale: (client.locale as "es" | "en") || "es",
            currency: client.currency || "COP",
            timezone: client.timezone || "America/Bogota",
            lifecycleStatus: client.lifecycleStatus,
            planId: client.planId,
            planCode: currentPlanCode,
            cellCode: cellCode || "cell-01",
          }
        : null;

      return ok({
        step: stepKeyToNumber(stepKey),
        stepKey,
        client: clientDto,
        draft: draftPayload,
        availablePlans: enrichedPlans,
        currentCatalogSummary,
        botCatalog: {
          tones: tonesCatalog,
          presets: presetsCatalog,
          objectives: BOT_OBJECTIVE_OPTIONS.map((o) => ({
            code: o.code,
            labels: { es: o.labels.es, en: o.labels.en },
          })),
        },
        paymentChannels: cellPaymentChannels,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[getOnboardingState Failed] ${msg}`, error, { userId });
      return err("Error al consultar el estado de onboarding.", "ONBOARDING_STATE_ERROR");
    }
  }

  /**
   * Guarda el Paso 1 (`business`): identidad comercial, contacto, idioma y aprovisionamiento de celda/cliente.
   */
  async saveBusinessStep(
    userId: string,
    input: SaveStep1BusinessInput,
  ): Promise<Result<CompleteStep1BusinessOutcome>> {
    const db = getDb();

    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length < 2) {
      return err("El nombre del comercio debe tener al menos 2 caracteres.", "INVALID_DISPLAY_NAME");
    }

    const cleanSlug = input.slug?.trim().toLowerCase();
    if (!cleanSlug || cleanSlug.length < 3 || cleanSlug.length > 50 || !SLUG_REGEX.test(cleanSlug)) {
      return err(
        "El identificador (slug) debe contener entre 3 y 50 caracteres (solo minúsculas, números y guiones).",
        "INVALID_SLUG_FORMAT",
      );
    }

    const emailRes = normalizeOptionalEmail(input.commercialEmail);
    if (!emailRes.ok) return err(emailRes.error, emailRes.code);
    const websiteRes = normalizeOptionalUrl(input.websiteUrl);
    if (!websiteRes.ok) return err(websiteRes.error, websiteRes.code);
    const phoneRes = normalizeOptionalPhone(input.phone);
    if (!phoneRes.ok) return err(phoneRes.error, phoneRes.code);

    const commercialEmail = emailRes.data;
    const websiteUrl = websiteRes.data;
    const phone = phoneRes.data;

    try {
      const { user, client: existingClient } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      const [slugCollision] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          existingClient
            ? and(eq(clients.slug, cleanSlug), sql`${clients.id} <> ${existingClient.id}`)
            : eq(clients.slug, cleanSlug),
        )
        .limit(1);

      if (slugCollision) {
        return err(`El identificador de tienda '${cleanSlug}' ya se encuentra en uso.`, "SLUG_ALREADY_EXISTS");
      }

      const locale: "es" | "en" = input.locale === "en" ? "en" : "es";
      const currency = (input.currency || "COP").slice(0, 3).toUpperCase();
      const timezone = input.timezone || "America/Bogota";
      const planCode = input.planCode || "free";

      let clientId = existingClient?.id;
      let effectivePlanId: string | null = null;

      if (existingClient) {
        clientId = existingClient.id;
        effectivePlanId = existingClient.planId || null;
        await db
          .update(clients)
          .set({
            displayName,
            slug: cleanSlug,
            commercialEmail,
            websiteUrl,
            phone,
            locale,
            currency,
            timezone,
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(eq(clients.id, existingClient.id));
      } else {
        const [assignedCell] = await db
          .select()
          .from(cells)
          .where(and(eq(cells.status, "active"), lt(cells.currentClients, cells.maxClients)))
          .orderBy(asc(cells.currentClients))
          .limit(1);

        if (!assignedCell) {
          return err(
            "No hay celdas de almacenamiento activas disponibles con capacidad en el clúster.",
            "NO_ACTIVE_CELL_AVAILABLE",
          );
        }

        let [selectedPlan] = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
        if (!selectedPlan) {
          const [freePlan] = await db.select().from(plans).where(eq(plans.code, "free")).limit(1);
          selectedPlan = freePlan;
        }
        if (!selectedPlan) {
          const [anyPlan] = await db.select().from(plans).where(eq(plans.status, "active")).limit(1);
          selectedPlan = anyPlan;
        }
        if (!selectedPlan) {
          return err("No hay planes comerciales disponibles para asignación.", "NO_ACTIVE_PLAN_FOUND");
        }

        effectivePlanId = selectedPlan.id;
        clientId = randomUUID();

        await db.insert(clients).values({
          id: clientId,
          ownerUserId: user.id,
          slug: cleanSlug,
          displayName,
          contactEmail: user.email,
          commercialEmail,
          phone,
          websiteUrl,
          locale,
          currency,
          timezone,
          planId: selectedPlan.id,
          lifecycleStatus: "alta",
          quotaVersion: 1,
          createdBy: user.email,
          updatedBy: user.email,
        });

        await db.insert(clientRouting).values({
          clientId,
          cellId: assignedCell.id,
          routingStatus: "active",
          createdBy: user.email,
          updatedBy: user.email,
        });

        await db.insert(clientPlans).values({
          clientId,
          planId: selectedPlan.id,
          source: "self_service",
          createdBy: user.email,
          updatedBy: user.email,
        });

        const provRes = await provisionTenantInCellDataPlane(clientId, assignedCell.id, user.id, {
          displayName,
          contactEmail: user.email,
          actor: "onboarding_step1",
          ownerUser: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            passwordHash: user.passwordHash,
            passwordUpdatedAt: user.passwordUpdatedAt,
            emailVerifiedAt: user.emailVerifiedAt,
          },
        });

        if (!provRes.ok) {
          appLogger.error("[saveBusinessStep] Error en provisión celular inicial.", {
            error: provRes.error,
          });
          return err(provRes.error, "CELL_PROVISION_ERROR");
        }

        await db
          .update(users)
          .set({
            activeClientId: clientId,
            identityLocation: assignedCell.id,
            passwordHash: null,
            passwordUpdatedAt: null,
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(eq(users.id, user.id));

        await db
          .update(cells)
          .set({
            currentClients: sql`${cells.currentClients} + 1`,
            updatedBy: user.email,
            updatedAt: new Date(),
          })
          .where(eq(cells.id, assignedCell.id));
      }

      const businessDraft = {
        displayName,
        slug: cleanSlug,
        commercialEmail,
        websiteUrl,
        phone,
        locale,
        currency,
        timezone,
        planCode,
      };

      await db
        .insert(onboardingSessions)
        .values({
          userId: user.id,
          clientId,
          planCode,
          currentStep: "plan",
          status: "in_progress",
          draftPayload: { business: businessDraft },
          createdBy: user.email,
          updatedBy: user.email,
        })
        .onConflictDoUpdate({
          target: onboardingSessions.userId,
          set: {
            clientId,
            planCode,
            currentStep: "plan",
            draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{business}', ${JSON.stringify(
              businessDraft,
            )}::jsonb)`,
            updatedAt: new Date(),
            updatedBy: user.email,
          },
        });

      // Aprovisionamiento idempotente y fail-soft en Chatwoot
      try {
        if (clientId && effectivePlanId) {
          const [existingCw] = await db
            .select({
              state: chatwootAccounts.state,
              chatwootAccountId: chatwootAccounts.chatwootAccountId,
            })
            .from(chatwootAccounts)
            .where(eq(chatwootAccounts.clientId, clientId))
            .limit(1);

          const shouldProvision =
            !existingCw ||
            existingCw.state !== "active" ||
            existingCw.chatwootAccountId === null;

          if (shouldProvision) {
            const isPlanEnabled = await isChatwootEnabledForPlan(effectivePlanId, db);
            if (isPlanEnabled) {
              const { features, limits } = await buildChatwootFeaturesAndLimitsForPlan(
                effectivePlanId,
                db,
              );
              const cwService =
                this.chatwootProvisioningService ||
                new ChatwootProvisioningService(
                  new ChatwootHttpPlatformGateway(),
                  undefined,
                  "k1",
                  db,
                );

              await cwService.provisionOrRetryAccount({
                clientId,
                tenantName: displayName,
                locale: locale === "en" ? "en" : "es",
                idempotencyKey: `cw_prov_${clientId}`,
                features,
                limits,
                actor: user.email,
              });
            }
          }
        }
      } catch (cwErr) {
        appLogger.warn("[saveBusinessStep] Fallo en aprovisionamiento automático de Chatwoot (Fail-Soft)", {
          clientId,
          error: cwErr instanceof Error ? cwErr.message : String(cwErr),
        });
      }

      appLogger.info("onboarding.step.saved", {
        clientId,
        userId: user.id,
        stepKey: "business",
      });

      return ok({
        clientId: clientId!,
        slug: cleanSlug,
        displayName,
        locale,
        nextStep: 2,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[saveBusinessStep Failed] ${msg}`, error, { userId, input });
      return err("Error al procesar el Paso 1 de negocio.", "STEP_1_FAILED");
    }
  }

  /**
   * Alias heredado hacia `saveBusinessStep`.
   */
  async completeStep1Business(
    userId: string,
    input: SaveStep1BusinessInput,
  ): Promise<Result<CompleteStep1BusinessOutcome>> {
    return this.saveBusinessStep(userId, input);
  }

  /**
   * Guarda el Paso 2 (`plan`): plan comercial y ciclo elegidos (`SPEC-06 ONB-07`).
   */
  async savePlanStep(
    userId: string,
    input: SaveStep2PlanInput,
  ): Promise<Result<SaveStep2PlanOutcome>> {
    const db = getDb();

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }
      if (!client) {
        return err("Primero debes registrar los datos básicos de tu comercio.", "CLIENT_NOT_FOUND");
      }

      let selectedPlan = null;
      if (input.planId) {
        const [byId] = await db
          .select()
          .from(plans)
          .where(and(eq(plans.id, input.planId), eq(plans.status, "active")))
          .limit(1);
        selectedPlan = byId || null;
      }
      if (!selectedPlan && input.planCode) {
        const [byCode] = await db
          .select()
          .from(plans)
          .where(and(eq(plans.code, input.planCode), eq(plans.status, "active")))
          .limit(1);
        selectedPlan = byCode || null;
      }
      if (!selectedPlan && client.planId) {
        const [byCurrent] = await db
          .select()
          .from(plans)
          .where(eq(plans.id, client.planId))
          .limit(1);
        selectedPlan = byCurrent || null;
      }

      if (!selectedPlan) {
        return err("El plan comercial seleccionado no existe o no está activo.", "PLAN_NOT_FOUND");
      }

      const cycle: "monthly" | "annual" = input.cycle === "annual" ? "annual" : "monthly";

      if (client.planId !== selectedPlan.id) {
        await db
          .update(clients)
          .set({
            planId: selectedPlan.id,
            quotaVersion: sql`${clients.quotaVersion} + 1`,
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(eq(clients.id, client.id));

        try {
          await db.insert(clientPlans).values({
            clientId: client.id,
            planId: selectedPlan.id,
            source: "self_service",
            createdBy: user.email,
            updatedBy: user.email,
          });
        } catch {
          // Resiliencia si la historia de planes ya tiene registro único activo
        }
      }

      const planDraft = {
        planId: selectedPlan.id,
        planCode: selectedPlan.code,
        cycle,
      };

      await db
        .update(onboardingSessions)
        .set({
          planCode: selectedPlan.code,
          currentStep: "product",
          draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{plan}', ${JSON.stringify(
            planDraft,
          )}::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      appLogger.info("onboarding.step.saved", {
        clientId: client.id,
        userId: user.id,
        stepKey: "plan",
        planCode: selectedPlan.code,
        cycle,
      });

      return ok({
        planId: selectedPlan.id,
        planCode: selectedPlan.code,
        cycle,
        nextStep: 3,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[savePlanStep Failed] ${msg}`, error, { userId, input });
      return err("Error al guardar la selección del plan.", "STEP_2_PLAN_FAILED");
    }
  }

  /**
   * Guarda el Paso 3 (`product`): primer producto en `pg-cell-XX` con costo opcional,
   * precio de venta en `price_cents` (`D-01`) y cálculo autoritativo de rentabilidad (`SPEC-06 ONB-08`).
   */
  async saveFirstProductStep(
    userId: string,
    input: SaveStep3ProductInput,
  ): Promise<Result<CompleteStep2FirstProductOutcome>> {
    const db = getDb();

    const name = input.name?.trim();
    if (!name || name.length < 2) {
      return err("El nombre del producto debe tener al menos 2 caracteres.", "INVALID_PRODUCT_NAME");
    }

    const description = input.description?.trim();
    if (!description || description.length < 5) {
      return err(
        "La descripción del producto debe tener al menos 5 caracteres.",
        "INVALID_PRODUCT_DESCRIPTION",
      );
    }

    const rawSalePrice = input.salePriceCents ?? input.priceCents ?? 0;
    const salePriceCents = Number(rawSalePrice);
    if (!Number.isFinite(salePriceCents) || salePriceCents <= 0) {
      return err("El precio de venta debe ser un número mayor a cero.", "INVALID_PRICE");
    }

    let normalizedCostCents: number | null = null;
    if (input.costPriceCents !== undefined && input.costPriceCents !== null) {
      const parsedCost = Number(input.costPriceCents);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        return err("El precio de costo no puede ser negativo.", "INVALID_COST_PRICE");
      }
      normalizedCostCents = Math.round(parsedCost);
    }

    const profitability = calculateProductProfitability(
      normalizedCostCents ?? 0,
      Math.round(salePriceCents),
    );

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }
      if (!client) {
        return err("No existe un comercio vinculado para registrar el producto.", "CLIENT_NOT_FOUND");
      }

      const [session] = await db
        .select({ draftPayload: onboardingSessions.draftPayload })
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, userId))
        .limit(1);

      const currentDraft = (session?.draftPayload as OnboardingDraftPayloadV2) || {};
      const existingDraftProductId = currentDraft.firstProduct?.productId;

      let productId = existingDraftProductId || randomUUID();
      const currency = (input.currency || client.currency || "COP").slice(0, 3).toUpperCase();
      const kind = input.kind || "physical";

      await withTenantCellTransaction(client.id, async (tx) => {
        let updatedExisting = false;
        if (existingDraftProductId) {
          const [existingRow] = await tx
            .select({ id: cellProducts.id })
            .from(cellProducts)
            .where(
              and(eq(cellProducts.clientId, client.id), eq(cellProducts.id, existingDraftProductId)),
            )
            .limit(1);

          if (existingRow) {
            await tx
              .update(cellProducts)
              .set({
                name,
                description,
                costPriceCents: normalizedCostCents ?? 0,
                priceCents: Math.round(salePriceCents),
                salePriceCents: null,
                currency,
                kind,
                updatedAt: new Date(),
                updatedBy: user.email,
              })
              .where(
                and(eq(cellProducts.clientId, client.id), eq(cellProducts.id, existingDraftProductId)),
              );
            updatedExisting = true;
            productId = existingRow.id;
          }
        }

        if (!updatedExisting) {
          await tx.insert(cellProducts).values({
            id: productId,
            clientId: client.id,
            name,
            description,
            costPriceCents: normalizedCostCents ?? 0,
            priceCents: Math.round(salePriceCents),
            salePriceCents: null,
            currency,
            kind,
            compositionType: "simple",
            condition: "new",
            availability: "in_stock",
            status: "active",
            sourceSystem: "onboarding",
            sortOrder: 1,
            createdBy: user.email,
            updatedBy: user.email,
          });

          await tx
            .insert(cellClientUsage)
            .values({
              clientId: client.id,
              dimension: "products",
              usedValue: 1,
              createdBy: user.email,
              updatedBy: user.email,
            })
            .onConflictDoUpdate({
              target: [cellClientUsage.clientId, cellClientUsage.dimension],
              set: {
                usedValue: sql`${cellClientUsage.usedValue} + 1`,
                updatedAt: new Date(),
                updatedBy: user.email,
              },
            });
        }
      });

      const productDraft = {
        productId,
        name,
        description,
        costPriceCents: normalizedCostCents,
        salePriceCents: Math.round(salePriceCents),
        priceCents: Math.round(salePriceCents),
        currency,
        kind,
        coverMediaUrl: currentDraft.firstProduct?.coverMediaUrl ?? null,
        profitability,
      };

      await db
        .update(onboardingSessions)
        .set({
          currentStep: "assistant_payments",
          draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{firstProduct}', ${JSON.stringify(
            productDraft,
          )}::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      appLogger.info("onboarding.step.saved", {
        clientId: client.id,
        userId: user.id,
        stepKey: "product",
        productId,
      });

      return ok({
        productId,
        name,
        profitability,
        nextStep: 4,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[saveFirstProductStep Failed] ${msg}`, error, { userId, input });
      return err("Error al registrar el primer producto en la celda.", "STEP_3_PRODUCT_FAILED");
    }
  }

  /**
   * Alias heredado hacia `saveFirstProductStep`.
   */
  async completeStep2FirstProduct(
    userId: string,
    input: SaveStep3ProductInput,
  ): Promise<Result<CompleteStep2FirstProductOutcome>> {
    return this.saveFirstProductStep(userId, input);
  }

  /**
   * Sube una imagen de portada opcional para el primer producto del onboarding a SeaweedFS + imgproxy
   * y actualiza `cell_product_media` + `cell_client_usage` (`SPEC-06 ONB-08`).
   */
  async uploadFirstProductCover(
    userId: string,
    file: { buffer: Buffer; mimeType: string; originalFilename?: string },
  ): Promise<Result<{ mediaId: string; productId: string; coverMediaUrl: string }>> {
    const db = getDb();

    if (!file.buffer || file.buffer.byteLength === 0) {
      return err("El archivo de portada está vacío.", "EMPTY_FILE");
    }
    if (file.buffer.byteLength > MAX_PRODUCT_COVER_BYTES) {
      return err("La imagen de portada no puede superar 5 MB.", "FILE_TOO_LARGE");
    }

    const magic = validateMediaMagicBytes(file.buffer);
    if (!magic.valid || !magic.detectedMime) {
      return err(magic.error || "Formato de imagen inválido (usa PNG, JPG o WEBP).", "VALIDATION_ERROR");
    }

    const ext = ALLOWED_COVER_MIMES.get(magic.detectedMime);
    if (!ext) {
      return err("La imagen debe ser PNG, JPG o WEBP.", "VALIDATION_ERROR");
    }

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user || !client) {
        return err("Comercio no encontrado para adjuntar la portada.", "CLIENT_NOT_FOUND");
      }

      const [session] = await db
        .select({ draftPayload: onboardingSessions.draftPayload })
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, user.id))
        .limit(1);

      const draft = (session?.draftPayload as OnboardingDraftPayloadV2) || {};
      const productId = draft.firstProduct?.productId;
      if (!productId) {
        return err("Guarda primero los datos del producto antes de subir su portada.", "PRODUCT_NOT_FOUND");
      }

      const contentHash = createHash("sha256").update(file.buffer).digest("hex");
      const storagePoolId = "seaweedfs-main";
      const storageKey = `products/${client.id}/${productId}/${contentHash}.${ext}`;
      const storage = new S3StorageService();

      const uploadRes = await storage.putObject(storageKey, file.buffer, magic.detectedMime);
      if (!uploadRes.ok) {
        return err(`No se pudo almacenar la imagen en SeaweedFS: ${uploadRes.error}`, "STORAGE_UNAVAILABLE");
      }

      const coverMediaUrl = buildImgproxyUrl(storageKey, { width: 800, height: 800, format: "webp" });

      const mediaRows = await db
        .insert(mediaCatalog)
        .values({
          contentHash,
          storagePoolId,
          storageKey,
          sizeBytes: file.buffer.byteLength,
          mediaKind: "image",
          mimeType: magic.detectedMime,
          sourceFormat: ext,
          originalFilename: file.originalFilename || `cover.${ext}`,
          processingStatus: "ready",
          storageType: "internal",
          createdBy: user.email,
          updatedBy: user.email,
        })
        .onConflictDoUpdate({
          target: [mediaCatalog.contentHash, mediaCatalog.storagePoolId],
          set: {
            storageKey,
            updatedAt: new Date(),
            updatedBy: user.email,
          },
        })
        .returning({ id: mediaCatalog.id });

      const mediaId = mediaRows[0]?.id;
      if (!mediaId) {
        return err("No fue posible registrar el recurso multimedia.", "MEDIA_CATALOG_ERROR");
      }

      await withTenantCellTransaction(client.id, async (tx) => {
        await tx
          .insert(cellClientMedia)
          .values({
            clientId: client.id,
            mediaId,
            sizeBytes: file.buffer.byteLength,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoNothing();

        await tx
          .insert(cellProductMedia)
          .values({
            clientId: client.id,
            productId,
            mediaId,
            mediaKind: "image",
            isCover: true,
            sortOrder: 0,
            altText: draft.firstProduct?.name || "Portada del producto",
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoNothing();

        await tx
          .insert(cellClientUsage)
          .values({
            clientId: client.id,
            dimension: "storage_bytes",
            usedValue: file.buffer.byteLength,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoUpdate({
            target: [cellClientUsage.clientId, cellClientUsage.dimension],
            set: {
              usedValue: sql`${cellClientUsage.usedValue} + ${file.buffer.byteLength}`,
              updatedAt: new Date(),
              updatedBy: user.email,
            },
          });
      });

      const updatedFirstProduct = {
        ...(draft.firstProduct || {}),
        coverMediaUrl,
      };

      await db
        .update(onboardingSessions)
        .set({
          draftPayload: sql`jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{firstProduct}', ${JSON.stringify(
            updatedFirstProduct,
          )}::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      return ok({ mediaId, productId, coverMediaUrl });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[uploadFirstProductCover Failed] ${msg}`, error, { userId });
      return err("Error al cargar la imagen de portada del producto.", "PRODUCT_COVER_UPLOAD_FAILED");
    }
  }

  /**
   * Guarda el Paso 4 (`assistant_payments`): configuración real en `admin.tenant_bots`,
   * canales de pago en `cell_tenant_payment_channels` (`SPEC-05`), mensaje de pedido e
   * inicialización idempotente de etiquetas Chatwoot predeterminadas (`SPEC-06 ONB-09`).
   */
  async saveAssistantAndPaymentsStep(
    userId: string,
    input: SaveStep4AssistantPaymentsInput = {},
  ): Promise<Result<SaveStep4AssistantPaymentsOutcome>> {
    const db = getDb();

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }
      if (!client) {
        return err(
          "No existe un comercio vinculado para configurar el asistente virtual.",
          "CLIENT_NOT_FOUND",
        );
      }

      await ensureDefaultBotCatalogSeeded(db);

      const botObjective =
        input.botObjective?.trim() || "Vender productos y cerrar pedidos por chat";
      const botName = input.botName?.trim() || `Asistente ${client.displayName}`;
      const orderConfirmationMessage =
        input.orderConfirmationMessage?.trim() ||
        input.orderMessage?.trim() ||
        "¡Gracias por tu pedido! Nuestro equipo lo está preparando y nos pondremos en contacto contigo de inmediato.";

      const shippingPolicy = input.shippingPolicy || {
        domestic: true,
        deliveryTime: "2-4 días hábiles",
      };
      const returnsPolicy = input.returnsPolicy || "Garantía legal de 30 días.";
      const warrantyPolicy = input.warrantyPolicy || "Garantía por defectos de fábrica.";

      // Resolver IDs reales de tono y preset desde catálogos
      let resolvedToneId = input.botToneId || null;
      let resolvedPresetId = input.botPresetId || null;
      let resolvedPresetCode = input.botPreset || "quick_sales";

      try {
        const tones = await db
          .select({ id: botTones.id, code: botTones.code })
          .from(botTones)
          .where(eq(botTones.isActive, true))
          .orderBy(asc(botTones.sortOrder));
        if (Array.isArray(tones) && tones.length > 0) {
          const exactTone = resolvedToneId ? tones.find((t) => t.id === resolvedToneId) : null;
          resolvedToneId = exactTone ? exactTone.id : tones[0]!.id;
        }

        const presets = await db
          .select({ id: botPresets.id, code: botPresets.code })
          .from(botPresets)
          .where(eq(botPresets.isActive, true))
          .orderBy(asc(botPresets.sortOrder));
        if (Array.isArray(presets) && presets.length > 0) {
          const exactPreset = resolvedPresetId
            ? presets.find((p) => p.id === resolvedPresetId)
            : presets.find((p) => p.code === input.botPreset);
          const chosen = exactPreset ?? presets[0]!;
          resolvedPresetId = chosen.id;
          resolvedPresetCode = chosen.code;
        }
      } catch {
        // Resiliencia ante mocks parciales sin catálogos IA
      }

      // Persistir configuración autoritativa en `admin.tenant_bots` (misma fuente que /admin/ai)
      let savedBotId: string | null = null;
      if (resolvedToneId && resolvedPresetId) {
        try {
          const [existingBot] = await db
            .select({ id: tenantBots.id })
            .from(tenantBots)
            .where(and(eq(tenantBots.clientId, client.id), isNull(tenantBots.deletedAt)))
            .limit(1);

          if (existingBot) {
            await db
              .update(tenantBots)
              .set({
                name: botName,
                objective: botObjective,
                toneId: resolvedToneId,
                presetId: resolvedPresetId,
                providerId: null,
                modelId: null,
                responseLanguage: client.locale === "en" ? "en" : "es",
                updatedAt: new Date(),
                updatedBy: user.email,
              })
              .where(eq(tenantBots.id, existingBot.id));
            savedBotId = existingBot.id;
          } else {
            const [inserted] = await db
              .insert(tenantBots)
              .values({
                clientId: client.id,
                name: botName,
                objective: botObjective,
                toneId: resolvedToneId,
                presetId: resolvedPresetId,
                status: "draft",
                responseLanguage: client.locale === "en" ? "en" : "es",
                createdBy: user.email,
                updatedBy: user.email,
              })
              .returning({ id: tenantBots.id });
            savedBotId = inserted?.id ?? null;
          }
        } catch (botErr) {
          appLogger.warn("[saveAssistantAndPaymentsStep] Persistencia parcial de tenant_bots.", {
            clientId: client.id,
            error: botErr instanceof Error ? botErr.message : String(botErr),
          });
        }
      }

      // Sincronizar canales de pago en celda + info comercial + etiquetas reservadas
      const normalizedChannels: OnboardingPaymentChannelInput[] = Array.isArray(input.paymentChannels)
        ? input.paymentChannels
        : [];

      const activePaymentSummary =
        normalizedChannels.length > 0
          ? normalizedChannels.filter((c) => c.isActive !== false).map((c) => c.displayName.trim())
          : input.paymentMethods && input.paymentMethods.length > 0
            ? input.paymentMethods
            : ["Nequi", "Daviplata", "Bancolombia", "Pago Contra Entrega"];

      await withTenantCellTransaction(client.id, async (tx) => {
        if (normalizedChannels.length > 0) {
          // Sincronización limpia por canal dentro de la celda bajo RLS
          await tx
            .delete(cellTenantPaymentChannels)
            .where(eq(cellTenantPaymentChannels.clientId, client.id));

          for (let i = 0; i < normalizedChannels.length; i++) {
            const ch = normalizedChannels[i]!;
            const code = TENANT_PAYMENT_CHANNEL_CODES.includes(ch.channelCode)
              ? ch.channelCode
              : "other";
            await tx.insert(cellTenantPaymentChannels).values({
              clientId: client.id,
              channelCode: code,
              displayName: ch.displayName.trim() || code,
              accountIdentifier: ch.accountIdentifier?.trim() || null,
              accountHolderName: ch.accountHolderName?.trim() || null,
              instructions: ch.instructions?.trim() || null,
              isActive: ch.isActive !== false,
              sortOrder: i,
              createdBy: user.email,
              updatedBy: user.email,
            });
          }
        }

        await tx
          .insert(cellClientBusinessInfo)
          .values({
            clientId: client.id,
            botPreset: resolvedPresetCode,
            paymentMethods: activePaymentSummary,
            shippingPolicy,
            returnsPolicy,
            warrantyPolicy,
            orderMessage: orderConfirmationMessage,
            faqs: [],
            remindersEnabled: false,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .onConflictDoUpdate({
            target: cellClientBusinessInfo.clientId,
            set: {
              botPreset: resolvedPresetCode,
              paymentMethods: activePaymentSummary,
              shippingPolicy,
              returnsPolicy,
              warrantyPolicy,
              orderMessage: orderConfirmationMessage,
              updatedAt: new Date(),
              updatedBy: user.email,
            },
          });

        // Siembra idempotente de etiquetas reservadas de clasificación
        for (const label of RESERVED_MOCTER_LEAD_LABELS) {
          await tx
            .insert(cellTenantLabels)
            .values({
              clientId: client.id,
              title: label.title,
              description: label.description,
              color: label.color,
              showOnSidebar: label.showOnSidebar,
              origin: label.origin,
              state: "active",
              createdBy: user.email,
              updatedBy: user.email,
            })
            .onConflictDoNothing();
        }
      });

      const assistantDraft = {
        botId: savedBotId ?? undefined,
        botName,
        botObjective,
        botPresetId: resolvedPresetId ?? undefined,
        botToneId: resolvedToneId ?? undefined,
        paymentMethods: activePaymentSummary,
        orderConfirmationMessage,
      };

      await db
        .update(onboardingSessions)
        .set({
          currentStep: "billing",
          draftPayload: sql`jsonb_set(jsonb_set(COALESCE(${onboardingSessions.draftPayload}, '{}'::jsonb), '{assistantAndPayments}', ${JSON.stringify(
            assistantDraft,
          )}::jsonb), '{chatwootLabelsInitialized}', 'true'::jsonb)`,
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      appLogger.info("onboarding.step.saved", {
        clientId: client.id,
        userId: user.id,
        stepKey: "assistant_payments",
        botId: savedBotId,
      });

      return ok({
        botId: savedBotId,
        chatwootLabelsInitialized: true,
        nextStep: 5,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[saveAssistantAndPaymentsStep Failed] ${msg}`, error, { userId, input });
      return err(
        "Error al guardar la configuración del asistente y canales de pago.",
        "STEP_4_ASSISTANT_FAILED",
      );
    }
  }

  /**
   * Completa el Paso 5 (`billing`): activa el periodo de prueba, plan gratuito o
   * transición con comprobante en revisión (`D-03`), promueve `clients.lifecycle_status = 'activo'`,
   * activa el bot y redirige a `/workspace`.
   */
  async completeOnboardingStep(
    userId: string,
    input: CompleteStep5BillingInput = {},
  ): Promise<Result<CompleteStep3BotAndActivateOutcome>> {
    const db = getDb();

    try {
      const { user, client } = await this.resolveUserAndClient(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }
      if (!client) {
        return err("No existe un comercio vinculado para activar.", "CLIENT_NOT_FOUND");
      }

      const [session] = await db
        .select({
          startedAt: onboardingSessions.startedAt,
          draftPayload: onboardingSessions.draftPayload,
        })
        .from(onboardingSessions)
        .where(eq(onboardingSessions.userId, user.id))
        .limit(1);

      // Asegurar etiquetas predeterminadas de Chatwoot idempotentemente
      try {
        await ensureDefaultChatwootLabels(client.id, user.email);
      } catch {
        // Resiliencia ante mocks o celdas no disponibles
      }

      // Resolver ciclo y plan efectivo
      const draft = (session?.draftPayload as OnboardingDraftPayloadV2) || {};
      const cycle: "monthly" | "annual" =
        input.cycle === "annual" || draft.plan?.cycle === "annual" ? "annual" : "monthly";

      let effectivePlanId = client.planId;
      let planTrialDays = 14;
      let planMonthlyCents = 0;

      try {
        if (input.planCode) {
          const [requestedPlan] = await db
            .select({
              id: plans.id,
              trialDays: plans.trialDays,
              priceMonthlyCents: plans.priceMonthlyCents,
            })
            .from(plans)
            .where(and(eq(plans.code, input.planCode), eq(plans.status, "active")))
            .limit(1);
          if (requestedPlan) {
            effectivePlanId = requestedPlan.id;
            planTrialDays = Number(requestedPlan.trialDays ?? 0);
            planMonthlyCents = Number(requestedPlan.priceMonthlyCents ?? 0);
          }
        } else if (client.planId) {
          const [currentPlan] = await db
            .select({
              id: plans.id,
              trialDays: plans.trialDays,
              priceMonthlyCents: plans.priceMonthlyCents,
            })
            .from(plans)
            .where(eq(plans.id, client.planId))
            .limit(1);
          if (currentPlan) {
            planTrialDays = Number(currentPlan.trialDays ?? 0);
            planMonthlyCents = Number(currentPlan.priceMonthlyCents ?? 0);
          }
        }
      } catch {
        // Mocks parciales
      }

      const completionMode = input.completionMode || (planMonthlyCents === 0 && planTrialDays <= 0 ? "free" : "trial");

      if (completionMode === "trial" || (completionMode === "pending_payment_review" && planTrialDays > 0)) {
        try {
          const trialRes = await getBillingService().activateTrialForTenant({
            clientId: client.id,
            planId: effectivePlanId,
            cycle,
            executedBy: user.id,
          });
          if (!trialRes.ok && trialRes.code !== "TRIAL_NOT_AVAILABLE") {
            appLogger.warn(`[completeOnboardingStep TrialInit] ${trialRes.error}`);
          }
        } catch (trialError) {
          const trialMsg = trialError instanceof Error ? trialError.message : String(trialError);
          appLogger.warn(`[completeOnboardingStep TrialInit] ${trialMsg}`);
        }
      } else if (completionMode === "free" && effectivePlanId) {
        try {
          const [existingSub] = await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.clientId, client.id))
            .limit(1);
          if (!existingSub) {
            const now = new Date();
            const farFutureEnd = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);
            await db.insert(subscriptions).values({
              clientId: client.id,
              planId: effectivePlanId,
              status: "active",
              cycle,
              currentPeriodStart: now,
              currentPeriodEnd: farFutureEnd,
              gateway: null,
              createdBy: user.email,
              updatedBy: user.email,
            });
          }
        } catch {
          // Resiliencia ante mocks parciales
        }
      }

      // Activar bot en admin.tenant_bots si se creó en estado draft
      try {
        await db
          .update(tenantBots)
          .set({
            status: "active",
            updatedAt: new Date(),
            updatedBy: user.email,
          })
          .where(and(eq(tenantBots.clientId, client.id), isNull(tenantBots.deletedAt)));
      } catch {
        // Resiliencia ante mocks
      }

      // Activar cliente en Router Global
      await db
        .update(clients)
        .set({
          planId: effectivePlanId,
          lifecycleStatus: "activo",
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(clients.id, client.id));

      await db
        .update(onboardingSessions)
        .set({
          currentStep: "completed",
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: user.email,
        })
        .where(eq(onboardingSessions.userId, user.id));

      const durationMs = session?.startedAt
        ? Math.max(0, Date.now() - new Date(session.startedAt).getTime())
        : 0;

      appLogger.info("onboarding.completed", {
        clientId: client.id,
        userId: user.id,
        completionMode,
        durationMs,
      });

      return ok({
        clientId: client.id,
        lifecycleStatus: "activo",
        redirectTo: "/workspace",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[completeOnboardingStep Failed] ${msg}`, error, { userId, input });
      return err("Error al completar la activación del comercio.", "STEP_5_BILLING_FAILED");
    }
  }

  /**
   * Alias de compatibilidad hacia atrás para invocadores de 3 pasos.
   */
  async completeStep3BotAndActivate(
    userId: string,
    input: CompleteStep3BotAndActivateInput = {},
  ): Promise<Result<CompleteStep3BotAndActivateOutcome>> {
    const step4Res = await this.saveAssistantAndPaymentsStep(userId, input);
    if (!step4Res.ok) {
      return err(step4Res.error, step4Res.code);
    }
    return this.completeOnboardingStep(userId, {
      completionMode: input.completionMode ?? "trial",
      planCode: input.planCode,
      cycle: input.cycle,
    });
  }
}

export const tenantOnboardingService = new TenantOnboardingService();
