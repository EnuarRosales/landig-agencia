import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceBillingPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let initialBilling = null;
  let locale: "es" | "en" = "es";
  let isOwner = true;
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    locale = context?.activeClient?.locale === "en" ? "en" : "es";
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

  return <BillingView initialBilling={initialBilling} locale={locale} isOwner={isOwner} />;
}

