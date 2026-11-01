import { describe, expect, it, vi, beforeEach } from "vitest";
import { BotService, type UpsertTenantBotInput } from "./bot.service";
import type {
  IBotRepository,
} from "../repositories/bot.repository.interface";
import type {
  AiProvider,
  AiModel,
  BotTone,
  BotPreset,
  BotDefault,
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
import type {
  BotFollowup,
  BotFollowupStep,
  BotFollowupRun,
} from "../db/schemas/admin/bot-followups";

describe("BOT-001 · BotService (Gobernanza, alta mínima, BYOK y snapshot)", () => {
  let mockBotRepo: IBotRepository;
  let botService: BotService;

  const sampleProvider: AiProvider = {
    id: "01930000-0000-7000-8000-000000000001",
    code: "openai",
    name: "OpenAI",
    isActive: true,
    docsUrl: "https://platform.openai.com",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const sampleModel: AiModel = {
    id: "01930000-0000-7000-8000-000000000002",
    providerId: sampleProvider.id,
    modelId: "gpt-4o",
    displayName: "GPT-4o Omnicanal",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    capabilities: { tools: true, vision: true, json: true },
    recommendedUse: {
      es: "Ideal para atención comercial fluida",
      en: "Best for fluid sales conversations",
    },
    defaultTemperature: "0.7",
    defaultMaxTokens: 1000,
    isActive: true,
    sortOrder: 1,
    spreadPercent: 30,
    costInputMtokUsdCents: 250,
    costOutputMtokUsdCents: 1000,
    retailInputMtokUsdCents: 325,
    retailOutputMtokUsdCents: 1300,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const sampleTone: BotTone = {
    id: "01930000-0000-7000-8000-000000000003",
    code: "cercano",
    labels: { es: "Cercano y empático", en: "Warm & empathetic" },
    description: {
      es: "Lenguaje cálido y accesible",
      en: "Warm and approachable language",
    },
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const samplePreset: BotPreset = {
    id: "01930000-0000-7000-8000-000000000004",
    code: "natural_rhythm",
    labels: { es: "Ritmo natural", en: "Natural rhythm" },
    modelId: sampleModel.id,
    temperature: "0.8",
    maxTokens: 1200,
    recommendedFor: {
      es: "Conversaciones comerciales persuasivas",
      en: "Persuasive sales conversations",
    },
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const sampleDefaults: BotDefault = {
    id: "01930000-0000-7000-8000-000000000005",
    defaultMaxTurns: 10,
    defaultAnswerPolicy: "solo_conocimiento",
    defaultHandoffTriggers: ["asesor", "humano", "reclamo", "queja"],
    defaultResponseLanguageBehavior: "match_contact",
    greetingMessageKey: "bot.default_greeting",
    fallbackMessageKey: "bot.default_fallback",
    defaultMaxMessagesPerContact: 50,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const sampleChannelType: ChatwootChannelType = {
    id: "01930000-0000-7000-8000-000000000006",
    code: "website",
    labels: { es: "Widget Web", en: "Website Widget" },
    provisioning: "api",
    notes: { es: "Nativo por API", en: "Native via API" },
    isAdmissible: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const sampleTenantBot: TenantBot = {
    id: "01930000-0000-7000-8000-000000000010",
    clientId: "01930000-0000-7000-8000-000000000099",
    name: "Asistente Mocter",
    objective: "Asesorar a clientes y capturar pedidos",
    toneId: sampleTone.id,
    presetId: samplePreset.id,
    providerId: null,
    modelId: null,
    status: "draft",
    revision: 1,
    persona: "Experto en ventas consultivas",
    instructions: "Siempre responder con amabilidad",
    allowedTopics: "Productos, precios y envíos",
    excludedTopics: "Temas políticos o personales",
    handoffTriggers: ["asesor", "humano"],
    maxTurns: 10,
    greetingMessage: "¡Hola! ¿En qué puedo ayudarte hoy?",
    fallbackMessage: "Un momento, te comunico con un asesor.",
    responseLanguage: "es",
    answerPolicy: "solo_conocimiento",
    maxMessagesPerContact: 50,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "tenant_owner",
    updatedBy: "tenant_owner",
  };

  const sampleByokProvider: TenantAiProvider = {
    id: "01930000-0000-7000-8000-000000000020",
    clientId: sampleTenantBot.clientId,
    providerId: sampleProvider.id,
    apiKeyCiphertext: "0123456789abcdef",
    apiKeyKeyId: "k-bot-v1",
    apiKeyLast4: "9876",
    status: "active",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "tenant_owner",
    updatedBy: "tenant_owner",
  };

  const sampleBotChannel: TenantBotChannel = {
    id: "01930000-0000-7000-8000-000000000030",
    botId: sampleTenantBot.id,
    channelTypeId: sampleChannelType.id,
    inboxId: 45,
    inboxName: "Canal Web Principal",
    enabled: true,
    greetingOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "tenant_owner",
    updatedBy: "tenant_owner",
  };

  beforeEach(() => {
    mockBotRepo = {
      listProviders: vi.fn().mockResolvedValue([sampleProvider]),
      findProviderById: vi.fn().mockResolvedValue(sampleProvider),
      findProviderByCode: vi.fn().mockResolvedValue(sampleProvider),
      updateProvider: vi.fn().mockImplementation(async (id, patch) => ({ ...sampleProvider, ...patch })),
      listModels: vi.fn().mockResolvedValue([sampleModel]),
      findModelById: vi.fn().mockResolvedValue(sampleModel),
      updateModel: vi.fn().mockImplementation(async (id, patch) => ({ ...sampleModel, ...patch })),
      listTones: vi.fn().mockResolvedValue([sampleTone]),
      findToneById: vi.fn().mockResolvedValue(sampleTone),
      listPresets: vi.fn().mockResolvedValue([samplePreset]),
      findPresetById: vi.fn().mockResolvedValue(samplePreset),
      getBotDefaults: vi.fn().mockResolvedValue(sampleDefaults),
      listChannelTypes: vi.fn().mockResolvedValue([sampleChannelType]),
      findChannelTypeByCode: vi.fn().mockImplementation(async (code) =>
        code === sampleChannelType.code ? sampleChannelType : null,
      ),
      findChannelTypeById: vi.fn().mockImplementation(async (id) =>
        id === sampleChannelType.id ? sampleChannelType : null,
      ),
      findTenantBot: vi.fn().mockResolvedValue(sampleTenantBot),
      upsertTenantBot: vi.fn().mockResolvedValue(sampleTenantBot),
      updateTenantBotStatus: vi.fn().mockResolvedValue({
        ...sampleTenantBot,
        status: "active",
      }),
      findTenantAiProvider: vi.fn().mockResolvedValue(sampleByokProvider),
      listTenantAiProviders: vi.fn().mockResolvedValue([sampleByokProvider]),
      saveTenantAiProvider: vi.fn().mockImplementation(async (data) => ({
        ...sampleByokProvider,
        ...data,
      })),
      disableTenantAiProvider: vi.fn().mockResolvedValue(undefined),
      listTenantBotChannels: vi.fn().mockResolvedValue([sampleBotChannel]),
      upsertTenantBotChannel: vi.fn().mockImplementation(async (ch) => ({ ...sampleBotChannel, ...ch })),
      getWallet: vi.fn().mockResolvedValue(null),
      findWalletTransactionByReference: vi.fn().mockResolvedValue(null),
      listWalletTransactions: vi.fn().mockResolvedValue([]),
      listUsageEvents: vi.fn().mockResolvedValue([]),
      executeRechargeTransaction: vi.fn().mockImplementation(async (params) => {
        const currentBal = 0;
        const newBal = currentBal + params.amountUsdCents;
        return {
          wallet: {
            clientId: params.clientId,
            balanceUsdCents: newBal,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: params.actor,
            updatedBy: params.actor,
          },
          transaction: {
            id: "tx-rec-001",
            clientId: params.clientId,
            type: "recharge",
            amountUsdCents: params.amountUsdCents,
            currency: params.currency,
            amountLocalCents: params.amountLocalCents ?? null,
            fxRate: params.fxRate ?? null,
            inputTokens: null,
            outputTokens: null,
            balanceAfterUsdCents: newBal,
            reference: params.reference,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: params.actor,
            updatedBy: params.actor,
          },
        };
      }),
      executeConsumptionTransaction: vi.fn().mockImplementation(async (params) => {
        const newBal = 1000 - params.costUsdCents;
        return {
          wallet: {
            clientId: params.clientId,
            balanceUsdCents: newBal,
            version: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: params.actor,
            updatedBy: params.actor,
          },
          transaction: {
            id: "tx-cons-001",
            clientId: params.clientId,
            type: "consumption",
            amountUsdCents: -params.costUsdCents,
            currency: "USD",
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            balanceAfterUsdCents: newBal,
            reference: params.reference,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: params.actor,
            updatedBy: params.actor,
          },
          usageEvent: {
            id: "ev-use-001",
            clientId: params.clientId,
            botId: params.botId ?? null,
            providerId: params.providerId,
            modelId: params.modelId,
            mode: "mocter",
            purpose: params.purpose,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            costUsdCents: params.costUsdCents,
            walletTransactionId: "tx-cons-001",
            createdAt: new Date(),
          },
        };
      }),
      recordUsageEvent: vi.fn().mockImplementation(async (ev) => ({
        id: "ev-rec-001",
        createdAt: new Date(),
        ...ev,
      })),
      recordAuditLog: vi.fn().mockImplementation(async (entry) => ({
        id: "audit-01",
        createdAt: new Date(),
        ...entry,
      })),
      getPlatformAiRevenueMetrics: vi.fn().mockResolvedValue({
        totalRechargedUsdCents: 15000,
        totalCostUsdCents: 4500,
        totalTokensConsumed: 1200000,
        tokensByPurpose: {
          bot: 900000,
          assist: 300000,
          trial: 0,
        },
        eventsCount: 42,
      }),
      createFollowupSequence: vi.fn().mockImplementation(async (params) => {
        const followup: BotFollowup = {
          id: "fol-01",
          clientId: params.clientId,
          botId: params.botId ?? null,
          name: params.name,
          origin: params.origin ?? "tenant_custom",
          triggerInactivityMinutes: params.triggerInactivityMinutes,
          status: "draft",
          revision: 1,
          deletedAt: null,
          deletedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: params.actor,
          updatedBy: params.actor,
        };
        const steps: BotFollowupStep[] = params.steps.map((s: any, idx: number) => ({
          id: `step-${idx + 1}`,
          followupId: "fol-01",
          position: s.position,
          delayMinutes: s.delayMinutes,
          message: s.message,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: params.actor,
          updatedBy: params.actor,
        }));
        return { followup, steps };
      }),
      listFollowups: vi.fn().mockResolvedValue([]),
      findFollowupById: vi.fn().mockImplementation(async (id) => ({
        id,
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        name: "Secuencia Activa",
        origin: "tenant_custom",
        triggerInactivityMinutes: 60,
        status: "active",
        revision: 1,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner",
        updatedBy: "owner",
        steps: [
          {
            id: "step-1",
            followupId: id,
            position: 1,
            delayMinutes: 0,
            message: "Paso 1",
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "owner",
            updatedBy: "owner",
          },
        ],
      })),
      updateFollowupStatus: vi.fn().mockImplementation(async (id, status, actor) => ({
        id,
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        name: "Secuencia Activa",
        origin: "tenant_custom",
        triggerInactivityMinutes: 60,
        status,
        revision: 1,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: actor,
        updatedBy: actor,
      })),
      findActiveFollowupRun: vi.fn().mockResolvedValue(null),
      createFollowupRun: vi.fn().mockImplementation(async (run) => ({
        id: "run-01",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...run,
      })),
      updateFollowupRun: vi.fn().mockImplementation(async (id, patch) => ({
        id,
        clientId: sampleTenantBot.clientId,
        followupId: "fol-01",
        prospectContactId: "prospect-01",
        chatwootConversationId: 100,
        currentStep: 1,
        nextSendAt: new Date(),
        status: "running",
        stopReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
        ...patch,
      })),
      stopFollowupRunsForProspect: vi.fn().mockResolvedValue(1),
    };

    botService = new BotService(mockBotRepo);
  });

  describe("T-08 · Alta mínima del bot y herencia de defaults", () => {
    it("crea un bot con los 5 campos mínimos y hereda defaults de plataforma", async () => {
      const input: UpsertTenantBotInput = {
        clientId: sampleTenantBot.clientId,
        name: "Bot Rápido",
        objective: "Capturar leads",
        toneId: sampleTone.id,
        presetId: samplePreset.id,
        actor: "tenant_owner",
      };

      const res = await botService.upsertTenantBot(input);

      expect(res.ok).toBe(true);
      expect(mockBotRepo.upsertTenantBot).toHaveBeenCalledWith(
        sampleTenantBot.clientId,
        expect.objectContaining({
          name: "Bot Rápido",
          objective: "Capturar leads",
          toneId: sampleTone.id,
          presetId: samplePreset.id,
          maxTurns: sampleDefaults.defaultMaxTurns,
          answerPolicy: sampleDefaults.defaultAnswerPolicy,
          handoffTriggers: sampleDefaults.defaultHandoffTriggers,
          maxMessagesPerContact: sampleDefaults.defaultMaxMessagesPerContact,
        }),
      );
    });

    it("rechaza el alta si se provee preset_id y modelo custom a la vez (exclusividad)", async () => {
      const ambiguousInput: UpsertTenantBotInput = {
        clientId: sampleTenantBot.clientId,
        name: "Bot Ambiguo",
        objective: "Vender",
        toneId: sampleTone.id,
        presetId: samplePreset.id,
        providerId: sampleProvider.id,
        modelId: sampleModel.id,
        actor: "tenant_owner",
      };

      const res = await botService.upsertTenantBot(ambiguousInput);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("BOT_MODEL_SELECTION_EXCLUSIVE");
      }
      expect(mockBotRepo.upsertTenantBot).not.toHaveBeenCalled();
    });

    it("rechaza el alta si falta nombre u objetivo", async () => {
      const invalidInput: UpsertTenantBotInput = {
        clientId: sampleTenantBot.clientId,
        name: "",
        objective: "Vender",
        toneId: sampleTone.id,
        presetId: samplePreset.id,
        actor: "tenant_owner",
      };

      const res = await botService.upsertTenantBot(invalidInput);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("BOT_NAME_REQUIRED");
      }
      expect(mockBotRepo.upsertTenantBot).not.toHaveBeenCalled();
    });
  });

  describe("T-11 · Cifrado de claves BYOK (AES-256-GCM con AAD)", () => {
    it("cifra la clave con AES-256-GCM y retorna únicamente la máscara last4", async () => {
      const plainApiKey = "sk-proj-supersecretkey123456789";

      const res = await botService.saveByokKey({
        clientId: sampleTenantBot.clientId,
        providerId: sampleProvider.id,
        plainApiKey,
        actor: "tenant_owner",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.maskedApiKey).toBe("••••6789");
        expect(res.data.providerCode).toBe("openai");
      }

      expect(mockBotRepo.saveTenantAiProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: sampleTenantBot.clientId,
          providerId: sampleProvider.id,
          apiKeyLast4: "6789",
          apiKeyCiphertext: expect.any(String),
          apiKeyKeyId: "k-bot-v1",
        }),
      );
    });

    it("descifra exactamente la clave original internamente mediante decryptApiKey", async () => {
      const plainApiKey = "sk-ant-api03-live-test-key-54321";

      const saveRes = await botService.saveByokKey({
        clientId: sampleTenantBot.clientId,
        providerId: sampleProvider.id,
        plainApiKey,
        actor: "tenant_owner",
      });

      expect(saveRes.ok).toBe(true);

      const capturedCall = vi.mocked(mockBotRepo.saveTenantAiProvider).mock.calls[0]![0];
      const decrypted = botService.decryptApiKey(
        sampleTenantBot.clientId,
        sampleProvider.id,
        capturedCall.apiKeyCiphertext,
        capturedCall.apiKeyKeyId,
      );

      expect(decrypted).toBe(plainApiKey);
    });

    it("rechaza claves vacías o demasiado cortas", async () => {
      const res = await botService.saveByokKey({
        clientId: sampleTenantBot.clientId,
        providerId: sampleProvider.id,
        plainApiKey: "123",
        actor: "tenant_owner",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("BYOK_KEY_INVALID");
      }
      expect(mockBotRepo.saveTenantAiProvider).not.toHaveBeenCalled();
    });
  });

  describe("RF-02.4 · Resolución de snapshot efectivo para BOT-002", () => {
    it("resuelve el snapshot completo a partir del preset configurado", async () => {
      const res = await botService.getEffectiveBotSnapshot(sampleTenantBot.clientId);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.bot.id).toBe(sampleTenantBot.id);
        expect(res.data.provider.code).toBe("openai");
        expect(res.data.model.modelId).toBe("gpt-4o");
        expect(res.data.tone.code).toBe("cercano");
        expect(res.data.preset?.code).toBe("natural_rhythm");
        expect(res.data.resolvedTemperature).toBe("0.8"); // Proviene del preset
        expect(res.data.resolvedMaxTokens).toBe(1200);
        expect(res.data.channels).toHaveLength(1);
      }
    });

    it("falla si el inquilino no tiene ningún bot configurado", async () => {
      vi.mocked(mockBotRepo.findTenantBot).mockResolvedValueOnce(null);

      const res = await botService.getEffectiveBotSnapshot("unknown-client");

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("BOT_NOT_FOUND");
      }
    });
  });

  describe("T-09 · Habilitación de canales y estado operativo", () => {
    it("habilita un canal para el bot con saludo personalizado opcional", async () => {
      const res = await botService.setBotChannelEnabled(
        sampleTenantBot.id,
        sampleChannelType.id,
        101,
        "WhatsApp Soporte",
        true,
        "¡Hola! Bienvenido a nuestra línea de WhatsApp.",
      );

      expect(res.ok).toBe(true);
      expect(mockBotRepo.upsertTenantBotChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          botId: sampleTenantBot.id,
          channelTypeId: sampleChannelType.id,
          inboxId: 101,
          inboxName: "WhatsApp Soporte",
          enabled: true,
          greetingOverride: "¡Hola! Bienvenido a nuestra línea de WhatsApp.",
        }),
      );
    });

    it("actualiza el estado operativo del bot a 'active'", async () => {
      const res = await botService.updateBotStatus(
        sampleTenantBot.clientId,
        sampleTenantBot.id,
        "active",
      );

      expect(res.ok).toBe(true);
      expect(mockBotRepo.updateTenantBotStatus).toHaveBeenCalledWith(
        sampleTenantBot.clientId,
        sampleTenantBot.id,
        "active",
      );
    });
  });

  describe("T-04 · Backoffice y permisos del catálogo (RBAC)", () => {
    it("permite a platform_admin activar o desactivar un proveedor", async () => {
      const result = await botService.updateProviderStatus(
        sampleProvider.id,
        false,
        "platform_admin",
        "admin-user",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.isActive).toBe(false);
      }
      expect(mockBotRepo.updateProvider).toHaveBeenCalledWith(
        sampleProvider.id,
        expect.objectContaining({
          isActive: false,
          updatedBy: "admin-user",
        }),
      );
    });

    it("rechaza a tenant_owner con PERMISSION_DENIED al intentar modificar proveedores", async () => {
      const result = await botService.updateProviderStatus(
        sampleProvider.id,
        false,
        "tenant_owner",
        "tenant-user",
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PERMISSION_DENIED");
      }
      expect(mockBotRepo.updateProvider).not.toHaveBeenCalled();
    });

    it("permite a platform_owner actualizar costos y spread calculando retail automáticamente", async () => {
      const result = await botService.updateModelPricingAndSpread({
        modelId: sampleModel.id,
        spreadPercent: 40,
        costInputMtokUsdCents: 500,
        costOutputMtokUsdCents: 2000,
        actorRole: "platform_owner",
        actor: "owner-user",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.spreadPercent).toBe(40);
        // retail = cost * (1 + 40/100) -> 500 * 1.4 = 700; 2000 * 1.4 = 2800
        expect(result.data.retailInputMtokUsdCents).toBe(700);
        expect(result.data.retailOutputMtokUsdCents).toBe(2800);
      }
    });

    it("rechaza spread porcentual negativo", async () => {
      const result = await botService.updateModelPricingAndSpread({
        modelId: sampleModel.id,
        spreadPercent: -5,
        actorRole: "platform_admin",
        actor: "admin-user",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_SPREAD_PERCENT");
      }
    });

    it("rechaza a un usuario no autorizado al intentar actualizar precios o spread", async () => {
      const result = await botService.updateModelPricingAndSpread({
        modelId: sampleModel.id,
        spreadPercent: 35,
        actorRole: "tenant_agent",
        actor: "agent-user",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PERMISSION_DENIED");
      }
    });
  });

  describe("T-05 · Gestión de integraciones de canal desde Mocter", () => {
    it("lista solo canales admisibles reflejando configuración e inboxId", async () => {
      const nonAdmissibleChannel: ChatwootChannelType = {
        id: "01930000-0000-7000-8000-000000000099",
        code: "line",
        labels: { es: "Line", en: "Line" },
        provisioning: "oauth",
        notes: { es: "No soportado en Colombia", en: "Unsupported" },
        isAdmissible: false,
        sortOrder: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockBotRepo.listChannelTypes).mockResolvedValue([
        sampleChannelType,
        nonAdmissibleChannel,
      ]);

      const result = await botService.listAdmissibleChannelsForTenant(sampleTenantBot.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.code).toBe("website");
        expect(result.data[0]?.isConfigured).toBe(true);
        expect(result.data[0]?.inboxId).toBe(45);
        expect(result.data[0]?.enabled).toBe(true);
      }
    });

    it("aprovisiona directamente canales tipo 'api' (ej. website) asignando inbox", async () => {
      const result = await botService.provisionChannelIntegration({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        channelTypeCode: "website",
        inboxName: "Canal Web Principal",
        inboxId: 88,
        actor: "owner-user",
        actorRole: "tenant_owner",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("provisioned");
        expect(result.data.channel?.inboxId).toBe(88);
      }
    });

    it("retorna requerimiento de flujo OAuth para canales tipo 'oauth' (ej. whatsapp_cloud)", async () => {
      const oauthChannel: ChatwootChannelType = {
        id: "01930000-0000-7000-8000-000000000007",
        code: "whatsapp_cloud",
        labels: { es: "WhatsApp Cloud", en: "WhatsApp Cloud" },
        provisioning: "oauth",
        notes: { es: "Meta Cloud API mediado por Chatwoot", en: "Meta Cloud API" },
        isAdmissible: true,
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockBotRepo.findChannelTypeByCode).mockResolvedValue(oauthChannel);

      const result = await botService.provisionChannelIntegration({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        channelTypeCode: "whatsapp_cloud",
        inboxName: "Línea WhatsApp Oficial",
        actor: "owner-user",
        actorRole: "tenant_owner",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("oauth_flow_required");
        expect(result.data.oauthUrl).toContain("/api/auth/chatwoot/channels/whatsapp_cloud/start");
      }
    });

    it("rechaza tipos no admisibles con CHANNEL_NOT_ADMISSIBLE", async () => {
      const inadmissibleChannel: ChatwootChannelType = {
        id: "01930000-0000-7000-8000-000000000099",
        code: "line",
        labels: { es: "Line", en: "Line" },
        provisioning: "oauth",
        notes: { es: "No soportado en Colombia", en: "Unsupported" },
        isAdmissible: false,
        sortOrder: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockBotRepo.findChannelTypeByCode).mockResolvedValue(inadmissibleChannel);

      const result = await botService.provisionChannelIntegration({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        channelTypeCode: "line",
        inboxName: "Canal Line",
        actor: "owner-user",
        actorRole: "tenant_owner",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CHANNEL_NOT_ADMISSIBLE");
      }
    });

    it("rechaza a tenant_agent al intentar aprovisionar canales", async () => {
      const result = await botService.provisionChannelIntegration({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        channelTypeCode: "website",
        inboxName: "Canal Web",
        actor: "agent-user",
        actorRole: "tenant_agent",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PERMISSION_DENIED");
      }
    });

    it("desactiva una integración de canal existente para el bot", async () => {
      const result = await botService.deactivateChannelIntegration(
        sampleTenantBot.id,
        sampleChannelType.id,
        "tenant_owner",
        "owner-user",
      );

      expect(result.ok).toBe(true);
      expect(mockBotRepo.upsertTenantBotChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          botId: sampleTenantBot.id,
          channelTypeId: sampleChannelType.id,
          enabled: false,
        }),
      );
    });
  });

  describe("T-13 · Recarga idempotente en billetera (Wompi + Stripe, COP y USD)", () => {
    it("acredita recarga en USD directamente en centavos de USD", async () => {
      const result = await botService.rechargeWallet({
        clientId: sampleTenantBot.clientId,
        gateway: "stripe",
        reference: "ch_stripe_12345",
        currency: "USD",
        amountLocalCents: 5000, // $50.00 USD
        actor: "owner-user",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alreadyProcessed).toBe(false);
        expect(result.data.newBalanceUsdCents).toBe(5000);
        expect(result.data.transaction.currency).toBe("USD");
      }
    });

    it("convierte recarga en COP a centavos de USD registrando fxRate", async () => {
      // 210.000 COP a tasa 4.200 COP/USD = 50 USD = 5000 centavos USD
      const result = await botService.rechargeWallet({
        clientId: sampleTenantBot.clientId,
        gateway: "wompi",
        reference: "trans_wompi_67890",
        currency: "COP",
        amountLocalCents: 21000000, // $210.000 COP en centavos COP
        fxRate: "4200.00",
        actor: "owner-user",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alreadyProcessed).toBe(false);
        expect(result.data.newBalanceUsdCents).toBe(5000);
        expect(result.data.transaction.fxRate).toBe("4200.00");
      }
    });

    it("garantiza idempotencia retornando la transacción previa sin duplicar saldo", async () => {
      const existingTx: WalletTransaction = {
        id: "tx-existing-99",
        clientId: sampleTenantBot.clientId,
        type: "recharge",
        amountUsdCents: 2500,
        currency: "USD",
        amountLocalCents: 2500,
        fxRate: "1.00",
        inputTokens: null,
        outputTokens: null,
        balanceAfterUsdCents: 2500,
        reference: "ref-duplicate-check",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      };

      vi.mocked(mockBotRepo.findWalletTransactionByReference).mockResolvedValue(existingTx);

      const result = await botService.rechargeWallet({
        clientId: sampleTenantBot.clientId,
        gateway: "stripe",
        reference: "ref-duplicate-check",
        currency: "USD",
        amountLocalCents: 2500,
        actor: "owner-user",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.alreadyProcessed).toBe(true);
        expect(result.data.transaction.id).toBe("tx-existing-99");
        expect(result.data.newBalanceUsdCents).toBe(2500);
      }
      expect(mockBotRepo.executeRechargeTransaction).not.toHaveBeenCalled();
    });

    it("rechaza recargas con monto resultante menor o igual a cero", async () => {
      const result = await botService.rechargeWallet({
        clientId: sampleTenantBot.clientId,
        gateway: "stripe",
        reference: "ref-zero",
        currency: "USD",
        amountLocalCents: 0,
        actor: "owner-user",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_RECHARGE_AMOUNT");
      }
    });
  });

  describe("T-14 · Consumo con débito atómico y prepago estricto", () => {
    it("en modo BYOK registra el evento de uso con costo 0 sin debitar saldo", async () => {
      const result = await botService.consumeInferenceTokens({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        providerId: sampleProvider.id,
        modelId: sampleModel.id,
        purpose: "bot",
        mode: "byok",
        inputTokens: 1200,
        outputTokens: 350,
        actor: "bot-runtime",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.mode).toBe("byok");
        expect(result.data.costUsdCents).toBe(0);
      }
      expect(mockBotRepo.executeConsumptionTransaction).not.toHaveBeenCalled();
      expect(mockBotRepo.recordUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "byok",
          costUsdCents: 0,
        }),
      );
    });

    it("en modo Mocter debita exactamente los tokens usados al precio minorista (spread 30%)", async () => {
      // sampleModel tiene:
      // retailInputMtokUsdCents = 325 (3.25 USD por 1M tokens)
      // retailOutputMtokUsdCents = 1300 (13.00 USD por 1M tokens)
      // 10.000 tokens de entrada = (10.000 * 325) / 1.000.000 = 3.25 centavos -> Math.round = 3 centavos
      // 5.000 tokens de salida = (5.000 * 1300) / 1.000.000 = 6.5 centavos -> Math.round = 7 centavos
      // Total costo esperado: 3 + 7 = 10 centavos USD

      const walletWithBalance: Wallet = {
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 1000, // 10 USD
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      };
      vi.mocked(mockBotRepo.getWallet).mockResolvedValue(walletWithBalance);

      const result = await botService.consumeInferenceTokens({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        providerId: sampleProvider.id,
        modelId: sampleModel.id,
        purpose: "bot",
        mode: "mocter",
        inputTokens: 10000,
        outputTokens: 5000,
        actor: "bot-runtime",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.costUsdCents).toBe(10);
        expect(result.data.mode).toBe("mocter");
      }
      expect(mockBotRepo.executeConsumptionTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          costUsdCents: 10,
          inputTokens: 10000,
          outputTokens: 5000,
        }),
      );
    });

    it("rechaza si el saldo es insuficiente sin debitar saldo ni registrar consumo", async () => {
      const lowBalanceWallet: Wallet = {
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 2, // solo 2 centavos
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      };
      vi.mocked(mockBotRepo.getWallet).mockResolvedValue(lowBalanceWallet);

      const result = await botService.consumeInferenceTokens({
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        providerId: sampleProvider.id,
        modelId: sampleModel.id,
        purpose: "bot",
        mode: "mocter",
        inputTokens: 50000, // costo > 2 centavos
        outputTokens: 20000,
        actor: "bot-runtime",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INSUFFICIENT_FUNDS");
      }
      expect(mockBotRepo.executeConsumptionTransaction).not.toHaveBeenCalled();
    });
  });

  describe("T-15 · Fallback automático e historial de billetera", () => {
    it("resuelve modo mocter si la billetera tiene saldo disponible", async () => {
      vi.mocked(mockBotRepo.getWallet).mockResolvedValue({
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 500,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      });

      const result = await botService.resolveInferenceExecutionMode(sampleTenantBot.clientId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.mode).toBe("mocter");
        expect(result.data.canExecute).toBe(true);
        expect(result.data.shouldPauseMocter).toBe(false);
      }
    });

    it("aplica fallback automático a BYOK cuando no hay saldo pero existe proveedor BYOK activo", async () => {
      vi.mocked(mockBotRepo.getWallet).mockResolvedValue({
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      });
      vi.mocked(mockBotRepo.listTenantAiProviders).mockResolvedValue([sampleByokProvider]);

      const result = await botService.resolveInferenceExecutionMode(sampleTenantBot.clientId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.mode).toBe("byok");
        expect(result.data.canExecute).toBe(true);
        expect(result.data.byokProvider?.id).toBe(sampleByokProvider.id);
        expect(result.data.shouldPauseMocter).toBe(false);
      }
    });

    it("resuelve modo exhausted con fallbackMessage y pausa cuando no hay saldo ni BYOK", async () => {
      vi.mocked(mockBotRepo.getWallet).mockResolvedValue({
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      });
      vi.mocked(mockBotRepo.listTenantAiProviders).mockResolvedValue([]);

      const result = await botService.resolveInferenceExecutionMode(sampleTenantBot.clientId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.mode).toBe("exhausted");
        expect(result.data.canExecute).toBe(false);
        expect(result.data.shouldPauseMocter).toBe(true);
        expect(result.data.fallbackMessage).toBe(sampleTenantBot.fallbackMessage);
      }
    });

    it("retorna el historial consolidado de billetera y eventos de uso", async () => {
      const sampleTx: WalletTransaction = {
        id: "tx-hist-1",
        clientId: sampleTenantBot.clientId,
        type: "recharge",
        amountUsdCents: 3000,
        currency: "USD",
        amountLocalCents: 3000,
        fxRate: "1.00",
        inputTokens: null,
        outputTokens: null,
        balanceAfterUsdCents: 3000,
        reference: "ref-h1",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      };

      const sampleUsage: AiUsageEvent = {
        id: "ev-hist-1",
        clientId: sampleTenantBot.clientId,
        botId: sampleTenantBot.id,
        providerId: sampleProvider.id,
        modelId: sampleModel.id,
        mode: "mocter",
        purpose: "bot",
        inputTokens: 1000,
        outputTokens: 500,
        costUsdCents: 5,
        walletTransactionId: "tx-hist-1",
        createdAt: new Date(),
      };

      vi.mocked(mockBotRepo.getWallet).mockResolvedValue({
        clientId: sampleTenantBot.clientId,
        balanceUsdCents: 3000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "owner-user",
        updatedBy: "owner-user",
      });
      vi.mocked(mockBotRepo.listWalletTransactions).mockResolvedValue([sampleTx]);
      vi.mocked(mockBotRepo.listUsageEvents).mockResolvedValue([sampleUsage]);

      const result = await botService.listWalletHistory(sampleTenantBot.clientId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.balanceUsdCents).toBe(3000);
        expect(result.data.transactions).toHaveLength(1);
        expect(result.data.usageEvents).toHaveLength(1);
      }
    });
  });

  describe("T-16 · Auditoría de precios, claves y recargas; monitoreo de recaudación", () => {
    it("registra en audit_log la actualización de precios y spread de modelos", async () => {
      await botService.updateModelPricingAndSpread({
        modelId: sampleModel.id,
        spreadPercent: 35,
        costInputMtokUsdCents: 300,
        costOutputMtokUsdCents: 1200,
        actor: "platform-superadmin",
        actorRole: "platform_admin",
      });

      expect(mockBotRepo.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ai_model.pricing_updated",
          entityType: "ai_model",
          entityId: sampleModel.id,
          actorRole: "platform_admin",
          metadata: expect.objectContaining({
            spreadPercent: 35,
            actor: "platform-superadmin",
          }),
        }),
      );
    });

    it("registra en audit_log el alta de clave BYOK con máscara last4 sin exponer secreto", async () => {
      await botService.saveByokKey({
        clientId: sampleTenantBot.clientId,
        providerId: sampleProvider.id,
        plainApiKey: "sk-ant-api03-abcdef1234567890",
        actor: "owner-user",
      });

      expect(mockBotRepo.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "tenant_ai_provider.key_registered",
          entityType: "tenant_ai_provider",
          entityId: sampleProvider.id,
          clientId: sampleTenantBot.clientId,
          metadata: expect.objectContaining({
            apiKeyLast4: "7890",
            actor: "owner-user",
          }),
        }),
      );
    });

    it("registra en audit_log la recarga exitosa de billetera", async () => {
      await botService.rechargeWallet({
        clientId: sampleTenantBot.clientId,
        gateway: "stripe",
        reference: "ref-audit-check-1",
        currency: "USD",
        amountLocalCents: 8000,
        actor: "owner-user",
      });

      expect(mockBotRepo.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "wallet.recharged",
          entityType: "wallet",
          entityId: sampleTenantBot.clientId,
          clientId: sampleTenantBot.clientId,
          metadata: expect.objectContaining({
            amountUsdCents: 8000,
            currency: "USD",
            reference: "ref-audit-check-1",
          }),
        }),
      );
    });

    it("obtiene métricas consolidadas de recaudación y consumo de IA de plataforma", async () => {
      const result = await botService.getPlatformAiRevenueMetrics();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalRechargedUsdCents).toBe(15000);
        expect(result.data.totalCostUsdCents).toBe(4500);
        expect(result.data.totalTokensConsumed).toBe(1200000);
        expect(result.data.tokensByPurpose.bot).toBe(900000);
        expect(result.data.tokensByPurpose.assist).toBe(300000);
        expect(result.data.eventsCount).toBe(42);
      }
    });
  });

  describe("T-21 · Configuración y seed de secuencias de seguimiento (RF-11)", () => {
    it("crea una secuencia personalizada con pasos ordenados y tiempos de espera", async () => {
      const result = await botService.createFollowupSequence({
        clientId: sampleTenantBot.clientId,
        name: "Secuencia Carrito Abandonado",
        triggerInactivityMinutes: 120,
        origin: "tenant_custom",
        steps: [
          { position: 1, delayMinutes: 0, message: "¿Deseas finalizar tu pedido?" },
          { position: 2, delayMinutes: 60, message: "Te reservamos los productos por 1 hora más." },
        ],
        actor: "owner-user",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.followup.name).toBe("Secuencia Carrito Abandonado");
        expect(result.data.steps).toHaveLength(2);
      }
    });

    it("rechaza si se excede el límite máximo de 10 pasos (RF-11.7)", async () => {
      const steps = Array.from({ length: 11 }, (_, i) => ({
        position: i + 1,
        delayMinutes: 10,
        message: `Paso ${i + 1}`,
      }));

      const result = await botService.createFollowupSequence({
        clientId: sampleTenantBot.clientId,
        name: "Secuencia Excesiva",
        triggerInactivityMinutes: 60,
        steps,
        actor: "owner-user",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MAX_STEPS_EXCEEDED");
      }
    });

    it("siembra la secuencia por defecto con 3 pasos y estado draft (RF-11.8)", async () => {
      const result = await botService.seedDefaultFollowupSequence(sampleTenantBot.clientId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.followup.origin).toBe("platform_default");
        expect(result.data.steps).toHaveLength(3);
      }
    });

    it("permite a tenant_owner actualizar el estado a activa o pausada", async () => {
      const result = await botService.updateFollowupStatus(
        "fol-01",
        "active",
        "tenant_owner",
        "owner-user",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("active");
      }
    });
  });

  describe("T-22 · Ejecución de seguimientos y reglas de parada (RF-11.3, RF-11.4)", () => {
    it("inicia la ejecución cuando el prospecto posee consentimiento comercial vigente", async () => {
      const result = await botService.triggerFollowupExecution({
        clientId: sampleTenantBot.clientId,
        followupId: "fol-01",
        prospectContactId: "prospect-01",
        chatwootConversationId: 501,
        hasCommercialConsent: true,
        actor: "bot",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("running");
        expect(result.data.currentStep).toBe(1);
        expect(result.data.nextSendAt).toBeDefined();
      }
    });

    it("rechaza iniciar si el prospecto no posee consentimiento comercial (RF-11.6)", async () => {
      const result = await botService.triggerFollowupExecution({
        clientId: sampleTenantBot.clientId,
        followupId: "fol-01",
        prospectContactId: "prospect-no-consent",
        chatwootConversationId: 502,
        hasCommercialConsent: false,
        actor: "bot",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("COMMERCIAL_CONSENT_REQUIRED");
      }
    });

    it("rechaza si el prospecto ya tiene una secuencia activa en ejecución (RF-11.3)", async () => {
      vi.mocked(mockBotRepo.findActiveFollowupRun).mockResolvedValueOnce({
        id: "run-active",
        clientId: sampleTenantBot.clientId,
        followupId: "fol-01",
        prospectContactId: "prospect-01",
        chatwootConversationId: 501,
        currentStep: 1,
        nextSendAt: new Date(),
        status: "running",
        stopReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "bot",
        updatedBy: "bot",
      });

      const result = await botService.triggerFollowupExecution({
        clientId: sampleTenantBot.clientId,
        followupId: "fol-01",
        prospectContactId: "prospect-01",
        chatwootConversationId: 501,
        hasCommercialConsent: true,
        actor: "bot",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ACTIVE_RUN_EXISTS");
      }
    });

    it("aplica reglas de parada cancelando ejecuciones activas ante respuesta o agente", async () => {
      const result = await botService.stopFollowupRuns({
        clientId: sampleTenantBot.clientId,
        prospectContactId: "prospect-01",
        stopReason: "prospect_replied",
        actor: "bot-listener",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.stoppedCount).toBe(1);
        expect(result.data.stopReason).toBe("prospect_replied");
      }
    });
  });
});
