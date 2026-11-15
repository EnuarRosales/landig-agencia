import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantOnboardingService } from "./tenant-onboarding.service";
import * as dbModule from "../db/index";
import * as cellClientModule from "../db/cell-client";
import * as adminDashboardModule from "./admin-dashboard.service";
import { ok } from "../types/result";

describe("TenantOnboardingService", () => {
  let service: TenantOnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantOnboardingService();
  });

  describe("getOnboardingState", () => {
    it("returns USER_NOT_FOUND if user does not exist in db", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const res = await service.getOnboardingState("non-existent-user");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("USER_NOT_FOUND");
      }
    });

    it("returns Step 1 for autonomous prospect with no client", async () => {
      const mockUser = { id: "user-1", email: "prospect@test.com", activeClientId: null };
      const mockPlans = [{ id: "p1", code: "free", name: "Free", description: "Free", priceMonthlyCents: 0 }];

      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser]; // user
                if (selectCount === 2) return []; // client by owner
                if (selectCount === 3) return []; // session
                return [];
              }),
              orderBy: vi.fn().mockResolvedValue(mockPlans), // plans
            })),
          })),
        })),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const res = await service.getOnboardingState("user-1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.step).toBe(1);
        expect(res.data.client).toBeNull();
        expect(res.data.availablePlans).toHaveLength(1);
      }
    });

    it("returns Step 2 for manual tenant in alta with 0 products", async () => {
      const mockUser = { id: "user-1", email: "owner@synergia.com", activeClientId: "client-1" };
      const mockClient = {
        id: "client-1",
        displayName: "Synergia Market",
        slug: "synergia-market",
        locale: "es",
        currency: "COP",
        timezone: "America/Bogota",
        lifecycleStatus: "alta",
        planId: "p1",
      };
      const mockPlans = [{ id: "p1", code: "pro", name: "Pro", description: "Pro", priceMonthlyCents: 50000 }];

      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            leftJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser]; // user
                if (selectCount === 2) return [mockClient]; // client
                if (selectCount === 3) return []; // session
                if (selectCount === 4) return [{ cellId: "cell-1", cellCode: "cell-01" }]; // routing
                return [];
              }),
              orderBy: vi.fn().mockResolvedValue(mockPlans),
            })),
          })),
        })),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      vi.spyOn(cellClientModule, "withTenantCellTransaction").mockImplementation(async (_clientId, callback) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]), // 0 products, 0 business info
            }),
          }),
        };
        return await callback(mockTx as any);
      });

      const res = await service.getOnboardingState("user-1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.step).toBe(1);
        expect(res.data.stepKey).toBe("business");
        expect(res.data.client?.slug).toBe("synergia-market");
        expect(res.data.client?.cellCode).toBe("cell-01");
      }
    });

    it("maps legacy 'bot_channel' session step to Step 4 ('assistant_payments')", async () => {
      const { mapLegacyStep, stepKeyToNumber } = await import("./tenant-onboarding.service");
      expect(mapLegacyStep("bot_channel")).toBe("assistant_payments");
      expect(stepKeyToNumber(mapLegacyStep("bot_channel"))).toBe(4);
      expect(stepKeyToNumber(mapLegacyStep("plan"))).toBe(2);
      expect(stepKeyToNumber(mapLegacyStep("billing"))).toBe(5);
    });
  });

  describe("completeStep1Business", () => {
    it("rejects invalid slug format with spaces or uppercase", async () => {
      const res = await service.completeStep1Business("user-1", {
        displayName: "Mi Tienda",
        slug: "Tienda Con Espacios",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_SLUG_FORMAT");
      }
    });

    it("rejects display name shorter than 2 characters", async () => {
      const res = await service.completeStep1Business("user-1", {
        displayName: "A",
        slug: "tienda-valida",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_DISPLAY_NAME");
      }
    });

    it("rejects duplicate slug if already in use by another tenant", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: null };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser]; // user
                if (selectCount === 2) return []; // client by owner
                if (selectCount === 3) return [{ id: "other-client-id" }]; // slug collision
                return [];
              }),
            })),
          })),
        })),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const res = await service.completeStep1Business("user-1", {
        displayName: "Mi Tienda",
        slug: "tienda-existente",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("SLUG_ALREADY_EXISTS");
      }
    });

    it("updates existing client in alta manual and transitions to step 2", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: "client-1" };
      const mockClient = { id: "client-1", slug: "old-slug", displayName: "Old Name" };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser];
                if (selectCount === 2) return [mockClient];
                if (selectCount === 3) return []; // slug collision check
                return [];
              }),
            })),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const res = await service.completeStep1Business("user-1", {
        displayName: "Synergia Market Updated",
        slug: "synergia-market-updated",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.nextStep).toBe(2);
        expect(res.data.clientId).toBe("client-1");
        expect(res.data.slug).toBe("synergia-market-updated");
      }
    });

    it("dispara provisionOrRetryAccount en reintento de alta manual si la cuenta no está activa (CHW-002 T-05)", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: "client-1" };
      const mockClient = { id: "client-1", slug: "old-slug", displayName: "Old Name", planId: "p-cw" };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser];
                if (selectCount === 2) return [mockClient];
                if (selectCount === 3) return []; // slug collision check
                if (selectCount === 4) return [{ state: "failed", chatwootAccountId: null }]; // chatwootAccounts
                if (selectCount === 5) return [{ chatwootEnabled: true }]; // plans
                return [];
              }),
            })),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const mockChatwootService = {
        provisionOrRetryAccount: vi.fn().mockResolvedValue(ok({ state: "active", chatwootAccountId: 999 })),
      };

      const onboardingService = new TenantOnboardingService(mockChatwootService as any);

      const res = await onboardingService.completeStep1Business("user-1", {
        displayName: "Synergia Market",
        slug: "synergia-market-cw",
      });

      expect(res.ok).toBe(true);
      expect(mockChatwootService.provisionOrRetryAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: "client-1",
          tenantName: "Synergia Market",
        }),
      );
    });

    it("completa el Paso 1 de forma fail-soft si Chatwoot arroja excepción (CHW-002 T-05)", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: "client-1" };
      const mockClient = { id: "client-1", slug: "old-slug", displayName: "Old Name", planId: "p-cw" };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser];
                if (selectCount === 2) return [mockClient];
                if (selectCount === 3) return [];
                if (selectCount === 4) return []; // chatwootAccounts
                if (selectCount === 5) return [{ chatwootEnabled: true }];
                return [];
              }),
            })),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const mockChatwootService = {
        provisionOrRetryAccount: vi.fn().mockRejectedValue(new Error("Chatwoot HTTP 500 timeout")),
      };

      const onboardingService = new TenantOnboardingService(mockChatwootService as any);

      const res = await onboardingService.completeStep1Business("user-1", {
        displayName: "Tienda Resiliente",
        slug: "tienda-resiliente",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.nextStep).toBe(2);
      }
      expect(mockChatwootService.provisionOrRetryAccount).toHaveBeenCalled();
    });
  });

  describe("completeStep2FirstProduct", () => {
    it("rejects non-positive price", async () => {
      const res = await service.completeStep2FirstProduct("user-1", {
        name: "Camisa",
        description: "Camisa Oxford",
        priceCents: 0,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_PRICE");
      }
    });

    it("rejects description shorter than 5 characters", async () => {
      const res = await service.completeStep2FirstProduct("user-1", {
        name: "Camisa",
        description: "ABC",
        priceCents: 50000,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_PRODUCT_DESCRIPTION");
      }
    });

    it("inserts first product under RLS and transitions to step 3", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: "client-1" };
      const mockClient = { id: "client-1", currency: "COP" };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser];
                if (selectCount === 2) return [mockClient];
                return [];
              }),
            })),
          })),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(cellClientModule, "withTenantCellTransaction").mockImplementation(async (_clientId, cb) => {
        return await cb(mockTx as any);
      });

      const res = await service.saveFirstProductStep("user-1", {
        name: "Camisa Oxford Premium",
        description: "Algodón egipcio 100% de alta densidad.",
        costPriceCents: 60000,
        salePriceCents: 120000,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.nextStep).toBe(4);
        expect(res.data.name).toBe("Camisa Oxford Premium");
        expect(res.data.profitability.profitCents).toBe(60000);
        expect(res.data.profitability.marginPct).toBe(50);
        expect(res.data.productId).toBeDefined();
      }
    });

    it("rejects negative costPriceCents in Step 3", async () => {
      const res = await service.saveFirstProductStep("user-1", {
        name: "Camisa Oxford",
        description: "Algodón egipcio 100% de alta densidad.",
        costPriceCents: -100,
        salePriceCents: 120000,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_COST_PRICE");
      }
    });
  });

  describe("completeStep3BotAndActivate", () => {
    it("returns CLIENT_NOT_FOUND if user has no client", async () => {
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: null };
      let selectCount = 0;
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => {
                selectCount++;
                if (selectCount === 1) return [mockUser];
                return [];
              }),
            })),
          })),
        })),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const res = await service.completeStep3BotAndActivate("user-1", {});
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CLIENT_NOT_FOUND");
      }
    });

    it("persists bot configuration, transitions lifecycle to 'activo', and returns /workspace redirect", async () => {
      const { users: tUsers, clients: tClients, onboardingSessions: tSessions } = await import(
        "../db/schemas/admin"
      );
      const mockUser = { id: "user-1", email: "owner@test.com", activeClientId: "client-1" };
      const mockClient = {
        id: "client-1",
        displayName: "Synergia",
        locale: "es",
        planId: "plan-free",
        lifecycleStatus: "alta",
      };
      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table: unknown) => {
            let rows: any[] = [];
            if (table === tUsers) rows = [mockUser];
            else if (table === tClients) rows = [mockClient];
            else if (table === tSessions) rows = [{ startedAt: new Date(), draftPayload: {} }];

            const makeWhereRes = () => {
              const p = Promise.resolve(rows);
              return Object.assign(p, {
                limit: vi.fn().mockResolvedValue(rows.slice(0, 1)),
                orderBy: vi.fn().mockResolvedValue(rows),
              });
            };

            return {
              where: vi.fn().mockImplementation(makeWhereRes),
            };
          }),
        })),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      const mockTx = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
            onConflictDoNothing: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      vi.spyOn(cellClientModule, "withTenantCellTransaction").mockImplementation(async (_clientId, cb) => {
        return await cb(mockTx as any);
      });

      const res = await service.completeStep3BotAndActivate("user-1", {
        botPreset: "quick_sales",
        botObjective: "Vender productos por chat",
        paymentChannels: [
          { channelCode: "nequi", displayName: "Nequi", accountIdentifier: "3001234567" },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.lifecycleStatus).toBe("activo");
        expect(res.data.redirectTo).toBe("/workspace");
      }
    });
  });

  describe("getOnboardingState catalogLimits (SPEC-03 T-05)", () => {
    it("adjunta catalogLimits reales por plan y currentCatalogSummary con overrides vigentes", async () => {
      const {
        users: tUsers,
        clients: tClients,
        onboardingSessions: tSessions,
        plans: tPlans,
        clientRouting: tRouting,
        planLimits: tPlanLimits,
        clientPlanOverrides: tPlanOverrides,
      } = await import("../db/schemas/admin");

      const mockUser = { id: "user-1", email: "owner@shop.co", activeClientId: "client-1" };
      const mockClient = {
        id: "client-1",
        displayName: "Shop",
        slug: "shop",
        locale: "es",
        currency: "COP",
        timezone: "America/Bogota",
        lifecycleStatus: "alta",
        planId: "plan-pro",
      };
      const mockPlans = [
        { id: "plan-pro", code: "pro", name: { es: "Plan Pro" }, description: { es: "Pro" }, priceMonthlyCents: 99000 },
      ];
      const mockPlanLimits = [
        { planId: "plan-pro", dimension: "products", mode: "LIMITED", value: 100 },
        { planId: "plan-pro", dimension: "images_per_product", mode: "LIMITED", value: 10 },
        { planId: "plan-pro", dimension: "videos_per_product", mode: "LIMITED", value: 1 },
        { planId: "plan-pro", dimension: "audios_per_product", mode: "LIMITED", value: 3 },
        { planId: "plan-pro", dimension: "pdfs_per_product", mode: "UNLIMITED", value: null },
        { planId: "plan-pro", dimension: "storage_bytes", mode: "LIMITED", value: 1073741824 },
      ];
      const mockOverrides = [{ dimension: "products", value: 250 }];

      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table: unknown) => {
            let rows: any[] = [];
            if (table === tUsers) rows = [mockUser];
            else if (table === tClients) rows = [mockClient];
            else if (table === tSessions) rows = [];
            else if (table === tPlans) rows = mockPlans;
            else if (table === tRouting) rows = [{ cellId: "c1", cellCode: "cell-01" }];
            else if (table === tPlanLimits) rows = mockPlanLimits;
            else if (table === tPlanOverrides) rows = mockOverrides;

            const makeWhereRes = () => {
              const p = Promise.resolve(rows);
              return Object.assign(p, {
                limit: vi.fn().mockResolvedValue(rows.slice(0, 1)),
                orderBy: vi.fn().mockResolvedValue(rows),
              });
            };

            return {
              leftJoin: vi.fn().mockReturnValue({ where: vi.fn().mockImplementation(makeWhereRes) }),
              where: vi.fn().mockImplementation(makeWhereRes),
            };
          }),
        })),
      };
      vi.spyOn(dbModule, "getDb").mockReturnValue(mockDb as any);

      vi.spyOn(cellClientModule, "withTenantCellTransaction").mockImplementation(async (_cid, cb) =>
        cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as any),
      );

      const res = await service.getOnboardingState("user-1");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.availablePlans[0].catalogLimits?.audiosPerProduct).toEqual({
          mode: "LIMITED",
          value: 3,
        });
        expect(res.data.availablePlans[0].catalogLimits?.pdfsPerProduct).toEqual({
          mode: "UNLIMITED",
          value: null,
        });
        expect(res.data.currentCatalogSummary?.products).toEqual({
          mode: "LIMITED",
          value: 250,
        });
      }
    });
  });
});
