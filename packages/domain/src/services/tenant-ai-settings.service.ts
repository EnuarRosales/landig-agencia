import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  aiModels,
  aiProviders,
  auditLog,
  subscriptions,
  tenantAiProviders,
  tenantModelSettings,
} from "../db/schemas/admin";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { AiPriorityRole, SupportedLlmProviderCode } from "./ai-credential-resolver.service";
import { signProviderLogoUrl } from "./admin-dashboard.service";
import { LlmHttpProviderClient, type AiApiDialect } from "./llm-http-provider.client";
import { SecretCryptoService, SecretCryptoError } from "./secret-crypto.service";

const PRIORITY_ROLE_ORDER: Record<AiPriorityRole, number> = {
  primary: 0,
  secondary: 1,
  standby: 2,
};

function normalizeTenantPriorityRole(value: string | null | undefined): AiPriorityRole {
  if (value === "primary" || value === "secondary" || value === "standby") {
    return value;
  }
  return "standby";
}

function normalizeTenantDialect(value: string | null | undefined): AiApiDialect {
  if (
    value === "openai_compatible" ||
    value === "anthropic" ||
    value === "google_gemini"
  ) {
    return value;
  }
  return "openai_compatible";
}

/**
 * Modelo LLM disponible en el catálogo para selección del inquilino.
 */
export interface TenantAvailableModelDto {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  defaultTemperature: string;
  defaultMaxTokens: number;
  maxOutputTokens: number;
  contextWindow: number;
  isDefault?: boolean;
}

/**
 * Proveedor LLM disponible en el catálogo maestro.
 */
export interface TenantAvailableProviderDto {
  id: string;
  code: SupportedLlmProviderCode;
  name: string;
  apiDialect?: AiApiDialect;
  logoUrl?: string | null;
  docsUrl: string | null;
  models: TenantAvailableModelDto[];
}

/**
 * Representación pública y enmascarada de una credencial BYOK guardada para un inquilino.
 * Jamás expone la llave en texto plano ni el texto cifrado.
 */
export interface MaskedTenantByokProviderDto {
  id: string;
  providerId: string;
  providerCode: SupportedLlmProviderCode;
  providerName: string;
  logoUrl?: string | null;
  hasKey: true;
  apiKeyLast4: string;
  apiKeyKeyId: string;
  status: string;
  priorityRole?: AiPriorityRole;
  lastVerifiedAt: string | null;
  lastVerificationError: string | null;
  selectedModelId: string | null;
  selectedModelCode: string | null;
  temperature: string;
  maxTokens: number;
  updatedAt: string;
}

/**
 * Estado agregado de configuración AI/BYOK del inquilino para `/workspace/ai`.
 */
export interface TenantAiSettingsOverviewDto {
  clientId: string;
  effectiveMode: "byok" | "platform_trial" | "byok_required";
  inferenceSource: "byok" | "platform_trial" | "unavailable";
  isTrialActive: boolean;
  trialEndsAt: string | null;
  activeByok: MaskedTenantByokProviderDto | null;
  configuredProviders: MaskedTenantByokProviderDto[];
  catalog: TenantAvailableProviderDto[];
}

/**
 * Parámetros para guardar o rotar una configuración BYOK de inquilino.
 */
export interface SaveTenantByokInput {
  clientId: string;
  actorUserId?: string | null;
  actorRole: string;
  actorEmail: string;
  providerCode: SupportedLlmProviderCode;
  modelId?: string | null;
  apiKey?: string | null;
  temperature?: number;
  maxTokens?: number;
  priorityRole?: AiPriorityRole;
  verifyImmediately?: boolean;
}

/**
 * Resultado seguro al verificar conectividad con el proveedor externo.
 */
export interface VerifyTenantByokResultDto {
  valid: true;
  providerCode: SupportedLlmProviderCode;
  apiKeyLast4: string;
  latencyMs: number;
  verifiedAt: string;
}

/**
 * Contrato de persistencia abstracto para pruebas y runtime Drizzle de `TenantAiSettingsService`.
 */
