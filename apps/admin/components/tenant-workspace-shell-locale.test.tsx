// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme Toggle</button>,
}));

import { TenantWorkspaceShell } from "./tenant-workspace-shell";

describe("SPEC-17 TRV-01 · TenantWorkspaceShell i18n & Switcher ES | EN", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ locale: "en", preferredLocale: "en" }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renderiza el shell completo en inglés cuando locale='en' (sin textos en español)", () => {
    render(
      <TenantWorkspaceShell
        locale="en"
        tenant={{
          id: "cli-1",
          name: "Synergia Market",
          slug: "synergia-market",
          planName: "Starter",
          connectionHealthy: true,
        }}
        currentUser={{
          id: "usr-1",
          email: "owner@synergia.co",
          displayName: "Maria Owner",
          role: "tenant_owner",
          status: "active",
        }}
        capabilities={{ conversations: true, branding: true, referrals: true }}
      >
        <div>Workspace Content</div>
      </TenantWorkspaceShell>
    );

    const desktopNav = screen.getByRole("navigation", { name: /Store navigation/i });
    expect(desktopNav.textContent).toContain("Dashboard");
    expect(desktopNav.textContent).toContain("Conversations");
    expect(desktopNav.textContent).toContain("Products & Catalog");
    expect(desktopNav.textContent).toContain("Orders & Sales");
    expect(desktopNav.textContent).toContain("Referral Program");
    expect(screen.getAllByText("Store").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Connected").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("locale-option-en-desktop").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("locale-option-es-desktop").getAttribute("aria-pressed")).toBe("false");
  });

  it("permite alternar idioma ES -> EN invocando PATCH /api/tenant/locale y router.refresh()", async () => {
    render(
      <TenantWorkspaceShell
        locale="es"
        tenant={{
          id: "cli-1",
          name: "Synergia Market",
          slug: "synergia-market",
          planName: "Starter",
          connectionHealthy: true,
        }}
        currentUser={{
          id: "usr-1",
          email: "owner@synergia.co",
          displayName: "Maria Owner",
          role: "tenant_owner",
          status: "active",
        }}
      >
        <div>Contenido</div>
      </TenantWorkspaceShell>
    );

    const enButton = screen.getByTestId("locale-option-en-desktop");
    fireEvent.click(enButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/tenant/locale",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: "en" }),
        })
      );
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("locale-option-en-desktop").getAttribute("aria-pressed")).toBe("true");
  });
});
