import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantCapabilityGateService,
  InMemoryTenantCapabilityGateRepository,
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
});
