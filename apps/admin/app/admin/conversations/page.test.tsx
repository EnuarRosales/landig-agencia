import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminConversationsPage from "./page";

// Mock de fetchAdminChatwootOverview de @mocter/domain
vi.mock("@mocter/domain", () => ({
  fetchAdminChatwootOverview: vi.fn().mockResolvedValue({
    kpis: {
      totalAccounts: 10,
      activeAccounts: 8,
      failedOrPendingAccounts: 2,
      catalogCapabilitiesCount: 42,
    },
  }),
}));

interface ComponentWithClassName {
  props?: {
    className?: string;
    children?: React.ReactElement;
  };
}

describe("CHW-002 T-08 / D-06 · Consola SaaS Super Admin (/admin/conversations)", () => {
  it("renderiza la consola SaaS con KPIs y el iframe SSO apuntando por defecto a /super_admin", async () => {
    const page = await AdminConversationsPage();
    expect(page.type).toBe("main");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBeGreaterThan(2);

    const iframeWrapper = children.find(
      (child): child is React.ReactElement<ComponentWithClassName> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: string })?.className === "string" &&
        ((child.props as { className?: string }).className?.includes("overflow-hidden") ?? false),
    );
    expect(iframeWrapper).toBeDefined();

    const iframe = (iframeWrapper?.props as { children: React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>> }).children as React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>>;
    expect(iframe.type).toBe("iframe");
    expect(iframe.props.title).toBe("Consola Super Admin Chatwoot");
    expect(iframe.props.sandbox).toContain("allow-same-origin");
    expect(iframe.props.sandbox).toContain("allow-scripts");
    expect(iframe.props.allow).toContain("camera");
    expect(iframe.props.allow).toContain("keyboard-map");
    expect(iframe.props.src).toContain("/api/auth/chatwoot/embed?scope=admin");
    expect(iframe.props.src).toContain("targetPath=%2Fsuper_admin");
  });

  it("permite conmutar hacia la vista de cuentas (/super_admin/accounts)", async () => {
    const page = await AdminConversationsPage({ searchParams: Promise.resolve({ view: "accounts" }) });
    const children = React.Children.toArray(page.props.children);
    const iframeWrapper = children.find(
      (child): child is React.ReactElement<ComponentWithClassName> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: string })?.className === "string" &&
        ((child.props as { className?: string }).className?.includes("overflow-hidden") ?? false),
    );
    const iframe = (iframeWrapper?.props as { children: React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>> }).children as React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>>;
    expect(iframe.props.src).toContain("targetPath=%2Fsuper_admin%2Faccounts");
  });

  it("permite cargar la ficha directa de una cuenta específica con accountId", async () => {
    const page = await AdminConversationsPage({ searchParams: Promise.resolve({ accountId: "123" }) });
    const children = React.Children.toArray(page.props.children);
    const iframeWrapper = children.find(
      (child): child is React.ReactElement<ComponentWithClassName> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: string })?.className === "string" &&
        ((child.props as { className?: string }).className?.includes("overflow-hidden") ?? false),
    );
    const iframe = (iframeWrapper?.props as { children: React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>> }).children as React.ReactElement<React.IframeHTMLAttributes<HTMLIFrameElement>>;
    expect(iframe.props.src).toContain("targetPath=%2Fsuper_admin%2Faccounts%2F123");
  });
});
