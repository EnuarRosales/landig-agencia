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
      getActiveFields: vi.fn().mockResolvedValue([mockField]),
      getFieldByKey: vi.fn().mockResolvedValue(mockField),
      getActivePromptByFieldKey: vi.fn().mockResolvedValue(mockPrompt),
      getPromptByVersion: vi.fn().mockResolvedValue(mockPrompt),
      saveField: vi.fn(),
      savePrompt: vi.fn(),
      promotePromptToActive: vi.fn(),
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
});

