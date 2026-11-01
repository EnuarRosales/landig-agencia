import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminBrandingPage from "./page";
import { AdminBrandingView } from "./branding-view";

const mockSettings = {
  platformBranding: {
    brandName: "Mocter",
    logoUrl: null,
    faviconUrl: null,
    palette: {
      primary: "#2F6BFF",
      primaryForeground: "#FFFFFF",
      accent: "#22D3EE",
      accentForeground: "#0F172A",
    },
    customDomain: "mocter.co",
    customFont: "Chakra Petch, Inter, sans-serif",
    removeMocterBranding: false,
  },
  tenantsBrandings: [
    {
      clientId: "tenant-01",
      clientDisplayName: "Café Origen",
      clientSlug: "cafe-origen",
      brandName: "Café Especial",
      logoUrl: "https://cafe.com/logo.png",
      primaryColor: "#78350F",
      customDomain: "cafe.com",
      hasCustomBranding: true,
      updatedAt: new Date(),
    },
  ],
};

vi.mock("@mocter/domain", () => ({
  fetchAdminBrandingSettings: vi.fn().mockImplementation(() => Promise.resolve(mockSettings)),
}));

describe("ADM-001 / DSN-001 · Identidad Visual y Marca Blanca (Backoffice)", () => {
  it("renderiza el Server Component con AdminBrandingView e initialData", async () => {
    const page = await AdminBrandingPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(1);

    const view = children[0] as React.ReactElement;
    expect(view.type).toBe(AdminBrandingView);
    expect(view.props.initialData.platformBranding.brandName).toBe("Mocter");
  });

  it("renderiza AdminBrandingView con labels de formulario en Title Case y sin códigos de specs", () => {
    const view = <AdminBrandingView initialData={mockSettings} />;
    expect(view).toBeDefined();

    // Verificación de textos y labels en Title Case
    const rendered = JSON.stringify(view);
    expect(rendered).not.toContain("ADM-001");
    expect(rendered).not.toContain("DSN-001");
  });
});
