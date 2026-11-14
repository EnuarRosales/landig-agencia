import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok, err } from "../types/result";
import { SecretCryptoService } from "./secret-crypto.service";
import type { LlmHttpProviderClient } from "./llm-http-provider.client";

const mockSelectQueue: unknown[][] = [];
const mockUpdateWhereQueue: unknown[][] = [];
const mockInsertValues: Array<{ table: unknown; values: unknown }> = [];
const mockInsertReturningQueue: unknown[][] = [];

function createMockDb() {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        const resolveNext = () => Promise.resolve(mockSelectQueue.shift() ?? []);
        chain.where = vi.fn(() => chain);
        chain.innerJoin = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(() => resolveNext());
        chain.then = (onFulfilled: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) =>
          resolveNext().then(onFulfilled, onRejected);
        return chain;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => {
          const result = mockUpdateWhereQueue.shift() ?? [];
          return {
            returning: vi.fn(() => Promise.resolve(result)),
            then: (onFulfilled: (val: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(result).then(onFulfilled, onRejected),
          };
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        mockInsertValues.push({ table, values });
        const insertedRow = mockInsertReturningQueue.shift() ?? [values];
        return {
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
          returning: vi.fn(() => Promise.resolve(insertedRow)),
          then: (onFulfilled: (val: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(insertedRow).then(onFulfilled, onRejected),
        };
      }),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> => cb(db)),
  };
  return db;
}

const mockDb = createMockDb();

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => mockDb),
}));

import {
  saveAdminPlatformTrialKey,
  retireAdminPlatformTrialKey,
  saveAdminAssistPromptVersion,
} from "./admin-dashboard.service";

const TEST_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("SPEC-02 T-08 · Gobernanza de llaves de prueba y prompts en @mocter/domain", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockUpdateWhereQueue.length = 0;
    mockInsertValues.length = 0;
    mockInsertReturningQueue.length = 0;
    vi.clearAllMocks();
  });

  it("rechaza API keys demasiado cortas antes de consultar el proveedor", async () => {
    const res = await saveAdminPlatformTrialKey({
      providerCode: "openai",
      apiKey: "short",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION_ERROR");
    }
    expect(mockInsertValues.length).toBe(0);
  });

  it("aborta el guardado si la verificación HTTP activa falla (AI_KEY_INVALID)", async () => {
    mockSelectQueue.push(
      [{ id: "prov-1", code: "openai", name: "OpenAI", isActive: true }],
      [{ id: "mod-1", providerId: "prov-1", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", isActive: true }],
    );

    const fakeLlmClient = {
      verifyApiKey: vi.fn().mockResolvedValue(err("Clave inválida", "AI_KEY_INVALID")),
    } as unknown as LlmHttpProviderClient;

    const res = await saveAdminPlatformTrialKey(
      {
        providerCode: "openai",
        modelId: "mod-1",
        apiKey: "sk-proj-invalidkey1234",
        verifyImmediately: true,
      },
      {
        crypto: new SecretCryptoService({ masterKey: TEST_MASTER_KEY, keyId: "key-v1" }),
        llmClient: fakeLlmClient,
      },
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("AI_KEY_INVALID");
    }
    expect(mockInsertValues.length).toBe(0);
  });

  it("cifra con AES-256-GCM, retira llaves previas, inserta credencial y registra auditoría", async () => {
    const now = new Date("2026-11-14T16:00:00Z");
    mockSelectQueue.push(
      [{ id: "prov-1", code: "openai", name: "OpenAI", isActive: true }],
      [{ id: "mod-1", providerId: "prov-1", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", isActive: true }],
    );
    mockUpdateWhereQueue.push([]);
    mockInsertReturningQueue.push([
      {
        id: "pk-01",
        providerId: "prov-1",
        keyId: "trial-openai-nov",
        apiKeyLast4: "9988",
        defaultModelId: "mod-1",
        monthlyTokenCap: 250000,
        status: "active",
        purpose: "inference",
        updatedAt: now,
      },
    ]);

    const fakeLlmClient = {
      verifyApiKey: vi.fn().mockResolvedValue(ok({ valid: true, providerCode: "openai", latencyMs: 42 })),
    } as unknown as LlmHttpProviderClient;

    const crypto = new SecretCryptoService({ masterKey: TEST_MASTER_KEY, keyId: "key-v1" });

    const res = await saveAdminPlatformTrialKey(
      {
        providerCode: "openai",
        modelId: "mod-1",
        apiKey: "sk-proj-supersecret9988",
        keyId: "trial-openai-nov",
        monthlyTokenCap: 250000,
        verifyImmediately: true,
      },
      { crypto, llmClient: fakeLlmClient },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.apiKeyLast4).toBe("9988");
      expect(res.data.providerCode).toBe("openai");
      expect(res.data.defaultModelCode).toBe("gpt-4o-mini");
      expect(res.data.monthlyTokenCap).toBe(250000);
      expect(res.data.status).toBe("active");
    }

    // Verifica que lo persistido jamás contiene texto plano y usa formato AES-256-GCM v1:
    const insertedKeyRow = mockInsertValues[0]?.values as Record<string, unknown>;
    expect(String(insertedKeyRow.apiKeyCiphertext)).toMatch(/^v1:/);
    expect(String(insertedKeyRow.apiKeyCiphertext)).not.toContain("sk-proj-supersecret9988");
    expect(mockInsertValues.length).toBe(2); // aiPlatformKeys + auditLog
  });

  it("retireAdminPlatformTrialKey retorna NOT_FOUND si el id no existe y retira si existe", async () => {
    mockUpdateWhereQueue.push([]);
    const notFound = await retireAdminPlatformTrialKey({ platformKeyId: "pk-missing" });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.code).toBe("NOT_FOUND");
    }

    mockUpdateWhereQueue.push([{ id: "pk-01", keyId: "trial-openai", apiKeyLast4: "9988" }]);
    const retired = await retireAdminPlatformTrialKey({ platformKeyId: "pk-01" });
    expect(retired.ok).toBe(true);
    if (retired.ok) {
      expect(retired.data.status).toBe("retired");
    }
  });

  it("saveAdminAssistPromptVersion crea versión incrementada y activa el nuevo prompt maestro", async () => {
    mockSelectQueue.push(
      [{ fieldKey: "bot.objective", isActive: true }],
      [{ id: "ap-1", fieldKey: "bot.objective", version: 1, status: "active", inputHint: "Meta del bot", outputRules: {}, examples: [] }],
    );
    mockUpdateWhereQueue.push([]);
    mockInsertReturningQueue.push([
      { id: "ap-2", fieldKey: "bot.objective", version: 2, status: "active" },
    ]);

    const res = await saveAdminAssistPromptVersion({
      fieldKey: "bot.objective",
      masterPrompt: "Redacta objetivos medibles orientados a conversión.",
      inputHint: "Describe qué debe lograr el asistente.",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.fieldKey).toBe("bot.objective");
      expect(res.data.version).toBe(2);
    }
    const insertedPrompt = mockInsertValues[0]?.values as Record<string, unknown>;
    expect(insertedPrompt.version).toBe(2);
    expect(insertedPrompt.status).toBe("active");
  });
});
