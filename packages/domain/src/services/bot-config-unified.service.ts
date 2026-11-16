import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { clients } from "../db/schemas/admin/clients";
import { aiModels, botPresets, botTones } from "../db/schemas/admin/bot-catalog";
import {
  tenantBots,
  type BotDefaultMessageKey,
  type TenantBotDefaultMessages,
  type TenantBusinessHours,
} from "../db/schemas/admin/bot-tenancy";
import { auditLog, chatwootAccounts } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  cellClientBusinessInfo,
  cellTenantLabels,
  type TenantShippingPolicy,
} from "../db/schemas/tenant/tenancy-catalog";
import { err, ok, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import {
  BOT_DEFAULT_LABELS_SEED,
  BOT_OBJECTIVE_OPTIONS,
  buildDefaultBusinessHours,
  buildDefaultTenantBotMessages,
  ensureDefaultBotCatalogSeeded,
} from "./bot-catalog.seed";

/**
 * Etiqueta de clasificación / operación del bot (`SPEC-10` + `SPEC-19`).
 */
export interface TenantBotLabelDto {
  id: string;
  title: string;
  description: string | null;
  color: string;
  origin: string;
  state: string;
  category: "operational" | "functional";
  activationRule: string | null;
  sideEffects: string | null;
}

/**
 * Opción de catálogo de objetivo, preset o tono servida desde base de datos.
 */
export interface UnifiedBotCatalogDto {
  objectives: Array<{ code: string; labels: { es: string; en: string } }>;
  presets: Array<{
    id: string;
    code: string;
    labels: { es: string; en: string };
    recommendedFor: { es: string; en: string } | null;
    temperature: string;
    maxTokens: number;
  }>;
  tones: Array<{
    id: string;
    code: string;
    labels: { es: string; en: string };
    description: { es: string; en: string } | null;
  }>;
}

/**
 * Contrato unificado de lectura para `/workspace/bot` y `GET /api/tenant/bot` (`SPEC-10` + `SPEC-19` + `SPEC-20`).
 */
export interface UnifiedTenantBotConfigDto {
  bot: {
    id: string | null;
    name: string;
    status: "draft" | "active" | "paused";
    revision: number;
    objective: string;
    presetId: string | null;
    presetCode: string;
    toneId: string | null;
    toneCode: string | null;
    persona: string | null;
    instructions: string | null;
    allowedTopics: string | null;
    excludedTopics: string | null;
    handoffTriggers: string[];
    responseLanguage: "es" | "en" | "auto";
    answerPolicy: "solo_conocimiento" | "libre";
    maxTurns: number;
    maxMessagesPerContact: number;
    classifierPrompt: string | null;
    defaultMessages: TenantBotDefaultMessages;
    businessHours: TenantBusinessHours;
  };
  policies: {
    botPreset: string;
    remindersEnabled: boolean;
    returnsPolicy: string | null;
    warrantyPolicy: string | null;
    shippingPolicy: TenantShippingPolicy;
    orderMessage: string | null;
    faqs: Array<{ question: string; answer: string }>;
    paymentMethods: string[];
  };
  labels: TenantBotLabelDto[];
  catalog: UnifiedBotCatalogDto;
  context: {
    businessName: string;
    locale: string;
    countryCode: string;
    currency: string;
    timezone: string;
  };
  defaultLabelsInitialized: boolean;
}

/**
 * Entrada de escritura para `PUT /api/tenant/bot`.
 */
export interface UpdateUnifiedBotConfigInput {
  name?: string;
  status?: "draft" | "active" | "paused";
  objective?: string;
  presetId?: string | null;
  toneId?: string | null;
  persona?: string | null;
  instructions?: string | null;
  allowedTopics?: string | null;
  excludedTopics?: string | null;
  handoffTriggers?: string[];
  responseLanguage?: "es" | "en" | "auto";
  answerPolicy?: "solo_conocimiento" | "libre";
  maxTurns?: number;
  maxMessagesPerContact?: number;
  classifierPrompt?: string | null;
  defaultMessages?: Partial<
    Record<BotDefaultMessageKey, { body: string; enabled?: boolean }>
  >;
  businessHours?: TenantBusinessHours;
  remindersEnabled?: boolean;
  returnsPolicy?: string | null;
  warrantyPolicy?: string | null;
  shippingPolicy?: TenantShippingPolicy;
  orderMessage?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
  paymentMethods?: string[];
  labels?: Array<{
    id?: string;
    title: string;
    description?: string | null;
    color?: string;
    category?: "operational" | "functional";
    activationRule?: string | null;
    sideEffects?: string | null;
  }>;
}

const DEFAULT_MESSAGE_KEYS: readonly BotDefaultMessageKey[] = [
  "welcome",
  "order_confirmation",
  "dispatch_tracking",
  "delivery_issue",
  "out_of_hours",
  "handoff",
];

function normalizeShippingPolicy(
  raw: unknown,
  legacyFallback?: Partial<TenantShippingPolicy>,
): TenantShippingPolicy {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    freeShipping:
      typeof base.freeShipping === "boolean"
        ? base.freeShipping
        : Boolean(legacyFallback?.freeShipping ?? false),
    defaultCostCents:
      typeof base.defaultCostCents === "number" && Number.isFinite(base.defaultCostCents)
        ? Math.max(0, Math.round(base.defaultCostCents))
        : (legacyFallback?.defaultCostCents ?? 0),
    policyText:
      typeof base.policyText === "string"
        ? base.policyText
        : (legacyFallback?.policyText ?? ""),
    deliveryRules: Array.isArray(base.deliveryRules)
      ? (base.deliveryRules as TenantShippingPolicy["deliveryRules"])
      : (legacyFallback?.deliveryRules ?? []),
  };
}

