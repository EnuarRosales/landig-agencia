import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockOverview = {
  kpis: { totalProviders: 1, totalModels: 1, activePrompts: 1, defaultSpreadPercent: 30 },
  providers: [],
  models: [],
  platformKeys: [],
  promptBlocks: [],
  aiAssistPrompts: [],
  defaults: { defaultMaxTurns: 10, defaultAnswerPolicy: "solo_conocimiento", defaultHandoffTriggers: [] },
};

vi.mock("@mocter/domain", () => ({
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  fetchAdminAiGovernanceOverview: vi.fn().mockImplementation(() => Promise.resolve(mockOverview)),
  updateAdminModelSpread: vi.fn().mockImplementation((input) => {
    if (input.modelId === "inexistente") {
      return Promise.resolve({ ok: false, error: "Modelo no existe", code: "NOT_FOUND" });
    }
    return Promise.resolve({
      ok: true,
      data: { modelId: input.modelId, spreadPercent: input.spreadPercent, isActive: input.isActive },
    });
  }),
  updateAdminPromptBlock: vi.fn().mockImplementation((input) => {
    return Promise.resolve({ ok: true, data: { blockKey: input.blockKey, version: 2 } });
  }),
  updateAdminBotDefaults: vi.fn().mockImplementation(() => {
    return Promise.resolve({ ok: true, data: { success: true } });
  }),
  saveAdminPlatformTrialKey: vi.fn().mockImplementation((input) => {
    if (input.apiKey === "sk-invalid-key") {
      return Promise.resolve({ ok: false, error: "Credencial rechazada", code: "AI_KEY_INVALID" });
    }
    return Promise.resolve({
      ok: true,
      data: {
        id: "pk-01",
        providerId: "p-01",
        providerCode: input.providerCode,
        providerName: "OpenAI",
        keyId: input.keyId || "trial-openai",
        apiKeyLast4: String(input.apiKey).slice(-4),
        defaultModelId: input.modelId || "m-01",
        defaultModelCode: "gpt-4o-mini",
        monthlyTokenCap: input.monthlyTokenCap ?? 500000,
        priorityRole: input.priorityRole ?? "primary",
        status: "active",
        purpose: "inference",
        updatedAt: "2026-11-14T16:00:00.000Z",
      },
    });
  }),
  retireAdminPlatformTrialKey: vi.fn().mockImplementation((input) => {
    if (input.platformKeyId === "missing") {
      return Promise.resolve({ ok: false, error: "No encontrada", code: "NOT_FOUND" });
    }
    return Promise.resolve({ ok: true, data: { id: input.platformKeyId, status: "retired" } });
  }),
  updateAdminPlatformKeySettings: vi.fn().mockImplementation((input) => {
    return Promise.resolve({
      ok: true,
      data: {
        id: input.platformKeyId,
        providerId: "p-01",
        providerCode: "openai",
        providerName: "OpenAI",
        keyId: "trial-openai",
        apiKeyLast4: "4321",
        defaultModelId: input.modelId ?? "m-01",
        defaultModelCode: "gpt-4o-mini",
        monthlyTokenCap: input.monthlyTokenCap ?? 500000,
        temperature: input.temperature ?? 0.5,
        maxTokens: input.maxTokens ?? 1200,
        priorityRole: "primary",
        status: "active",
        purpose: "inference",
        updatedAt: "2026-11-14T16:10:00.000Z",
      },
    });
  }),
  setAdminPlatformKeyPriority: vi.fn().mockImplementation((input) => {
    return Promise.resolve({
      ok: true,
      data: { id: input.platformKeyId, priorityRole: input.priorityRole },
    });
  }),
  createAdminAiProvider: vi.fn().mockImplementation((input) => {
    if (input.code === "openai") {
      return Promise.resolve({
        ok: false,
        error: "Ya existe un proveedor activo con el slug 'openai'.",
        code: "AI_PROVIDER_CODE_EXISTS",
      });
    }
    return Promise.resolve({
      ok: true,
      data: {
        id: "p-groq",
        code: input.code,
        name: input.name,
        apiDialect: input.apiDialect,
        baseUrl: input.baseUrl,
        verifyPath: input.verifyPath ?? "/models",
        logoStorageKey: input.logoStorageKey ?? null,
        logoUrl: null,
        docsUrl: input.docsUrl ?? null,
        sortOrder: 100,
        isActive: true,
        supportedModes: { byok: true, mocter: true },
        modelsCount: 0,
      },
    });
  }),
  updateAdminAiProvider: vi.fn().mockImplementation((input) => {
    return Promise.resolve({
      ok: true,
      data: { id: input.providerId, name: input.name ?? "Groq", isActive: input.isActive ?? true },
    });
  }),
  deleteAdminAiProvider: vi.fn().mockImplementation((input) => {
    if (input.providerId === "p-in-use") {
      return Promise.resolve({
        ok: false,
        error: "Proveedor en uso activo",
        code: "AI_RESOURCE_IN_ACTIVE_USE",
      });
    }
    return Promise.resolve({
      ok: true,
      data: { providerId: input.providerId, mode: "hard_deleted" },
    });
  }),
  createAdminAiModel: vi.fn().mockImplementation((input) => {
    return Promise.resolve({
      ok: true,
      data: {
        id: "m-new",
        providerId: input.providerId,
        providerCode: "groq",
        modelId: input.modelId,
        displayName: input.displayName,
        defaultTemperature: input.defaultTemperature ?? 0.7,
        defaultMaxTokens: input.defaultMaxTokens ?? 1000,
        isDefault: Boolean(input.isDefault),
        isActive: true,
      },
    });
  }),
  updateAdminAiModel: vi.fn().mockImplementation((input) => {
    return Promise.resolve({
      ok: true,
      data: { id: input.id, isDefault: Boolean(input.isDefault), isActive: input.isActive ?? true },
    });
  }),
  deleteAdminAiModel: vi.fn().mockImplementation((input) => {
    if (input.id === "m-in-use") {
      return Promise.resolve({
        ok: false,
        error: "Modelo en uso activo",
        code: "AI_RESOURCE_IN_ACTIVE_USE",
      });
    }
    return Promise.resolve({
      ok: true,
      data: { id: input.id, mode: "soft_deleted" },
    });
  }),
  saveAdminAssistPromptVersion: vi.fn().mockImplementation((input) => {
    return Promise.resolve({ ok: true, data: { fieldKey: input.fieldKey, version: 2 } });
  }),
}));

