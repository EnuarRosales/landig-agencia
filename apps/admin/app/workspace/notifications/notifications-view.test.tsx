/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TenantNotificationsView } from "./notifications-view";
import type { TenantNotificationsResponseDto } from "@mocter/domain";

describe("SPEC-14 · TenantNotificationsView (/workspace/notifications)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const baseData: TenantNotificationsResponseDto = {
    unreadCount: 1,
    total: 1,
    page: 1,
    limit: 20,
    canManagePreferences: true,
    notifications: [
      {
        id: "019a0000-0000-7000-8000-000000000010",
        clientId: "c-1",
        eventKey: "tenant.inventory.low_stock",
        title: "Stock mínimo alcanzado: Camisa",
        body: "Quedan 2 unidades en bodega.",
        severity: "warning",
        actionUrl: "/workspace/products",
        readAt: null,
        createdAt: "2026-11-17T08:00:00.000Z",
      },
    ],
    preferences: [
      {
        eventKey: "tenant.inventory.low_stock",
        category: "tenant",
        description: "Alerta de inventario bajo",
        tenantConfigurable: true,
        isEnabledByPlatform: true,
        emailEnabled: true,
        inAppEnabled: true,
        customRecipientEmail: "bodega@andes.co",
        updatedAt: null,
      },
      {
        eventKey: "community.join_accepted",
        category: "community",
        description: "Confirmación de admisión del miembro en una comunidad.",
        tenantConfigurable: true,
        isEnabledByPlatform: true,
        emailEnabled: true,
        inAppEnabled: true,
        customRecipientEmail: null,
        updatedAt: null,
      },
    ],
  };

  it("renderiza Centro De Mensajes y permite al tenant_owner editar preferencias respetando eventos obligatorios", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: baseData.preferences }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TenantNotificationsView initialData={baseData} locale="es" />);

    expect(screen.getByText("Centro de Notificaciones")).toBeDefined();
    expect(screen.getAllByText("Stock mínimo alcanzado: Camisa").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /Ir al Recurso/i })[0].getAttribute("href")).toBe(
      "/workspace/products",
    );

    fireEvent.click(screen.getByRole("button", { name: "Preferencias de Alertas" }));

    expect(screen.getByDisplayValue("bodega@andes.co")).toBeDefined();
    expect(screen.getByText("community.join_accepted")).toBeDefined();
    expect(screen.queryByText(/inquilino/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guardar Preferencias" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tenant/notifications/preferences",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("oculta la pestaña Preferencias De Alertas cuando el usuario es tenant_agent", () => {
    render(
      <TenantNotificationsView
        initialData={{
          ...baseData,
          canManagePreferences: false,
          preferences: [],
        }}
        locale="es"
      />,
    );

    expect(screen.queryByRole("button", { name: "Preferencias de Alertas" })).toBeNull();
    expect(screen.getAllByText("Stock mínimo alcanzado: Camisa").length).toBeGreaterThanOrEqual(1);
  });
});