function mergeDefaultMessages(
  existing: TenantBotDefaultMessages | null | undefined,
  patch: UpdateUnifiedBotConfigInput["defaultMessages"] | undefined,
  locale: string,
  legacyOrderMessage?: string | null,
): TenantBotDefaultMessages {
  const baseline = existing
    ? { ...buildDefaultTenantBotMessages(locale, legacyOrderMessage), ...existing }
    : buildDefaultTenantBotMessages(locale, legacyOrderMessage);

  if (!patch) {
    return baseline;
  }

  const nowIso = new Date().toISOString();
  const next = { ...baseline };
  for (const key of DEFAULT_MESSAGE_KEYS) {
    const incoming = patch[key];
    if (incoming) {
      next[key] = {
        body: incoming.body.trim(),
        enabled: incoming.enabled ?? baseline[key].enabled,
        updatedAt: nowIso,
      };
    }
  }
  return next;
}

/**
 * Inicializa de forma idempotente las etiquetas canónicas (`SPEC-10` 6 operacionales + `SPEC-19` 5 funcionales)
 * en `admin.tenant_labels` de la celda del inquilino.
 */
export async function ensureDefaultBotLabelsInCell(
  clientId: string,
  actorEmail: string,
): Promise<{ bootstrappedCount: number }> {
  let bootstrappedCount = 0;

  await withTenantCellTransaction(clientId, async (tx) => {
    const existingRows = await tx
      .select({
        id: cellTenantLabels.id,
        title: cellTenantLabels.title,
        category: cellTenantLabels.category,
        activationRule: cellTenantLabels.activationRule,
        sideEffects: cellTenantLabels.sideEffects,
      })
      .from(cellTenantLabels)
      .where(and(eq(cellTenantLabels.clientId, clientId), isNull(cellTenantLabels.deletedAt)));

    const existingByTitle = new Map(existingRows.map((row) => [row.title, row]));

    for (const seed of BOT_DEFAULT_LABELS_SEED) {
      const existing = existingByTitle.get(seed.title);
      if (!existing) {
        await tx
          .insert(cellTenantLabels)
          .values({
            clientId,
            title: seed.title,
            description: seed.description,
            color: seed.color,
            showOnSidebar: seed.showOnSidebar,
            origin: seed.origin,
            state: "active",
            category: seed.category,
            activationRule: seed.activationRule,
            sideEffects: seed.sideEffects,
            createdBy: actorEmail,
            updatedBy: actorEmail,
          })
          .onConflictDoNothing();
        bootstrappedCount += 1;
      } else if (!existing.activationRule || !existing.sideEffects || existing.category !== seed.category) {
        await tx
          .update(cellTenantLabels)
          .set({
            category: seed.category,
            activationRule: existing.activationRule ?? seed.activationRule,
            sideEffects: existing.sideEffects ?? seed.sideEffects,
            updatedAt: new Date(),
            updatedBy: actorEmail,
          })
          .where(and(eq(cellTenantLabels.clientId, clientId), eq(cellTenantLabels.id, existing.id)));
      }
    }
  });

  appLogger.info("Etiquetas predeterminadas del bot verificadas en celda", {
    event: "tenant.chatwoot.labels_bootstrapped",
    clientId,
    bootstrappedCount,
  });

  return { bootstrappedCount };
}