export interface ITenantAiSettingsRepository {
  getOverviewData(clientId: string): Promise<{
    providers: Array<{
      id: string;
      code: SupportedLlmProviderCode;
      name: string;
      apiDialect?: AiApiDialect;
      logoUrl?: string | null;
      docsUrl: string | null;
    }>;
    models: TenantAvailableModelDto[];
    tenantProviders: Array<{
      id: string;
      providerId: string;
      providerCode: SupportedLlmProviderCode;
      providerName: string;
      apiKeyLast4: string;
      apiKeyKeyId: string;
      status: string;
      priorityRole?: AiPriorityRole;
      lastVerifiedAt: Date | null;
      lastVerificationError: string | null;
      updatedAt: Date;
    }>;
    modelSettings: Array<{
      providerId: string;
      modelId: string;
      modelCode: string;
      temperature: string;
      maxTokens: number;
      isEnabled: boolean;
    }>;
    subscription: { status: string; trialEndsAt: Date | null } | null;
  }>;

  findProviderByCode(providerCode: SupportedLlmProviderCode): Promise<{
    id: string;
    code: SupportedLlmProviderCode;
    name: string;
    apiDialect?: AiApiDialect;
    baseUrl?: string;
    verifyPath?: string;
    logoUrl?: string | null;
  } | null>;

  findModelForProvider(
    providerId: string,
    modelIdOrCode?: string | null,
  ): Promise<{ id: string; modelId: string; defaultTemperature: string; defaultMaxTokens: number } | null>;

  findTenantProviderForVerification(
    clientId: string,
    providerCode?: SupportedLlmProviderCode,
  ): Promise<{
    id: string;
    providerId: string;
    providerCode: SupportedLlmProviderCode;
    apiDialect?: AiApiDialect;
    baseUrl?: string;
    verifyPath?: string;
    apiKeyCiphertext: string;
    apiKeyLast4: string;
    status: string;
  } | null>;

  upsertTenantProviderAndModel(params: {
    clientId: string;
    providerId: string;
    modelId: string;
    temperature: string;
    maxTokens: number;
    priorityRole?: AiPriorityRole;
    actorEmail: string;
    encrypted?: { ciphertext: string; keyId: string; last4: string };
    verifiedAt?: Date;
  }): Promise<{
    id: string;
    apiKeyLast4: string;
    apiKeyKeyId: string;
    status: string;
    priorityRole?: AiPriorityRole;
    lastVerifiedAt: Date | null;
  }>;

  updateTenantProviderVerification(params: {
    id: string;
    status?: "active" | "invalid";
    lastVerifiedAt?: Date | null;
    lastVerificationError: string | null;
    actorEmail: string;
  }): Promise<void>;

  revokeTenantProviders(params: {
    clientId: string;
    providerCode?: SupportedLlmProviderCode;
    actorEmail: string;
  }): Promise<number>;

  writeAuditLog(entry: {
    actorUserId?: string | null;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    clientId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Implementación Drizzle ORM del repositorio de configuración BYOK por inquilino.
 */
export class DrizzleTenantAiSettingsRepository implements ITenantAiSettingsRepository {
  /** @inheritdoc */
  async getOverviewData(clientId: string) {
    const db = getDb();

    const providers = await db
      .select({
        id: aiProviders.id,
        code: aiProviders.code,
        name: aiProviders.name,
        apiDialect: aiProviders.apiDialect,
        logoStorageKey: aiProviders.logoStorageKey,
        docsUrl: aiProviders.docsUrl,
      })
      .from(aiProviders)
      .where(and(eq(aiProviders.isActive, true), isNull(aiProviders.deletedAt)))
      .orderBy(asc(aiProviders.sortOrder), asc(aiProviders.name));

    const models = await db
      .select({
        id: aiModels.id,
        providerId: aiModels.providerId,
        modelId: aiModels.modelId,
        displayName: aiModels.displayName,
        defaultTemperature: aiModels.defaultTemperature,
        defaultMaxTokens: aiModels.defaultMaxTokens,
        maxOutputTokens: aiModels.maxOutputTokens,
        contextWindow: aiModels.contextWindow,
        isDefault: aiModels.isDefault,
      })
      .from(aiModels)
      .where(and(eq(aiModels.isActive, true), isNull(aiModels.deletedAt)))
      .orderBy(desc(aiModels.isDefault), asc(aiModels.sortOrder), asc(aiModels.displayName));

    const tenantProviders = await db
      .select({
        id: tenantAiProviders.id,
        providerId: tenantAiProviders.providerId,
        providerCode: aiProviders.code,
        providerName: aiProviders.name,
        apiKeyLast4: tenantAiProviders.apiKeyLast4,
        apiKeyKeyId: tenantAiProviders.apiKeyKeyId,
        status: tenantAiProviders.status,
        priorityRole: tenantAiProviders.priorityRole,
        lastVerifiedAt: tenantAiProviders.lastVerifiedAt,
        lastVerificationError: tenantAiProviders.lastVerificationError,
        updatedAt: tenantAiProviders.updatedAt,
      })
      .from(tenantAiProviders)
      .innerJoin(aiProviders, eq(tenantAiProviders.providerId, aiProviders.id))
      .where(
        and(
          eq(tenantAiProviders.clientId, clientId),
          isNull(tenantAiProviders.deletedAt),
        ),
      )
      .orderBy(desc(tenantAiProviders.updatedAt));

    const modelSettings = await db
      .select({
        providerId: tenantModelSettings.providerId,
        modelId: tenantModelSettings.modelId,
        modelCode: aiModels.modelId,
        temperature: tenantModelSettings.temperature,
        maxTokens: tenantModelSettings.maxTokens,
        isEnabled: tenantModelSettings.isEnabled,
      })
      .from(tenantModelSettings)
      .innerJoin(aiModels, eq(tenantModelSettings.modelId, aiModels.id))
      .where(
        and(
          eq(tenantModelSettings.clientId, clientId),
          isNull(tenantModelSettings.deletedAt),
        ),
      )
      .orderBy(desc(tenantModelSettings.updatedAt));

    const subRows = await db
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.clientId, clientId))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);

    return {
      providers: providers.map((p) => ({
        id: p.id,
        code: p.code as SupportedLlmProviderCode,
        name: p.name,
        apiDialect: normalizeTenantDialect(p.apiDialect),
        logoUrl: signProviderLogoUrl(p.logoStorageKey),
        docsUrl: p.docsUrl,
      })),
      models,
      tenantProviders: tenantProviders.map((tp) => ({
        ...tp,
        providerCode: tp.providerCode as SupportedLlmProviderCode,
        priorityRole: normalizeTenantPriorityRole(tp.priorityRole),
      })),
      modelSettings,
      subscription: subRows[0] ?? null,
    };
  }

