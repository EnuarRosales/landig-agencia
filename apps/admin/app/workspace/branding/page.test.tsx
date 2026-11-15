/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceBrandingView, calculateWcagContrastRatio } from "./branding-view";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("SPEC-07 T-04 · WorkspaceBrandingView (/workspace/branding)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: {} }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("calcula el contraste WCAG 2.2 AA correctamente", () => {
    expect(calculateWcagContrastRatio("#FFFFFF", "#000000")).toBe(21);
    expect(calculateWcagContrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(calculateWcagContrastRatio("#FFFFFF", "#0F766E")).toBeGreaterThanOrEqual(4.5);
  });

  it("en modo 'none' muestra tarjeta informativa y enlaces a /workspace/profile y /workspace/billing", () => {
    render(
      <WorkspaceBrandingView
        locale="es"
        isOwner={true}
        tenantName="Café del Valle"
        tenantSlug="cafe-del-valle"
        initialMode="none"
        initialBranding={null}
        allowedFonts={["Inter", "Roboto"]}
        cnameTargetHost="cname.mocter.co"
      />,
    );

    expect(screen.getByTestId("branding-mode-none-card")).toBeDefined();
    const profileLink = screen.getByRole("link", { name: /Ir a Perfil del Negocio/i });
    const billingLink = screen.getByRole("link", { name: /Explorar Planes Disponibles/i });
    expect(profileLink.getAttribute("href")).toBe("/workspace/profile");
    expect(billingLink.getAttribute("href")).toBe("/workspace/billing");
    expect(screen.queryByRole("button", { name: /Guardar Configuración/i })).toBeNull();
  });

  it("en modo 'paleta' valida contraste WCAG AA en vivo y bloquea campos Enterprise", () => {
    render(
      <WorkspaceBrandingView
        locale="es"
        isOwner={true}
        tenantName="Tienda Paleta"
        tenantSlug="tienda-paleta"
        initialMode="paleta"
        initialBranding={null}
        allowedFonts={["Inter", "Roboto"]}
        cnameTargetHost="cname.mocter.co"
      />,
    );

    const primaryFgInput = screen.getByLabelText("Texto Sobre Color Primario") as HTMLInputElement;
    const primaryBgInput = screen.getByLabelText("Color Primario de Marca") as HTMLInputElement;

    // Color de bajo contraste bloquea guardado
    fireEvent.change(primaryBgInput, { target: { value: "#FAFAFA" } });
    fireEvent.change(primaryFgInput, { target: { value: "#FFFFFF" } });

    expect(screen.getAllByText(/Contraste Insuficiente/i).length).toBeGreaterThanOrEqual(1);
    const saveButton = screen.getByRole("button", { name: /Guardar Configuración/i }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.queryByLabelText("Dominio Personalizado (FQDN)")).toBeNull();
  });

  it("en modo 'completa' permite editar dominio/fuente, guardar por PUT y restaurar con ConfirmationModal (DELETE)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { restored: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WorkspaceBrandingView
        locale="es"
        isOwner={true}
        tenantName="Tienda Enterprise"
        tenantSlug="tienda-enterprise"
        initialMode="completa"
        initialBranding={null}
        allowedFonts={["Inter", "Poppins"]}
        cnameTargetHost="admin.mocter.co"
      />,
    );

    const domainInput = screen.getByLabelText("Dominio Personalizado (FQDN)");
    fireEvent.change(domainInput, { target: { value: "shop.enterprise.co" } });

    const preview = screen.getByTestId("branding-live-preview");
    expect(preview.textContent).toContain("shop.enterprise.co");
    expect(preview.textContent).toContain("Tienda Enterprise");

    const saveBtn = screen.getByRole("button", { name: /Guardar Configuración/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tenant/branding",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const resetTrigger = screen.getByRole("button", { name: /Restaurar Marca por Defecto/i });
    fireEvent.click(resetTrigger);
    expect(screen.getByRole("dialog")).toBeDefined();

    const confirmReset = screen.getByRole("button", { name: /Sí, Restaurar Valores/i });
    fireEvent.click(confirmReset);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tenant/branding",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
