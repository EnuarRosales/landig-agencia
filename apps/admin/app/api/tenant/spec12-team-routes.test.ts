import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import { GET as getTeam } from "./team/route";
import { POST as postInvite } from "./team/invite/route";
import { POST as postResend } from "./team/invitations/[id]/resend/route";
import { DELETE as deleteInvitation } from "./team/invitations/[id]/route";
import { PATCH as patchMember, DELETE as deleteMember } from "./team/[id]/route";
import { PATCH as patchMemberStatus } from "./team/[id]/status/route";
import { GET as getAcceptInvite, POST as postAcceptInvite } from "./team/accept-invite/route";

const { mockTeamService } = vi.hoisted(() => ({
  mockTeamService: {
    listTeamAndInvitations: vi.fn(),
    issueInvitation: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    getInvitationPreview: vi.fn(),
    acceptTeamInvitation: vi.fn(),
    updateMemberProfile: vi.fn(),
    updateMemberStatus: vi.fn(),
    retireMember: vi.fn(),
    dispatchInvitationEmail: vi.fn(async () => undefined),
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((fn: () => void) => fn()),
  };
});

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    getTenantContactsAndUsersService: vi.fn(() => mockTeamService),
    syncTenantMemberChatwootAccess: vi.fn(async () => ({ synced: true, chatwootUserId: 91 })),
    removeTenantMemberChatwootAccess: vi.fn(async () => ({ removed: true })),
    authService: {
      ...actual.authService,
      issueSessionForUserById: vi.fn(),
    },
  };
});

const OWNER_CTX: domain.PortalContext = {
  scope: "tenant",
  user: {
    id: "u-owner",
    email: "owner@tienda.co",
    displayName: "Carlos Owner",
    status: "active",
    emailVerifiedAt: null,
  },
  session: { id: "s-owner" },
  activeClientId: "c-1",
  activeClient: {
    id: "c-1",
    name: "Tienda Sol",
    displayName: "Tienda Sol",
    slug: "tienda-sol",
    lifecycleStatus: "activo",
    planId: "plan-pro",
  },
  activeCellId: "cell-1",
  activeCellCode: "cell-01",
  planName: "Plan Pro",
  lifecycleStatus: "activo",
  role: "tenant_owner",
  effectiveRoles: ["tenant_owner"],
  capabilities: {},
};

const AGENT_CTX: domain.PortalContext = {
  scope: "tenant",
  user: {
    id: "u-agent",
    email: "agent@tienda.co",
    displayName: "Andrea",
    status: "active",
    emailVerifiedAt: null,
  },
  session: { id: "s-agent" },
  activeClientId: "c-1",
  activeClient: {
    id: "c-1",
    name: "Tienda Sol",
    displayName: "Tienda Sol",
    slug: "tienda-sol",
    lifecycleStatus: "activo",
    planId: "plan-pro",
  },
  activeCellId: "cell-1",
  activeCellCode: "cell-01",
  planName: "Plan Pro",
  lifecycleStatus: "activo",
  role: "tenant_agent",
  effectiveRoles: ["tenant_agent"],
  capabilities: {},
};

const VALID_UUID = "019b0000-0000-7000-8000-000000000001";

