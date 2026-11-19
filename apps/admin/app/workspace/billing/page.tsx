import { cookies, headers } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceBillingPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialBilling = null;
  let isOwner = true;
  let context = null;
  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    const resolvedRole = context?.role as string | undefined;
    isOwner = !resolvedRole || resolvedRole === "tenant_owner" || resolvedRole === "tenancy_owner";
    if (context?.activeClient?.id) {
      try {
        initialBilling = await tenantWorkspaceService.getBillingDetails(context.activeClient.id);
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

  return <BillingView initialBilling={initialBilling} locale={locale} isOwner={isOwner} />;
}

