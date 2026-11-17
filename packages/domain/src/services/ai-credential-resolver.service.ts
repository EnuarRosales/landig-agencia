import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  aiModels,
  aiPlatformKeys,
  aiProviders,
  aiUsageEvents,
  onboardingSessions,
  subscriptions,
  tenantAiProviders,
  tenantModelSettings,
} from "../db/schemas/admin";
import { ok, err, type Result } from "../types/result";
import type { AiApiDialect } from "./llm-http-provider.client";
import { SecretCryptoService, SecretCryptoError } from "./secret-crypto.service";

/**
 * Código slug de proveedor LLM configurado dinámicamente en la base de datos.
 */
export type SupportedLlmProviderCode = string;

/**
 * Rol de prioridad de una credencial para failover automático entre primario y secundario.
 */
export type AiPriorityRole = "primary" | "secondary" | "standby";

/**
 * Origen efectivo de la credencial autorizada para una llamada de inferencia.
 */
export type AiCredentialSource = "byok" | "platform_trial";

/**
 * Credencial efectiva resuelta y lista para ejecutarse en memoria del servidor.
 * Nunca debe serializarse ni exponerse fuera del runtime de backend.
 */
export interface ResolvedAiCredential {
  /** Origen de la clave autorizada (`byok` del inquilino o `platform_trial` del SaaS). */
  source: AiCredentialSource;
  /** Modo de facturación/auditoría para `admin.ai_usage_events`. */
  mode: "byok" | "mocter";
  /** Rol de prioridad asignado (`primary` o `secondary`). */
  priorityRole?: AiPriorityRole;
  /** Identificador interno del proveedor (`admin.ai_providers.id`). */
  providerId: string;
  /** Código slug del proveedor LLM. */
  providerCode: SupportedLlmProviderCode;
  /** Dialecto HTTP técnico del proveedor para construir la petición saliente. */
  apiDialect?: AiApiDialect;
  /** URL base personalizada configurada para el proveedor en la BD. */
  baseUrl?: string | null;
  /** Ruta de verificación personalizada configurada para el proveedor en la BD. */
  verifyPath?: string | null;
  /** Identificador interno del modelo (`admin.ai_models.id`). */
  modelId: string;
  /** Identificador técnico del modelo ante el proveedor externo (ej. `gpt-4o-mini`). */
  modelCode: string;
  /** Secreto API descifrado en memoria exclusivamente para la petición saliente. */
  apiKey: string;
  /** Últimos cuatro caracteres de la clave para trazabilidad segura. */
  keyLast4: string;
  /** Temperatura configurada para el modelo. */
  temperature: number;
  /** Límite máximo de tokens de salida configurado. */
  maxTokens: number;
  /** Tope mensual de tokens cuando aplica inferencia de prueba de plataforma. */
  monthlyTokenCap: number | null;
}

/**
 * Registro activo de credencial BYOK y modelo preferido de un inquilino.
 */
