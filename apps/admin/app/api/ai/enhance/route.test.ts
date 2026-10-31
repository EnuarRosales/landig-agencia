import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createEnhanceRouteHandler } from "./route";
import { ok, err } from "@mocter/domain";
import type { AiAssistService } from "@mocter/domain";

describe("AI-001 T-04 · API Route Handler (/api/ai/enhance)", () => {
  let mockAiService: {
    enhanceText: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockAiService = {
      enhanceText: vi.fn(),
    };
    handler = createEnhanceRouteHandler(mockAiService as unknown as AiAssistService);
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost:3003/api/ai/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("responde 400 Bad Request si faltan campos obligatorios", async () => {
    const req = createRequest({
      clientId: "invalido",
      draft: "",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("responde 409 Conflict si no tiene BYOK ni saldo en billetera", async () => {
    const req = createRequest({
      clientId: "11111111-1111-7111-8111-111111111111",
      fieldKey: "bot.objective",
      draft: "borrador de prueba",
      hasByokConfigured: false,
      walletBalanceCents: 0,
    });

    const res = await handler(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { title: string; detail: string };
    expect(json.title).toBe("Inference Provider Required");
    expect(json.detail).toContain("BYOK");
  });

  it("ejecuta la inferencia con éxito y responde 200 con la sugerencia", async () => {
    mockAiService.enhanceText.mockResolvedValue(
      ok({
        fieldKey: "bot.objective",
        promptVersion: 1,
        draft: "borrador de prueba",
        suggestion: "Sugerencia mejorada de prueba",
        inputTokens: 100,
        outputTokens: 20,
        modelUsed: "gemini-1.5-flash",
      }),
    );

    const req = createRequest({
      clientId: "11111111-1111-7111-8111-111111111111",
      fieldKey: "bot.objective",
      draft: "borrador de prueba",
      hasByokConfigured: true,
      locale: "es",
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { suggestion: string } };
    expect(json.ok).toBe(true);
    expect(json.data.suggestion).toBe("Sugerencia mejorada de prueba");
  });
});

