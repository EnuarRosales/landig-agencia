import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { authService, assertCellProvisionAuthorization, updateCellStatus } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
    },
    assertCellProvisionAuthorization: vi.fn(),
    updateCellStatus: vi.fn(),
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

describe("POST /api/admin/cells/[id]/action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza peticiones desde un origen no administrativo con 403", async () => {
    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/action", {
      method: "POST",
      headers: { origin: "https://bad.com" },
      body: JSON.stringify({ action: "drain" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
  });

  it("actualiza el estado de la celda a draining cuando action es 'drain'", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: { id: "user-owner" } as any, session: {} as any },
    });
    vi.mocked(assertCellProvisionAuthorization).mockResolvedValue({
      ok: true,
    });
    vi.mocked(updateCellStatus).mockResolvedValue({
      ok: true,
      data: { id: "123", status: "draining" } as any,
    });

    const req = new NextRequest("http://localhost:3001/api/admin/cells/123/action", {
      method: "POST",
      headers: {
        origin: "http://localhost:3003",
        cookie: "mocter_sid=session-123",
        "x-csrf-token": "csrf-valid",
      },
      body: JSON.stringify({ action: "drain" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("draining");
  });
});
