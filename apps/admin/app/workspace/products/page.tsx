import { cookies, headers } from "next/headers";
import {
  getTenantProductsAndMediaService,
  resolveAuthenticatedPortalContext,
  tenantProfileService,
  tenantWorkspaceService,
  type CatalogListResultDto,
  type WorkspaceBillingDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { ProductsView } from "./products-view";

export const dynamic = "force-dynamic";

/**
 * Página SSR del catálogo de productos, combos, inventario y multimedia del comercio (`SPEC-08`).
 */
export default async function WorkspaceProductsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialCatalog: CatalogListResultDto | null = null;
  let initialBilling: WorkspaceBillingDto | null = null;
  let tenantLocale: string | null = null;
  let initialCurrency = "COP";
  let canDelete = false;
  let context = null;

  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    if (context?.activeClient?.id) {
      tenantLocale = context.activeClient.locale ?? null;
      canDelete =
        context.role === "tenant_owner" ||
        Boolean(context.effectiveRoles?.includes("tenant_owner"));

      const service = getTenantProductsAndMediaService();
      const [catalogRes, billingRes, profileRes] = await Promise.allSettled([
        service.listCatalog(context.activeClient.id, {
          page: 1,
          limit: 20,
          sortBy: "createdAt",
          sortDir: "desc",
        }),
        tenantWorkspaceService.getBillingDetails(context.activeClient.id),
        tenantProfileService.getTenantProfile(context.activeClient.id),
      ]);

      if (catalogRes.status === "fulfilled" && catalogRes.value.ok) {
        initialCatalog = catalogRes.value.data;
      }
      if (billingRes.status === "fulfilled") {
        initialBilling = billingRes.value;
      }
      if (profileRes.status === "fulfilled" && profileRes.value.ok) {
        tenantLocale = profileRes.value.data.locale;
        initialCurrency = profileRes.value.data.currency || "COP";
      }
    }
  }

  const locale = resolvePortalPageLocale({
    context,
    cookieLocale,
    tenantLocale,
    acceptLanguage,
  });

  return (
    <ProductsView
      initialCatalog={initialCatalog}
      initialBilling={initialBilling}
      canDelete={canDelete}
      locale={locale}
      initialCurrency={initialCurrency}
    />
  );
}
