import { describe, expect, it, vi, beforeEach } from "vitest";
import { AiAssistService, type IAiAssistModelClient } from "./ai-assist.service";
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
});