export interface ActiveTenantByokRecord {
  priorityRole?: AiPriorityRole;
  providerId: string;
  providerCode: SupportedLlmProviderCode;
  apiDialect?: AiApiDialect;
  baseUrl?: string | null;
  verifyPath?: string | null;
  apiKeyCiphertext: string;
  apiKeyLast4: string;
  modelId: string;
  modelCode: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Estado resumido de suscripción de prueba para evaluar la excepción de Trial.
 */
export interface TenantSubscriptionTrialRecord {
  status: string;
  trialEndsAt: Date | null;
}

/**
 * Estado resumido de sesión de onboarding para evaluar la excepción de Onboarding inconcluso.
 */
export interface OnboardingSessionStateRecord {
  status: string;
  completedAt: Date | null;
}

/**
 * Registro activo de clave de plataforma asignada a pruebas/onboarding.
 */
export interface ActivePlatformKeyRecord {
  id: string;
  priorityRole?: AiPriorityRole;
  providerId: string;
  providerCode: SupportedLlmProviderCode;
  apiDialect?: AiApiDialect;
  baseUrl?: string | null;
  verifyPath?: string | null;
  apiKeyCiphertext: string;
  apiKeyLast4: string;
  modelId: string;
  modelCode: string;
  temperature: number;
  maxTokens: number;
  monthlyTokenCap: number | null;
}

/**
 * Contrato de persistencia requerido por `AiCredentialResolverService`.
 */
export interface IAiCredentialResolverRepository {
  /** Busca la credencial BYOK activa del inquilino y su modelo preferido (o default del proveedor). */
  findActiveTenantByok(clientId: string): Promise<ActiveTenantByokRecord | null>;
  /** Lista ordenada `[primary, secondary]` de credenciales BYOK activas del inquilino. */
  findActiveTenantByokCandidates?(clientId: string): Promise<ActiveTenantByokRecord[]>;
  /** Consulta la suscripción actual del inquilino para verificar ventana de trial vigente. */
  findTenantSubscription(clientId: string): Promise<TenantSubscriptionTrialRecord | null>;
  /** Consulta si el usuario tiene una sesión de onboarding inconclusa (`completedAt IS NULL`). */
  findOnboardingSession(userId: string): Promise<OnboardingSessionStateRecord | null>;
  /** Busca la clave activa de plataforma disponible para inferencia de prueba/onboarding. */
  findActivePlatformTrialKey(): Promise<ActivePlatformKeyRecord | null>;
  /** Lista ordenada `[primary, secondary]` de claves activas de plataforma para pruebas/onboarding. */
  findActivePlatformTrialKeys?(): Promise<ActivePlatformKeyRecord[]>;
  /** Calcula los tokens consumidos por el cliente bajo modo `mocter` en el mes calendario UTC actual. */
  sumMonthlyPlatformTrialTokens(clientId: string, monthStartUtc: Date): Promise<number>;
}

const PRIORITY_ROLE_RANK: Record<AiPriorityRole, number> = {
  primary: 0,
  secondary: 1,
  standby: 2,
};

function normalizePriorityRole(value: string | null | undefined): AiPriorityRole {
  if (value === "primary" || value === "secondary" || value === "standby") {
    return value;
  }
  return "standby";
}

function normalizeDialect(value: string | null | undefined): AiApiDialect | undefined {
  if (
    value === "openai_compatible" ||
    value === "anthropic" ||
    value === "google_gemini"
  ) {
    return value;
  }
  return undefined;
}

/**
 * Implementación Drizzle ORM del repositorio de resolución de credenciales AI en el Router Global.
 */
export class DrizzleAiCredentialResolverRepository implements IAiCredentialResolverRepository {
  /** @inheritdoc */
  async findActiveTenantByok(clientId: string): Promise<ActiveTenantByokRecord | null> {
    const candidates = await this.findActiveTenantByokCandidates(clientId);
    return candidates[0] ?? null;
  }