describe("SPEC-12 · /api/tenant/team/* Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/tenant/team exige sesión (401) y delega viewerRole según rol", async () => {
    const unauthReq = new NextRequest("http://localhost:3003/api/tenant/team");
    const unauthRes = await getTeam(unauthReq);
    expect(unauthRes.status).toBe(401);

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(AGENT_CTX);
    mockTeamService.listTeamAndInvitations.mockResolvedValueOnce({
      members: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      invitations: [],
      quota: {
        tenantUsers: { usedActive: 1, pendingInvitations: 0, totalConsumed: 1, limit: 5, mode: "LIMITED" },
        chatwootAgents: { usedActive: 1, pendingInvitations: 0, totalConsumed: 1, limit: 5, mode: "LIMITED" },
      },
    });

    const agentReq = new NextRequest("http://localhost:3003/api/tenant/team?page=1&limit=10", {
      headers: { cookie: "mocter_sid=sid-agent" },
    });
    const agentRes = await getTeam(agentReq);
    expect(agentRes.status).toBe(200);
    expect(mockTeamService.listTeamAndInvitations).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({ viewerRole: "tenant_agent", page: 1, limit: 10 }),
    );
  });

  it("POST /api/tenant/team/invite bloquea a tenant_agent (403) y rechaza email inválido (400)", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(AGENT_CTX);
    const agentRes = await postInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/invite", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-agent", "content-type": "application/json" },
        body: JSON.stringify({ email: "andrea@tienda.co" }),
      }),
    );
    expect(agentRes.status).toBe(403);

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    const badRes = await postInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/invite", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ email: "no-valido" }),
      }),
    );
    expect(badRes.status).toBe(400);
    expect(badRes.headers.get("content-type")).toContain("application/problem+json");
  });

  it("POST /api/tenant/team/invite mapea cuota agotada a 422 TEAM_QUOTA_EXCEEDED y crea invitación (201)", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.issueInvitation.mockResolvedValueOnce({
      ok: false,
      error: "Límite alcanzado",
      code: "QUOTA_EXCEEDED",
    });

    const quotaRes = await postInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/invite", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ email: "andrea@tienda.co" }),
      }),
    );
    expect(quotaRes.status).toBe(422);
    const quotaJson = await quotaRes.json();
    expect(quotaJson.code).toBe("TEAM_QUOTA_EXCEEDED");

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.issueInvitation.mockResolvedValueOnce({
      ok: true,
      data: {
        invitation: {
          id: VALID_UUID,
          email: "andrea@tienda.co",
          displayName: "Andrea",
          role: "tenant_agent",
          grantChatwootAccess: true,
          status: "pending",
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
        rawToken: "raw-tok-123",
      },
    });

    const okRes = await postInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/invite", {
        method: "POST",
        headers: {
          cookie: "mocter_sid=sid-owner",
          "content-type": "application/json",
          host: "admin.mocter.co",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ email: "andrea@tienda.co", displayName: "Andrea", grantChatwootAccess: true }),
      }),
    );
    expect(okRes.status).toBe(201);
    expect(mockTeamService.dispatchInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "andrea@tienda.co",
        rawToken: "raw-tok-123",
        baseUrl: "https://admin.mocter.co",
      }),
    );
  });

  it("POST /resend y DELETE /invitations/[id] exigen owner y validan UUID", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.resendInvitation.mockResolvedValueOnce({
      ok: true,
      data: {
        invitation: {
          id: VALID_UUID,
          email: "luis@tienda.co",
          displayName: "Luis",
          status: "pending",
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
        rawToken: "new-tok-456",
      },
    });

    const resendRes = await postResend(
      new NextRequest(`http://localhost:3003/api/tenant/team/invitations/${VALID_UUID}/resend`, {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(resendRes.status).toBe(200);
    expect(mockTeamService.dispatchInvitationEmail).toHaveBeenCalled();

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    const badDel = await deleteInvitation(
      new NextRequest("http://localhost:3003/api/tenant/team/invitations/not-a-uuid", {
        method: "DELETE",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(badDel.status).toBe(400);

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.revokeInvitation.mockResolvedValueOnce({ ok: true, data: true });
    const okDel = await deleteInvitation(
      new NextRequest(`http://localhost:3003/api/tenant/team/invitations/${VALID_UUID}`, {
        method: "DELETE",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(okDel.status).toBe(200);
  });

  it("PATCH /[id], PATCH /[id]/status y DELETE /[id] protegen owner (422) y sincronizan Chatwoot en after()", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.updateMemberProfile.mockResolvedValueOnce({
      ok: false,
      error: "No puede degradarse",
      code: "LAST_OWNER_CANNOT_BE_REMOVED",
    });

    const ownerPatchRes = await patchMember(
      new NextRequest(`http://localhost:3003/api/tenant/team/${VALID_UUID}`, {
        method: "PATCH",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ role: "tenant_agent" }),
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(ownerPatchRes.status).toBe(422);

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.updateMemberStatus.mockResolvedValueOnce({
      ok: true,
      data: {
        member: {
          id: VALID_UUID,
          userId: "u-agent",
          email: "agent@tienda.co",
          displayName: "Andrea",
          role: "tenant_agent",
          status: "suspended",
          grantChatwootAccess: true,
          chatwootAgentId: 77,
          joinedAt: new Date(),
          lastAccessAt: null,
        },
        chatwootAction: "remove",
        previousChatwootAgentId: 77,
      },
    });

    const suspendRes = await patchMemberStatus(
      new NextRequest(`http://localhost:3003/api/tenant/team/${VALID_UUID}/status`, {
        method: "PATCH",
        headers: { cookie: "mocter_sid=sid-owner", "content-type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(suspendRes.status).toBe(200);
    expect(domain.removeTenantMemberChatwootAccess).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c-1", chatwootAgentId: 77 }),
    );

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce(OWNER_CTX);
    mockTeamService.retireMember.mockResolvedValueOnce({
      ok: true,
      data: { removed: true, userId: "u-agent", chatwootAgentId: 77 },
    });

    const retireRes = await deleteMember(
      new NextRequest(`http://localhost:3003/api/tenant/team/${VALID_UUID}`, {
        method: "DELETE",
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(retireRes.status).toBe(200);
  });

  it("GET y POST /api/tenant/team/accept-invite soportan consulta pública, error de token y emiten cookies de sesión", async () => {
    mockTeamService.getInvitationPreview.mockResolvedValueOnce({
      valid: true,
      tenantName: "Tienda Sol",
      emailHint: "an***@tienda.co",
      existingAccount: false,
    });
    const previewRes = await getAcceptInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/accept-invite?token=abc123"),
    );
    expect(previewRes.status).toBe(200);
    const previewJson = await previewRes.json();
    expect(previewJson.data.valid).toBe(true);

    mockTeamService.acceptTeamInvitation.mockResolvedValueOnce({
      ok: false,
      error: "Token expirado",
      code: "INVITATION_TOKEN_INVALID_OR_EXPIRED",
    });
    const invalidAccept = await postAcceptInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "expired-token-123456", displayName: "Andrea", password: "Password1!" }),
      }),
    );
    expect(invalidAccept.status).toBe(422);
    const invalidJson = await invalidAccept.json();
    expect(invalidJson.code).toBe("INVITATION_TOKEN_INVALID_OR_EXPIRED");

    mockTeamService.acceptTeamInvitation.mockResolvedValueOnce({
      ok: true,
      data: {
        member: { id: VALID_UUID },
        userId: "u-new-1",
        email: "andrea@tienda.co",
        displayName: "Andrea",
        clientId: "c-1",
        grantChatwootAccess: true,
      },
    });
    vi.mocked(domain.authService.issueSessionForUserById).mockResolvedValueOnce({
      ok: true,
      data: {
        sid: "sid-new-1",
        csrfToken: "csrf-new-1",
        emailVerified: true,
        clientId: "c-1",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        user: { id: "u-new-1", email: "andrea@tienda.co", fullName: "Andrea", status: "active", role: "tenant_user" },
      },
    });

    const okAccept = await postAcceptInvite(
      new NextRequest("http://localhost:3003/api/tenant/team/accept-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "valid-token-123456", displayName: "Andrea", password: "Password1!" }),
      }),
    );
    expect(okAccept.status).toBe(200);
    const setCookieHeader = okAccept.headers.get("set-cookie") || "";
    expect(setCookieHeader).toContain("mocter_sid=sid-new-1");
    expect(setCookieHeader).toContain("mocter_csrf=csrf-new-1");
    expect(domain.syncTenantMemberChatwootAccess).toHaveBeenCalled();
  });
});
