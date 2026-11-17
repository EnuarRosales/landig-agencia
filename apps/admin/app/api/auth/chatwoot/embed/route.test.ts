import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockResolveAuthenticatedPortalContext = vi.fn();
const mockGetDb = vi.fn();
const mockWithTenantCellTransaction = vi.fn();
const mockEnsureMemberUserInAccount = vi.fn();
const mockGetUserSsoLoginUrl = vi.fn();

vi.mock("@mocter/domain", async () => {
  const actual = await vi.importActual<typeof import("@mocter/domain")>("@mocter/domain");
  const testEmbedService = new actual.TenantChatwootEmbedService({
    findAccountByClientId: async () => {
      const db = mockGetDb();
      const rows = await db
        .select({
          state: actual.chatwootAccounts.state,
          chatwootAccountId: actual.chatwootAccounts.chatwootAccountId,
        })
        .from(actual.chatwootAccounts)
        .where(actual.eq(actual.chatwootAccounts.clientId, "c-1"))
        .limit(1);
      return rows?.[0] ?? null;
    },
    findCellMembership: async (clientId: string) => {
      return await mockWithTenantCellTransaction(clientId, async (tx: {
        select: (cols: unknown) => {
          from: (tbl: unknown) => {
            where: (cond: unknown) => {
              orderBy: (ord: unknown) => {
                limit: (n: number) => Promise<Array<{ status: string; grantChatwootAccess: boolean }>>;
              };
            };
          };
        };
      }) => {
        const rows = await tx
          .select({
            status: actual.cellTenantUsers.status,
            grantChatwootAccess: actual.cellTenantUsers.grantChatwootAccess,
          })
          .from(actual.cellTenantUsers)
          .where(actual.and(actual.eq(actual.cellTenantUsers.clientId, clientId)))
          .orderBy(actual.desc(actual.cellTenantUsers.joinedAt))
          .limit(1);
        return rows?.[0] ?? null;
      });
    },
    updateCellChatwootAgentId: vi.fn().mockResolvedValue(undefined),
    createGateway: () => ({
      createAccount: vi.fn(),
      ensureServiceUser: vi.fn(),
      ensureWebchatInbox: vi.fn(),
      ensureMemberUserInAccount: mockEnsureMemberUserInAccount,
      getUserSsoLoginUrl: mockGetUserSsoLoginUrl,
    }),
  });

  return {
    resolveAuthenticatedPortalContext: (...args: unknown[]) =>
      mockResolveAuthenticatedPortalContext(...args),
    getDb: () => mockGetDb(),
    withTenantCellTransaction: (...args: unknown[]) => mockWithTenantCellTransaction(...args),
    chatwootAccounts: {
      clientId: "client_id",
      state: "state",
      chatwootAccountId: "chatwoot_account_id",
    },
    cellTenantUsers: {
      clientId: "client_id",
      userId: "user_id",
      status: "status",
      grantChatwootAccess: "grant_chatwoot_access",
      joinedAt: "joined_at",
    },
    and: vi.fn(),
    desc: vi.fn(),
    eq: vi.fn(),
    ChatwootHttpPlatformGateway: vi.fn().mockImplementation(() => ({
      ensureMemberUserInAccount: mockEnsureMemberUserInAccount,
      getUserSsoLoginUrl: mockGetUserSsoLoginUrl,
    })),
    tenantChatwootEmbedService: testEmbedService,
    appLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe("apps/admin · GET /api/auth/chatwoot/embed (CHW-002 T-06, SPEC-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 400 con RFC 9457 cuando scope es inválido sin invocar Chatwoot", async () => {
    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=invalido", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body.title).toBe("BAD_REQUEST");
    expect(mockEnsureMemberUserInAccount).not.toHaveBeenCalled();
    expect(mockGetUserSsoLoginUrl).not.toHaveBeenCalled();
  });

  it("responde 401 con RFC 9457 cuando no hay cookie de sesión", async () => {
    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body.title).toBe("UNAUTHORIZED");
  });

  it("responde 403 cuando el inquilino no tiene la capacidad chatwoot_inboxes", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-1", email: "agent@store.com", roles: ["tenant_agent"] },
      activeClient: { id: "c-1", ownerUserId: "u-owner" },
      capabilities: { chatwoot_inboxes: false },
    });

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe("FORBIDDEN");
    expect(body.detail).toContain("buzones de atención");
  });

  it("responde 404 cuando la cuenta de Chatwoot no está activa", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-1", email: "agent@store.com", roles: ["tenant_agent"] },
      activeClient: { id: "c-1", ownerUserId: "u-owner" },
      capabilities: { chatwoot_inboxes: true },
    });

    mockGetDb.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ state: "provisioning", chatwootAccountId: null }]),
          }),
        }),
      }),
    });

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe("NOT_FOUND");
  });

  it("modo workspace: rechaza con HTTP 403 CHATWOOT_ACCOUNT_MISMATCH cuando se fuerza un ?accountId ajeno", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-1", email: "owner@store.com", displayName: "Dueño Store" },
      activeClient: { id: "c-1", ownerUserId: "u-1" },
      capabilities: { chatwoot_inboxes: true },
      role: "tenant_owner",
    });

    mockGetDb.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ state: "active", chatwootAccountId: 42 }]),
          }),
        }),
      }),
    });

    const req = new NextRequest(
      "http://localhost:3003/api/auth/chatwoot/embed?scope=workspace&accountId=99",
      { headers: { cookie: "mocter_sid=sid-test" } },
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("CHATWOOT_ACCOUNT_MISMATCH");
    expect(mockEnsureMemberUserInAccount).not.toHaveBeenCalled();
  });

  it("modo workspace: resuelve usuario, rol y redirige con HTTP 307 al dashboard de la cuenta sin puerto :3001", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-1", email: "owner@store.com", displayName: "Dueño Store", roles: ["tenant_owner"] },
      activeClient: { id: "c-1", ownerUserId: "u-1" },
      capabilities: { chatwoot_inboxes: true },
      role: "tenant_owner",
    });

    mockGetDb.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ state: "active", chatwootAccountId: 88 }]),
          }),
        }),
      }),
    });

    mockEnsureMemberUserInAccount.mockResolvedValueOnce({ userId: 501 });
    mockGetUserSsoLoginUrl.mockResolvedValueOnce({
      url: "http://rails:3000/app/login?email=owner%40store.com&sso_auth_token=tok-sso-88",
    });

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeDefined();
    expect(location).toContain("/app/login?email=owner%40store.com");
    expect(location).toContain("sso_auth_token=tok-sso-88");
    expect(location).toContain("redirect_to=%2Fapp%2Faccounts%2F88%2Fdashboard");
    expect(location).not.toContain("localhost:3001");

    expect(mockEnsureMemberUserInAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 88,
        email: "owner@store.com",
        role: "administrator",
      }),
    );
  });

  it("modo workspace: retorna 502 BAD_GATEWAY RFC 9457 sin exponer secretos cuando el servidor SSO falla", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-1", email: "owner@store.com", displayName: "Dueño Store" },
      activeClient: { id: "c-1", ownerUserId: "u-1" },
      capabilities: { chatwoot_inboxes: true },
      role: "tenant_owner",
    });

    mockGetDb.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ state: "active", chatwootAccountId: 88 }]),
          }),
        }),
      }),
    });

    mockEnsureMemberUserInAccount.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:3000"));

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body.title).toBe("BAD_GATEWAY");
    expect(body.code).toBe("CHATWOOT_SSO_UNAVAILABLE");
    expect(body.detail).not.toContain("ECONNREFUSED");
  });

  it("modo admin: responde 403 si el usuario no es platform_owner ni platform_admin", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-2", email: "client@store.com", roles: ["tenant_owner"] },
      activeClient: { id: "c-2", ownerUserId: "u-2" },
      capabilities: { chatwoot_inboxes: true },
    });

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=admin", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe("FORBIDDEN");
  });

  it("modo admin: redirige con HTTP 307 con SSO de super admin hacia targetPath", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-owner", email: "admin@mocter.co", roles: ["platform_owner"] },
      role: "platform_owner",
    });

    mockGetUserSsoLoginUrl.mockResolvedValueOnce({
      url: "http://rails:3000/app/login?email=admin%40mocter.co&sso_auth_token=super-token-1",
    });

    const req = new NextRequest(
      "http://localhost:3003/api/auth/chatwoot/embed?scope=admin&targetPath=/super_admin/accounts/12",
      { headers: { cookie: "mocter_sid=sid-test" } },
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeDefined();
    expect(location).toContain("/super_admin/accounts/12");
    expect(location).toContain("sso_auth_token=super-token-1");
    expect(location).toContain("email=admin%40mocter.co");
  });

  it("modo admin: neutraliza rutas no permitidas o de open redirect forzando /super_admin", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-owner", email: "admin@mocter.co", roles: ["platform_owner"] },
      role: "platform_owner",
    });

    mockGetUserSsoLoginUrl.mockResolvedValueOnce({
      url: "http://rails:3000/app/login?email=admin%40mocter.co&sso_auth_token=super-token-1",
    });

    const req = new NextRequest(
      "http://localhost:3003/api/auth/chatwoot/embed?scope=admin&targetPath=/super_admin.attacker.com",
      { headers: { cookie: "mocter_sid=sid-test" } },
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeDefined();
    expect(location).toContain("/super_admin");
    expect(location).not.toContain("attacker.com");
  });

  it("modo workspace: bloquea con HTTP 403 a un tenant_agent con grantChatwootAccess=false (SPEC-12)", async () => {
    mockResolveAuthenticatedPortalContext.mockResolvedValueOnce({
      user: { id: "u-agent-1", email: "agent@store.com", displayName: "Agente" },
      activeClient: { id: "c-1", ownerUserId: "u-owner" },
      capabilities: { chatwoot_inboxes: true },
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
    });

    mockGetDb.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ state: "active", chatwootAccountId: 88 }]),
          }),
        }),
      }),
    });

    mockWithTenantCellTransaction.mockImplementationOnce(
      async (_clientId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ status: "active", grantChatwootAccess: false }]),
              }),
            }),
          }),
        }),
      };
      return await fn(fakeTx);
    });

    const req = new NextRequest("http://localhost:3003/api/auth/chatwoot/embed?scope=workspace", {
      headers: { cookie: "mocter_sid=sid-test" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("bandeja de atención");
  });
});