  /** @inheritdoc */
  async findActiveTenantByokCandidates(clientId: string): Promise<ActiveTenantByokRecord[]> {
    const db = getDb();

    const providerRows = await db
      .select({
        priorityRole: tenantAiProviders.priorityRole,
        providerId: tenantAiProviders.providerId,
        providerCode: aiProviders.code,
        apiDialect: aiProviders.apiDialect,
        baseUrl: aiProviders.baseUrl,
        verifyPath: aiProviders.verifyPath,
        apiKeyCiphertext: tenantAiProviders.apiKeyCiphertext,
        apiKeyLast4: tenantAiProviders.apiKeyLast4,
        updatedAt: tenantAiProviders.updatedAt,
      })
      .from(tenantAiProviders)
      .innerJoin(aiProviders, eq(tenantAiProviders.providerId, aiProviders.id))
      .where(
        and(
          eq(tenantAiProviders.clientId, clientId),
          eq(tenantAiProviders.status, "active"),
          isNull(tenantAiProviders.deletedAt),
          eq(aiProviders.isActive, true),
          isNull(aiProviders.deletedAt),
        ),
      )
      .orderBy(desc(tenantAiProviders.updatedAt));

    const sortedProviders = [...providerRows].sort((a, b) => {
      const rankDiff =
        PRIORITY_ROLE_RANK[normalizePriorityRole(a.priorityRole)] -
        PRIORITY_ROLE_RANK[normalizePriorityRole(b.priorityRole)];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const eligibleProviders = sortedProviders.filter((row) => {
      const role = normalizePriorityRole(row.priorityRole);
      return role === "primary" || role === "secondary";
    });

    const candidates: ActiveTenantByokRecord[] = [];
    for (const providerRow of eligibleProviders) {
      const preferredRows = await db
        .select({
          modelId: aiModels.id,
          modelCode: aiModels.modelId,
          temperature: tenantModelSettings.temperature,
          maxTokens: tenantModelSettings.maxTokens,
        })
        .from(tenantModelSettings)
        .innerJoin(aiModels, eq(tenantModelSettings.modelId, aiModels.id))
        .where(
          and(
            eq(tenantModelSettings.clientId, clientId),
            eq(tenantModelSettings.providerId, providerRow.providerId),
            eq(tenantModelSettings.isEnabled, true),
            isNull(tenantModelSettings.deletedAt),
            eq(aiModels.isActive, true),
            isNull(aiModels.deletedAt),
          ),
        )
        .orderBy(desc(tenantModelSettings.updatedAt))
        .limit(1);

      if (preferredRows[0]) {
        const model = preferredRows[0];
        candidates.push({
          priorityRole: normalizePriorityRole(providerRow.priorityRole),
          providerId: providerRow.providerId,
          providerCode: providerRow.providerCode,
          apiDialect: normalizeDialect(providerRow.apiDialect),
          baseUrl: providerRow.baseUrl,
          verifyPath: providerRow.verifyPath,
          apiKeyCiphertext: providerRow.apiKeyCiphertext,
          apiKeyLast4: providerRow.apiKeyLast4,
          modelId: model.modelId,
          modelCode: model.modelCode,
          temperature: Number.parseFloat(model.temperature) || 0.7,
          maxTokens: model.maxTokens || 1000,
        });
        continue;
      }

      const defaultModels = await db
        .select({
          modelId: aiModels.id,
          modelCode: aiModels.modelId,
          defaultTemperature: aiModels.defaultTemperature,
          defaultMaxTokens: aiModels.defaultMaxTokens,
        })
        .from(aiModels)
        .where(
          and(
            eq(aiModels.providerId, providerRow.providerId),
            eq(aiModels.isActive, true),
            isNull(aiModels.deletedAt),
          ),
        )
        .orderBy(desc(aiModels.isDefault), asc(aiModels.sortOrder), asc(aiModels.displayName))
        .limit(1);

      const fallbackModel = defaultModels[0];
      if (!fallbackModel) {
        continue;
      }

      candidates.push({
        priorityRole: normalizePriorityRole(providerRow.priorityRole),
        providerId: providerRow.providerId,
        providerCode: providerRow.providerCode,
        apiDialect: normalizeDialect(providerRow.apiDialect),
        baseUrl: providerRow.baseUrl,
        verifyPath: providerRow.verifyPath,
        apiKeyCiphertext: providerRow.apiKeyCiphertext,
        apiKeyLast4: providerRow.apiKeyLast4,
        modelId: fallbackModel.modelId,
        modelCode: fallbackModel.modelCode,
        temperature: Number.parseFloat(fallbackModel.defaultTemperature) || 0.7,
        maxTokens: fallbackModel.defaultMaxTokens || 1000,
      });
    }

    return candidates;
  }

  /** @inheritdoc */
  async findTenantSubscription(clientId: string): Promise<TenantSubscriptionTrialRecord | null> {
    const db = getDb();
    const rows = await db
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.clientId, clientId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);

    return rows[0] ?? null;
  }

  /** @inheritdoc */
  async findOnboardingSession(userId: string): Promise<OnboardingSessionStateRecord | null> {
    const db = getDb();
    const rows = await db
      .select({
        status: onboardingSessions.status,
        completedAt: onboardingSessions.completedAt,
      })
      .from(onboardingSessions)
      .where(eq(onboardingSessions.userId, userId))
      .orderBy(desc(onboardingSessions.updatedAt))
      .limit(1);

    return rows[0] ?? null;
  }

  /** @inheritdoc */
  async findActivePlatformTrialKey(): Promise<ActivePlatformKeyRecord | null> {
    const keys = await this.findActivePlatformTrialKeys();
    return keys[0] ?? null;
  }

  /** @inheritdoc */
  async findActivePlatformTrialKeys(): Promise<ActivePlatformKeyRecord[]> {
    const db = getDb();
    const keys = await db
      .select({
        id: aiPlatformKeys.id,
        purpose: aiPlatformKeys.purpose,
        priorityRole: aiPlatformKeys.priorityRole,
        providerId: aiPlatformKeys.providerId,
        providerCode: aiProviders.code,
        apiDialect: aiProviders.apiDialect,
        baseUrl: aiProviders.baseUrl,
        verifyPath: aiProviders.verifyPath,
        apiKeyCiphertext: aiPlatformKeys.apiKeyCiphertext,
        apiKeyLast4: aiPlatformKeys.apiKeyLast4,
        defaultModelId: aiPlatformKeys.defaultModelId,
        temperature: aiPlatformKeys.temperature,
        maxTokens: aiPlatformKeys.maxTokens,
        monthlyTokenCap: aiPlatformKeys.monthlyTokenCap,
        updatedAt: aiPlatformKeys.updatedAt,
      })
      .from(aiPlatformKeys)
      .innerJoin(aiProviders, eq(aiPlatformKeys.providerId, aiProviders.id))
      .where(
        and(
          eq(aiPlatformKeys.status, "active"),
          eq(aiProviders.isActive, true),
          isNull(aiProviders.deletedAt),
        ),
      )
      .orderBy(desc(aiPlatformKeys.updatedAt));

    const sortedKeys = [...keys].sort((a, b) => {
      if (a.purpose !== b.purpose) {
        if (a.purpose === "onboarding_trial") return -1;
        if (b.purpose === "onboarding_trial") return 1;
      }
      const rankDiff =
        PRIORITY_ROLE_RANK[normalizePriorityRole(a.priorityRole)] -
        PRIORITY_ROLE_RANK[normalizePriorityRole(b.priorityRole)];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    const eligibleKeys = sortedKeys.filter((row) => {
      const role = normalizePriorityRole(row.priorityRole);
      return role === "primary" || role === "secondary";
    });

    const results: ActivePlatformKeyRecord[] = [];
    for (const key of eligibleKeys) {
      const modelRows = key.defaultModelId
        ? await db
            .select({
              id: aiModels.id,
              modelId: aiModels.modelId,
              defaultTemperature: aiModels.defaultTemperature,
              defaultMaxTokens: aiModels.defaultMaxTokens,
            })
            .from(aiModels)
            .where(
              and(
                eq(aiModels.id, key.defaultModelId),
                eq(aiModels.isActive, true),
                isNull(aiModels.deletedAt),
              ),
            )
            .limit(1)
        : await db
            .select({
              id: aiModels.id,
              modelId: aiModels.modelId,
              defaultTemperature: aiModels.defaultTemperature,
              defaultMaxTokens: aiModels.defaultMaxTokens,
            })
            .from(aiModels)
            .where(
              and(
                eq(aiModels.providerId, key.providerId),
                eq(aiModels.isActive, true),
                isNull(aiModels.deletedAt),
              ),
            )
            .orderBy(desc(aiModels.isDefault), asc(aiModels.sortOrder), asc(aiModels.displayName))
            .limit(1);

      const model = modelRows[0];
      if (!model) {
        continue;
      }

      const resolvedTemp =
        key.temperature !== null && key.temperature !== undefined
          ? Number.parseFloat(key.temperature)
          : Number.parseFloat(model.defaultTemperature);
      const resolvedMaxTokens = key.maxTokens ?? model.defaultMaxTokens ?? 1000;

      results.push({
        id: key.id,
        priorityRole: normalizePriorityRole(key.priorityRole),
        providerId: key.providerId,
        providerCode: key.providerCode,
        apiDialect: normalizeDialect(key.apiDialect),
        baseUrl: key.baseUrl,
        verifyPath: key.verifyPath,
        apiKeyCiphertext: key.apiKeyCiphertext,
        apiKeyLast4: key.apiKeyLast4,
        modelId: model.id,
        modelCode: model.modelId,
        temperature: Number.isFinite(resolvedTemp) ? resolvedTemp : 0.7,
        maxTokens: resolvedMaxTokens,
        monthlyTokenCap: key.monthlyTokenCap ?? null,
      });
    }

    return results;
  }

  /** @inheritdoc */
  async sumMonthlyPlatformTrialTokens(clientId: string, monthStartUtc: Date): Promise<number> {
    const db = getDb();
    const rows = await db
      .select({
        totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.inputTokens} + ${aiUsageEvents.outputTokens}), 0)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.clientId, clientId),
          eq(aiUsageEvents.mode, "mocter"),
          gte(aiUsageEvents.createdAt, monthStartUtc),
        ),
      );

