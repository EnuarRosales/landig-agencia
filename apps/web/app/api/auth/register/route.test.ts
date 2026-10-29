import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  authService,
  GENERIC_REGISTER_SUCCESS_MESSAGE,
  MockRedisClient,
  setRedisClientForTesting,
  createMockRedisClient,
} from "@mocter/domain";
import { POST } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      register: vi.fn(),
    },
  };
});

describe("POST /api/auth/register (AUTH-001 T-08, T-12)", () => {
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
  });

  function createMockRequest(body: unknown, headers?: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3001/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3001",
        host: "localhost:3001",
        ...(headers ?? {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("responde 202 Accepted con mensaje genérico cuando el registro es exitoso", async () => {
    vi.mocked(authService.register).mockResolvedValue({
      ok: true,
      data: {
        message: GENERIC_REGISTER_SUCCESS_MESSAGE,
      },
    });

    const req = createMockRequest({
      name: "Carlos Gómez",
      email: "carlos@empresa.com",
      password: "Password123!",
      treatmentConsent: true,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.ok).toBe(true);
    expect(data.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    expect(data).not.toHaveProperty("token");
  });

  it("responde 429 Too Many Requests cuando se superan 5 registros por IP en 1 hora (AUTH-001 T-12)", async () => {
    vi.mocked(authService.register).mockResolvedValue({
      ok: true,
      data: {
        message: GENERIC_REGISTER_SUCCESS_MESSAGE,
      },
    });

    const validPayload = {
      name: "Carlos Gómez",
      email: "carlos@empresa.com",
      password: "Password123!",
      treatmentConsent: true,
    };

    // 5 registros permitidos
    for (let i = 0; i < 5; i++) {
      const res = await POST(createMockRequest(validPayload));
      expect(res.status).toBe(202);
    }

    // 6to registro bloqueado
    const resBlocked = await POST(createMockRequest(validPayload));
    const dataBlocked = await resBlocked.json();

    expect(resBlocked.status).toBe(429);
    expect(dataBlocked.ok).toBe(false);
    expect(dataBlocked.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(resBlocked.headers.get("Retry-After")).toBeDefined();
    const retryAfter = Number(resBlocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("responde 503 Service Unavailable (Fail-Closed) si Redis no está disponible", async () => {
    mockRedis.simulateFailure(true);

    const req = createMockRequest({
      name: "Carlos Gómez",
      email: "carlos@empresa.com",
      password: "Password123!",
      treatmentConsent: true,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.code).toBe("REDIS_UNAVAILABLE");
  });

  it("responde 422 Unprocessable Entity cuando falla la validación o falta consentimiento", async () => {
    vi.mocked(authService.register).mockResolvedValue({
      ok: false,
      error: "Los datos ingresados no cumplen con las políticas de registro.",
      code: "VALIDATION_ERROR",
      issues: [
        {
          code: "custom",
          message: "Debe autorizar el tratamiento de datos personales.",
          path: ["treatmentConsent"],
        },
      ],
    });

    const req = createMockRequest({
      name: "Carlos Gómez",
      email: "carlos@empresa.com",
      password: "Password123!",
      treatmentConsent: false,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("políticas de registro");
    expect(data.issues).toBeDefined();
  });

  it("responde 400 Bad Request cuando la carga JSON está malformada", async () => {
    const req = new NextRequest("http://localhost:3001/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3001",
      },
      body: "{ not a json }",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("JSON requerido");
  });

  it("responde 403 Forbidden cuando el origen no es autorizado", async () => {
    const req = createMockRequest(
      {
        name: "Carlos",
        email: "carlos@empresa.com",
        password: "Pass!",
      },
      {
        origin: "https://sitio-malicioso.com",
        host: "mocter.co",
      },
    );

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Origen no autorizado");
  });
});
