import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TenantCapabilityGateService,
  InMemoryTenantCapabilityGateRepository,
  DrizzleTenantCapabilityGateRepository,
} from "./tenant-capability-gate.service";

describe("TenantCapabilityGateService (T9 / CA-008 / S10)", () => {
  let repo: InMemoryTenantCapabilityGateRepository;
  let service: TenantCapabilityGateService;
  const clientId = "tenant-gate-1";

  beforeEach(() => {
    repo = new InMemoryTenantCapabilityGateRepository();
    service = new TenantCapabilityGateService(repo);
  });

  describe("assertCapability", () => {
    it("permite el acceso si la capacidad está contratada en el plan", async () => {
      repo.capabilities.set(clientId, { reports: true, crm: true });

      const res = await service.assertCapability(clientId, "reports");
      expect(res.ok).toBe(true);
    });

    it("bloquea con mensaje S10 si la capacidad no está incluida en el plan (RN-007, S10)", async () => {
      repo.capabilities.set(clientId, { reports: false, crm: true });

      const res = await service.assertCapability(clientId, "reports");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Tu plan no incluye esta funcionalidad.");
        expect(res.code).toBe("CAPABILITY_NOT_INCLUDED");
      }
    });

    it("bloquea si el inquilino no tiene capacidades configuradas", async () => {
      const res = await service.assertCapability("unknown-tenant", "reports");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Tu plan no incluye esta funcionalidad.");
      }
    });
  });

  describe("filterNavItems (CA-008 Interfaz limpia)", () => {
    it("oculta los accesos a módulos no contratados y conserva los permitidos", async () => {
      repo.capabilities.set(clientId, {
        crm: true,
        reports: false, // Plan sin reportes
        campaigns: true,
      });

      const navMenu = [
        { href: "/", label: "Dashboard" }, // Sin capabilityCode -> siempre visible
        { href: "/admin/leads", label: "Leads y CRM", capabilityCode: "crm" },
        { href: "/admin/reports", label: "Informes y Analítica", capabilityCode: "reports" },
        { href: "/admin/campaigns", label: "Campañas", capabilityCode: "campaigns" },
      ];

      const filtered = await service.filterNavItems(clientId, navMenu);

      expect(filtered).toHaveLength(3);
      expect(filtered.map((item) => item.href)).toEqual([
        "/",
        "/admin/leads",
        "/admin/campaigns",
      ]);
      expect(filtered.some((item) => item.href === "/admin/reports")).toBe(false);
    });
  });

  describe("DrizzleTenantCapabilityGateRepository (CHW-002 T-03)", () => {
    it("deriva chatwoot_inboxes = true a partir de plan_limits cuando mode = UNLIMITED o value > 0", async () => {
      let step = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              step += 1;
              let rows: any[] = [];
              if (step === 1) rows = [{ planId: "plan-pro-1" }];
              else if (step === 2) rows = [{ capabilityCode: "crm", enabled: true }];
              else if (step === 3) rows = [{ mode: "LIMITED", value: 3 }];
              else if (step === 4) rows = [];

              const promise = Promise.resolve(rows);
              return Object.assign(promise, {
                limit: vi.fn().mockImplementation(() => Promise.resolve(rows.slice(0, 1))),
              });
            }),
          }),
        }),
      };

      const drizzleRepo = new DrizzleTenantCapabilityGateRepository(() => mockDb);
      const caps = await drizzleRepo.getTenantCapabilities("client-pro-1");

      expect(caps.crm).toBe(true);
      expect(caps.chatwoot_inboxes).toBe(true);
    });

    it("permite que client_feature_overrides sobreescriba chatwoot_inboxes", async () => {
      let step = 0;
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              step += 1;
              let rows: any[] = [];
              if (step === 1) rows = [{ planId: "plan-pro-1" }];
              else if (step === 2) rows = [];
              else if (step === 3) rows = [{ mode: "UNLIMITED", value: null }];
              else if (step === 4) rows = [{ featureKey: "chatwoot_inboxes", enabled: false }];

              const promise = Promise.resolve(rows);
              return Object.assign(promise, {
                limit: vi.fn().mockImplementation(() => Promise.resolve(rows.slice(0, 1))),
              });
            }),
          }),
        }),
      };

      const drizzleRepo = new DrizzleTenantCapabilityGateRepository(() => mockDb);
      const caps = await drizzleRepo.getTenantCapabilities("client-pro-1");

      expect(caps.chatwoot_inboxes).toBe(false);
    });

    it("resuelve getResolvedLimits combinando plan_limits y overrides vigentes y expone getTenantEntitlementsSummary (SPEC-03 T-04)", async () => {
      const {
        clients: tClients,
        planLimits: tPlanLimits,
        clientPlanOverrides: tPlanOverrides,
        planCapabilityValues: tPlanCaps,
        clientFeatureOverrides: tFeatOverrides,
      } = await import("../db/schemas/admin");

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockImplementation((table: unknown) => ({
            where: vi.fn().mockImplementation(() => {
              let rows: any[] = [];
              if (table === tClients) rows = [{ planId: "plan-pro-1" }];
              else if (table === tPlanLimits) {
                rows = [
                  { dimension: "products", mode: "LIMITED", value: 100 },
                  { dimension: "audios_per_product", mode: "LIMITED", value: 2 },
                  { dimension: "contacts", mode: "UNLIMITED", value: null },
                  { dimension: "chatwoot_inboxes", mode: "LIMITED", value: 3 },
                ];
              } else if (table === tPlanOverrides) {
                rows = [{ dimension: "products", value: 250 }];
              } else if (table === tPlanCaps) {
                rows = [{ capabilityCode: "crm", enabled: true }];
              } else if (table === tFeatOverrides) {
                rows = [];
              }

              const promise = Promise.resolve(rows);
              return Object.assign(promise, {
                limit: vi.fn().mockImplementation(() => {
                  const inbox = rows.find((r) => r.dimension === "chatwoot_inboxes");
                  return Promise.resolve(table === tPlanLimits && inbox ? [inbox] : rows.slice(0, 1));
                }),
              });
            }),
          })),
        }),
      };

      const drizzleRepo = new DrizzleTenantCapabilityGateRepository(() => mockDb);
      const gateService = new TenantCapabilityGateService(drizzleRepo);
      const summary = await gateService.getTenantEntitlementsSummary("client-pro-1");

      expect(summary.limits.products).toEqual({ mode: "LIMITED", value: 250, source: "override" });
      expect(summary.limits.audios_per_product).toEqual({ mode: "LIMITED", value: 2, source: "plan" });
      expect(summary.limits.contacts).toEqual({ mode: "UNLIMITED", value: null, source: "plan" });
      expect(summary.limits.videos_per_product).toEqual({ mode: "LIMITED", value: 0, source: "default" });
      expect(summary.limits.chat_retention_days).toEqual({ mode: "LIMITED", value: 30, source: "default" });
      expect(summary.capabilities.crm).toBe(true);
      expect(summary.capabilities.chatwoot_inboxes).toBe(true);
    });
  });
});
