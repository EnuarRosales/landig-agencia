import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import { GET, PUT, DELETE } from "./route";
import { POST as VERIFY } from "./verify/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    tenantAiSettingsService: {
      getSettingsOverview: vi.fn(),
      saveSettings: vi.fn(),
      verifyStoredKey: vi.fn(),
      revokeSettings: vi.fn(),
    },
  };
});

function makeContext(role: "tenant_owner" | "tenant_agent") {
  return {
    user: {
      id: "user-1",
      email: "user@store.co",
      displayName: "Usuario Store",
      status: "active",
      emailVerifiedAt: new Date(),
    },
    session: { id: "sess-1" },
    scope: "tenant" as const,
    role,
    effectiveRoles: [role],
    activeClientId: "11111111-1111-7111-8111-111111111111",
    activeClient: {
      id: "11111111-1111-7111-8111-111111111111",
      slug: "store",
      displayName: "Mi Tienda",
      name: "Mi Tienda",
      lifecycleStatus: "activo",
      planId: "plan-1",
    },
    activeCellId: null,
    activeCellCode: null,
    planName: "Pro",
    capabilities: {},
    lifecycleStatus: "activo",
  };
}

describe("SPEC-02 T-06 · /api/tenant/ai/settings & /verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 401 sin cookie de sesión", async () => {
    const req = new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("responde 403 Forbidden para rol tenant_agent en GET, PUT, DELETE y POST /verify", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValue(
      makeContext("tenant_agent"),
    );

    const getRes = await GET(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "GET",
        headers: { cookie: "mocter_sid=sid-agent" },
      }),
    );
    expect(getRes.status).toBe(403);

    const putRes = await PUT(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "PUT",
        headers: { cookie: "mocter_sid=sid-agent", "content-type": "application/json" },
        body: JSON.stringify({ providerCode: "openai", apiKey: "sk-1234567890" }),
      }),
    );
    expect(putRes.status).toBe(403);

    const delRes = await DELETE(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "DELETE",
        headers: { cookie: "mocter_sid=sid-agent" },
      }),
    );
    expect(delRes.status).toBe(403);

    const verifyRes = await VERIFY(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings/verify", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-agent", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(verifyRes.status).toBe(403);
  });

  it("retorna configuración enmascarada (apiKeyLast4) en GET para tenant_owner sin exponer claves descifradas", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValue(
      makeContext("tenant_owner"),
    );
    vi.mocked(domain.tenantAiSettingsService.getSettingsOverview).mockResolvedValue(
      domain.ok({
        clientId: "11111111-1111-7111-8111-111111111111",
        effectiveMode: "byok",
        inferenceSource: "byok",
        isTrialActive: false,
        trialEndsAt: null,
        activeByok: {
          id: "tap-1",
          providerId: "p-1",
          providerCode: "openai",
          providerName: "OpenAI",
          hasKey: true,
          apiKeyLast4: "4321",
          apiKeyKeyId: "key-v1",
          status: "active",
          lastVerifiedAt: "2026-11-14T10:00:00.000Z",
          lastVerificationError: null,
          selectedModelId: "m-1",
          selectedModelCode: "gpt-4o-mini",
          temperature: "0.7",
          maxTokens: 1000,
          updatedAt: "2026-11-14T10:00:00.000Z",
        },
        configuredProviders: [],
        catalog: [],
      }),
    );

    const res = await GET(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "GET",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { activeByok: { apiKeyLast4: string } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.activeByok.apiKeyLast4).toBe("4321");
  });

  it("retorna 422 cuando PUT intenta guardar una clave inválida rechazada por el proveedor", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValue(
      makeContext("tenant_owner"),
    );
    vi.mocked(domain.tenantAiSettingsService.saveSettings).mockResolvedValue(
      domain.err("La API Key fue rechazada.", "AI_KEY_VERIFICATION_FAILED"),
    );

    const res = await PUT(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "PUT",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({
          providerCode: "openai",
          modelId: "gpt-4o-mini",
          apiKey: "sk-bad-key-1234",
          verifyImmediately: true,
        }),
      }),
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("AI_KEY_VERIFICATION_FAILED");
  });

  it("verifica conectividad con POST /verify y revoca con DELETE retornando 200", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValue(
      makeContext("tenant_owner"),
    );
    vi.mocked(domain.tenantAiSettingsService.verifyStoredKey).mockResolvedValue(
      domain.ok({
        valid: true,
        providerCode: "google",
        apiKeyLast4: "9876",
        latencyMs: 145,
        verifiedAt: "2026-11-14T11:00:00.000Z",
      }),
    );
    vi.mocked(domain.tenantAiSettingsService.revokeSettings).mockResolvedValue(
      domain.ok({ revokedCount: 1 }),
    );

    const verifyRes = await VERIFY(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings/verify", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ providerCode: "google" }),
      }),
    );
    expect(verifyRes.status).toBe(200);

    const delRes = await DELETE(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings?providerCode=google", {
        method: "DELETE",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
    );
    expect(delRes.status).toBe(200);
    const delJson = (await delRes.json()) as { ok: boolean; data: { revokedCount: number } };
    expect(delJson.data.revokedCount).toBe(1);
  });

  it("acepta proveedor dinámico (ej. groq) con priorityRole='secondary' en PUT y POST /verify", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValue(
      makeContext("tenant_owner"),
    );
    vi.mocked(domain.tenantAiSettingsService.saveSettings).mockResolvedValue(
      domain.ok({
        id: "tap-groq",
        providerId: "p-groq",
        providerCode: "groq",
        providerName: "Groq Cloud",
        hasKey: true,
        apiKeyLast4: "7890",
        apiKeyKeyId: "k1",
        status: "active",
        priorityRole: "secondary",
        lastVerifiedAt: "2026-11-14T11:30:00.000Z",
        lastVerificationError: null,
        selectedModelId: "m-llama",
        selectedModelCode: "llama-3.3-70b-versatile",
        temperature: "0.55",
        maxTokens: 1500,
        updatedAt: "2026-11-14T11:30:00.000Z",
      }),
    );
    vi.mocked(domain.tenantAiSettingsService.verifyStoredKey).mockResolvedValue(
      domain.ok({
        valid: true,
        providerCode: "groq",
        apiKeyLast4: "7890",
        latencyMs: 90,
        verifiedAt: "2026-11-14T11:31:00.000Z",
      }),
    );

    const putRes = await PUT(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings", {
        method: "PUT",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({
          providerCode: "groq",
          modelId: "llama-3.3-70b-versatile",
          apiKey: "gsk-secret-key-7890",
          priorityRole: "secondary",
          temperature: 0.55,
          maxTokens: 1500,
        }),
      }),
    );
    expect(putRes.status).toBe(200);
    expect(domain.tenantAiSettingsService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCode: "groq",
        priorityRole: "secondary",
      }),
    );

    const verifyRes = await VERIFY(
      new NextRequest("http://localhost:3003/api/tenant/ai/settings/verify", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ providerCode: "groq" }),
      }),
    );
    expect(verifyRes.status).toBe(200);
  });
});
