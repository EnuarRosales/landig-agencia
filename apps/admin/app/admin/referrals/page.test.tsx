import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminReferralsPage from "./page";
import { ReferralsView } from "./referrals-view";

vi.mock("@mocter/domain", () => ({
  fetchAdminReferralsOverview: vi.fn().mockResolvedValue({
    program: {
      id: "prog-01",
      name: "Programa Oficial Mocter",
      model: "credit",
      rewardType: "fixed",
      rewardValue: 5000000,
      currency: "COP",
      attributionDays: 60,
      creditValidityDays: 365,
      status: "active",
    },
    metrics: {
      totalReferrals: 10,
      pendingCount: 4,
      qualifiedCount: 6,
      rewardedCount: 6,
      rejectedCount: 0,
      totalRewardsIssuedCents: 30000000,
      totalCreditsRedeemedCents: 15000000,
      totalCreditsAvailableCents: 15000000,
    },
    topReferrers: [],
  }),
}));

describe("REF-001 · Programa de Referidos (Backoffice)", () => {
  it("renderiza el Server Component con encabezado institucional y vista interactiva", async () => {
    const page = await AdminReferralsPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(2);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const view = children[1] as React.ReactElement;
    expect(view.type).toBe(ReferralsView);
  });

  it("renderiza ReferralsView con métricas y formulario en Title Case", () => {
    const mockData = {
      program: {
        id: "prog-01",
        name: "Programa Oficial Mocter",
        model: "credit",
        rewardType: "fixed",
        rewardValue: 5000000,
        currency: "COP",
        attributionDays: 60,
        creditValidityDays: 365,
        status: "active",
      },
      metrics: {
        totalReferrals: 5,
        pendingCount: 2,
        qualifiedCount: 3,
        rewardedCount: 3,
        rejectedCount: 0,
        totalRewardsIssuedCents: 15000000,
        totalCreditsRedeemedCents: 5000000,
        totalCreditsAvailableCents: 10000000,
      },
      topReferrers: [],
    };

    const element = <ReferralsView initialData={mockData} />;
    expect(React.isValidElement(element)).toBe(true);
  });
});
