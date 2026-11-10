/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PortalShellRouter } from "./portal-shell-router";
import * as domain from "@mocter/domain";
import * as nextNavigation from "next/navigation";
import * as nextHeaders from "next/headers";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/components/admin-shell", () => ({
  AdminShell: ({ children }: { children?: React.ReactNode }) => <div data-testid="admin-shell">{children}</div>,
}));

vi.mock("@/components/tenant-workspace-shell", () => ({
  TenantWorkspaceShell: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="tenant-workspace-shell">{children}</div>
  ),
}));

describe("apps/admin · PortalShellRouter Component (TNT-001 R2, ADM-D-35)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Redirige a login cuando no hay cookie de sesión activa", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/admin/cells" : null)),
    } as any);

    await expect(PortalShellRouter({ children: <div>Contenido</div> })).rejects.toThrow(/REDIRECT:.*\/es\/login/);
  });

  it("2. Redirige a login cuando la sesión es inválida, revocada o falsificada (resolveAuthenticatedPortalContext devuelve null)", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "invalid_forged_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/admin/cells" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue(null);

    await expect(PortalShellRouter({ children: <div>Contenido</div> })).rejects.toThrow(/REDIRECT:.*\/es\/login/);
  });

  it("3. Intercepta a prospecto intentando acceder a /admin y redirige a /onboarding", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid_prospect_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/admin/cells" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue({
      scope: "onboarding_prospect",
      role: "onboarding_prospect",
      lifecycleStatus: "alta",
      user: { id: "u-prospect", email: "p@mocter.co", displayName: "P", status: "active", emailVerifiedAt: null },
      session: { id: "s-1" },
      effectiveRoles: ["onboarding_prospect"],
      activeClientId: null,
      activeClient: null,
      activeCellId: null,
      activeCellCode: null,
      planName: null,
      capabilities: {},
    });

    await expect(PortalShellRouter({ children: <div>Contenido</div> })).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("4. Intercepta a inquilino intentando acceder a /admin y redirige a /workspace", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid_tenant_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/admin/cells" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue({
      scope: "tenant",
      role: "tenant_owner",
      lifecycleStatus: "activo",
      user: { id: "u-tenant", email: "t@mocter.co", displayName: "T", status: "active", emailVerifiedAt: null },
      session: { id: "s-2" },
      effectiveRoles: ["tenant_owner"],
      activeClientId: "c-1",
      activeClient: { id: "c-1", slug: "tienda", displayName: "Tienda", name: "Tienda", lifecycleStatus: "activo", planId: "p-1" },
      activeCellId: "cell-1",
      activeCellCode: "cell-01",
      planName: "Plan Pro",
      capabilities: {},
    });

    await expect(PortalShellRouter({ children: <div>Contenido</div> })).rejects.toThrow("REDIRECT:/workspace");
  });

  it("5. Intercepta a operador de plataforma en /workspace y redirige a /admin", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid_platform_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/workspace/products" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue({
      scope: "platform",
      role: "platform_owner",
      lifecycleStatus: null,
      user: { id: "u-platform", email: "soporte@mocter.co", displayName: "Soporte", status: "active", emailVerifiedAt: null },
      session: { id: "s-3" },
      effectiveRoles: ["platform_owner"],
      activeClientId: null,
      activeClient: null,
      activeCellId: null,
      activeCellCode: null,
      planName: null,
      capabilities: {},
    });

    await expect(PortalShellRouter({ children: <div>Contenido</div> })).rejects.toThrow("REDIRECT:/admin");
  });

  it("6. Renderiza TenantWorkspaceShell para inquilino en /workspace", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid_tenant_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/workspace" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue({
      scope: "tenant",
      role: "tenant_owner",
      lifecycleStatus: "activo",
      user: { id: "u-tenant", email: "t@mocter.co", displayName: "T", status: "active", emailVerifiedAt: null },
      session: { id: "s-2" },
      effectiveRoles: ["tenant_owner"],
      activeClientId: "c-1",
      activeClient: { id: "c-1", slug: "tienda", displayName: "Tienda", name: "Tienda", lifecycleStatus: "activo", planId: "p-1" },
      activeCellId: "cell-1",
      activeCellCode: "cell-01",
      planName: "Plan Pro",
      capabilities: {},
    });

    const element = await PortalShellRouter({ children: <div>Contenido Tienda</div> });
    render(element as React.ReactElement);

    expect(screen.getByTestId("tenant-workspace-shell")).toBeDefined();
    expect(screen.getByText("Contenido Tienda")).toBeDefined();
  });

  it("7. Renderiza AdminShell para operador de plataforma en /admin", async () => {
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "valid_platform_sid" }),
    } as any);

    vi.mocked(nextHeaders.headers).mockResolvedValue({
      get: vi.fn().mockImplementation((k: string) => (k === "x-pathname" ? "/admin/cells" : null)),
    } as any);

    vi.spyOn(domain, "resolveAuthenticatedPortalContext").mockResolvedValue({
      scope: "platform",
      role: "platform_owner",
      lifecycleStatus: null,
      user: { id: "u-platform", email: "soporte@mocter.co", displayName: "Soporte", status: "active", emailVerifiedAt: null },
      session: { id: "s-3" },
      effectiveRoles: ["platform_owner"],
      activeClientId: null,
      activeClient: null,
      activeCellId: null,
      activeCellCode: null,
      planName: null,
      capabilities: {},
    });

    const element = await PortalShellRouter({ children: <div>Control Plane</div> });
    render(element as React.ReactElement);

    expect(screen.getByTestId("admin-shell")).toBeDefined();
    expect(screen.getByText("Control Plane")).toBeDefined();
  });
});
