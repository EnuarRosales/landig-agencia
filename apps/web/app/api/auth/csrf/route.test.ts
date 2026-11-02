import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { authService, type User, type Session } from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
    },
  };
});

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "development",
    NEXT_PUBLIC_ADMIN_URL: "http://localhost:3003",
  },
}));

vi.mock("@/lib/logger", () => ({
  getRequestLogger: vi.fn().mockResolvedValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/logger/serialize-error", () => ({
  serializeError: vi.fn((e) => String(e)),
}));

function buildRequest({
  origin = "http://localhost:3003",
  sid = "valid-sid",
  csrf = "valid-csrf",
}: {
  origin?: string;
  sid?: string | null;
  csrf?: string | null;
} = {}): NextRequest {
  const req = new NextRequest("http://localhost:3001/api/auth/csrf", {
    method: "GET",
    headers: { origin, host: "localhost:3001" },
  });
  if (sid !== null && sid !== undefined) req.cookies.set("mocter_sid", sid);
  if (csrf !== null && csrf !== undefined) req.cookies.set("mocter_csrf", csrf);
  return req;
}

const mockUser = { id: "user-owner-001", email: "owner@mocter.co" } as unknown as User;
const mockSession = { id: "session-001", userId: "user-owner-001" } as unknown as Session;

describe("DAT-001 T1 · /api/auth/csrf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza origen distinto al subdominio admin (403)", async () => {
    const req = buildRequest({ origin: "https://evil.com" });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe("INVALID_ORIGIN");
    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it("rechaza petición sin cookie de sesión (401)", async () => {
    const req = buildRequest({ sid: null });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("rechaza sesión inválida (401)", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: false,
      error: "Sesión inválida",
      code: "UNAUTHORIZED",
    });

    const req = buildRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("rechaza si no hay cookie CSRF disponible (403)", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: mockUser, session: mockSession },
    });

    const req = buildRequest({ csrf: null });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe("CSRF_UNAVAILABLE");
  });

  it("devuelve el token CSRF cuando la sesión es válida", async () => {
    vi.mocked(authService.validateSession).mockResolvedValue({
      ok: true,
      data: { user: mockUser, session: mockSession },
    });

    const req = buildRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.csrfToken).toBe("valid-csrf");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3003");
  });
});
