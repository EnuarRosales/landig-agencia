import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { authService, assertCellProvisionAuthorization } from "@mocter/domain";

const mockGenerateManifest = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
    },
    assertCellProvisionAuthorization: vi.fn(),
    CellManifestService: class {
      generateManifest = mockGenerateManifest;
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

describe("GET /api/admin/cells/[id]/manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza peticiones desde un origen no administrativo con 403", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/manifest", {
      method: "GET",
      headers: { origin: "https://unknown.com" },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
  });

  it("rechaza peticiones sin sesión con 401", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/manifest", {
      method: "GET",
      headers: { origin: "http://localhost:3003" },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(401);
  });

  it("rechaza usuarios sin el scope cells.provision", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: { id: "user-agent" } as any, session: {} as any },
    });
    vi.mocked(assertCellProvisionAuthorization).mockResolvedValue({
      ok: false,
      error: "Acceso denegado.",
    });

    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/manifest", {
      method: "GET",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
  });

  it("retorna 200 con el manifiesto para usuarios autorizados", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: { id: "user-owner" } as any, session: {} as any },
    });
    vi.mocked(assertCellProvisionAuthorization).mockResolvedValue({
      ok: true,
    });

    const mockManifest = {
      cellId: "123",
      code: "cell-02",
      workingDir: "/opt/cell-02",
      deployUser: "deploy:1000",
      envContent: "CELL_CODE=cell-02",
      dockerComposeContent: "version: '3.8'",
      instructions: ["Paso 1"],
    };
    mockGenerateManifest.mockResolvedValue(mockManifest);

    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/manifest", {
      method: "GET",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.code).toBe("cell-02");
  });
});
