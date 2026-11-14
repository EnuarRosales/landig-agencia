import { describe, it, expect, vi } from "vitest";
import {
  TenantAiSettingsService,
  type ITenantAiSettingsRepository,
} from "./tenant-ai-settings.service";
import { SecretCryptoService } from "./secret-crypto.service";
import { LlmHttpProviderClient } from "./llm-http-provider.client";

const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createRepoMock(
  overrides: Partial<ITenantAiSettingsRepository> = {},
): ITenantAiSettingsRepository {
  return {
    getOverviewData: vi.fn(async () => ({
      providers: [
        { id: "p-openai", code: "openai" as const, name: "OpenAI", docsUrl: "https://platform.openai.com" },
      ],
      models: [
        {
          id: "m-4o-mini",
          providerId: "p-openai",
          modelId: "gpt-4o-mini",
          displayName: "GPT-4o mini",
          defaultTemperature: "0.7",
          defaultMaxTokens: 1000,
          maxOutputTokens: 16384,
          contextWindow: 128000,
        },
      ],
      tenantProviders: [],
      modelSettings: [],
      subscription: { status: "active", trialEndsAt: null },
    })),
    findProviderByCode: vi.fn(async () => ({
      id: "p-openai",
      code: "openai" as const,
      name: "OpenAI",
    })),
    findModelForProvider: vi.fn(async () => ({
      id: "m-4o-mini",
      modelId: "gpt-4o-mini",
      defaultTemperature: "0.7",
      defaultMaxTokens: 1000,
    })),
    findTenantProviderForVerification: vi.fn(async () => null),
    upsertTenantProviderAndModel: vi.fn(async (params) => ({
      id: "tap-1",
      apiKeyLast4: params.encrypted?.last4 ?? "1234",
      apiKeyKeyId: params.encrypted?.keyId ?? "key-v1",
      status: "active",
      lastVerifiedAt: params.verifiedAt ?? null,
    })),
    updateTenantProviderVerification: vi.fn(async () => undefined),
    revokeTenantProviders: vi.fn(async () => 1),
    writeAuditLog: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("TenantAiSettingsService", () => {
  const crypto = new SecretCryptoService({ masterKey: TEST_MASTER_KEY, keyId: "key-v1" });

  it("cifra la API Key al guardar con verificación exitosa y jamás expone la llave original", async () => {
    const repo = createRepoMock();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const llm = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });

    const service = new TenantAiSettingsService(repo, crypto, llm);
    const res = await service.saveSettings({
      clientId: "client-1",
      actorUserId: "user-1",
      actorRole: "tenant_owner",
      actorEmail: "owner@store.co",
      providerCode: "openai",
      modelId: "m-4o-mini",
      apiKey: "sk-proj-supersecret-9876",
      verifyImmediately: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.apiKeyLast4).toBe("9876");
      expect(res.data.hasKey).toBe(true);
      expect(res.data.status).toBe("active");
      expect(JSON.stringify(res.data)).not.toContain("sk-proj-supersecret-9876");
    }

    const upsertCall = (repo.upsertTenantProviderAndModel as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(upsertCall.encrypted.ciphertext).toMatch(/^v1:/);
    expect(crypto.decrypt(upsertCall.encrypted.ciphertext)).toBe("sk-proj-supersecret-9876");
    expect(repo.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant_ai_byok_updated",
        clientId: "client-1",
      }),
    );
  });

  it("rechaza con AI_KEY_VERIFICATION_FAILED sin guardar cuando verifyImmediately falla con HTTP 401", async () => {
    const repo = createRepoMock();
    const fetchMock = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    const llm = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });

    const service = new TenantAiSettingsService(repo, crypto, llm);
    const res = await service.saveSettings({
      clientId: "client-1",
      actorRole: "tenant_owner",
      actorEmail: "owner@store.co",
      providerCode: "openai",
      modelId: "m-4o-mini",
      apiKey: "sk-invalid-key-0000",
      verifyImmediately: true,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("AI_KEY_VERIFICATION_FAILED");
    }
    expect(repo.upsertTenantProviderAndModel).not.toHaveBeenCalled();
  });

  it("marca credencial como invalid cuando verifyStoredKey detecta rechazo 401 en el proveedor", async () => {
    const enc = crypto.encrypt("sk-revoked-1234");
    const repo = createRepoMock({
      findTenantProviderForVerification: vi.fn(async () => ({
        id: "tap-1",
        providerId: "p-openai",
        providerCode: "openai" as const,
        apiKeyCiphertext: enc.ciphertext,
        apiKeyLast4: "1234",
        status: "active",
      })),
    });
    const fetchMock = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    const llm = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });

    const service = new TenantAiSettingsService(repo, crypto, llm);
    const res = await service.verifyStoredKey({
      clientId: "client-1",
      actorRole: "tenant_owner",
      actorEmail: "owner@store.co",
      providerCode: "openai",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("AI_KEY_INVALID");
    }
    expect(repo.updateTenantProviderVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tap-1",
        status: "invalid",
        lastVerificationError: "AI_KEY_INVALID",
      }),
    );
  });

  it("revoca credenciales BYOK mediante soft-delete y registra evento en audit_log", async () => {
    const repo = createRepoMock();
    const service = new TenantAiSettingsService(repo, crypto, new LlmHttpProviderClient());

    const res = await service.revokeSettings({
      clientId: "client-1",
      actorUserId: "user-1",
      actorRole: "tenant_owner",
      actorEmail: "owner@store.co",
      providerCode: "openai",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.revokedCount).toBe(1);
    }
    expect(repo.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant_ai_byok_revoked",
      }),
    );
  });

  it("permite configurar un proveedor dinámico (ej. groq) como secundario pasando apiDialect/baseUrl/verifyPath", async () => {
    const repo = createRepoMock({
      findProviderByCode: vi.fn(async () => ({
        id: "p-groq",
        code: "groq",
        name: "Groq Cloud",
        apiDialect: "openai_compatible" as const,
        baseUrl: "https://api.groq.com/openai/v1",
        verifyPath: "/models",
        logoUrl: null,
      })),
      findModelForProvider: vi.fn(async () => ({
        id: "m-llama",
        modelId: "llama-3.3-70b-versatile",
        defaultTemperature: "0.6",
        defaultMaxTokens: 1200,
      })),
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const llm = new LlmHttpProviderClient({ fetchFn: fetchMock as unknown as typeof fetch });
    const service = new TenantAiSettingsService(repo, crypto, llm);

    const res = await service.saveSettings({
      clientId: "client-1",
      actorUserId: "user-1",
      actorRole: "tenant_owner",
      actorEmail: "owner@store.co",
      providerCode: "groq",
      modelId: "llama-3.3-70b-versatile",
      apiKey: "gsk-valid-secret-9999",
      priorityRole: "secondary",
      temperature: 0.55,
      maxTokens: 1500,
      verifyImmediately: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.providerCode).toBe("groq");
      expect(res.data.priorityRole).toBe("secondary");
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
    expect(repo.upsertTenantProviderAndModel).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityRole: "secondary",
        temperature: "0.55",
        maxTokens: 1500,
      }),
    );
  });
});
