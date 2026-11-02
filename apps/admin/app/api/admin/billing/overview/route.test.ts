import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@mocter/domain", () => ({
  getBillingService: vi.fn().mockReturnValue({
    getAdminBillingOverview: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        metrics: {
          mrrCents: 50000000,
          activeCount: 10,
          trialingCount: 3,
          pastDueCount: 1,
          totalInvoicesCount: 25,
        },
        subscriptions: [],
        recentInvoices: [],
        recentReceipts: [],
      },
    }),
  }),
}));

describe("BILL-001 · GET /api/admin/billing/overview", () => {
  it("responde 200 con el consolidado financiero de la SaaS", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.metrics.mrrCents).toBe(50000000);
    expect(json.data.metrics.activeCount).toBe(10);
  });
});

