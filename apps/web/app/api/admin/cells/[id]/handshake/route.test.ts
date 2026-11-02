import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { authService, assertCellProvisionAuthorization } from "@mocter/domain";

const mockExecuteHandshake = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
    },
    assertCellProvisionAuthorization: vi.fn(),
    CellHandshakeService: class {
      executeHandshake = mockExecuteHandshake;
    },
  };
});

vi.mock("@/lib/logger", () => ({
  getRequestLogger: vi.fn().mockResolvedValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("POST /api/admin/cells/[id]/handshake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza peticiones desde un origen no administrativo con 403", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/handshake", {
      method: "POST",
      headers: { origin: "https://malicious-site.com" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ORIGIN");
  });

  it("rechaza peticiones sin sesión con 401", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/handshake", {
      method: "POST",
      headers: { origin: "http://localhost:3003" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(401);
  });

  it("rechaza peticiones sin encabezado CSRF con 403", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/handshake", {
      method: "POST",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
      },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CSRF_MISSING");
  });

  it("rechaza si el usuario no tiene autoridad de platform_owner / cells.provision", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: { id: "user-normal", email: "test@example.com" } as any, session: {} as any },
    });

    vi.mocked(assertCellProvisionAuthorization).mockResolvedValue({
      ok: false,
      error: "Acceso denegado: se requiere rol de Platform Owner.",
    });

    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/handshake", {
      method: "POST",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
        "x-csrf-token": "csrf-valid",
      },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
  });

  it("ejecuta el handshake y retorna 200 con el diagnóstico cuando está autorizado", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: { id: "user-owner", email: "owner@mocter.co" } as any, session: {} as any },
    });

    vi.mocked(assertCellProvisionAuthorization).mockResolvedValue({
      ok: true,
    });

    const mockResult = {
      ok: true,
      status: "active" as const,
      cellId: "123",
      code: "cell-02",
      diagnostic: {
        ok: true,
        checkedAt: new Date().toISOString(),
        db: { ok: true, latencyMs: 5 },
        app: { ok: true, latencyMs: 12 },
      },
    };

    mockExecuteHandshake.mockResolvedValue(mockResult);

    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/handshake", {
      method: "POST",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
        "x-csrf-token": "csrf-valid",
      },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("active");
  });
});