    return Number(rows[0]?.totalTokens ?? 0);
  }
}

/**
 * Parámetros de entrada para resolver la credencial AI efectiva de una solicitud.
 */
export interface ResolveAiCredentialInput {
  /** Identificador del inquilino si ya existe (nulo o ausente durante onboarding temprano). */
  clientId?: string | null;
  /** Identificador del usuario autenticado para validar sesiones de onboarding inconclusas. */
  userId?: string | null;
  /** Indica si la solicitud proviene de un operador SaaS autorizado para usar las llaves globales de plataforma. */
  isPlatformScope?: boolean;
  /** Marca de tiempo de referencia (inyectable para pruebas deterministas). */
  now?: Date;
}

/**
 * Servicio de dominio que aplica la matriz de precedencia estricta para inferencia AI (SPEC-02):
 * 1. Credencial BYOK activa del inquilino (`mode = 'byok'`, ordenada `[primary, secondary]`).
 * 2. Excepción temporal de plataforma durante `trialing` vigente u `onboarding` inconcluso (`mode = 'mocter'`, `[primary, secondary]`).
 * 3. Bloqueo determinista `AI_BYOK_REQUIRED` cuando no existe credencial propia ni excepción vigente.
 */
export class AiCredentialResolverService {
  constructor(
    private readonly repository: IAiCredentialResolverRepository = new DrizzleAiCredentialResolverRepository(),
    private readonly crypto: SecretCryptoService = new SecretCryptoService(),
  ) {}

