import { cookies, headers } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialData = null;
  let context = null;
  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    if (context?.activeClient?.id) {
      try {
        initialData = await tenantWorkspaceService.getDashboard(context.activeClient.id);
      } catch {
        // Fallback defensivo
      }
    }
  }

  const locale = resolvePortalPageLocale({
    context,
    cookieLocale,
    acceptLanguage,
  });

  return <WorkspaceDashboardView initialData={initialData} locale={locale} />;
}