describe("BOT-001 / BOT-002 · Route Handler (/api/admin/ai)", () => {
  it("GET responde 200 con el resumen de gobernanza de IA", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.kpis.defaultSpreadPercent).toBe(30);
  });

  it("POST action=update_model_spread actualiza el spread del modelo", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_model_spread",
        modelId: "m-01",
        spreadPercent: 35,
        isActive: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.spreadPercent).toBe(35);
  });

  it("POST action=save_prompt_block guarda una nueva versión del bloque", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_prompt_block",
        blockKey: "core.identity",
        contentEs: "Eres un asistente virtual de alta eficiencia.",
        contentEn: "You are a high efficiency virtual assistant.",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe(2);
  });

  it("POST action=update_defaults actualiza los parámetros globales", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_defaults",
        defaultMaxTurns: 12,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor", "humano"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("POST action=save_platform_key registra y retorna credencial enmascarada sin exponer secreto", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_platform_key",
        providerCode: "openai",
        modelId: "m-01",
        apiKey: "sk-proj-secret-4321",
        monthlyTokenCap: 500000,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.apiKeyLast4).toBe("4321");
    expect(JSON.stringify(json)).not.toContain("sk-proj-secret-4321");
  });

  it("POST action=save_platform_key retorna 422 si el proveedor rechaza la clave (AI_KEY_INVALID)", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_platform_key",
        providerCode: "openai",
        apiKey: "sk-invalid-key",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("AI_KEY_INVALID");
  });

  it("POST action=retire_platform_key retira credencial activa y retorna 404 si falta", async () => {
    const missingReq = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retire_platform_key", platformKeyId: "missing" }),
    });
    expect((await POST(missingReq)).status).toBe(404);

    const okReq = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retire_platform_key", platformKeyId: "pk-01" }),
    });
    const okRes = await POST(okReq);
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.data.status).toBe("retired");
  });

  it("POST action=save_assist_prompt versiona y activa un prompt maestro de asistencia", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_assist_prompt",
        fieldKey: "bot.objective",
        masterPrompt: "Redacta objetivos claros y enfocados en conversión.",
        inputHint: "Describe qué debe lograr el bot.",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.version).toBe(2);
  });

  it("POST actions Fase 2: create_provider (y 409 duplicado), delete_provider (409 en uso), create_model y llaves", async () => {
    const createOk = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_provider",
          code: "groq",
          name: "Groq Cloud",
          apiDialect: "openai_compatible",
          baseUrl: "https://api.groq.com/openai/v1",
          verifyPath: "/models",
        }),
      }),
    );
    expect(createOk.status).toBe(200);

    const createDup = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_provider",
          code: "openai",
          name: "OpenAI",
          apiDialect: "openai_compatible",
          baseUrl: "https://api.openai.com/v1",
        }),
      }),
    );
    expect(createDup.status).toBe(409);

    const delInUse = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_provider", providerId: "p-in-use" }),
      }),
    );
    expect(delInUse.status).toBe(409);
    const delInUseJson = await delInUse.json();
    expect(delInUseJson.code).toBe("AI_RESOURCE_IN_ACTIVE_USE");

    const createModelRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_model",
          providerId: "p-groq",
          modelId: "llama-3.3-70b-versatile",
          displayName: "Llama 3.3 70B",
          defaultTemperature: 0.6,
          defaultMaxTokens: 1200,
          isDefault: true,
        }),
      }),
    );
    expect(createModelRes.status).toBe(200);

    const priorityRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_platform_key_priority",
          platformKeyId: "pk-01",
          priorityRole: "secondary",
        }),
      }),
    );
    expect(priorityRes.status).toBe(200);

    const standbyRes = await POST(
      new NextRequest("http://localhost:3003/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_platform_key",
          providerCode: "openai",
          apiKey: "sk-standby-key-9999",
          priorityRole: "standby",
        }),
      }),
    );
    expect(standbyRes.status).toBe(200);
    const standbyJson = await standbyRes.json();
    expect(standbyJson.data.priorityRole).toBe("standby");
  });
});
