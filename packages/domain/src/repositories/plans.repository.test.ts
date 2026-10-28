import { describe, it, expect, vi } from "vitest";
import { DrizzlePlansRepository } from "./plans.repository";
import type { Plan } from "../db/schemas/admin/plans";

describe("DrizzlePlansRepository", () => {
  const activePublicPlan1: Plan = {
    id: "0192e210-aaaa-7000-8000-000000000001",
    code: "starter",
    name: { es: "Inicial", en: "Starter" },
    description: { es: "Para negocios que inician", en: "For starting businesses" },
    status: "active",
    isPublic: true,
    isPopular: false,
    sortOrder: 1,
    trialDays: 14,
    graceDays: 7,
    billingCycles: ["monthly", "annual"],
    priceMonthlyCents: 4900000,
    priceAnnualCents: 47000000,
    currency: "COP",
    marketingFeatures: { es: ["1 agente"], en: ["1 agent"] },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  const activePublicPlan2: Plan = {
    id: "0192e210-bbbb-7000-8000-000000000002",
    code: "growth",
    name: { es: "Crecimiento", en: "Growth" },
    description: { es: "Para empresas consolidadas", en: "For growing businesses" },
    status: "active",
    isPublic: true,
    isPopular: true,
    sortOrder: 2,
    trialDays: 14,
    graceDays: 7,
    billingCycles: ["monthly", "annual"],
    priceMonthlyCents: 9900000,
    priceAnnualCents: 95000000,
    currency: "COP",
    marketingFeatures: { es: ["3 agentes", "Bot IA"], en: ["3 agents", "AI Bot"] },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "system",
    updatedBy: "system",
  };

  it("retrieves public active plans ordered by sort_order", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([activePublicPlan1, activePublicPlan2]),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    const plans = await repo.getPublicPlans();

    expect(plans).toHaveLength(2);
    expect(plans[0].code).toBe("starter");
    expect(plans[1].code).toBe("growth");
    expect(plans[0].status).toBe("active");
    expect(plans[0].isPublic).toBe(true);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("propagates and logs error when getPublicPlans query fails", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(new Error("Database connection error")),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    await expect(repo.getPublicPlans()).rejects.toThrow("Database connection error");
  });

  it("finds a plan by its public slug code", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([activePublicPlan1]),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    const plan = await repo.findByCode("starter");

    expect(plan).not.toBeNull();
    expect(plan?.code).toBe("starter");
    expect(plan?.id).toBe(activePublicPlan1.id);
  });

  it("returns null when findByCode finds no match", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    const plan = await repo.findByCode("non_existent_plan");

    expect(plan).toBeNull();
  });

  it("finds a plan by its UUID id", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([activePublicPlan2]),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    const plan = await repo.findById(activePublicPlan2.id);

    expect(plan).not.toBeNull();
    expect(plan?.id).toBe(activePublicPlan2.id);
    expect(plan?.code).toBe("growth");
  });

  it("returns null when findById finds no match", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new DrizzlePlansRepository(() => mockDb as any);
    const plan = await repo.findById("0192e210-0000-7000-8000-000000000000");

    expect(plan).toBeNull();
  });
});
