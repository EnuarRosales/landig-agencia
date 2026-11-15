import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";

async function readWorkspaceContextFromCookies() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  if (!sid) {
    return null;
  }

  return resolveAuthenticatedPortalContext(sid);
}

/**
 * Metadatos dinámicos del workspace del comercio (título y favicon personalizados para marca blanca).
 */
export async function generateMetadata(): Promise<Metadata> {
  const context = await readWorkspaceContextFromCookies();
  if (!context || context.scope !== "tenant" || !context.branding) {
    return {};
  }

  const metadata: Metadata = {};
  if (context.branding.brandName?.trim()) {
    metadata.title = context.branding.brandName.trim();
  }
  if (context.branding.faviconUrl?.trim()) {
    metadata.icons = { icon: context.branding.faviconUrl.trim() };
  }
  return metadata;
}

/**
 * Guardia de navegación e inyección de tokens seguros de marca blanca para `/workspace/*`.
 */
export default async function WorkspaceSubtreeLayout({ children }: { children: ReactNode }) {
  const context = await readWorkspaceContextFromCookies();

  if (!context) {
    redirect("/es/login");
  }

  if (context.scope !== "tenant" || context.lifecycleStatus !== "activo") {
    if (context.scope === "platform") {
      redirect("/admin");
    } else if (context.lifecycleStatus === "alta" || context.scope === "onboarding_prospect") {
      redirect("/onboarding");
    } else {
      redirect("/es/login?error=account_suspended");
    }
  }

  const brandingStyle =
    context.brandingTokens && Object.keys(context.brandingTokens).length > 0
      ? (context.brandingTokens as React.CSSProperties)
      : undefined;

  return (
    <div style={brandingStyle} className="w-full">
      {children}
    </div>
  );
}
