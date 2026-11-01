import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  IBotRepository,
  EffectiveBotSnapshot,
} from "../repositories/bot.repository.interface";
import type {
  AiProvider,
  AiModel,
  BotTone,
  BotPreset,
  ChatwootChannelType,
} from "../db/schemas/admin/bot-catalog";
import type {
  TenantBot,
  TenantAiProvider,
  TenantBotChannel,
  Wallet,
  WalletTransaction,
  AiUsageEvent,
} from "../db/schemas/admin/bot-tenancy";

/**
 * Entrada para crear o actualizar el bot de atención del inquilino (BOT-001 T-08).
 */
export interface UpsertTenantBotInput {
  clientId: string;
  name: string;
  objective: string;
  toneId: string;
  presetId?: string;
  providerId?: string;
  modelId?: string;
  persona?: string;
  instructions?: string;
  allowedTopics?: string;
  excludedTopics?: string;
  handoffTriggers?: string[];
  maxTurns?: number;
  greetingMessage?: string;
  fallbackMessage?: string;
  responseLanguage?: string;
  answerPolicy?: "solo_conocimiento" | "libre";
  maxMessagesPerContact?: number;
  actor: string;
}

/**
 * Entrada para registrar o rotar una clave de API BYOK de inquilino (BOT-001 T-11).
 */
export interface SaveByokKeyInput {
  clientId: string;
  providerId: string;
  plainApiKey: string;
  actor: string;
}

/**
 * Vista segura enmascarada de credencial BYOK para UI y respuestas de API.
 */
export interface MaskedTenantAiProvider {
  id: string;
  clientId: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  maskedApiKey: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Parámetros para la actualización administrativa de costos y spread de un modelo (BOT-001 T-04).
 */
export interface UpdateModelPricingInput {
  modelId: string;
  isActive?: boolean;
  spreadPercent?: number;
  costInputMtokUsdCents?: number;
  costOutputMtokUsdCents?: number;
  actorRole: string;
  actor: string;
}

/**
 * Vista consolidada de canales admisibles con viabilidad técnica para el inquilino (BOT-001 T-05).
 */
export interface AdmissibleChannelView {
  id: string;
  code: string;
  labels: { es: string; en: string };
  provisioning: "api" | "oauth" | string;
  notes?: { es: string; en: string };
  isConfigured: boolean;
  inboxId?: number | null;
  inboxName?: string | null;
  enabled: boolean;
}

/**
 * Parámetros para aprovisionar o asociar una instancia de canal desde Mocter (BOT-001 T-05).
 */
export interface ProvisionChannelInput {
  clientId: string;
  botId: string;
  channelTypeCode: string;
  inboxName: string;
  inboxId?: number;
  actor: string;
  actorRole: string;
}

/**
 * Resultado del aprovisionamiento o inicio del flujo OAuth mediado para un canal.
 */
export interface ProvisionChannelResult {
  action: "provisioned" | "oauth_flow_required";
  channel?: TenantBotChannel;
  oauthUrl?: string;
  message: string;
}

/**
 * Entrada para recargar saldo de inferencia en la billetera (BOT-001 T-13, RF-06).
 */
export interface RechargeWalletInput {
  clientId: string;
  gateway: "wompi" | "stripe";
  reference: string;
  currency: "COP" | "USD";
  amountLocalCents: number;
  fxRate?: string;
  actor: string;
}

/**
 * Resultado de la recarga idempotente de billetera.
 */
export interface RechargeWalletResult {
  transaction: WalletTransaction;
  newBalanceUsdCents: number;
  alreadyProcessed: boolean;
}

/**
 * Entrada para debitar o registrar consumo de tokens de inferencia (BOT-001 T-14, T-15).
 */
export interface ConsumeInferenceTokensInput {
  clientId: string;
  botId?: string;
  providerId: string;
  modelId: string;
  purpose: "bot" | "assist" | "trial";
  mode: "byok" | "mocter";
  inputTokens: number;
  outputTokens: number;
  reference?: string;
  actor: string;
}

/**
 * Resultado del débito atómico y registro de uso de inferencia.
 */
export interface ConsumeInferenceTokensResult {
  costUsdCents: number;
  mode: "byok" | "mocter";
  newBalanceUsdCents?: number;
  transactionId?: string;
  usageEventId: string;
}

/**
 * Resolución del modo de inferencia y fallback automático (BOT-001 T-15).
 */
export interface InferenceExecutionModeResult {
  mode: "mocter" | "byok" | "exhausted";
  canExecute: boolean;
  byokProvider?: TenantAiProvider;
  walletBalanceUsdCents: number;
  fallbackMessage?: string;
  shouldPauseMocter: boolean;
}

/**
 * Historial consolidado de movimientos financieros y consumos de billetera (BOT-001 T-15).
 */
export interface WalletHistoryResult {
  balanceUsdCents: number;
  transactions: WalletTransaction[];
  usageEvents: AiUsageEvent[];
}

/**
 * Servicio de dominio para la gobernanza, configuración y resolución de bots e IA (BOT-001).
 */
export class BotService {
  constructor(
    private readonly botRepo: IBotRepository,
    private readonly masterKey: Buffer = Buffer.alloc(32, 1),
    private readonly activeKeyId: string = "k-bot-v1",
  ) {}

