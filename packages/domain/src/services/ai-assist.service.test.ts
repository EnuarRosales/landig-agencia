import { describe, expect, it, vi, beforeEach } from "vitest";
import { AiAssistService, type IAiAssistModelClient } from "./ai-assist.service";
import { LlmHttpCallError } from "./llm-http-provider.client";
import type { IAiAssistRepository } from "../repositories/ai-assist.repository.interface";
import type { AiAssistField, AiAssistPrompt } from "../db/schemas/admin/ai-assist";

describe("AI-001 T-04 · AiAssistService («Mejorar con AI»)", () => {
  let mockRepo: IAiAssistRepository;
  let mockModel: IAiAssistModelClient;
  let service: AiAssistService;

  const mockField: AiAssistField = {
    fieldKey: "bot.objective",
    entity: "tenant_bots",
    columnName: "objective",
    labels: { es: "Objetivo Del Bot", en: "Bot Objective" },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "seed",
    updatedBy: "seed",
  };

  const mockPrompt: AiAssistPrompt = {
    id: "00000000-0000-7000-8000-000000000001",
    fieldKey: "bot.objective",
    version: 1,
    masterPrompt: "Eres un especialista en diseño conversacional...",
    inputHint: "Describe qué quieres que logre el bot...",
    outputRules: { maxLength: 300, minLength: 20 },
    examples: [],
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "seed",
    updatedBy: "seed",
  };

  beforeEach(() => {
    mockRepo = {
      getAllFields: vi.fn().mockResolvedValue([mockField]),
      getActiveFields: vi.fn().mockResolvedValue([mockField]),
      getFieldByKey: vi.fn().mockResolvedValue(mockField),
      getActivePromptByFieldKey: vi.fn().mockResolvedValue(mockPrompt),
      getPromptByVersion: vi.fn().mockResolvedValue(mockPrompt),
      listPromptsByFieldKey: vi.fn().mockResolvedValue([mockPrompt]),
      getNextVersionForField: vi.fn().mockResolvedValue(2),
      saveField: vi.fn(),
      savePrompt: vi.fn().mockImplementation((p) =>
        Promise.resolve({
          ...p,
          id: "new-prompt-id",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      promotePromptToActive: vi.fn().mockImplementation((fieldKey, version) =>
        Promise.resolve({
          ok: true,
          data: { ...mockPrompt, fieldKey, version, status: "active" },
        }),
      ),
    };
    mockModel = {
      generateSuggestion: vi.fn().mockResolvedValue({
        suggestion: "Guiar a clientes y cerrar ventas en línea.",
        inputTokens: 120,
        outputTokens: 25,
      }),
    };
    service = new AiAssistService(mockRepo, mockModel, "gemini-1.5-flash");
  });

  it("rechaza si el borrador está vacío (EMPTY_DRAFT)", async () => {
    const result = await service.enhanceText({
      clientId: "client-1",
      fieldKey: "bot.objective",
      draft: "   ",
      hasByokConfigured: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EMPTY_DRAFT");
  });

  it("rechaza si no tiene BYOK ni saldo en billetera (NO_INFERENCE_CREDENTIALS)", async () => {
    const result = await service.enhanceText({
      clientId: "client-1",
      fieldKey: "bot.objective",
      draft: "vender zapatos rapido",
      hasByokConfigured: false,
      walletBalanceCents: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NO_INFERENCE_CREDENTIALS");
  });

  it("rechaza si el campo no está registrado o no está activo", async () => {
    (mockRepo.getFieldByKey as any).mockResolvedValue(null);

    const result = await service.enhanceText({
      clientId: "client-1",
      fieldKey: "campo.desconocido",
      draft: "borrador de prueba",
      hasByokConfigured: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("FIELD_NOT_ASSISTED");
  });

  it("genera sugerencia con éxito uniendo borrador, prompt maestro y locale", async () => {
    const result = await service.enhanceText({
      clientId: "client-1",
      fieldKey: "bot.objective",
      draft: "vender zapatos de mujer",
      locale: "es",
      hasByokConfigured: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.fieldKey).toBe("bot.objective");
    expect(result.data.promptVersion).toBe(1);
    expect(result.data.draft).toBe("vender zapatos de mujer");
    expect(result.data.suggestion).toBe("Guiar a clientes y cerrar ventas en línea.");
    expect(result.data.inputTokens).toBe(120);
    expect(result.data.outputTokens).toBe(25);
    expect(result.data.modelUsed).toBe("gemini-1.5-flash");

    expect(mockModel.generateSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: "vender zapatos de mujer",
        locale: "es",
        systemPrompt: expect.stringContaining("IDIOMA REQUERIDO: ES"),
      }),
    );
  });

  describe("T-06 · Rate Limiting y Control de Peticiones (RF-04.4)", () => {
    it("permite hasta 10 peticiones por minuto y bloquea la número 11 con tiempo de espera", async () => {
      for (let i = 0; i < 10; i++) {
        const check = service.checkRateLimit("client-busy");
        expect(check.allowed).toBe(true);
      }

      const blockedCheck = service.checkRateLimit("client-busy");
      expect(blockedCheck.allowed).toBe(false);
      expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);

      const result = await service.enhanceText({
        clientId: "client-busy",
        fieldKey: "bot.objective",
        draft: "otra prueba",
        hasByokConfigured: true,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });

  describe("T-03 · Biblioteca y Versionado de Prompts Maestros (RF-02)", () => {
    it("lista el catálogo completo de campos con sus versiones de prompts", async () => {
      const res = await service.listPromptLibrary();
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.length).toBe(1);
      expect(res.data[0].fieldKey).toBe("bot.objective");
      expect(res.data[0].activePrompt?.version).toBe(1);
      expect(res.data[0].totalVersions).toBe(1);
    });

    it("rechaza el registro de versión si el rol no es platform_owner o platform_admin", async () => {
      const res = await service.createPromptVersion({
        fieldKey: "bot.objective",
        masterPrompt: "Nuevo prompt maestro",
        inputHint: "Hint",
        userRole: "platform_sales",
        executedBy: "sales@mocter.co",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("FORBIDDEN_INSUFFICIENT_PERMISSIONS");
    });

    it("crea exitosamente una versión activa y promueve retirando versiones anteriores", async () => {
      const res = await service.createPromptVersion({
        fieldKey: "bot.objective",
        masterPrompt: "Eres un estratega conversacional avanzado...",
        inputHint: "Escribe el objetivo del bot",
        status: "active",
        userRole: "platform_admin",
        executedBy: "admin@mocter.co",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(mockRepo.promotePromptToActive).toHaveBeenCalledWith(
        "bot.objective",
        2,
        "admin@mocter.co",
      );
    });

    it("permite promover explícitamente una versión existente a 'active'", async () => {
      const res = await service.promotePromptVersion(
        "bot.objective",
        1,
        "platform_owner",
        "owner@mocter.co",
      );

      expect(res.ok).toBe(true);
      expect(mockRepo.promotePromptToActive).toHaveBeenCalledWith(
        "bot.objective",
        1,
        "owner@mocter.co",
      );
    });
  });

  describe("SPEC-02 · Integración con CredentialResolver, Prompts Requeridos y LlmHttpCallError", () => {
    it("permite mejora en trial/onboarding sin exigir saldo en billetera cuando el resolvedor entrega platform_trial", async () => {
      const mockResolver = {
        resolveCredential: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            source: "platform_trial",
            mode: "mocter",
            providerId: "prov-1",
            providerCode: "google",
            modelId: "mod-1",
            modelCode: "gemini-2.0-flash",
            apiKey: "AIzaSyMockTrialKey_1234",
            keyLast4: "1234",
            temperature: 0.7,
            maxTokens: 1000,
            monthlyTokenCap: 50000,
          },
        }),
      };
      const mockRecorder = {
        record: vi.fn().mockResolvedValue(undefined),
      };

      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gemini-1.5-flash",
        mockResolver as any,
        mockRecorder,
      );

      const res = await specService.enhanceText({
        clientId: "client-trial",
        userId: "user-trial",
        fieldKey: "bot.objective",
        draft: "vender tenis por whatsapp",
        locale: "es",
        context: { productName: "Tenis Urban" },
        requestId: "req-spec02-1",
        walletBalanceCents: 0,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.credentialSource).toBe("platform_trial");
        expect(res.data.billingMode).toBe("mocter");
        expect(res.data.modelUsed).toBe("gemini-2.0-flash");
        expect(res.data.providerUsed).toBe("google");
      }
      expect(mockModel.generateSuggestion).toHaveBeenCalledWith(
        expect.objectContaining({
          providerCode: "google",
          modelCode: "gemini-2.0-flash",
          apiKey: "AIzaSyMockTrialKey_1234",
          systemPrompt: expect.stringContaining("Tenis Urban"),
        }),
      );
      expect(mockRecorder.record).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-trial",
          mode: "mocter",
          purpose: "trial",
          fieldKey: "bot.objective",
          requestId: "req-spec02-1",
          status: "success",
        }),
      );
    });

    it("devuelve AI_MASTER_PROMPT_MISSING cuando el campo activo no tiene prompt maestro en BD", async () => {
      (mockRepo.getActivePromptByFieldKey as any).mockResolvedValueOnce(null);
      const mockResolver = {
        resolveCredential: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            source: "byok",
            mode: "byok",
            providerId: "prov-1",
            providerCode: "openai",
            modelId: "mod-1",
            modelCode: "gpt-4o-mini",
            apiKey: "sk-proj-byok-1234",
            keyLast4: "1234",
            temperature: 0.7,
            maxTokens: 1000,
            monthlyTokenCap: null,
          },
        }),
      };

      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gpt-4o-mini",
        mockResolver as any,
      );

      const res = await specService.enhanceText({
        clientId: "client-byok",
        fieldKey: "bot.objective",
        draft: "texto borrador",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("AI_MASTER_PROMPT_MISSING");
      }
    });

    it("propaga AI_BYOK_REQUIRED desde el resolvedor sin invocar al proveedor HTTP", async () => {
      const mockResolver = {
        resolveCredential: vi.fn().mockResolvedValue({
          ok: false,
          error: "BYOK requerido",
          code: "AI_BYOK_REQUIRED",
        }),
      };
      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gpt-4o-mini",
        mockResolver as any,
      );

      const res = await specService.enhanceText({
        clientId: "client-expired",
        fieldKey: "bot.objective",
        draft: "texto borrador",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("AI_BYOK_REQUIRED");
      }
      expect(mockModel.generateSuggestion).not.toHaveBeenCalled();
    });

    it("registra evento status='error' en usageRecorder cuando la llamada HTTP LLM falla", async () => {
      const mockUsageRecorder = { record: vi.fn().mockResolvedValue(undefined) };
      const mockResolver = {
        resolveCredential: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            source: "byok",
            mode: "byok",
            providerId: "prov-1",
            providerCode: "openai",
            modelId: "mod-1",
            modelCode: "gpt-4o-mini",
            apiKey: "sk-proj-byok-1234",
            keyLast4: "1234",
            temperature: 0.7,
            maxTokens: 1000,
            monthlyTokenCap: null,
          },
        }),
      };
      (mockModel.generateSuggestion as any).mockRejectedValueOnce(
        new LlmHttpCallError("Timeout upstream 502", "AI_UPSTREAM_ERROR"),
      );

      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gpt-4o-mini",
        mockResolver as any,
        mockUsageRecorder,
      );

      const res = await specService.enhanceText({
        clientId: "client-byok",
        fieldKey: "bot.objective",
        draft: "texto borrador",
        requestId: "req-err-502",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("AI_UPSTREAM_ERROR");
      }
      expect(mockUsageRecorder.record).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-byok",
          fieldKey: "bot.objective",
          requestId: "req-err-502",
          inputTokens: 0,
          outputTokens: 0,
          status: "error",
        }),
      );
    });

    it("ejecuta failover automático al proveedor secundario ante HTTP 429/5xx del primario y registra ambos eventos", async () => {
      const mockUsageRecorder = { record: vi.fn().mockResolvedValue(undefined) };
      const mockResolver = {
        resolveCredential: vi.fn(),
        resolveCredentialCandidates: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              source: "byok",
              mode: "byok",
              priorityRole: "primary",
              providerId: "prov-primary",
              providerCode: "openai",
              apiDialect: "openai_compatible",
              modelId: "mod-primary",
              modelCode: "gpt-4o-mini",
              apiKey: "sk-primary",
              keyLast4: "mary",
              temperature: 0.7,
              maxTokens: 1000,
              monthlyTokenCap: null,
            },
            {
              source: "byok",
              mode: "byok",
              priorityRole: "secondary",
              providerId: "prov-secondary",
              providerCode: "groq",
              apiDialect: "openai_compatible",
              baseUrl: "https://api.groq.com/openai/v1",
              modelId: "mod-secondary",
              modelCode: "llama-3.3-70b-versatile",
              apiKey: "gsk-secondary",
              keyLast4: "dary",
              temperature: 0.6,
              maxTokens: 1000,
              monthlyTokenCap: null,
            },
          ],
        }),
      };

      (mockModel.generateSuggestion as any)
        .mockRejectedValueOnce(new LlmHttpCallError("Rate limit 429", "AI_PROVIDER_RATE_LIMIT"))
        .mockResolvedValueOnce({
          suggestion: "Texto optimizado vía proveedor secundario.",
          inputTokens: 20,
          outputTokens: 30,
        });

      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gpt-4o-mini",
        mockResolver as any,
        mockUsageRecorder,
      );

      const res = await specService.enhanceText({
        clientId: "client-failover",
        fieldKey: "bot.objective",
        draft: "texto borrador inicial",
        requestId: "req-failover-1",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.providerUsed).toBe("groq");
        expect(res.data.modelUsed).toBe("llama-3.3-70b-versatile");
        expect(res.data.failoverUsed).toBe(true);
      }
      expect(mockModel.generateSuggestion).toHaveBeenCalledTimes(2);
      expect(mockUsageRecorder.record).toHaveBeenCalledTimes(2);
      expect(mockUsageRecorder.record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          providerId: "prov-primary",
          status: "error",
          failoverUsed: false,
        }),
      );
      expect(mockUsageRecorder.record).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          providerId: "prov-secondary",
          status: "success",
          failoverUsed: true,
        }),
      );
    });

    it("NO hace failover al proveedor secundario cuando el primario falla por AI_KEY_INVALID (401/403)", async () => {
      const mockUsageRecorder = { record: vi.fn().mockResolvedValue(undefined) };
      const mockResolver = {
        resolveCredential: vi.fn(),
        resolveCredentialCandidates: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              source: "byok",
              mode: "byok",
              priorityRole: "primary",
              providerId: "prov-primary",
              providerCode: "openai",
              modelId: "mod-primary",
              modelCode: "gpt-4o-mini",
              apiKey: "sk-bad",
              keyLast4: "bad1",
              temperature: 0.7,
              maxTokens: 1000,
              monthlyTokenCap: null,
            },
            {
              source: "byok",
              mode: "byok",
              priorityRole: "secondary",
              providerId: "prov-secondary",
              providerCode: "anthropic",
              modelId: "mod-secondary",
              modelCode: "claude-3-5-haiku-latest",
              apiKey: "sk-ant-ok",
              keyLast4: "ok22",
              temperature: 0.7,
              maxTokens: 1000,
              monthlyTokenCap: null,
            },
          ],
        }),
      };

      (mockModel.generateSuggestion as any).mockRejectedValueOnce(
        new LlmHttpCallError("Unauthorized 401", "AI_KEY_INVALID"),
      );

      const specService = new AiAssistService(
        mockRepo,
        mockModel,
        "gpt-4o-mini",
        mockResolver as any,
        mockUsageRecorder,
      );

      const res = await specService.enhanceText({
        clientId: "client-no-failover",
        fieldKey: "bot.objective",
        draft: "texto borrador",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("AI_KEY_INVALID");
      }
      expect(mockModel.generateSuggestion).toHaveBeenCalledTimes(1);
    });
  });
});

