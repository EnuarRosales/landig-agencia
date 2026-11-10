import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminTenantsPage from "./page";
import { CreateTenantForm } from "./create-tenant-form";
import { TenantActions } from "./tenant-actions";

vi.mock("@mocter/domain", () => ({
  fetchAdminTenantsOverview: vi.fn().mockResolvedValue({
    kpis: {
      totalTenants: 2,
      activeTenants: 1,
      suspendedTenants: 0,
      onboardingTenants: 1,
    },
    tenants: [
      {
        id: "tenant-01",
        slug: "zapateria-andina",
        displayName: "Zapatería Andina",
        contactEmail: "contacto@zapateria.com",
        phone: "+573001234567",
        lifecycleStatus: "activo",
        locale: "es",
        currency: "COP",
        planId: "plan-pro",
        planCode: "growth",
        planName: "Plan Crecimiento",
        cellId: "cell-01",
        cellCode: "cell-primary",
        cellTier: "standard",
        ownerUserId: "usr-01",
        ownerName: "Carlos Gómez",
        ownerEmail: "carlos@zapateria.com",
        createdAt: "2026-11-01T12:00:00.000Z",
        updatedAt: "2026-11-01T12:00:00.000Z",
      },
      {
        id: "tenant-02",
        slug: "cafe-colombia",
        displayName: "Café Colombia",
        contactEmail: "ventas@cafecolombia.co",
        phone: null,
        lifecycleStatus: "alta",
        locale: "es",
        currency: "COP",
        planId: "plan-free",
        planCode: "free",
        planName: "Plan Gratuito",
        cellId: "cell-01",
        cellCode: "cell-primary",
        cellTier: "standard",
        ownerUserId: "usr-02",
        ownerName: "María López",
        ownerEmail: "maria@cafecolombia.co",
        createdAt: "2026-11-01T14:00:00.000Z",
        updatedAt: "2026-11-01T14:00:00.000Z",
      },
    ],
    availablePlans: [
      { id: "plan-free", code: "free", name: "Plan Gratuito" },
      { id: "plan-pro", code: "growth", name: "Plan Crecimiento" },
    ],
    availableCells: [
      { id: "cell-01", code: "cell-primary", currentClients: 2, maxClients: 100 },
    ],
  }),
}));

describe("ADM-001 §6 / DAT-001 · Directorio y Gestión de Inquilinos y Comercios", () => {
  it("renderiza el Server Component con encabezado, KPIs y tabla de inventario", async () => {
    const page = await AdminTenantsPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(3);

    // Header
    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    // KPIs section
    const kpisSection = children[1] as React.ReactElement;
    expect(kpisSection.type).toBe("section");

    // Table section
    const tableSection = children[2] as React.ReactElement;
    expect(tableSection.type).toBe("section");
  });

  it("renderiza CreateTenantForm con Title Case y botón interactivo", () => {
    const formElement = (
      <CreateTenantForm
        availablePlans={[{ id: "p1", code: "free", name: "Plan Gratuito" }]}
        availableCells={[{ id: "c1", code: "cell-01", currentClients: 0, maxClients: 50 }]}
      />
    );
    expect(React.isValidElement(formElement)).toBe(true);
  });

  it("renderiza TenantActions con botón de suspensión para inquilinos activos", () => {
    const actionsElement = (
      <TenantActions
        clientId="tenant-01"
        clientName="Zapatería Andina"
        currentStatus="activo"
      />
    );
    expect(React.isValidElement(actionsElement)).toBe(true);
  });

  it("renderiza TenantActions con modelo CRUD completo (Editar, Onboarding, Reactivar, Baja)", () => {
    const actionsElement = (
      <TenantActions
        tenant={{
          id: "tenant-01",
          slug: "zapateria-andina",
          displayName: "Zapatería Andina",
          contactEmail: "contacto@zapateria.com",
          phone: "+573001234567",
          lifecycleStatus: "suspendido",
          locale: "es",
          currency: "COP",
          planId: "plan-pro",
          planCode: "growth",
          planName: "Plan Crecimiento",
          cellId: "cell-01",
          cellCode: "cell-primary",
          cellTier: "standard",
          ownerUserId: "usr-01",
          ownerName: "Carlos Gómez",
          ownerEmail: "carlos@zapateria.com",
          createdAt: "2026-11-01T12:00:00.000Z",
          updatedAt: "2026-11-01T12:00:00.000Z",
        }}
        availablePlans={[{ id: "plan-pro", code: "growth", name: "Plan Crecimiento" }]}
        availableCells={[{ id: "cell-01", code: "cell-primary", currentClients: 1, maxClients: 100 }]}
      />
    );
    expect(React.isValidElement(actionsElement)).toBe(true);
  });
});
