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
}