  /**
   * Resuelve y descifra en memoria la credencial LLM primaria autorizada para el inquilino o prospecto.
   *
   * @param input - Contexto de identidad (`clientId` y/o `userId`) de la solicitud actual.
   * @returns `Result` con la credencial descifrada en memoria o código de rechazo de negocio.
   */
  async resolveCredential(
    input: ResolveAiCredentialInput,
  ): Promise<Result<ResolvedAiCredential>> {
    const candidatesResult = await this.resolveCredentialCandidates(input);
    if (!candidatesResult.ok) {
      return candidatesResult;
    }
    return ok(candidatesResult.data[0]);
  }

  /**
   * Resuelve y descifra en memoria la lista ordenada `[primary, secondary]` de credenciales autorizadas
   * para permitir failover automático sin mezclar credenciales BYOK del inquilino con claves de plataforma.
   *
   * @param input - Contexto de identidad (`clientId` y/o `userId`) de la solicitud actual.
   * @returns `Result` con al menos una credencial descifrada en orden de prioridad.
   */
  async resolveCredentialCandidates(
    input: ResolveAiCredentialInput,
  ): Promise<Result<ResolvedAiCredential[]>> {
    const now = input.now ?? new Date();
    const clientId = input.clientId ?? null;
    const userId = input.userId ?? null;

    // Prioridad 1: BYOK propio del inquilino (siempre prevalece sobre trial u onboarding)
    if (clientId) {
      const byokRecords = this.repository.findActiveTenantByokCandidates
        ? await this.repository.findActiveTenantByokCandidates(clientId)
        : await this.repository.findActiveTenantByok(clientId).then((r) => (r ? [r] : []));

      if (byokRecords.length > 0) {
        const resolvedByok: ResolvedAiCredential[] = [];
        for (const byok of byokRecords) {
          try {
            const apiKey = this.crypto.decrypt(byok.apiKeyCiphertext);
            resolvedByok.push({
              source: "byok",
              mode: "byok",
              priorityRole: byok.priorityRole ?? "primary",
              providerId: byok.providerId,
              providerCode: byok.providerCode,
              apiDialect: byok.apiDialect,
              baseUrl: byok.baseUrl,
              verifyPath: byok.verifyPath,
              modelId: byok.modelId,
              modelCode: byok.modelCode,
              apiKey,
              keyLast4: byok.apiKeyLast4,
              temperature: byok.temperature,
              maxTokens: byok.maxTokens,
              monthlyTokenCap: null,
            });
          } catch (error) {
            if (error instanceof SecretCryptoError) {
              continue;
            }
            throw error;
          }
        }

        if (resolvedByok.length === 0) {
          return err(
            "La credencial BYOK configurada no pudo descifrarse. Reingresa o rota la API Key.",
            "AI_KEY_INVALID",
          );
        }

        return ok(resolvedByok);
      }
    }

    // Prioridad 2: Operador SaaS de plataforma, Onboarding inconcluso o Periodo de Trial vigente
    let isEligibleForPlatformTrial = Boolean(input.isPlatformScope);

    if (!isEligibleForPlatformTrial && userId) {
      const onboarding = await this.repository.findOnboardingSession(userId);
      if (onboarding && onboarding.completedAt === null && onboarding.status !== "completed") {
        isEligibleForPlatformTrial = true;
      }
    }

    if (!isEligibleForPlatformTrial && clientId) {
      const subscription = await this.repository.findTenantSubscription(clientId);
      if (
        subscription &&
        subscription.status === "trialing" &&
        subscription.trialEndsAt !== null &&
        subscription.trialEndsAt.getTime() > now.getTime()
      ) {
        isEligibleForPlatformTrial = true;
      }
    }

    if (!isEligibleForPlatformTrial) {
      return err(
        "Para usar la asistencia AI debes configurar tu propia API Key de proveedor (BYOK) en la configuración de Inteligencia Artificial.",
        "AI_BYOK_REQUIRED",
      );
    }

    const platformKeys = this.repository.findActivePlatformTrialKeys
      ? await this.repository.findActivePlatformTrialKeys()
      : await this.repository.findActivePlatformTrialKey().then((r) => (r ? [r] : []));

    if (platformKeys.length === 0) {
      return err(
        "La plataforma no cuenta con una API Key de prueba activa en este momento. Configura tu propia API Key BYOK o contacta al administrador.",
        "AI_PLATFORM_KEY_MISSING",
      );
    }

    const primaryCap = platformKeys[0].monthlyTokenCap;
    if (clientId && primaryCap !== null && primaryCap > 0) {
      const monthStartUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
      );
      const usedTokens = await this.repository.sumMonthlyPlatformTrialTokens(
        clientId,
        monthStartUtc,
      );
      if (usedTokens >= primaryCap) {
        return err(
          "Alcanzaste el tope mensual de tokens incluidos en el periodo de prueba. Configura tu propia API Key BYOK para continuar sin límites de plataforma.",
          "AI_RATE_LIMIT_EXCEEDED",
        );
      }
    }

    const resolvedPlatform: ResolvedAiCredential[] = [];
    for (const platformKey of platformKeys) {
      try {
        const apiKey = this.crypto.decrypt(platformKey.apiKeyCiphertext);
        resolvedPlatform.push({
          source: "platform_trial",
          mode: "mocter",
          priorityRole: platformKey.priorityRole ?? "primary",
          providerId: platformKey.providerId,
          providerCode: platformKey.providerCode,
          apiDialect: platformKey.apiDialect,
          baseUrl: platformKey.baseUrl,
          verifyPath: platformKey.verifyPath,
          modelId: platformKey.modelId,
          modelCode: platformKey.modelCode,
          apiKey,
          keyLast4: platformKey.apiKeyLast4,
          temperature: platformKey.temperature,
          maxTokens: platformKey.maxTokens,
          monthlyTokenCap: platformKey.monthlyTokenCap,
        });
      } catch (error) {
        if (error instanceof SecretCryptoError) {
          continue;
        }
        throw error;
      }
    }

    if (resolvedPlatform.length === 0) {
      return err(
        "No fue posible descifrar la clave de prueba configurada en plataforma.",
        "AI_PLATFORM_KEY_MISSING",
      );
    }

    return ok(resolvedPlatform);
  }
}
