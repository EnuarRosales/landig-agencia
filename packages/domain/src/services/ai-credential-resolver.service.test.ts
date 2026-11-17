import { describe, it, expect, vi } from "vitest";
import {
  AiCredentialResolverService,
  type IAiCredentialResolverRepository,
} from "./ai-credential-resolver.service";
import { SecretCryptoService } from "./secret-crypto.service";

const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createCrypto() {
  return new SecretCryptoService({ masterKey: TEST_MASTER_KEY, keyId: "key-v1" });
}

function createBaseRepo(
  overrides: Partial<IAiCredentialResolverRepository> = {},
): IAiCredentialResolverRepository {
  return {
    findActiveTenantByok: vi.fn(async () => null),
    findTenantSubscription: vi.fn(async () => null),
    findOnboardingSession: vi.fn(async () => null),
    findActivePlatformTrialKey: vi.fn(async () => null),
    sumMonthlyPlatformTrialTokens: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("AiCredentialResolverService", () => {
  const crypto = createCrypto();

  it("prioriza BYOK activo del inquilino sobre cualquier excepción de trial o plataforma", async () => {
    const byokEnc = crypto.encrypt("sk-tenant-byok-secret-1234");
    const platEnc = crypto.encrypt("sk-platform-trial-secret-9999");

    const repo = createBaseRepo({
      findActiveTenantByok: vi.fn(async () => ({
        providerId: "prov-openai",
        providerCode: "openai" as const,
        apiKeyCiphertext: byokEnc.ciphertext,
        apiKeyLast4: byokEnc.last4,
        modelId: "mod-4o-mini",
        modelCode: "gpt-4o-mini",
        temperature: 0.5,
        maxTokens: 800,
      })),
      findTenantSubscription: vi.fn(async () => ({
        status: "trialing",
        trialEndsAt: new Date("2026-12-01T00:00:00Z"),
      })),
      findActivePlatformTrialKey: vi.fn(async () => ({
        id: "pk-1",
        providerId: "prov-google",
        providerCode: "google" as const,
        apiKeyCiphertext: platEnc.ciphertext,
        apiKeyLast4: platEnc.last4,
        modelId: "mod-gemini",
        modelCode: "gemini-1.5-flash",
        temperature: 0.7,
        maxTokens: 1000,
        monthlyTokenCap: 50000,
      })),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredential({
      clientId: "client-1",
      userId: "user-1",
      now: new Date("2026-11-14T00:00:00Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("byok");
      expect(result.data.mode).toBe("byok");
      expect(result.data.providerCode).toBe("openai");
      expect(result.data.apiKey).toBe("sk-tenant-byok-secret-1234");
    }
    expect(repo.findActivePlatformTrialKey).not.toHaveBeenCalled();
  });

  it("resuelve clave de plataforma en modo trial cuando el inquilino está en trialing vigente y no tiene BYOK", async () => {
    const platEnc = crypto.encrypt("AIzaSyPlatformTrialKey_5678");
    const repo = createBaseRepo({
      findTenantSubscription: vi.fn(async () => ({
        status: "trialing",
        trialEndsAt: new Date("2026-11-28T00:00:00Z"),
      })),
      findActivePlatformTrialKey: vi.fn(async () => ({
        id: "pk-1",
        providerId: "prov-google",
        providerCode: "google" as const,
        apiKeyCiphertext: platEnc.ciphertext,
        apiKeyLast4: platEnc.last4,
        modelId: "mod-gemini",
        modelCode: "gemini-2.0-flash",
        temperature: 0.7,
        maxTokens: 1000,
        monthlyTokenCap: 100000,
      })),
      sumMonthlyPlatformTrialTokens: vi.fn(async () => 12500),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredential({
      clientId: "client-trial",
      userId: "user-trial",
      now: new Date("2026-11-14T12:00:00Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("platform_trial");
      expect(result.data.mode).toBe("mocter");
      expect(result.data.providerCode).toBe("google");
      expect(result.data.apiKey).toBe("AIzaSyPlatformTrialKey_5678");
    }
  });

  it("rechaza con AI_BYOK_REQUIRED cuando el periodo de trial expiró y no hay BYOK", async () => {
    const platEnc = crypto.encrypt("AIzaSyPlatformTrialKey_5678");
    const repo = createBaseRepo({
      findTenantSubscription: vi.fn(async () => ({
        status: "trialing",
        trialEndsAt: new Date("2026-11-01T00:00:00Z"),
      })),
      findActivePlatformTrialKey: vi.fn(async () => ({
        id: "pk-1",
        providerId: "prov-google",
        providerCode: "google" as const,
        apiKeyCiphertext: platEnc.ciphertext,
        apiKeyLast4: platEnc.last4,
        modelId: "mod-gemini",
        modelCode: "gemini-2.0-flash",
        temperature: 0.7,
        maxTokens: 1000,
        monthlyTokenCap: 100000,
      })),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredential({
      clientId: "client-expired",
      userId: "user-expired",
      now: new Date("2026-11-14T12:00:00Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_BYOK_REQUIRED");
    }
  });

  it("permite inferencia con clave de plataforma durante onboarding inconcluso sin BYOK y sin clientId", async () => {
    const platEnc = crypto.encrypt("sk-plat-onboarding-8888");
    const repo = createBaseRepo({
      findOnboardingSession: vi.fn(async () => ({
        status: "in_progress",
        completedAt: null,
      })),
      findActivePlatformTrialKey: vi.fn(async () => ({
        id: "pk-onb",
        providerId: "prov-openai",
        providerCode: "openai" as const,
        apiKeyCiphertext: platEnc.ciphertext,
        apiKeyLast4: platEnc.last4,
        modelId: "mod-4o-mini",
        modelCode: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 800,
        monthlyTokenCap: 50000,
      })),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredential({
      clientId: null,
      userId: "user-prospect",
      now: new Date("2026-11-14T12:00:00Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.source).toBe("platform_trial");
      expect(result.data.mode).toBe("mocter");
      expect(result.data.apiKey).toBe("sk-plat-onboarding-8888");
    }
  });

  it("bloquea con AI_RATE_LIMIT_EXCEEDED si el trial agotó el monthlyTokenCap configurado", async () => {
    const platEnc = crypto.encrypt("sk-plat-capped-7777");
    const repo = createBaseRepo({
      findTenantSubscription: vi.fn(async () => ({
        status: "trialing",
        trialEndsAt: new Date("2026-11-28T00:00:00Z"),
      })),
      findActivePlatformTrialKey: vi.fn(async () => ({
        id: "pk-cap",
        providerId: "prov-openai",
        providerCode: "openai" as const,
        apiKeyCiphertext: platEnc.ciphertext,
        apiKeyLast4: platEnc.last4,
        modelId: "mod-4o-mini",
        modelCode: "gpt-4o-mini",
        temperature: 0.7,
        maxTokens: 800,
        monthlyTokenCap: 10000,
      })),
      sumMonthlyPlatformTrialTokens: vi.fn(async () => 10500),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredential({
      clientId: "client-capped",
      now: new Date("2026-11-14T12:00:00Z"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_RATE_LIMIT_EXCEEDED");
    }
  });

  it("resuelve candidatos ordenados [primary, secondary] para failover BYOK sin mezclar claves de plataforma", async () => {
    const primaryEnc = crypto.encrypt("sk-primary-1111");
    const secondaryEnc = crypto.encrypt("sk-secondary-2222");
    const repo = createBaseRepo({
      findActiveTenantByokCandidates: vi.fn(async () => [
        {
          priorityRole: "primary" as const,
          providerId: "prov-openai",
          providerCode: "openai",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.openai.com/v1",
          verifyPath: "/models",
          apiKeyCiphertext: primaryEnc.ciphertext,
          apiKeyLast4: primaryEnc.last4,
          modelId: "mod-4o-mini",
          modelCode: "gpt-4o-mini",
          temperature: 0.5,
          maxTokens: 1200,
        },
        {
          priorityRole: "secondary" as const,
          providerId: "prov-anthropic",
          providerCode: "anthropic",
          apiDialect: "anthropic" as const,
          baseUrl: "https://api.anthropic.com/v1",
          verifyPath: "/models",
          apiKeyCiphertext: secondaryEnc.ciphertext,
          apiKeyLast4: secondaryEnc.last4,
          modelId: "mod-haiku",
          modelCode: "claude-3-5-haiku-latest",
          temperature: 0.7,
          maxTokens: 900,
        },
      ]),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredentialCandidates({
      clientId: "client-failover",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].priorityRole).toBe("primary");
      expect(result.data[0].providerCode).toBe("openai");
      expect(result.data[0].apiKey).toBe("sk-primary-1111");
      expect(result.data[1].priorityRole).toBe("secondary");
      expect(result.data[1].providerCode).toBe("anthropic");
      expect(result.data[1].apiKey).toBe("sk-secondary-2222");
    }
  });

  it("resuelve candidatos [primary, secondary] de plataforma con temperature y maxTokens propios", async () => {
    const p1 = crypto.encrypt("sk-plat-p1");
    const p2 = crypto.encrypt("sk-plat-p2");
    const repo = createBaseRepo({
      findTenantSubscription: vi.fn(async () => ({
        status: "trialing",
        trialEndsAt: new Date("2026-11-30T00:00:00Z"),
      })),
      findActivePlatformTrialKeys: vi.fn(async () => [
        {
          id: "pk-1",
          priorityRole: "primary" as const,
          providerId: "prov-openai",
          providerCode: "openai",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.openai.com/v1",
          verifyPath: "/models",
          apiKeyCiphertext: p1.ciphertext,
          apiKeyLast4: p1.last4,
          modelId: "mod-1",
          modelCode: "gpt-4o-mini",
          temperature: 0.35,
          maxTokens: 1500,
          monthlyTokenCap: 50000,
        },
        {
          id: "pk-2",
          priorityRole: "secondary" as const,
          providerId: "prov-groq",
          providerCode: "groq",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.groq.com/openai/v1",
          verifyPath: "/models",
          apiKeyCiphertext: p2.ciphertext,
          apiKeyLast4: p2.last4,
          modelId: "mod-2",
          modelCode: "llama-3.3-70b-versatile",
          temperature: 0.6,
          maxTokens: 1000,
          monthlyTokenCap: 50000,
        },
      ]),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredentialCandidates({
      clientId: "client-trial",
      now: new Date("2026-11-14T12:00:00Z"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].temperature).toBe(0.35);
      expect(result.data[0].maxTokens).toBe(1500);
      expect(result.data[1].providerCode).toBe("groq");
      expect(result.data[1].baseUrl).toBe("https://api.groq.com/openai/v1");
    }
  });

  it("permite a operadores SaaS (isPlatformScope = true) resolver directamente llaves activas de plataforma sin clientId ni trial", async () => {
    const p1 = crypto.encrypt("sk-platform-saas-1234");
    const repo = createBaseRepo({
      findActivePlatformTrialKeys: vi.fn(async () => [
        {
          id: "pk-saas",
          priorityRole: "primary" as const,
          providerId: "prov-google",
          providerCode: "google",
          apiDialect: "google_gemini" as const,
          baseUrl: null,
          verifyPath: null,
          apiKeyCiphertext: p1.ciphertext,
          apiKeyLast4: p1.last4,
          modelId: "mod-gemini",
          modelCode: "gemini-2.0-flash",
          temperature: 0.4,
          maxTokens: 1200,
          monthlyTokenCap: null,
        },
      ]),
    });

    const service = new AiCredentialResolverService(repo, crypto);
    const result = await service.resolveCredentialCandidates({
      clientId: null,
      userId: "u-platform-admin",
      isPlatformScope: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].source).toBe("platform_trial");
      expect(result.data[0].apiKey).toBe("sk-platform-saas-1234");
    }
  });
});
