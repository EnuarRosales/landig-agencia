import { describe, it, expect, vi, beforeEach } from "vitest";
import * as domain from "@mocter/domain";
import { GET } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and healthy when database is reachable", async () => {
    vi.mocked(domain.checkDatabaseConnection).mockResolvedValue({
      ok: true,
      latencyMs: 3,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.services.database.status).toBe("up");
    expect(data.services.database.latencyMs).toBe(3);
  });

  it("returns 503 and unhealthy when database connection fails", async () => {
    vi.mocked(domain.checkDatabaseConnection).mockResolvedValue({
      ok: false,
      latencyMs: 15,
      error: "Connection timeout",
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.services.database.status).toBe("down");
    expect(data.services.database.error).toBe("Connection timeout");
  });

  it("rechaza con 401 si HANDSHAKE_SECRET está configurado y no se envía la cabecera (CEL-RF-013)", async () => {
    process.env.HANDSHAKE_SECRET = "top-secret-handshake-token";
    try {
      const response = await GET();
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("X-Mocter-Handshake-Secret");
    } finally {
      delete process.env.HANDSHAKE_SECRET;
    }
  });

  it("rechaza con 401 si la cabecera X-Mocter-Handshake-Secret no coincide en tiempo constante", async () => {
    process.env.HANDSHAKE_SECRET = "top-secret-handshake-token";
    try {
      const mockReq = {
        headers: new Headers({
          "x-mocter-handshake-secret": "wrong-secret-token",
        }),
      } as any;

      const response = await GET(mockReq);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("inválido");
    } finally {
      delete process.env.HANDSHAKE_SECRET;
    }
  });

  it("responde 200 cuando se envía el handshake secret correcto", async () => {
    process.env.HANDSHAKE_SECRET = "top-secret-handshake-token";
    process.env.CELL_CODE = "cell-01";
    try {
      vi.mocked(domain.checkDatabaseConnection).mockResolvedValue({
        ok: true,
        latencyMs: 2,
      });

      const mockReq = {
        headers: new Headers({
          "x-mocter-handshake-secret": "top-secret-handshake-token",
        }),
      } as any;

      const response = await GET(mockReq);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("healthy");
      expect(data.mode).toBe("cell");
      expect(data.cellCode).toBe("cell-01");
    } finally {
      delete process.env.HANDSHAKE_SECRET;
      delete process.env.CELL_CODE;
    }
  });
});
