import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ALLOWED_WHITE_LABEL_FONTS,
  getWhiteLabelService,
  resolveAuthenticatedPortalContext,
} from "@mocter/domain";
import { siteConfig } from "@/config/site";
import { WorkspaceBrandingView } from "./branding-view";

export const dynamic = "force-dynamic";

function resolveCnameTarget(adminUrl: string): string {
  try {
    const parsed = new URL(adminUrl);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return "cname.mocter.co";
    }
    return parsed.hostname;
  } catch {
    return "cname.mocter.co";
  }
}

/**
 * Página del módulo de Identidad y Marca Blanca (`/workspace/branding`).
 */
export default async function WorkspaceBrandingPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  if (!sid) {
    redirect("/es/login");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context || !context.activeClient?.id) {
    redirect("/es/login");
  }

  const whiteLabelService = getWhiteLabelService();
  const [mode, brandingRes] = await Promise.all([
    whiteLabelService.getCapabilityMode(context.activeClient.id),
    whiteLabelService.getActiveBranding(context.activeClient.id),
  ]);

  const effectiveMode = context.whiteLabelMode ?? mode;
  const activeBranding = brandingRes.ok ? brandingRes.data : context.branding ?? null;
  const isOwner =
    context.role !== "tenant_agent" &&
    (!context.effectiveRoles?.length ||
      context.effectiveRoles.includes("tenant_owner") ||
      context.role === "tenant_owner");

  return (
    <WorkspaceBrandingView
      locale={context.activeClient.locale === "en" ? "en" : "es"}
      isOwner={isOwner}
      tenantName={context.activeClient.displayName || context.activeClient.name || "Mi Comercio"}
      tenantSlug={context.activeClient.slug || "comercio"}
      initialMode={effectiveMode}
      initialBranding={activeBranding}
      initialLogoUrl={context.activeClient.logoUrl ?? null}
      allowedFonts={[...ALLOWED_WHITE_LABEL_FONTS]}
      cnameTargetHost={resolveCnameTarget(siteConfig.adminUrl)}
    />
  );
}