  /** @inheritdoc */
  async findProviderByCode(providerCode: SupportedLlmProviderCode) {
    const db = getDb();
    const rows = await db
      .select({
        id: aiProviders.id,
        code: aiProviders.code,
        name: aiProviders.name,
        apiDialect: aiProviders.apiDialect,
        baseUrl: aiProviders.baseUrl,
        verifyPath: aiProviders.verifyPath,
        logoStorageKey: aiProviders.logoStorageKey,
      })
      .from(aiProviders)
      .where(
        and(
          eq(aiProviders.code, providerCode),
          eq(aiProviders.isActive, true),
          isNull(aiProviders.deletedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      code: row.code as SupportedLlmProviderCode,
      name: row.name,
      apiDialect: normalizeTenantDialect(row.apiDialect),
      baseUrl: row.baseUrl,
      verifyPath: row.verifyPath,
      logoUrl: signProviderLogoUrl(row.logoStorageKey),
    };
  }

  /** @inheritdoc */
  async findModelForProvider(providerId: string, modelIdOrCode?: string | null) {
    const db = getDb();
    const rows = await db
      .select({
        id: aiModels.id,
        modelId: aiModels.modelId,
        defaultTemperature: aiModels.defaultTemperature,
        defaultMaxTokens: aiModels.defaultMaxTokens,
      })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.providerId, providerId),
          eq(aiModels.isActive, true),
          isNull(aiModels.deletedAt),
        ),
      )
      .orderBy(desc(aiModels.isDefault), asc(aiModels.sortOrder), asc(aiModels.displayName));

    if (rows.length === 0) return null;
    if (!modelIdOrCode) return rows[0];