/**
 * Sincroniza de forma segura y no bloqueante (`after()`) las etiquetas pendientes hacia Chatwoot si ya hay cuenta provisionada.
 */
export async function syncPendingLabelsToChatwootNonBlocking(clientId: string): Promise<void> {
  try {
    const db = getDb();
    const [account] = await db
      .select({ accountId: chatwootAccounts.chatwootAccountId, state: chatwootAccounts.state })
      .from(chatwootAccounts)
      .where(eq(chatwootAccounts.clientId, clientId))
      .limit(1);

    if (!account || !account.accountId) {
      return;
    }

    appLogger.info("Cuenta Chatwoot activa detectada para sincronía posterior de etiquetas", {
      event: "tenant.chatwoot.labels_sync_scheduled",
      clientId,
      chatwootAccountId: account.accountId,
      state: account.state,
    });
  } catch (error) {
    appLogger.warn("Sincronización diferida de etiquetas Chatwoot omitida sin afectar guardado", {
      event: "tenant.chatwoot.labels_sync_skipped",
      clientId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

/**
 * Servicio unificado de configuración del Asistente AI (`SPEC-10` + `SPEC-19` + `SPEC-20`).
 *
 * Coordina de forma atómica y consistente:
 * - `admin.tenant_bots` en la base central (`objective`, `presetId`, `toneId`, `instructions`, `classifierPrompt`, `defaultMessages`, `businessHours`).
 * - `admin.client_business_info` y `admin.tenant_labels` en la celda del comercio (`returnsPolicy`, `warrantyPolicy`, `shippingPolicy` JSONB, `faqs`, etiquetas).
 */
export class BotConfigUnifiedService {
  /**
   * Obtiene la configuración unificada completa del asistente para `/workspace/bot` o consumo interno.
   */
  async getUnifiedConfig(
    clientId: string,
    options?: { actorEmail?: string },
  ): Promise<Result<UnifiedTenantBotConfigDto>> {
    try {
      const db = getDb();

      const [clientRow] = await db
        .select({
          id: clients.id,
          displayName: clients.displayName,
          locale: clients.locale,
          countryCode: clients.countryCode,
          currency: clients.currency,
          timezone: clients.timezone,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!clientRow) {
        return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
      }

      const [existingPresetCount] = await db
        .select({ id: botPresets.id })
        .from(botPresets)
        .where(eq(botPresets.isActive, true))
        .limit(1);
      if (!existingPresetCount) {
        await ensureDefaultBotCatalogSeeded(db);
      }

      const [presetRows, toneRows, botRows] = await Promise.all([
        db
          .select({
            id: botPresets.id,
            code: botPresets.code,
            labels: botPresets.labels,
            recommendedFor: botPresets.recommendedFor,
            temperature: botPresets.temperature,
            maxTokens: botPresets.maxTokens,
          })
          .from(botPresets)
          .where(eq(botPresets.isActive, true))
          .orderBy(asc(botPresets.sortOrder)),
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
          .select()
          .from(tenantBots)
          .where(and(eq(tenantBots.clientId, clientId), isNull(tenantBots.deletedAt)))
          .limit(1),
      ]);

      const actorEmail = options?.actorEmail ?? "system.bot-config";
      await ensureDefaultBotLabelsInCell(clientId, actorEmail);

      const cellData = await withTenantCellTransaction(clientId, async (tx) => {
        const [info] = await tx
          .select()
          .from(cellClientBusinessInfo)
          .where(eq(cellClientBusinessInfo.clientId, clientId))
          .limit(1);

        const labelRows = await tx
          .select()
          .from(cellTenantLabels)
          .where(and(eq(cellTenantLabels.clientId, clientId), isNull(cellTenantLabels.deletedAt)))
          .orderBy(asc(cellTenantLabels.category), asc(cellTenantLabels.title));

        return { info: info ?? null, labelRows };
      });

      const botRow = botRows[0] ?? null;
      const defaultPreset = presetRows[0] ?? null;
      const defaultTone = toneRows[0] ?? null;
      const resolvedPreset =
        presetRows.find((p) => p.id === botRow?.presetId) ??
        presetRows.find((p) => p.code === cellData.info?.botPreset) ??
        defaultPreset;
      const resolvedTone =
        toneRows.find((t) => t.id === botRow?.toneId) ?? defaultTone;

      const locale = clientRow.locale || "es";
      const countryCode = (clientRow.countryCode || "CO").toUpperCase();
      const mergedMessages = mergeDefaultMessages(
        botRow?.defaultMessages,
        undefined,
        locale,
        cellData.info?.orderMessage ?? null,
      );
      const businessHours =
        botRow?.businessHours ??
        buildDefaultBusinessHours({
          countryCode,
          timezone: clientRow.timezone,
        });

      const shippingPolicy = normalizeShippingPolicy(cellData.info?.shippingPolicy);

      const responseLanguage =
        botRow?.responseLanguage === "en" || botRow?.responseLanguage === "auto"
          ? botRow.responseLanguage
          : "es";
      const answerPolicy =
        botRow?.answerPolicy === "libre" ? "libre" : "solo_conocimiento";
      const botStatus =
        botRow?.status === "paused" || botRow?.status === "draft" ? botRow.status : "active";

      return ok({
        bot: {
          id: botRow?.id ?? null,
          name: botRow?.name ?? `${clientRow.displayName} AI`,
          status: botStatus,
          revision: botRow?.revision ?? 1,
          objective: botRow?.objective ?? BOT_OBJECTIVE_OPTIONS[0].code,
          presetId: resolvedPreset?.id ?? null,
          presetCode: resolvedPreset?.code ?? cellData.info?.botPreset ?? "quick_sales",
          toneId: resolvedTone?.id ?? null,
          toneCode: resolvedTone?.code ?? null,
          persona: botRow?.persona ?? null,
          instructions: botRow?.instructions ?? null,
          allowedTopics: botRow?.allowedTopics ?? null,
          excludedTopics: botRow?.excludedTopics ?? null,
          handoffTriggers: Array.isArray(botRow?.handoffTriggers) ? botRow.handoffTriggers : [],
          responseLanguage,
          answerPolicy,
          maxTurns: botRow?.maxTurns ?? 10,
          maxMessagesPerContact: botRow?.maxMessagesPerContact ?? 50,
          classifierPrompt: botRow?.classifierPrompt ?? null,
          defaultMessages: mergedMessages,
          businessHours,
        },
        policies: {
          botPreset: resolvedPreset?.code ?? cellData.info?.botPreset ?? "quick_sales",
          remindersEnabled: cellData.info?.remindersEnabled ?? false,
          returnsPolicy: cellData.info?.returnsPolicy ?? null,
          warrantyPolicy: cellData.info?.warrantyPolicy ?? null,
          shippingPolicy,
          orderMessage:
            cellData.info?.orderMessage ?? mergedMessages.order_confirmation.body,
          faqs: Array.isArray(cellData.info?.faqs) ? cellData.info.faqs : [],
          paymentMethods: Array.isArray(cellData.info?.paymentMethods)
            ? cellData.info.paymentMethods
            : ["transferencia", "contraentrega"],
        },
        labels: cellData.labelRows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description ?? null,
          color: row.color,
          origin: row.origin,
          state: row.state,
          category: row.category === "functional" ? "functional" : "operational",
          activationRule: row.activationRule ?? null,
          sideEffects: row.sideEffects ?? null,
        })),
        catalog: {
          objectives: BOT_OBJECTIVE_OPTIONS.map((o) => ({
            code: o.code,
            labels: o.labels,
          })),
          presets: presetRows.map((p) => ({
            id: p.id,
            code: p.code,
            labels: p.labels,
            recommendedFor: p.recommendedFor ?? null,
            temperature: p.temperature,
            maxTokens: p.maxTokens,
          })),
          tones: toneRows.map((t) => ({
            id: t.id,
            code: t.code,
            labels: t.labels,
            description: t.description ?? null,
          })),
        },
        context: {
          businessName: clientRow.displayName,
          locale,
          countryCode,
          currency: clientRow.currency || "COP",
          timezone: businessHours.timezone,
        },
        defaultLabelsInitialized: cellData.labelRows.length >= BOT_DEFAULT_LABELS_SEED.length,
      });
    } catch (error) {
      appLogger.error("Error al cargar configuración unificada del bot", {
        event: "tenant.bot.config_read_failed",
        clientId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return err("No se pudo cargar la configuración del asistente.", "BOT_CONFIG_READ_ERROR");
    }
  }

  /**
   * Actualiza de forma coordinada `admin.tenant_bots`, `cell_client_business_info`, `cell_tenant_labels` y `audit_log`.
   */
  async updateUnifiedConfig(
    clientId: string,
    input: UpdateUnifiedBotConfigInput,
    actor: string,
  ): Promise<Result<UnifiedTenantBotConfigDto>> {
    try {
      if (input.faqs) {
        const emptyFaqIndex = input.faqs.findIndex(
          (faq) => !faq.question.trim() || !faq.answer.trim(),
        );
        if (emptyFaqIndex >= 0) {
          return err(
            `La pregunta frecuente #${emptyFaqIndex + 1} debe tener pregunta y respuesta completas.`,
            "INCOMPLETE_FAQ",
          );
        }
      }

      if (input.defaultMessages) {
        for (const key of DEFAULT_MESSAGE_KEYS) {
          const entry = input.defaultMessages[key];
          if (entry && entry.body.trim().length > 2000) {
            return err(
              `El mensaje '${key}' supera la longitud máxima permitida de 2.000 caracteres.`,
              "MESSAGE_TOO_LONG",
            );
          }
        }
      }

      const db = getDb();
      const [clientRow] = await db
        .select({
          id: clients.id,
          displayName: clients.displayName,
          locale: clients.locale,
          countryCode: clients.countryCode,
          timezone: clients.timezone,
        })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      if (!clientRow) {
        return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
      }

      const [activePresets, activeTones, existingBotRows] = await Promise.all([
        db
          .select()
          .from(botPresets)
          .where(eq(botPresets.isActive, true))
          .orderBy(asc(botPresets.sortOrder)),
        db
          .select()
          .from(botTones)
          .where(eq(botTones.isActive, true))
          .orderBy(asc(botTones.sortOrder)),
        db
          .select()
          .from(tenantBots)
          .where(and(eq(tenantBots.clientId, clientId), isNull(tenantBots.deletedAt)))
          .limit(1),
      ]);

      const existingBot = existingBotRows[0] ?? null;

      let chosenPresetId: string | null = existingBot?.presetId ?? null;
      let chosenPresetCode: string | null = null;
      if (input.presetId !== undefined) {
        if (input.presetId === null) {
          chosenPresetId = null;
        } else {
          const matchedPreset = activePresets.find((p) => p.id === input.presetId);
          if (!matchedPreset) {
            return err("El preset de personalidad seleccionado no existe o está inactivo.", "INVALID_PRESET");
          }
          chosenPresetId = matchedPreset.id;
          chosenPresetCode = matchedPreset.code;
        }
      } else if (!chosenPresetId && !(existingBot?.providerId && existingBot?.modelId)) {
        const fallbackPreset = activePresets[0] ?? null;
        if (fallbackPreset) {
          chosenPresetId = fallbackPreset.id;
          chosenPresetCode = fallbackPreset.code;
        }
      } else if (chosenPresetId) {
        chosenPresetCode =
          activePresets.find((p) => p.id === chosenPresetId)?.code ?? null;
      }

      let chosenToneId: string | null = existingBot?.toneId ?? null;
      if (input.toneId !== undefined && input.toneId !== null) {
        const matchedTone = activeTones.find((t) => t.id === input.toneId);
        if (!matchedTone) {
          return err("El tono de comunicación seleccionado no existe o está inactivo.", "INVALID_TONE");
        }
        chosenToneId = matchedTone.id;
      } else if (!chosenToneId && activeTones[0]) {
        chosenToneId = activeTones[0].id;
      }

      let resolvedProviderId: string | null = existingBot?.providerId ?? null;
      let resolvedModelId: string | null = existingBot?.modelId ?? null;

      if (chosenPresetId) {
        resolvedProviderId = null;
        resolvedModelId = null;
      } else if (!resolvedProviderId || !resolvedModelId) {
        const [fallbackModel] = await db
          .select({ id: aiModels.id, providerId: aiModels.providerId })
          .from(aiModels)
          .where(eq(aiModels.isActive, true))
          .limit(1);
        if (!fallbackModel) {
          return err("No hay presets o modelos de IA disponibles en el catálogo.", "NO_AI_MODEL_AVAILABLE");
        }
        resolvedProviderId = fallbackModel.providerId;
        resolvedModelId = fallbackModel.id;
      }

      const locale = clientRow.locale || "es";
      const countryCode = (clientRow.countryCode || "CO").toUpperCase();

      const mergedMessages = mergeDefaultMessages(
        existingBot?.defaultMessages,
        input.defaultMessages,
        locale,
        input.orderMessage ?? null,
      );

      if (input.orderMessage !== undefined && !input.defaultMessages?.order_confirmation) {
        const trimmedOrder = input.orderMessage?.trim();
        if (trimmedOrder) {
          mergedMessages.order_confirmation = {
            ...mergedMessages.order_confirmation,
            body: trimmedOrder,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      const nextBusinessHours =
        input.businessHours ??
        existingBot?.businessHours ??
        buildDefaultBusinessHours({ countryCode, timezone: clientRow.timezone });

      const nextStatus = input.status ?? (existingBot?.status as "draft" | "active" | "paused" | undefined) ?? "active";
      const nextRevision = (existingBot?.revision ?? 0) + 1;
      const nextBotName = input.name?.trim() || existingBot?.name || `${clientRow.displayName} AI`;
      const nextObjective =
        input.objective?.trim() || existingBot?.objective || BOT_OBJECTIVE_OPTIONS[0].code;

      if (existingBot) {
        await db
          .update(tenantBots)
          .set({
            name: nextBotName,
            status: nextStatus,
            revision: nextRevision,
            objective: nextObjective,
            presetId: chosenPresetId,
            toneId: chosenToneId,
            providerId: resolvedProviderId,
            modelId: resolvedModelId,
            persona: input.persona !== undefined ? input.persona : existingBot.persona,
            instructions:
              input.instructions !== undefined ? input.instructions : existingBot.instructions,
            allowedTopics:
              input.allowedTopics !== undefined ? input.allowedTopics : existingBot.allowedTopics,
            excludedTopics:
              input.excludedTopics !== undefined
                ? input.excludedTopics
                : existingBot.excludedTopics,
            handoffTriggers:
              input.handoffTriggers !== undefined
                ? input.handoffTriggers
                : existingBot.handoffTriggers,
            responseLanguage: input.responseLanguage ?? existingBot.responseLanguage,
            answerPolicy: input.answerPolicy ?? existingBot.answerPolicy,
            maxTurns: input.maxTurns ?? existingBot.maxTurns,
            maxMessagesPerContact:
              input.maxMessagesPerContact ?? existingBot.maxMessagesPerContact,
            classifierPrompt:
              input.classifierPrompt !== undefined
                ? input.classifierPrompt
                : existingBot.classifierPrompt,
            defaultMessages: mergedMessages,
            businessHours: nextBusinessHours,
            greetingMessage: mergedMessages.welcome.body,
            fallbackMessage: mergedMessages.out_of_hours.body,
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(eq(tenantBots.id, existingBot.id));
      } else {
        await db.insert(tenantBots).values({
          clientId,
          name: nextBotName,
          status: nextStatus,
          revision: 1,
          objective: nextObjective,
          presetId: chosenPresetId,
          toneId: chosenToneId,
          providerId: resolvedProviderId,
          modelId: resolvedModelId,
          persona: input.persona ?? null,
          instructions: input.instructions ?? null,
          allowedTopics: input.allowedTopics ?? null,
          excludedTopics: input.excludedTopics ?? null,
          handoffTriggers: input.handoffTriggers ?? [],
          responseLanguage: input.responseLanguage ?? "es",
          answerPolicy: input.answerPolicy ?? "solo_conocimiento",
          maxTurns: input.maxTurns ?? 10,
          maxMessagesPerContact: input.maxMessagesPerContact ?? 50,
          classifierPrompt: input.classifierPrompt ?? null,
          defaultMessages: mergedMessages,
          businessHours: nextBusinessHours,
          greetingMessage: mergedMessages.welcome.body,
          fallbackMessage: mergedMessages.out_of_hours.body,
          createdBy: actor,
          updatedBy: actor,
        });
      }

      await withTenantCellTransaction(clientId, async (tx) => {
        const [existingInfo] = await tx
          .select()
          .from(cellClientBusinessInfo)
          .where(eq(cellClientBusinessInfo.clientId, clientId))
          .limit(1);

        const currentShipping = normalizeShippingPolicy(existingInfo?.shippingPolicy);
        const nextShipping = input.shippingPolicy
          ? normalizeShippingPolicy(input.shippingPolicy, currentShipping)
          : currentShipping;

        const nextFaqs =
          input.faqs !== undefined
            ? input.faqs.map((faq) => ({
                question: faq.question.trim(),
                answer: faq.answer.trim(),
              }))
            : ((existingInfo?.faqs as Array<{ question: string; answer: string }>) ?? []);

        const nextOrderMsg = mergedMessages.order_confirmation.body;
        const nextBotPresetCode =
          chosenPresetCode ?? existingInfo?.botPreset ?? "quick_sales";

        await tx
          .insert(cellClientBusinessInfo)
          .values({
            clientId,
            botPreset: nextBotPresetCode,
            remindersEnabled: input.remindersEnabled ?? existingInfo?.remindersEnabled ?? false,
            returnsPolicy:
              input.returnsPolicy !== undefined
                ? input.returnsPolicy
                : (existingInfo?.returnsPolicy ?? null),
            warrantyPolicy:
              input.warrantyPolicy !== undefined
                ? input.warrantyPolicy
                : (existingInfo?.warrantyPolicy ?? null),
            shippingPolicy: nextShipping,
            orderMessage: nextOrderMsg,
            faqs: nextFaqs,
            paymentMethods:
              input.paymentMethods ??
              ((existingInfo?.paymentMethods as string[]) ?? ["transferencia", "contraentrega"]),
            createdBy: actor,
            updatedBy: actor,
          })
          .onConflictDoUpdate({
            target: cellClientBusinessInfo.clientId,
            set: {
              botPreset: nextBotPresetCode,
              remindersEnabled: input.remindersEnabled ?? existingInfo?.remindersEnabled ?? false,
              returnsPolicy:
                input.returnsPolicy !== undefined
                  ? input.returnsPolicy
                  : (existingInfo?.returnsPolicy ?? null),
              warrantyPolicy:
                input.warrantyPolicy !== undefined
                  ? input.warrantyPolicy
                  : (existingInfo?.warrantyPolicy ?? null),
              shippingPolicy: nextShipping,
              orderMessage: nextOrderMsg,
              faqs: nextFaqs,
              paymentMethods:
                input.paymentMethods ??
                ((existingInfo?.paymentMethods as string[]) ?? ["transferencia", "contraentrega"]),
              updatedAt: new Date(),
              updatedBy: actor,
            },
          });

        if (input.labels && input.labels.length > 0) {
          for (const lbl of input.labels) {
            const cleanTitle = lbl.title.trim();
            if (!cleanTitle) continue;

            const [existingLbl] = await tx
              .select({ id: cellTenantLabels.id })
              .from(cellTenantLabels)
              .where(
                and(
                  eq(cellTenantLabels.clientId, clientId),
                  eq(cellTenantLabels.title, cleanTitle),
                ),
              )
              .limit(1);

            if (existingLbl) {
              await tx
                .update(cellTenantLabels)
                .set({
                  description: lbl.description ?? null,
                  color: lbl.color ?? "#1F93FF",
                  category: lbl.category === "functional" ? "functional" : "operational",
                  activationRule: lbl.activationRule ?? null,
                  sideEffects: lbl.sideEffects ?? null,
                  updatedAt: new Date(),
                  updatedBy: actor,
                })
                .where(
                  and(
                    eq(cellTenantLabels.clientId, clientId),
                    eq(cellTenantLabels.id, existingLbl.id),
                  ),
                );
            } else {
              await tx.insert(cellTenantLabels).values({
                clientId,
                title: cleanTitle,
                description: lbl.description ?? null,
                color: lbl.color ?? "#1F93FF",
                showOnSidebar: true,
                origin: "mocter_custom",
                state: "active",
                category: lbl.category === "functional" ? "functional" : "operational",
                activationRule: lbl.activationRule ?? null,
                sideEffects: lbl.sideEffects ?? null,
                createdBy: actor,
                updatedBy: actor,
              });
            }
          }
        }
      });

      await db.insert(auditLog).values({
        actorRole: "tenant_owner",
        action: "tenant.bot.config_updated",
        entityType: "tenant_bots",
        entityId: String(existingBot?.id ?? clientId),
        clientId,
        justification: `Actualización de configuración del asistente por ${actor}`,
        metadata: {
          actor,
          revision: nextRevision,
          objective: nextObjective,
          presetCode: chosenPresetCode,
        },
      });

      appLogger.info("Configuración unificada del asistente actualizada correctamente", {
        event: "tenant.bot.config_updated",
        clientId,
        revision: nextRevision,
      });

      return this.getUnifiedConfig(clientId, { actorEmail: actor });
    } catch (error) {
      appLogger.error("Error inesperado al guardar configuración unificada del asistente", {
        event: "tenant.bot.config_update_failed",
        clientId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return err(
        "No se pudo guardar la configuración del asistente.",
        "BOT_CONFIG_UPDATE_ERROR",
      );
    }
  }
}

export const botConfigUnifiedService = new BotConfigUnifiedService();
