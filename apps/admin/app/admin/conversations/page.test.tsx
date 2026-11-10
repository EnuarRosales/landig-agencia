import React from "react";
import { describe, expect, it } from "vitest";
import AdminConversationsPage from "./page";

interface ComponentWithClassName {
  props?: {
    className?: string;
    children?: React.ReactElement;
  };
}

describe("ADM-001 D-32 / CHW-001 · Vista de Chatwoot embebido same-site", () => {
  it("construye el contenedor principal y el iframe con atributos sandbox restrictivos", async () => {
    const page = await AdminConversationsPage();
    expect(page.type).toBe("main");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBeGreaterThan(1);

    const iframeWrapper = children.find(
      (child): child is React.ReactElement<ComponentWithClassName> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: string })?.className === "string" &&
        ((child.props as { className?: string }).className?.includes("overflow-hidden") ?? false),
    );
    expect(iframeWrapper).toBeDefined();

    const iframe = (iframeWrapper?.props as { children: React.ReactElement<any> }).children as React.ReactElement<any>;
    expect(iframe.type).toBe("iframe");
    expect(iframe.props.title).toBe("Chatwoot Omnichannel Inbox");
    expect(iframe.props.sandbox).toContain("allow-same-origin");
    expect(iframe.props.sandbox).toContain("allow-scripts");
    expect(iframe.props.allow).toContain("camera");
    expect(iframe.props.src).toContain("/app/accounts/1/settings");
  });

  it("permite conmutar hacia la vista de super_admin para el Platform Owner", async () => {
    const page = await AdminConversationsPage({ searchParams: Promise.resolve({ view: "super_admin" }) });
    const children = React.Children.toArray(page.props.children);
    const iframeWrapper = children.find(
      (child): child is React.ReactElement<ComponentWithClassName> =>
        React.isValidElement(child) &&
        typeof (child.props as { className?: string })?.className === "string" &&
        ((child.props as { className?: string }).className?.includes("overflow-hidden") ?? false),
    );
    const iframe = (iframeWrapper?.props as { children: React.ReactElement<any> }).children as React.ReactElement<any>;
    expect(iframe.props.src).toContain("/super_admin");
  });
});
