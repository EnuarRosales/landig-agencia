import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ok, err, type AiAssistService } from "@mocter/domain";
import { createEnhanceRouteHandler, type EnhanceAuthSession } from "./route";

describe("SPEC-02 T-06 · POST /api/ai/enhance", () => {
  let mockAiService: {
    enhanceText: ReturnType<typeof vi.fn>;
  };
  let mockRecordUsage: ReturnType<typeof vi.fn>;
  let currentSession: EnhanceAuthSession | null;
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    currentSession = {
      userId: "user-1",
      clientId: "11111111-1111-7111-8111-111111111111",
      scope: "tenant",
      role: "tenant_owner",
    };
    mockAiService = {
      enhanceText: vi.fn(),
    };
    mockRecordUsage = vi.fn().mockResolvedValue(undefined);

    handler = createEnhanceRouteHandler({
      getAiAssistService: () => mockAiService as unknown as AiAssistService,
      resolveSession: async () => currentSession,
      recordUsage: mockRecordUsage,
      scheduleAfter: (task) => {
        void task();
      },
    });
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost:3003/api/ai/enhance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "req-test-001",
      },
      body: JSON.stringify(body),
    });
  }

  it("responde 401 RFC 9457 si no existe sesión autenticada", async () => {
    currentSession = null;
    const req = createRequest({
      fieldKey: "bot.objective",
      draft: "vender zapatos",
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("responde 400 Bad Request si faltan campos obligatorios o el borrador está vacío", async () => {
    const req = createRequest({
      fieldKey: "",
      draft: "",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("responde 422 con código AI_BYOK_REQUIRED cuando el cliente no tiene BYOK ni trial vigente", async () => {
    mockAiService.enhanceText.mockResolvedValue(
      err(
        "Para usar la asistencia AI debes configurar tu propia API Key de proveedor (BYOK).",
        "AI_BYOK_REQUIRED",
      ),
    );

    const req = createRequest({
      fieldKey: "product.description",
      draft: "camisa algodón",
      locale: "es",
    });

    const res = await handler(req);
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const json = (await res.json()) as { code: string; detail: string };
    expect(json.code).toBe("AI_BYOK_REQUIRED");
  });

  it("responde 429 Too Many Requests con header Retry-After y código AI_RATE_LIMIT_EXCEEDED cuando excede el límite", async () => {
    mockAiService.enhanceText.mockResolvedValue(
      err(
        "Límite de peticiones excedido. Por favor intenta de nuevo en 42 segundos.",
        "RATE_LIMIT_EXCEEDED",
      ),
    );

    const req = createRequest({
      fieldKey: "bot.objective",
      draft: "vender tenis",
    });

    const res = await handler(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.headers.get("retry-after")).toBe("42");
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("AI_RATE_LIMIT_EXCEEDED");
  });

  it("ejecuta inferencia real en onboarding/trial sin saldo previo en billetera, responde 200 y audita en after()", async () => {
    currentSession = {
      userId: "user-onboarding",
      clientId: null,
      scope: "onboarding_prospect",
      role: "onboarding_prospect",
    };

    mockAiService.enhanceText.mockResolvedValue(
      ok({
        fieldKey: "onboarding.product_description",
        promptVersion: 1,
        draft: "camisa polo azul",
        suggestion: "Camisa polo de algodón peinado en color azul clásico, ideal para uso diario.",
        inputTokens: 85,
        outputTokens: 32,
        modelUsed: "gemini-2.0-flash",
        providerUsed: "google",
        providerId: "prov-google",
        modelId: "mod-gemini",
        credentialSource: "platform_trial",
        billingMode: "mocter",
        latencyMs: 310,
        requestId: "req-test-001",
      }),
    );

    const req = createRequest({
      fieldKey: "onboarding.product_description",
      draft: "camisa polo azul",
      locale: "es",
      context: { productName: "Polo Clásica" },
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        suggestion: string;
        credentialSource: string;
        providerUsed: string;
        mode: string;
        providerCode: string;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.data.suggestion).toContain("Camisa polo");
    expect(json.data.credentialSource).toBe("platform_trial");
    expect(json.data.providerUsed).toBe("google");
    expect(json.data.mode).toBe("trial");
    expect(json.data.providerCode).toBe("google");

    expect(mockAiService.enhanceText).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: null,
        userId: "user-onboarding",
        fieldKey: "onboarding.product_description",
        context: { productName: "Polo Clásica" },
        requestId: "req-test-001",
      }),
    );

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldKey: "onboarding.product_description",
        mode: "mocter",
        purpose: "trial",
        inputTokens: 85,
        outputTokens: 32,
        requestId: "req-test-001",
      }),
    );
  });

  it("evita doble registro de consumo cuando usageRecorder ya registró el evento en el servicio", async () => {
    mockAiService.enhanceText.mockResolvedValue(
      ok({
        fieldKey: "bot.objective",
        promptVersion: 1,
        draft: "vender ropa",
        suggestion: "Vender ropa urbana.",
        inputTokens: 40,
        outputTokens: 15,
        modelUsed: "gpt-4o-mini",
        providerUsed: "openai",
        providerId: "prov-openai",
        modelId: "mod-4o-mini",
        credentialSource: "byok",
        billingMode: "byok",
        latencyMs: 180,
        requestId: "req-test-001",
        usageRecorded: true,
      }),
    );

    const res = await handler(
      createRequest({
        fieldKey: "bot.objective",
        draft: "vender ropa",
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { mode: string; providerCode: string };
    };
    expect(json.data.mode).toBe("byok");
    expect(json.data.providerCode).toBe("openai");
    expect(mockRecordUsage).not.toHaveBeenCalled();
  });
});