    return (
      rows.find((m) => m.id === modelIdOrCode || m.modelId === modelIdOrCode) ?? null
    );
  }

  /** @inheritdoc */
  async findTenantProviderForVerification(
    clientId: string,
    providerCode?: SupportedLlmProviderCode,
  ) {
    const db = getDb();
    const conditions = [
      eq(tenantAiProviders.clientId, clientId),
      isNull(tenantAiProviders.deletedAt),
    ];
    if (providerCode) {
      conditions.push(eq(aiProviders.code, providerCode));
    }

    const rows = await db
      .select({
        id: tenantAiProviders.id,
        providerId: tenantAiProviders.providerId,
        providerCode: aiProviders.code,
        apiDialect: aiProviders.apiDialect,
        baseUrl: aiProviders.baseUrl,
        verifyPath: aiProviders.verifyPath,
        apiKeyCiphertext: tenantAiProviders.apiKeyCiphertext,
        apiKeyLast4: tenantAiProviders.apiKeyLast4,
        status: tenantAiProviders.status,
      })
      .from(tenantAiProviders)
      .innerJoin(aiProviders, eq(tenantAiProviders.providerId, aiProviders.id))
      .where(and(...conditions))
      .orderBy(desc(tenantAiProviders.updatedAt))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      providerCode: row.providerCode as SupportedLlmProviderCode,
      apiDialect: normalizeTenantDialect(row.apiDialect),
    };
  }

  /** @inheritdoc */
  async upsertTenantProviderAndModel(params: {
    clientId: string;
    providerId: string;
    modelId: string;
    temperature: string;
    maxTokens: number;
    priorityRole?: AiPriorityRole;
    actorEmail: string;
    encrypted?: { ciphertext: string; keyId: string; last4: string };
    verifiedAt?: Date;
  }) {
    const db = getDb();
    const now = new Date();

    return db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: tenantAiProviders.id,
          apiKeyLast4: tenantAiProviders.apiKeyLast4,
          apiKeyKeyId: tenantAiProviders.apiKeyKeyId,
          status: tenantAiProviders.status,
          priorityRole: tenantAiProviders.priorityRole,
          lastVerifiedAt: tenantAiProviders.lastVerifiedAt,
        })
        .from(tenantAiProviders)
        .where(
          and(
            eq(tenantAiProviders.clientId, params.clientId),
            eq(tenantAiProviders.providerId, params.providerId),
            isNull(tenantAiProviders.deletedAt),
          ),
        )
        .limit(1);

      const resolvedRole: AiPriorityRole =
        params.priorityRole ??
        (existing[0] ? normalizeTenantPriorityRole(existing[0].priorityRole) : "primary");

      if (resolvedRole === "primary" || resolvedRole === "secondary") {
        const demoteConditions = [
          eq(tenantAiProviders.clientId, params.clientId),
          eq(tenantAiProviders.priorityRole, resolvedRole),
          isNull(tenantAiProviders.deletedAt),
        ];
        if (existing[0]) {
          demoteConditions.push(ne(tenantAiProviders.id, existing[0].id));
        }

        await tx
          .update(tenantAiProviders)
          .set({
            priorityRole: "standby",
            updatedBy: params.actorEmail,
            updatedAt: now,
          })
          .where(and(...demoteConditions));
      }

      let savedProvider: {
        id: string;
        apiKeyLast4: string;
        apiKeyKeyId: string;
        status: string;
        priorityRole: AiPriorityRole;
        lastVerifiedAt: Date | null;
      };

      if (existing[0]) {
        const updateFields: Record<string, unknown> = {
          status: "active",
          priorityRole: resolvedRole,
          lastVerificationError: null,
          updatedBy: params.actorEmail,
          updatedAt: now,
        };
        if (params.encrypted) {
          updateFields.apiKeyCiphertext = params.encrypted.ciphertext;
          updateFields.apiKeyKeyId = params.encrypted.keyId;
          updateFields.apiKeyLast4 = params.encrypted.last4;
        }
        if (params.verifiedAt) {
          updateFields.lastVerifiedAt = params.verifiedAt;
        }

        const [updated] = await tx
          .update(tenantAiProviders)
          .set(updateFields)
          .where(eq(tenantAiProviders.id, existing[0].id))
          .returning({
            id: tenantAiProviders.id,
            apiKeyLast4: tenantAiProviders.apiKeyLast4,
            apiKeyKeyId: tenantAiProviders.apiKeyKeyId,
            status: tenantAiProviders.status,
            priorityRole: tenantAiProviders.priorityRole,
            lastVerifiedAt: tenantAiProviders.lastVerifiedAt,
          });
        savedProvider = {
          ...updated,
          priorityRole: normalizeTenantPriorityRole(updated.priorityRole),
        };
      } else {
        if (!params.encrypted) {
          throw new Error("API key cifrada requerida para crear proveedor BYOK.");
        }

        const [inserted] = await tx
          .insert(tenantAiProviders)
          .values({
            clientId: params.clientId,
            providerId: params.providerId,
            apiKeyCiphertext: params.encrypted.ciphertext,
            apiKeyKeyId: params.encrypted.keyId,
            apiKeyLast4: params.encrypted.last4,
            status: "active",
            priorityRole: resolvedRole,
            lastVerifiedAt: params.verifiedAt ?? null,
            lastVerificationError: null,
            createdBy: params.actorEmail,
            updatedBy: params.actorEmail,
          })
          .returning({
            id: tenantAiProviders.id,
            apiKeyLast4: tenantAiProviders.apiKeyLast4,
            apiKeyKeyId: tenantAiProviders.apiKeyKeyId,
            status: tenantAiProviders.status,
            priorityRole: tenantAiProviders.priorityRole,
            lastVerifiedAt: tenantAiProviders.lastVerifiedAt,
          });
        savedProvider = {
          ...inserted,
          priorityRole: normalizeTenantPriorityRole(inserted.priorityRole),
        };
      }

      // Deshabilitar ajustes previos del MISMO proveedor para mantener una preferencia activa por proveedor
      await tx
        .update(tenantModelSettings)
        .set({ isEnabled: false, updatedBy: params.actorEmail, updatedAt: now })
        .where(
          and(
            eq(tenantModelSettings.clientId, params.clientId),
            eq(tenantModelSettings.providerId, params.providerId),
            isNull(tenantModelSettings.deletedAt),
          ),
        );

      const existingSetting = await tx
        .select({ id: tenantModelSettings.id })
        .from(tenantModelSettings)
        .where(
          and(
            eq(tenantModelSettings.clientId, params.clientId),
            eq(tenantModelSettings.providerId, params.providerId),
            eq(tenantModelSettings.modelId, params.modelId),
            isNull(tenantModelSettings.deletedAt),
          ),
        )
        .limit(1);

      if (existingSetting[0]) {
        await tx
          .update(tenantModelSettings)
          .set({
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            isEnabled: true,
            updatedBy: params.actorEmail,
            updatedAt: now,
          })
          .where(eq(tenantModelSettings.id, existingSetting[0].id));
      } else {
        await tx.insert(tenantModelSettings).values({
          clientId: params.clientId,
          providerId: params.providerId,
          modelId: params.modelId,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          isEnabled: true,
          createdBy: params.actorEmail,
          updatedBy: params.actorEmail,
        });
      }

      return savedProvider;
    });
  }

  /** @inheritdoc */
  async updateTenantProviderVerification(params: {
    id: string;
    status?: "active" | "invalid";
    lastVerifiedAt?: Date | null;
    lastVerificationError: string | null;
    actorEmail: string;
  }) {
    const db = getDb();
    const updatePayload: Record<string, unknown> = {
      lastVerificationError: params.lastVerificationError,
      updatedBy: params.actorEmail,
      updatedAt: new Date(),
    };
    if (params.status) {
      updatePayload.status = params.status;
    }
    if (params.lastVerifiedAt !== undefined) {
      updatePayload.lastVerifiedAt = params.lastVerifiedAt;
    }

    await db
      .update(tenantAiProviders)
      .set(updatePayload)
      .where(eq(tenantAiProviders.id, params.id));
  }

  /** @inheritdoc */
  async revokeTenantProviders(params: {
    clientId: string;
    providerCode?: SupportedLlmProviderCode;
    actorEmail: string;
  }): Promise<number> {
    const db = getDb();
    const now = new Date();
    let providerIdFilter: string | undefined;

    if (params.providerCode) {
      const prov = await this.findProviderByCode(params.providerCode);
      providerIdFilter = prov?.id;
      if (!providerIdFilter) return 0;
    }

    const providerWhere = [
      eq(tenantAiProviders.clientId, params.clientId),
      isNull(tenantAiProviders.deletedAt),
    ];
    if (providerIdFilter) {
      providerWhere.push(eq(tenantAiProviders.providerId, providerIdFilter));
    }

    const revoked = await db
      .update(tenantAiProviders)
      .set({
        status: "revoked",
        deletedAt: now,
        deletedBy: params.actorEmail,
        updatedBy: params.actorEmail,
        updatedAt: now,
      })
      .where(and(...providerWhere))
      .returning({ id: tenantAiProviders.id });

    const modelWhere = [
      eq(tenantModelSettings.clientId, params.clientId),
      isNull(tenantModelSettings.deletedAt),
    ];
    if (providerIdFilter) {
      modelWhere.push(eq(tenantModelSettings.providerId, providerIdFilter));
    }

    await db
      .update(tenantModelSettings)
      .set({
        isEnabled: false,
        deletedAt: now,
        deletedBy: params.actorEmail,
        updatedBy: params.actorEmail,
        updatedAt: now,
      })
      .where(and(...modelWhere));

    return revoked.length;
  }

  /** @inheritdoc */
  async writeAuditLog(entry: {
    actorUserId?: string | null;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    clientId: string;
    metadata: Record<string, unknown>;
  }) {
    const db = getDb();
    await db.insert(auditLog).values({
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      clientId: entry.clientId,
      metadata: entry.metadata,
    });
  }
}

