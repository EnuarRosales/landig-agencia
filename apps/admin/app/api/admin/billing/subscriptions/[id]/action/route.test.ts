import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockManageAction = vi.fn().mockImplementation((subId, action, params) =>
  Promise.resolve({
    ok: true,
    data: {
      id: subId,
      status: action === "suspend" ? "suspended" : "active",
      trialEndsAt: action === "extend_trial" ? new Date() : null,
    },
  }),
);

vi.mock("@mocter/domain", () => ({
  getBillingService: vi.fn().mockReturnValue({
    manageSubscriptionAction: (subId: string, action: any, params: any) =>
      mockManageAction(subId, action, params),
  }),
}));

describe("BILL-001 · Acciones de Suscripción (/api/admin/billing/subscriptions/[id]/action)", () => {
  it("rechaza peticiones con acción no soportada con código 400", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/subscriptions/sub-1/action", {
      method: "POST",
      body: JSON.stringify({ action: "delete_everything" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("ejecuta la acción extend_trial y responde 200 con la suscripción actualizada", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/billing/subscriptions/sub-1/action", {
      method: "POST",
      body: JSON.stringify({ action: "extend_trial", days: 30 }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "sub-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockManageAction).toHaveBeenCalledWith("sub-1", "extend_trial", expect.objectContaining({ days: 30 }));
  });
});