  /**
   * Cifra una clave de API con AES-256-GCM y AAD `clientId:providerId:keyId` (BOT-001 §6, T-11).
   */
  private encryptApiKey(
    clientId: string,
    providerId: string,
    plainKey: string,
  ): {
    ciphertextHex: string;
    keyId: string;
    last4: string;
  } {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const aad = Buffer.from(`${clientId}:${providerId}:${this.activeKeyId}`, "utf8");
    cipher.setAAD(aad);

    const encrypted = Buffer.concat([
      cipher.update(plainKey, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, tag, encrypted]);
    const last4 = plainKey.slice(-4);

    return {
      ciphertextHex: payload.toString("hex"),
      keyId: this.activeKeyId,
      last4,
    };
  }

  /**
   * Descifra internamente una clave BYOK para el consumo del motor de inferencia (BOT-001 §6).
   */
  decryptApiKey(
    clientId: string,
    providerId: string,
    ciphertextHex: string,
    keyId: string,
  ): string {
    const payload = Buffer.from(ciphertextHex, "hex");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, iv);
    const aad = Buffer.from(`${clientId}:${providerId}:${keyId}`, "utf8");
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  /**
   * Lista los proveedores de IA activos en la plataforma.
   */
  async listProviders(): Promise<Result<AiProvider[]>> {
    const providers = await this.botRepo.listProviders();
    return ok(providers);
  }

  /**
   * Lista los modelos de IA soportados, opcionalmente filtrados por proveedor.
   */
  async listModels(providerId?: string): Promise<Result<AiModel[]>> {
    const models = await this.botRepo.listModels(providerId);
    return ok(models);
  }

  /**
   * Lista los tonos conversacionales gobernados.
   */
  async listTones(): Promise<Result<BotTone[]>> {
    const tones = await this.botRepo.listTones();
    return ok(tones);
  }

  /**
   * Lista los presets optimizados de modelo y temperatura.
   */
  async listPresets(): Promise<Result<BotPreset[]>> {
    const presets = await this.botRepo.listPresets();
    return ok(presets);
  }

  /**
   * Lista los tipos de canales admisibles gobernados por la plataforma.
   */
  async listChannelTypes(): Promise<Result<ChatwootChannelType[]>> {
    const channels = await this.botRepo.listChannelTypes();
    return ok(channels);
  }

  /**
   * Actualiza el estado de activación de un proveedor de IA en el catálogo global (BOT-001 T-04).
   * Restringido a platform_admin y platform_owner.
   */
  async updateProviderStatus(
    providerId: string,
    isActive: boolean,
    actorRole: string,
    actor: string,
  ): Promise<Result<AiProvider>> {
    if (actorRole !== "platform_admin" && actorRole !== "platform_owner") {
      return err(
        "Solo los roles platform_admin o platform_owner pueden modificar el catálogo de IA.",
        "PERMISSION_DENIED",
      );
    }

    const existing = await this.botRepo.findProviderById(providerId);
    if (!existing) {
      return err("El proveedor de IA especificado no existe.", "PROVIDER_NOT_FOUND");
    }

    const updated = await this.botRepo.updateProvider(providerId, {
      isActive,
      updatedBy: actor,
    });

    appLogger.info("[BotService] Estado de proveedor actualizado", {
      providerId,
      code: existing.code,
      isActive,
      actor,
    });

    return ok(updated!);
  }

  /**
   * Actualiza costos, spread porcentual y precios retail de un modelo de IA (BOT-001 T-04).
   * Restringido a platform_admin y platform_owner.
   */
  async updateModelPricingAndSpread(
    input: UpdateModelPricingInput,
  ): Promise<Result<AiModel>> {
    const { modelId, actorRole, actor } = input;

    if (actorRole !== "platform_admin" && actorRole !== "platform_owner") {
      return err(
        "Solo los roles platform_admin o platform_owner pueden modificar el catálogo de IA.",
        "PERMISSION_DENIED",
      );
    }

    const existing = await this.botRepo.findModelById(modelId);
    if (!existing) {
      return err("El modelo de IA especificado no existe.", "MODEL_NOT_FOUND");
    }

    const spreadPercent = input.spreadPercent ?? existing.spreadPercent;
    if (spreadPercent < 0) {
      return err("El spread porcentual no puede ser negativo.", "INVALID_SPREAD_PERCENT");
    }

    const costInput = input.costInputMtokUsdCents ?? existing.costInputMtokUsdCents;
    const costOutput = input.costOutputMtokUsdCents ?? existing.costOutputMtokUsdCents;

    const retailInput =
      costInput !== null && costInput !== undefined
        ? Math.round(costInput * (1 + spreadPercent / 100))
        : null;

    const retailOutput =
      costOutput !== null && costOutput !== undefined
        ? Math.round(costOutput * (1 + spreadPercent / 100))
        : null;

    const updated = await this.botRepo.updateModel(modelId, {
      isActive: input.isActive ?? existing.isActive,
      spreadPercent,
      costInputMtokUsdCents: costInput,
      costOutputMtokUsdCents: costOutput,
      retailInputMtokUsdCents: retailInput,
      retailOutputMtokUsdCents: retailOutput,
      updatedBy: actor,
    });

    appLogger.info("[BotService] Precios y spread de modelo de IA actualizados", {
      modelId,
      spreadPercent,
      retailInput,
      retailOutput,
      actor,
    });

    return ok(updated!);
  }

  /**
   * Registra o actualiza la configuración de bot del inquilino aplicando defaults (BOT-001 T-08).
   */
  async upsertTenantBot(input: UpsertTenantBotInput): Promise<Result<TenantBot>> {
    const {
      clientId,
      name,
      objective,
      toneId,
      presetId,
      providerId,
      modelId,
      actor,
    } = input;

    // 1. Validaciones básicas de campos obligatorios
    if (!name || name.trim().length === 0) {
      return err("El nombre del bot es obligatorio.", "BOT_NAME_REQUIRED");
    }
    if (!objective || objective.trim().length === 0) {
      return err("El objetivo del bot es obligatorio.", "BOT_OBJECTIVE_REQUIRED");
    }
    if (!toneId) {
      return err("El tono comunicacional es obligatorio.", "BOT_TONE_REQUIRED");
    }

    // 2. Validación de exclusividad de modelo: preset_id O (provider_id + model_id)
    const hasPreset = Boolean(presetId);
    const hasCustomModel = Boolean(providerId && modelId);

    if ((hasPreset && hasCustomModel) || (!hasPreset && !hasCustomModel)) {
      return err(
        "Debes seleccionar exactamente un preset optimizado O una combinación de proveedor y modelo.",
        "BOT_MODEL_SELECTION_EXCLUSIVE",
      );
    }

    // 3. Obtener defaults de plataforma para poblar campos no provistos (RF-03.3)
    let defaults;
    try {
      defaults = await this.botRepo.getBotDefaults();
    } catch {
      // Fallback si no está inicializada la tabla en entorno local
      defaults = {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor", "humano", "reclamo", "queja"],
        defaultMaxMessagesPerContact: 50,
      };
    }

    const savedBot = await this.botRepo.upsertTenantBot(clientId, {
      name: name.trim(),
      objective: objective.trim(),
      toneId,
      presetId: presetId ?? null,
      providerId: providerId ?? null,
      modelId: modelId ?? null,
      persona: input.persona?.trim() || null,
      instructions: input.instructions?.trim() || null,
      allowedTopics: input.allowedTopics?.trim() || null,
      excludedTopics: input.excludedTopics?.trim() || null,
      handoffTriggers: input.handoffTriggers ?? defaults.defaultHandoffTriggers,
      maxTurns: input.maxTurns ?? defaults.defaultMaxTurns,
      greetingMessage: input.greetingMessage?.trim() || null,
      fallbackMessage: input.fallbackMessage?.trim() || null,
      responseLanguage: input.responseLanguage ?? "es",
      answerPolicy: input.answerPolicy ?? (defaults.defaultAnswerPolicy as "solo_conocimiento" | "libre"),
      maxMessagesPerContact: input.maxMessagesPerContact ?? defaults.defaultMaxMessagesPerContact,
      status: "draft",
      createdBy: actor,
      updatedBy: actor,
    });

    appLogger.info("[BotService] Configuración de bot actualizada", {
      clientId,
      botId: savedBot.id,
      revision: savedBot.revision,
    });

    return ok(savedBot);
  }

  /**
   * Actualiza el estado operativo del bot ('draft', 'active', 'paused').
   */
  async updateBotStatus(
    clientId: string,
    botId: string,
    status: "draft" | "active" | "paused",
  ): Promise<Result<TenantBot>> {
    try {
      const updated = await this.botRepo.updateTenantBotStatus(clientId, botId, status);
      appLogger.info("[BotService] Estado del bot actualizado", { clientId, botId, status });
      return ok(updated);
    } catch {
      return err(`No fue posible actualizar el estado del bot ${botId}.`, "BOT_UPDATE_FAILED");
    }
  }

  /**
   * Guarda o rota una clave de API BYOK de inquilino de forma cifrada (BOT-001 T-11).
   */
  async saveByokKey(input: SaveByokKeyInput): Promise<Result<MaskedTenantAiProvider>> {
    const { clientId, providerId, plainApiKey, actor } = input;

    if (!plainApiKey || plainApiKey.trim().length < 8) {
      return err(
        "La clave de API suministrada es inválida o demasiado corta.",
        "BYOK_KEY_INVALID",
      );
    }

    const provider = await this.botRepo.findProviderById(providerId);
    if (!provider) {
      return err("El proveedor de IA especificado no existe.", "PROVIDER_NOT_FOUND");
    }

    const { ciphertextHex, keyId, last4 } = this.encryptApiKey(
      clientId,
      providerId,
      plainApiKey.trim(),
    );

    const saved = await this.botRepo.saveTenantAiProvider({
      clientId,
      providerId,
      apiKeyCiphertext: ciphertextHex,
      apiKeyKeyId: keyId,
      apiKeyLast4: last4,
      status: "active",
      createdBy: actor,
      updatedBy: actor,
    });

    appLogger.info("[BotService] Clave BYOK registrada exitosamente", {
      clientId,
      providerId,
      providerCode: provider.code,
      last4,
    });

    return ok({
      id: saved.id,
      clientId: saved.clientId,
      providerId: saved.providerId,
      providerCode: provider.code,
      providerName: provider.name,
      maskedApiKey: `••••${saved.apiKeyLast4}`,
      status: saved.status,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    });
  }

  /**
   * Lista las credenciales BYOK del inquilino con la clave enmascarada.
   */
  async listTenantByokKeys(clientId: string): Promise<Result<MaskedTenantAiProvider[]>> {
    const records = await this.botRepo.listTenantAiProviders(clientId);
    const providers = await this.botRepo.listProviders();
    const providersMap = new Map(providers.map((p) => [p.id, p]));

    const result: MaskedTenantAiProvider[] = records.map((rec) => {
      const p = providersMap.get(rec.providerId);
      return {
        id: rec.id,
        clientId: rec.clientId,
        providerId: rec.providerId,
        providerCode: p?.code ?? "unknown",
        providerName: p?.name ?? "Desconocido",
        maskedApiKey: `••••${rec.apiKeyLast4}`,
        status: rec.status,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      };
    });

    return ok(result);
  }

  /**
   * Resuelve el snapshot efectivo con defaults listos para el consumo de BOT-002 (RF-02.4).
   */
  async getEffectiveBotSnapshot(clientId: string): Promise<Result<EffectiveBotSnapshot>> {
    const bot = await this.botRepo.findTenantBot(clientId);
    if (!bot) {
      return err("El inquilino no tiene configurado un bot de atención.", "BOT_NOT_FOUND");
    }

    let resolvedModel: AiModel | null = null;
    let resolvedProvider: AiProvider | null = null;
    let resolvedPreset: BotPreset | null = null;
    let resolvedTemperature = "0.7";
    let resolvedMaxTokens = 1000;

    if (bot.presetId) {
      resolvedPreset = await this.botRepo.findPresetById(bot.presetId);
      if (!resolvedPreset) {
        return err("El preset asociado al bot no existe.", "PRESET_NOT_FOUND");
      }
      resolvedModel = await this.botRepo.findModelById(resolvedPreset.modelId);
      if (!resolvedModel) {
        return err("El modelo del preset no existe.", "MODEL_NOT_FOUND");
      }
      resolvedProvider = await this.botRepo.findProviderById(resolvedModel.providerId);
      resolvedTemperature = resolvedPreset.temperature;
      resolvedMaxTokens = resolvedPreset.maxTokens;
    } else if (bot.providerId && bot.modelId) {
      resolvedProvider = await this.botRepo.findProviderById(bot.providerId);
      resolvedModel = await this.botRepo.findModelById(bot.modelId);
      if (!resolvedModel || !resolvedProvider) {
        return err("El modelo o proveedor configurado no existe.", "MODEL_OR_PROVIDER_NOT_FOUND");
      }
      resolvedTemperature = resolvedModel.defaultTemperature;
      resolvedMaxTokens = resolvedModel.defaultMaxTokens;
    }

    if (!resolvedModel || !resolvedProvider) {
      return err("No fue posible resolver el modelo o proveedor del bot.", "BOT_RESOLUTION_FAILED");
    }

    const tone = await this.botRepo.findToneById(bot.toneId);
    if (!tone) {
      return err("El tono asociado al bot no existe.", "TONE_NOT_FOUND");
    }

    const channels = await this.botRepo.listTenantBotChannels(bot.id);

    return ok({
      bot,
      provider: resolvedProvider,
      model: resolvedModel,
      tone,
      preset: resolvedPreset,
      resolvedTemperature,
      resolvedMaxTokens,
      channels,
    });
  }

  /**
   * Habilita o deshabilita un canal para el bot de atención.
   */
  async setBotChannelEnabled(
    botId: string,
    channelTypeId: string,
    inboxId?: number,
    inboxName?: string,
    enabled: boolean = true,
    greetingOverride?: string,
    actor: string = "tenant_owner",
  ): Promise<Result<TenantBotChannel>> {
    const channel = await this.botRepo.upsertTenantBotChannel({
      botId,
      channelTypeId,
      inboxId: inboxId ?? null,
      inboxName: inboxName ?? null,
      enabled,
      greetingOverride: greetingOverride ?? null,
      createdBy: actor,
      updatedBy: actor,
    });

    return ok(channel);
  }

  /**
   * Lista los canales admisibles de la plataforma y su estado de configuración para el inquilino (BOT-001 T-05).
   * Un canal no admisible no se ofrece en el listado.
   */
  async listAdmissibleChannelsForTenant(
    botId?: string,
  ): Promise<Result<AdmissibleChannelView[]>> {
    try {
      const channelTypes = await this.botRepo.listChannelTypes();
      const admissibleTypes = channelTypes.filter((c) => c.isAdmissible);

      let tenantChannels: TenantBotChannel[] = [];
      if (botId) {
        tenantChannels = await this.botRepo.listTenantBotChannels(botId);
      }
      const channelMap = new Map(tenantChannels.map((tc) => [tc.channelTypeId, tc]));

      const views: AdmissibleChannelView[] = admissibleTypes.map((ct) => {
        const configured = channelMap.get(ct.id);
        return {
          id: ct.id,
          code: ct.code,
          labels: ct.labels,
          provisioning: ct.provisioning,
          notes: ct.notes ?? undefined,
          isConfigured: Boolean(configured),
          inboxId: configured?.inboxId,
          inboxName: configured?.inboxName,
          enabled: configured?.enabled ?? false,
        };
      });

      return ok(views);
    } catch (error: any) {
      appLogger.error("[BotService] Error al listar canales admisibles", { botId, error });
      return err(error.message ?? "Error interno al listar canales", "DB_ERROR");
    }
  }

  /**
   * Gestiona el aprovisionamiento de una instancia de canal o dispara el flujo OAuth mediado (BOT-001 T-05).
   * Restringido a tenant_owner o administración de plataforma.
   */
  async provisionChannelIntegration(
    input: ProvisionChannelInput,
  ): Promise<Result<ProvisionChannelResult>> {
    const { clientId, botId, channelTypeCode, inboxName, actorRole, actor } = input;

    if (
      actorRole !== "tenant_owner" &&
      actorRole !== "platform_owner" &&
      actorRole !== "platform_admin"
    ) {
      return err(
        "Solo los roles tenant_owner o administración de plataforma pueden aprovisionar canales.",
        "PERMISSION_DENIED",
      );
    }

    const channelType = await this.botRepo.findChannelTypeByCode(channelTypeCode);
    if (!channelType || !channelType.isAdmissible) {
      return err(
        `El canal '${channelTypeCode}' no es admisible o no está soportado por la plataforma.`,
        "CHANNEL_NOT_ADMISSIBLE",
      );
    }

    // 1. Canales con aprovisionamiento directo por API (ej. website o api)
    if (channelType.provisioning === "api") {
      const allocatedInboxId = input.inboxId ?? Math.floor(1000 + Math.random() * 9000);

      const channel = await this.botRepo.upsertTenantBotChannel({
        botId,
        channelTypeId: channelType.id,
        inboxId: allocatedInboxId,
        inboxName: inboxName.trim() || channelType.labels.es,
        enabled: true,
        greetingOverride: null,
        createdBy: actor,
        updatedBy: actor,
      });

      appLogger.info("[BotService] Canal API aprovisionado exitosamente", {
        clientId,
        botId,
        channelTypeCode,
        inboxId: allocatedInboxId,
      });

      return ok({
        action: "provisioned",
        channel,
        message: `Canal ${channelType.labels.es} aprovisionado correctamente con inbox #${allocatedInboxId}.`,
      });
    }

    // 2. Canales con flujo OAuth mediado por Chatwoot (ej. whatsapp_cloud, facebook, instagram)
    const oauthUrl = `/api/auth/chatwoot/channels/${channelType.code}/start?botId=${encodeURIComponent(botId)}&clientId=${encodeURIComponent(clientId)}`;

    appLogger.info("[BotService] Flujo OAuth mediado por Chatwoot requerido para el canal", {
      clientId,
      botId,
      channelTypeCode,
      oauthUrl,
    });

    return ok({
      action: "oauth_flow_required",
      oauthUrl,
      message: `El canal ${channelType.labels.es} requiere vincularse mediante el flujo seguro mediado por Chatwoot.`,
    });
  }

  /**
   * Desactiva una integración de canal existente para el bot (BOT-001 T-05).
   */
  async deactivateChannelIntegration(
    botId: string,
    channelTypeId: string,
    actorRole: string,
    actor: string,
  ): Promise<Result<TenantBotChannel>> {
    if (
      actorRole !== "tenant_owner" &&
      actorRole !== "platform_owner" &&
      actorRole !== "platform_admin"
    ) {
      return err(
        "Solo los roles tenant_owner o administración de plataforma pueden desactivar canales.",
        "PERMISSION_DENIED",
      );
    }

    const existingChannels = await this.botRepo.listTenantBotChannels(botId);
    const existing = existingChannels.find((c) => c.channelTypeId === channelTypeId);
    if (!existing) {
      return err("La integración de canal no fue encontrada en el bot.", "CHANNEL_NOT_FOUND");
    }

    const updated = await this.botRepo.upsertTenantBotChannel({
      botId,
      channelTypeId,
      inboxId: existing.inboxId,
      inboxName: existing.inboxName,
      enabled: false,
      greetingOverride: existing.greetingOverride,
      createdBy: existing.createdBy,
      updatedBy: actor,
    });

    appLogger.info("[BotService] Canal de bot desactivado", { botId, channelTypeId, actor });
    return ok(updated);
  }

  /**
   * Recarga de saldo en billetera de forma idempotente con soporte de COP y USD (BOT-001 T-13, RF-06.1, RF-06.2).
   */
  async rechargeWallet(
    input: RechargeWalletInput,
  ): Promise<Result<RechargeWalletResult>> {
    // 1. Verificación de idempotencia previa por referencia de pasarela
    const existing = await this.botRepo.findWalletTransactionByReference(
      input.clientId,
      input.reference,
    );
    if (existing) {
      appLogger.info("[BotService] Recarga de billetera ya procesada previamente (idempotente)", {
        clientId: input.clientId,
        gateway: input.gateway,
        reference: input.reference,
        transactionId: existing.id,
      });

      return ok({
        transaction: existing,
        newBalanceUsdCents: existing.balanceAfterUsdCents,
        alreadyProcessed: true,
      });
    }

    // 2. Conversión financiera a centavos de USD (RF-06.1)
    let amountUsdCents: number;
    let effectiveFx = input.fxRate;

    if (input.currency === "USD") {
      amountUsdCents = Math.round(input.amountLocalCents);
      effectiveFx = effectiveFx ?? "1.00";
    } else {
      effectiveFx = effectiveFx ?? "4200.00";
      const rate = parseFloat(effectiveFx);
      if (isNaN(rate) || rate <= 0) {
        return err(
          "La tasa de cambio (fxRate) suministrada no es válida.",
          "INVALID_FX_RATE",
        );
      }
      amountUsdCents = Math.round(input.amountLocalCents / rate);
    }

    if (amountUsdCents <= 0) {
      return err(
        "El monto neto a acreditar en la billetera en centavos de USD debe ser superior a cero.",
        "INVALID_RECHARGE_AMOUNT",
      );
    }

    // 3. Ejecutar transacción atómica de recarga y ledger
    const result = await this.botRepo.executeRechargeTransaction({
      clientId: input.clientId,
      amountUsdCents,
      currency: input.currency,
      amountLocalCents: input.amountLocalCents,
      fxRate: effectiveFx,
      reference: input.reference,
      actor: input.actor,
    });

    appLogger.info("[BotService] Recarga acreditada exitosamente en billetera", {
      clientId: input.clientId,
      reference: input.reference,
      amountUsdCents,
      newBalanceUsdCents: result.wallet.balanceUsdCents,
    });

    return ok({
      transaction: result.transaction,
      newBalanceUsdCents: result.wallet.balanceUsdCents,
      alreadyProcessed: false,
    });
  }

  /**
   * Débito atómico por consumo de tokens y registro append-only en el ledger (BOT-001 T-14, RF-06.3, RF-06.4).
   */
  async consumeInferenceTokens(
    input: ConsumeInferenceTokensInput,
  ): Promise<Result<ConsumeInferenceTokensResult>> {
    // Modo BYOK: no debita saldo, costo 0 (RF-06.6)
    if (input.mode === "byok") {
      const usage = await this.botRepo.recordUsageEvent({
        clientId: input.clientId,
        botId: input.botId ?? null,
        providerId: input.providerId,
        modelId: input.modelId,
        mode: "byok",
        purpose: input.purpose,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsdCents: 0,
        walletTransactionId: null,
      });

      return ok({
        costUsdCents: 0,
        mode: "byok",
        usageEventId: usage.id,
      });
    }

    // Modo Mocter: tarifación dinámica con spread y prepago estricto
    const model = await this.botRepo.findModelById(input.modelId);
    if (!model) {
      return err("El modelo de lenguaje especificado no existe en el catálogo.", "MODEL_NOT_FOUND");
    }

    const spread = model.spreadPercent ?? 30;
    const retailInputMtok =
      model.retailInputMtokUsdCents ??
      (model.costInputMtokUsdCents
        ? Math.round(model.costInputMtokUsdCents * (1 + spread / 100))
        : 150);
    const retailOutputMtok =
      model.retailOutputMtokUsdCents ??
      (model.costOutputMtokUsdCents
        ? Math.round(model.costOutputMtokUsdCents * (1 + spread / 100))
        : 600);

    const inputCost = Math.round((input.inputTokens * retailInputMtok) / 1_000_000);
    const outputCost = Math.round((input.outputTokens * retailOutputMtok) / 1_000_000);
    const costUsdCents = inputCost + outputCost;

    // Verificar prepago estricto antes de intentar debitar
    const wallet = await this.botRepo.getWallet(input.clientId);
    if (!wallet || wallet.balanceUsdCents < costUsdCents) {
      return err(
        "Saldo insuficiente en la billetera prepago para cubrir la inferencia.",
        "INSUFFICIENT_FUNDS",
      );
    }

    const reference = input.reference ?? `use_${randomBytes(12).toString("hex")}`;

    try {
      const res = await this.botRepo.executeConsumptionTransaction({
        clientId: input.clientId,
        botId: input.botId,
        providerId: input.providerId,
        modelId: input.modelId,
        purpose: input.purpose,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsdCents,
        reference,
        actor: input.actor,
      });

      return ok({
        costUsdCents,
        mode: "mocter",
        newBalanceUsdCents: res.wallet.balanceUsdCents,
        transactionId: res.transaction.id,
        usageEventId: res.usageEvent.id,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
        return err(
          "Saldo insuficiente en la billetera prepago para cubrir la inferencia.",
          "INSUFFICIENT_FUNDS",
        );
      }
      throw e;
    }
  }

  /**
   * Resuelve el modo de ejecución de inferencia con política de fallback automático (BOT-001 T-15, RF-06.4).
   */
  async resolveInferenceExecutionMode(
    clientId: string,
    botId?: string,
  ): Promise<Result<InferenceExecutionModeResult>> {
    const wallet = await this.botRepo.getWallet(clientId);
    const balance = wallet ? wallet.balanceUsdCents : 0;

    // 1. Saldo prepago disponible en modo Mocter
    if (balance > 0) {
      return ok({
        mode: "mocter",
        canExecute: true,
        walletBalanceUsdCents: balance,
        shouldPauseMocter: false,
      });
    }

    // 2. Sin saldo: comprobar si tiene proveedor BYOK activo (fallback automático)
    const byokProviders = await this.botRepo.listTenantAiProviders(clientId);
    const activeByok = byokProviders.find(
      (p) => p.status === "active" && !p.deletedAt,
    );

    if (activeByok) {
      return ok({
        mode: "byok",
        canExecute: true,
        byokProvider: activeByok,
        walletBalanceUsdCents: balance,
        shouldPauseMocter: false,
      });
    }

    // 3. Sin saldo y sin proveedor BYOK: suspender y emitir mensaje de fallback
    let fallbackMsg =
      "El asistente de atención automática se encuentra temporalmente inactivo por saldo insuficiente.";
    const bot = await this.botRepo.findTenantBot(clientId);
    if (bot?.fallbackMessage) {
      fallbackMsg = bot.fallbackMessage;
    }

    return ok({
      mode: "exhausted",
      canExecute: false,
      walletBalanceUsdCents: balance,
      fallbackMessage: fallbackMsg,
      shouldPauseMocter: true,
    });
  }

  /**
   * Retorna el historial consolidado de movimientos financieros y consumos de billetera (BOT-001 T-15, RF-06.5).
   */
  async listWalletHistory(
    clientId: string,
    limit: number = 50,
  ): Promise<Result<WalletHistoryResult>> {
    const wallet = await this.botRepo.getWallet(clientId);
    const transactions = await this.botRepo.listWalletTransactions(clientId, limit);
    const usageEvents = await this.botRepo.listUsageEvents(clientId, limit);

    return ok({
      balanceUsdCents: wallet ? wallet.balanceUsdCents : 0,
      transactions,
      usageEvents,
    });
  }
}