/**
 * Servicio de dominio para gestión segura de credenciales BYOK del inquilino (`SPEC-02 §6.2`).
 */
export class TenantAiSettingsService {
  constructor(
    private readonly repository: ITenantAiSettingsRepository = new DrizzleTenantAiSettingsRepository(),
    private readonly crypto: SecretCryptoService = new SecretCryptoService(),
    private readonly llmClient: LlmHttpProviderClient = new LlmHttpProviderClient(),
  ) {}

  /**
   * Obtiene el estado actual de configuración BYOK del inquilino sin exponer jamás llaves descifradas.
   *
   * @param clientId - Identificador único del comercio inquilino.
   * @returns `Result` con estado efectivo, proveedores configurados enmascarados y catálogo LLM.
   */
  async getSettingsOverview(
    clientId: string,
  ): Promise<Result<TenantAiSettingsOverviewDto>> {
    const data = await this.repository.getOverviewData(clientId);

    const catalog: TenantAvailableProviderDto[] = data.providers.map((p) => ({
      ...p,
      models: data.models.filter((m) => m.providerId === p.id),
    }));

    const providerById = new Map(data.providers.map((p) => [p.id, p]));

    const configuredProviders: MaskedTenantByokProviderDto[] = data.tenantProviders
      .map((tp) => {
        const setting =
          data.modelSettings.find(
            (ms) => ms.providerId === tp.providerId && ms.isEnabled,
          ) ?? data.modelSettings.find((ms) => ms.providerId === tp.providerId);
        const catalogProv = providerById.get(tp.providerId);

        return {
          id: tp.id,
          providerId: tp.providerId,
          providerCode: tp.providerCode,
          providerName: tp.providerName,
          logoUrl: catalogProv?.logoUrl ?? null,
          hasKey: true as const,
          apiKeyLast4: tp.apiKeyLast4,
          apiKeyKeyId: tp.apiKeyKeyId,
          status: tp.status,
          priorityRole: normalizeTenantPriorityRole(tp.priorityRole ?? "primary"),
          lastVerifiedAt: tp.lastVerifiedAt ? tp.lastVerifiedAt.toISOString() : null,
          lastVerificationError: tp.lastVerificationError ?? null,
          selectedModelId: setting?.modelId ?? null,
          selectedModelCode: setting?.modelCode ?? null,
          temperature: setting?.temperature ?? "0.7",
          maxTokens: setting?.maxTokens ?? 1000,
          updatedAt: tp.updatedAt.toISOString(),
        };
      })
      .sort((a, b) => {
        const rankA = PRIORITY_ROLE_ORDER[a.priorityRole ?? "standby"];
        const rankB = PRIORITY_ROLE_ORDER[b.priorityRole ?? "standby"];
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        return b.updatedAt.localeCompare(a.updatedAt);
      });

    const activeByok =
      configuredProviders.find(
        (p) => p.status === "active" && p.priorityRole === "primary",
      ) ??
      configuredProviders.find((p) => p.status === "active") ??
      null;

    const now = Date.now();
    const isTrialActive = Boolean(
      data.subscription &&
        data.subscription.status === "trialing" &&
        data.subscription.trialEndsAt &&
        data.subscription.trialEndsAt.getTime() > now,
    );

    const effectiveMode: TenantAiSettingsOverviewDto["effectiveMode"] = activeByok
      ? "byok"
      : isTrialActive
        ? "platform_trial"
        : "byok_required";

    const inferenceSource: TenantAiSettingsOverviewDto["inferenceSource"] = activeByok
      ? "byok"
      : isTrialActive
        ? "platform_trial"
        : "unavailable";

    return ok({
      clientId,
      effectiveMode,
      inferenceSource,
      isTrialActive,
      trialEndsAt: data.subscription?.trialEndsAt
        ? data.subscription.trialEndsAt.toISOString()
        : null,
      activeByok,
      configuredProviders,
      catalog,
    });
  }

