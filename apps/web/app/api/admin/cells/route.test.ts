import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import {
  authService,
  fetchAdminCells,
  createAdminCell,
  type User,
  type Session,
} from "@mocter/domain";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    authService: {
      validateSession: vi.fn(),
    },
    fetchAdminCells: vi.fn(),
    createAdminCell: vi.fn(),
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
  method = "GET",
  origin = "http://localhost:3003",
  sid = "valid-sid",
  csrf,
  body,
}: {
  method?: string;
  origin?: string;
  sid?: string | null;
  csrf?: string;
  body?: Record<string, unknown>;
} = {}): NextRequest {
  const headers: Record<string, string> = {
    origin,
    host: "localhost:3001",
  };
  if (csrf) headers["x-csrf-token"] = csrf;

  const req = new NextRequest("http://localhost:3001/api/admin/cells", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (sid !== null && sid !== undefined) req.cookies.set("mocter_sid", sid);
  return req;
}

const mockUser = {
  id: "user-owner-001",
  email: "owner@mocter.co",
  displayName: "Platform Owner",
  status: "active",
  identityLocation: "router",
} as unknown as User;

const mockSession = {
  id: "session-001",
  userId: "user-owner-001",
} as unknown as Session;

describe("DAT-001 T1 · /api/admin/cells", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("rechaza origen distinto al subdominio admin (403)", async () => {
      const req = buildRequest({ origin: "https://evil.com" });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("INVALID_ORIGIN");
      expect(fetchAdminCells).not.toHaveBeenCalled();
    });

    it("rechaza petición sin cookie de sesión (401)", async () => {
      const req = buildRequest({ sid: null });
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe("UNAUTHORIZED");
      expect(fetchAdminCells).not.toHaveBeenCalled();
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
      expect(fetchAdminCells).not.toHaveBeenCalled();
    });

    it("devuelve la lista de celdas sin secretos cuando la sesión es válida", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { user: mockUser, session: mockSession },
      });
      vi.mocked(fetchAdminCells).mockResolvedValue([
        {
          id: "cell-001",
          code: "cell-01",
          status: "draft",
          pgbouncerHost: "pgbouncer-cell-01",
          pgbouncerPort: 6432,
          databaseName: "mocter_cell_01",
          maxClients: 100,
          currentClients: 0,
          region: "us-east-1",
        },
      ] as unknown as Awaited<ReturnType<typeof fetchAdminCells>>);

      const req = buildRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data[0]).not.toHaveProperty("cellSecretsCiphertext");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3003");
    });
  });

  describe("POST", () => {
    const validBody = {
      code: "cell-02",
      pgbouncerHost: "pgbouncer-cell-02",
      databaseName: "mocter_cell_02",
    };

    it("rechaza origen distinto al subdominio admin (403)", async () => {
      const req = buildRequest({ method: "POST", origin: "https://evil.com", body: validBody, csrf: "token" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(createAdminCell).not.toHaveBeenCalled();
    });

    it("rechaza POST sin cookie de sesión (401)", async () => {
      const req = buildRequest({ method: "POST", sid: null, body: validBody, csrf: "token" });
      const res = await POST(req);
      await res.json();

      expect(res.status).toBe(401);
      expect(createAdminCell).not.toHaveBeenCalled();
    });

    it("rechaza POST sin token CSRF (403)", async () => {
      const req = buildRequest({ method: "POST", body: validBody });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("CSRF_MISSING");
      expect(createAdminCell).not.toHaveBeenCalled();
    });

    it("rechaza POST con sesión inválida (401)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: false,
        error: "Sesión inválida",
        code: "UNAUTHORIZED",
      });

      const req = buildRequest({ method: "POST", body: validBody, csrf: "token" });
      const res = await POST(req);
      await res.json();

      expect(res.status).toBe(401);
      expect(createAdminCell).not.toHaveBeenCalled();
    });

    it("rechaza POST con body inválido (400)", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { user: mockUser, session: mockSession },
      });

      const req = buildRequest({ method: "POST", body: { code: "   " }, csrf: "token" });
      const res = await POST(req);
      await res.json();

      expect(res.status).toBe(400);
      expect(createAdminCell).not.toHaveBeenCalled();
    });

    it("crea la celda y no expone secretos cuando todo es válido", async () => {
      vi.mocked(authService.validateSession).mockResolvedValue({
        ok: true,
        data: { user: mockUser, session: mockSession },
      });
      vi.mocked(createAdminCell).mockResolvedValue({
        ok: true,
        data: {
          id: "cell-002",
          code: "cell-02",
          status: "draft",
        } as unknown as Awaited<ReturnType<typeof createAdminCell>> extends { ok: true; data: infer D } ? D : never,
      });

      const req = buildRequest({ method: "POST", body: validBody, csrf: "token" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("draft");
      expect(body.data).not.toHaveProperty("cellSecretsCiphertext");

      expect(createAdminCell).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-owner-001",
          code: "cell-02",
        }),
      );
    });
  });
});
