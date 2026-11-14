import { describe, it, expect, vi } from "vitest";
import { LlmHttpProviderClient } from "./llm-http-provider.client";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LlmHttpProviderClient", () => {
  it("invoca OpenAI/DeepSeek/OpenRouter/Together con Bearer token y extrae sugerencia y tokens", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        choices: [{ message: { content: "Descripción mejorada para WhatsApp" } }],
        usage: { prompt_tokens: 42, completion_tokens: 18 },
      }),
    );

    const client = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });
    const result = await client.generateWithCredential({
      providerCode: "openai",
      modelCode: "gpt-4o-mini",
      apiKey: "sk-proj-mock-openai-1234",
      systemPrompt: "Mejora descripciones.",
      userPrompt: "Camisa azul algodón",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestion).toBe("Descripción mejorada para WhatsApp");
      expect(result.data.inputTokens).toBe(42);
      expect(result.data.outputTokens).toBe(18);
    }

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-proj-mock-openai-1234",
    );
  });

  it("invoca Anthropic con x-api-key y anthropic-version parseando content[] y usage", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        content: [{ type: "text", text: "Respuesta optimizada Anthropic" }],
        usage: { input_tokens: 30, output_tokens: 25 },
      }),
    );

    const client = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });
    const result = await client.generateWithCredential({
      providerCode: "anthropic",
      modelCode: "claude-3-5-haiku-latest",
      apiKey: "sk-ant-mock-key-5678",
      systemPrompt: "Mejora política.",
      userPrompt: "Devolución 5 días.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestion).toBe("Respuesta optimizada Anthropic");
      expect(result.data.inputTokens).toBe(30);
      expect(result.data.outputTokens).toBe(25);
    }

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-mock-key-5678");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("invoca Google Gemini enviando x-goog-api-key en header y nunca en la URL", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        candidates: [
          { content: { parts: [{ text: "Texto mejorado Gemini" }] } },
        ],
        usageMetadata: { promptTokenCount: 22, candidatesTokenCount: 14 },
      }),
    );

    const client = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });
    const result = await client.generateWithCredential({
      providerCode: "google",
      modelCode: "gemini-2.0-flash",
      apiKey: "AIzaSySecretKey_9999",
      systemPrompt: "Eres un experto comercial.",
      userPrompt: "Borrador inicial.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestion).toBe("Texto mejorado Gemini");
      expect(result.data.inputTokens).toBe(22);
      expect(result.data.outputTokens).toBe(14);
    }

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    );
    expect(url).not.toContain("AIzaSySecretKey_9999");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "AIzaSySecretKey_9999",
    );
  });

  it("mapea códigos HTTP 401/403 a AI_KEY_INVALID, 429 a AI_PROVIDER_RATE_LIMIT y 5xx/red a AI_UPSTREAM_ERROR", async () => {
    const fetch401 = vi.fn(async () => mockJsonResponse({ error: "unauthorized" }, 401));
    const client401 = new LlmHttpProviderClient({ fetchFn: fetch401 as unknown as typeof fetch });
    const res401 = await client401.verifyApiKey({
      providerCode: "deepseek",
      apiKey: "sk-invalid",
    });
    expect(res401.ok).toBe(false);
    if (!res401.ok) expect(res401.code).toBe("AI_KEY_INVALID");

    const fetch429 = vi.fn(async () => mockJsonResponse({ error: "rate limit" }, 429));
    const client429 = new LlmHttpProviderClient({ fetchFn: fetch429 as unknown as typeof fetch });
    const res429 = await client429.generateWithCredential({
      providerCode: "openrouter",
      modelCode: "meta-llama/llama-3.1-8b",
      apiKey: "sk-or-valid",
      systemPrompt: "Sys",
      userPrompt: "Draft",
    });
    expect(res429.ok).toBe(false);
    if (!res429.ok) expect(res429.code).toBe("AI_PROVIDER_RATE_LIMIT");

    const fetch500 = vi.fn(async () => mockJsonResponse({ error: "bad gateway" }, 502));
    const client500 = new LlmHttpProviderClient({ fetchFn: fetch500 as unknown as typeof fetch });
    const res500 = await client500.generateWithCredential({
      providerCode: "together_ai",
      modelCode: "Qwen/Qwen2.5-7B-Instruct",
      apiKey: "tok-valid",
      systemPrompt: "Sys",
      userPrompt: "Draft",
    });
    expect(res500.ok).toBe(false);
    if (!res500.ok) expect(res500.code).toBe("AI_UPSTREAM_ERROR");

    const fetchTimeout = vi.fn(async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    const clientTimeout = new LlmHttpProviderClient({
      fetchFn: fetchTimeout as unknown as typeof fetch,
    });
    const resTimeout = await clientTimeout.verifyApiKey({
      providerCode: "openai",
      apiKey: "sk-timeout",
    });
    expect(resTimeout.ok).toBe(false);
    if (!resTimeout.ok) expect(resTimeout.code).toBe("AI_UPSTREAM_ERROR");
  });

  it("limita el timeout por defecto de verifyApiKey a máximo 8000 ms (RN-SPEC-02-07)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => mockJsonResponse({ data: [] }, 200));
    const client = new LlmHttpProviderClient({
      fetchFn: fetchMock as unknown as typeof fetch,
      timeoutMs: 15_000,
    });

    const result = await client.verifyApiKey({
      providerCode: "openai",
      apiKey: "sk-valid-1234",
    });

    expect(result.ok).toBe(true);
    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    timeoutSpy.mockRestore();
  });

  it("permite proveedor dinámico openai_compatible (ej. groq) usando apiDialect, baseUrl y verifyPath de BD", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse(
        {
          choices: [{ message: { content: "Texto mejorado con Groq" } }],
          usage: { prompt_tokens: 18, completion_tokens: 22 },
        },
        200,
      ),
    );
    const client = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });

    const verifyRes = await client.verifyApiKey({
      providerCode: "groq",
      apiDialect: "openai_compatible",
      baseUrl: "https://api.groq.com/openai/v1/",
      verifyPath: "/models",
      apiKey: "gsk-secret-9999",
    });
    expect(verifyRes.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer gsk-secret-9999" }),
      }),
    );

    const genRes = await client.generateWithCredential({
      providerCode: "groq",
      apiDialect: "openai_compatible",
      baseUrl: "https://api.groq.com/openai/v1",
      modelCode: "llama-3.3-70b-versatile",
      apiKey: "gsk-secret-9999",
      systemPrompt: "Mejora",
      userPrompt: "Borrador",
    });

    expect(genRes.ok).toBe(true);
    if (genRes.ok) {
      expect(genRes.data.suggestion).toBe("Texto mejorado con Groq");
      expect(genRes.data.inputTokens).toBe(18);
      expect(genRes.data.outputTokens).toBe(22);
    }
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