  /**
   * Crea o actualiza la configuración BYOK de un inquilino cifrando la clave con AES-256-GCM.
   *
   * @param input - Proveedor, modelo preferido, parámetros, prioridad y API Key opcional en texto plano.
   * @returns `Result` con metadatos seguros y enmascarados tras guardar y auditar.
   */
  async saveSettings(
    input: SaveTenantByokInput,
  ): Promise<Result<MaskedTenantByokProviderDto>> {
    if (
      input.priorityRole !== undefined &&
      input.priorityRole !== "primary" &&
      input.priorityRole !== "secondary" &&
      input.priorityRole !== "standby"
    ) {
      return err("El rol de prioridad indicado no es válido.", "VALIDATION_ERROR");
    }

    const provider = await this.repository.findProviderByCode(input.providerCode);
    if (!provider) {
      return err(
        `El proveedor '${input.providerCode}' no existe o está deshabilitado.`,
        "AI_PROVIDER_NOT_FOUND",
      );
    }

    const model = await this.repository.findModelForProvider(
      provider.id,
      input.modelId,
    );
    if (!model) {
      return err(
        `El modelo seleccionado no pertenece al proveedor '${provider.name}' o no está disponible.`,
        "AI_MODEL_NOT_FOUND",
      );
    }

    const trimmedKey = input.apiKey?.trim() ?? "";
    let encryptedPayload: { ciphertext: string; keyId: string; last4: string } | undefined;
    let verifiedAt: Date | undefined;

    if (trimmedKey.length > 0) {
      if (input.verifyImmediately !== false) {
        const verifyRes = await this.llmClient.verifyApiKey({
          providerCode: provider.code,
          apiDialect: provider.apiDialect,
          baseUrl: provider.baseUrl,
          verifyPath: provider.verifyPath,
          apiKey: trimmedKey,
        });
        if (!verifyRes.ok) {
          const failureCode =
            verifyRes.code === "AI_KEY_INVALID"
              ? "AI_KEY_VERIFICATION_FAILED"
              : (verifyRes.code ?? "AI_KEY_VERIFICATION_FAILED");
          return err(verifyRes.error, failureCode);
        }
        verifiedAt = new Date();
      }

      try {
        encryptedPayload = this.crypto.encrypt(trimmedKey);
      } catch (error: unknown) {
        const msg =
          error instanceof SecretCryptoError
            ? error.message
            : "Error de configuración criptográfica al cifrar la API Key.";
        return err(msg, "AI_CRYPTO_CONFIG_ERROR");
      }
    } else {
      const existing = await this.repository.findTenantProviderForVerification(
        input.clientId,
        provider.code,
      );
      if (!existing) {
        return err(
          "Debes ingresar una API Key válida para activar este proveedor.",
          "AI_API_KEY_REQUIRED",
        );
      }
    }

    const tempVal =
      input.temperature !== undefined
        ? Math.min(2, Math.max(0, input.temperature)).toFixed(2)
        : model.defaultTemperature;
    const maxTokensVal =
      input.maxTokens !== undefined
        ? Math.max(64, Math.min(32768, Math.trunc(input.maxTokens)))
        : model.defaultMaxTokens;

    const saved = await this.repository.upsertTenantProviderAndModel({
      clientId: input.clientId,
      providerId: provider.id,
      modelId: model.id,
      temperature: tempVal,
      maxTokens: maxTokensVal,
      priorityRole: input.priorityRole,
      actorEmail: input.actorEmail,
      encrypted: encryptedPayload,
      verifiedAt,
    });

    const finalPriorityRole = saved.priorityRole ?? input.priorityRole ?? "primary";

    await this.repository.writeAuditLog({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: "tenant_ai_byok_updated",
      entityType: "tenant_ai_providers",
      entityId: saved.id,
      clientId: input.clientId,
      metadata: {
        providerCode: provider.code,
        modelCode: model.modelId,
        priorityRole: finalPriorityRole,
        apiKeyLast4: saved.apiKeyLast4,
        verified: Boolean(verifiedAt),
      },
    });

    appLogger.info("[TenantAiSettingsService] Configuración BYOK guardada", {
      clientId: input.clientId,
      providerCode: provider.code,
      modelCode: model.modelId,
      priorityRole: finalPriorityRole,
      apiKeyLast4: saved.apiKeyLast4,
      verified: Boolean(verifiedAt),
    });

    return ok({
      id: saved.id,
      providerId: provider.id,
      providerCode: provider.code,
      providerName: provider.name,
      logoUrl: provider.logoUrl ?? null,
      hasKey: true,
      apiKeyLast4: saved.apiKeyLast4,
      apiKeyKeyId: saved.apiKeyKeyId,
      status: saved.status,
      priorityRole: finalPriorityRole,
      lastVerifiedAt: saved.lastVerifiedAt ? saved.lastVerifiedAt.toISOString() : null,
      lastVerificationError: null,
      selectedModelId: model.id,
      selectedModelCode: model.modelId,
      temperature: tempVal,
      maxTokens: maxTokensVal,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Verifica activamente una clave BYOK ya almacenada realizando una consulta ligera al proveedor.
   *
   * @param params - Identidad del inquilino, actor y proveedor opcional.
   * @returns `Result` con latencia medida y última verificación o error tipado (`AI_KEY_INVALID`).
   */
  async verifyStoredKey(params: {
    clientId: string;
    actorUserId?: string | null;
    actorRole: string;
    actorEmail: string;
    providerCode?: SupportedLlmProviderCode;
  }): Promise<Result<VerifyTenantByokResultDto>> {
    const stored = await this.repository.findTenantProviderForVerification(
      params.clientId,
      params.providerCode,
    );
    if (!stored) {
      return err(
        "No hay una credencial BYOK registrada para verificar en este comercio.",
        "AI_BYOK_NOT_CONFIGURED",
      );
    }

    let plainKey: string;
    try {
      plainKey = this.crypto.decrypt(stored.apiKeyCiphertext);
    } catch {
      await this.repository.updateTenantProviderVerification({
        id: stored.id,
        status: "invalid",
        lastVerificationError: "AI_CRYPTO_AUTH_FAILED",
        actorEmail: params.actorEmail,
      });
      return err(
        "No fue posible descifrar la clave almacenada. Ingresa una nueva API Key.",
        "AI_KEY_INVALID",
      );
    }

    const verifyResult = await this.llmClient.verifyApiKey({
      providerCode: stored.providerCode,
      apiDialect: stored.apiDialect,
      baseUrl: stored.baseUrl,
      verifyPath: stored.verifyPath,
      apiKey: plainKey,
    });

    if (!verifyResult.ok) {
      await this.repository.updateTenantProviderVerification({
        id: stored.id,
        status: verifyResult.code === "AI_KEY_INVALID" ? "invalid" : undefined,
        lastVerificationError: verifyResult.code ?? verifyResult.error,
        actorEmail: params.actorEmail,
      });
      return err(verifyResult.error, verifyResult.code ?? "AI_UPSTREAM_ERROR");
    }

    const now = new Date();
    await this.repository.updateTenantProviderVerification({
      id: stored.id,
      status: "active",
      lastVerifiedAt: now,
      lastVerificationError: null,
      actorEmail: params.actorEmail,
    });

    await this.repository.writeAuditLog({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: "tenant_ai_byok_verified",
      entityType: "tenant_ai_providers",
      entityId: stored.id,
      clientId: params.clientId,
      metadata: {
        providerCode: stored.providerCode,
        apiKeyLast4: stored.apiKeyLast4,
        latencyMs: verifyResult.data.latencyMs,
      },
    });

    return ok({
      valid: true,
      providerCode: stored.providerCode,
      apiKeyLast4: stored.apiKeyLast4,
      latencyMs: verifyResult.data.latencyMs,
      verifiedAt: now.toISOString(),
    });
  }

  /**
   * Revoca mediante soft-delete la configuración BYOK del inquilino dejando rastro de auditoría.
   *
   * @param params - Datos del inquilino, actor y proveedor opcional a revocar.
   * @returns `Result` con cantidad de registros revocados.
   */
  async revokeSettings(params: {
    clientId: string;
    actorUserId?: string | null;
    actorRole: string;
    actorEmail: string;
    providerCode?: SupportedLlmProviderCode;
  }): Promise<Result<{ revokedCount: number }>> {
    const revokedCount = await this.repository.revokeTenantProviders({
      clientId: params.clientId,
      providerCode: params.providerCode,
      actorEmail: params.actorEmail,
    });

    await this.repository.writeAuditLog({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: "tenant_ai_byok_revoked",
      entityType: "tenant_ai_providers",
      entityId: params.providerCode ?? "all",
      clientId: params.clientId,
      metadata: {
        providerCode: params.providerCode ?? "all",
        revokedCount,
      },
    });

    appLogger.info("[TenantAiSettingsService] Credenciales BYOK revocadas", {
      clientId: params.clientId,
      providerCode: params.providerCode ?? "all",
      revokedCount,
    });

    return ok({ revokedCount });
  }
}

/**
 * Instancia singleton por defecto del servicio de configuración BYOK por inquilino.
 */
export const tenantAiSettingsService = new TenantAiSettingsService();
