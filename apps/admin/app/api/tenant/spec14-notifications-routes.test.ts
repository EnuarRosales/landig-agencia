import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveTenantSession = vi.fn();
const mockDispatcherService = {
  listTenantInboxAndPreferences: vi.fn(),
  updateTenantPreferences: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
};

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: (...args: unknown[]) => mockResolveTenantSession(...args),
}));

vi.mock("@mocter/domain", async () => {
  const actual = await vi.importActual<typeof import("@mocter/domain")>("@mocter/domain");
  return {
    ...actual,
    getNotificationDispatcherService: () => mockDispatcherService,
  };
});

import { GET as getNotifications } from "./notifications/route";
import { PUT as putPreferences } from "./notifications/preferences/route";
import { PATCH as patchRead } from "./notifications/[id]/read/route";
import { POST as postReadAll } from "./notifications/read-all/route";

describe("SPEC-14 · /api/tenant/notifications/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantSession.mockResolvedValue({
      ok: true,
      clientId: "client-andes-uuid",
      context: {
        scope: "tenant",
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
        user: { id: "user-owner-uuid", email: "owner@andes.co" },
      },
    });
  });

  it("GET /api/tenant/notifications devuelve inbox y preferencias para tenant_owner", async () => {
    mockDispatcherService.listTenantInboxAndPreferences.mockResolvedValueOnce({
      unreadCount: 2,
      notifications: [],
      total: 0,
      page: 1,
      limit: 20,
      canManagePreferences: true,
      preferences: [],
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/notifications?unreadOnly=true&page=1");
    const res = await getNotifications(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.unreadCount).toBe(2);
    expect(mockDispatcherService.listTenantInboxAndPreferences).toHaveBeenCalledWith(
      "client-andes-uuid",
      expect.objectContaining({ unreadOnly: true, viewerRole: "tenant_owner" }),
    );
  });

  it("PUT /api/tenant/notifications/preferences bloquea tenant_agent con 403 y valida correo con 400", async () => {
    mockResolveTenantSession.mockResolvedValueOnce({
      ok: true,
      clientId: "client-andes-uuid",
      context: {
        scope: "tenant",
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
        user: { id: "user-agent-uuid", email: "agent@andes.co" },
      },
    });

    const reqAgent = new NextRequest("http://localhost:3003/api/tenant/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ eventKey: "tenant.inventory.low_stock", emailEnabled: true, inAppEnabled: true }],
      }),
    });
    const resAgent = await putPreferences(reqAgent);
    expect(resAgent.status).toBe(403);
    expect(resAgent.headers.get("content-type")).toContain("application/problem+json");

    const reqBadEmail = new NextRequest("http://localhost:3003/api/tenant/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            eventKey: "tenant.inventory.low_stock",
            emailEnabled: true,
            inAppEnabled: true,
            customRecipientEmail: "correo-roto",
          },
        ],
      }),
    });
    const resBadEmail = await putPreferences(reqBadEmail);
    expect(resBadEmail.status).toBe(400);
    expect(resBadEmail.headers.get("content-type")).toContain("application/problem+json");
  });

  it("PUT /api/tenant/notifications/preferences responde 422 MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED al apagar evento obligatorio", async () => {
    mockDispatcherService.updateTenantPreferences.mockResolvedValueOnce({
      ok: false,
      code: "MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED",
      error: "La notificación obligatoria 'billing.trial_d0_expired' no puede desactivarse por correo.",
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ eventKey: "billing.trial_d0_expired", emailEnabled: false, inAppEnabled: true }],
      }),
    });
    const res = await putPreferences(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED");
  });

  it("PATCH /api/tenant/notifications/[id]/read responde 404 para notificación ajena y POST read-all marca todas", async () => {
    const validUuid = "019a0000-0000-7000-8000-000000000099";
    mockDispatcherService.markNotificationRead.mockResolvedValueOnce({
      ok: false,
      code: "NOTIFICATION_NOT_FOUND",
      error: "Notificación no encontrada para este comercio.",
    });

    const reqRead = new NextRequest(`http://localhost:3003/api/tenant/notifications/${validUuid}/read`, {
      method: "PATCH",
    });
    const resRead = await patchRead(reqRead, { params: Promise.resolve({ id: validUuid }) });
    expect(resRead.status).toBe(404);

    mockDispatcherService.markAllNotificationsRead.mockResolvedValueOnce({
      ok: true,
      data: { updatedCount: 3 },
    });
    const reqAll = new NextRequest("http://localhost:3003/api/tenant/notifications/read-all", {
      method: "POST",
    });
    const resAll = await postReadAll(reqAll);
    expect(resAll.status).toBe(200);
    const jsonAll = await resAll.json();
    expect(jsonAll.data.updatedCount).toBe(3);
  });
});
