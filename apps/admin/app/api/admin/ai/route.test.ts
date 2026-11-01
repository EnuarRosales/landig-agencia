import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockOverview = {
  kpis: { totalProviders: 1, totalModels: 1, activePrompts: 1, defaultSpreadPercent: 30 },
  providers: [],
  models: [],
  promptBlocks: [],
  aiAssistPrompts: [],
  defaults: { defaultMaxTurns: 10, defaultAnswerPolicy: "solo_conocimiento", defaultHandoffTriggers: [] },
};

vi.mock("@mocter/domain", () => ({
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
});
