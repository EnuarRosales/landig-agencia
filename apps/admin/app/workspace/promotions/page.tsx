import { cookies, headers } from "next/headers";
import {
  getTenantProductsAndMediaService,
  getTenantPromotionsService,
  resolveAuthenticatedPortalContext,
  tenantProfileService,
  type ProductListItemDto,
  type PromotionListResultDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { PromotionsView } from "./promotions-view";

export const dynamic = "force-dynamic";

/**
 * Página SSR de la Central de Promociones y Descuentos Comerciales Automáticos (`/workspace/promotions`).
 */
export default async function WorkspacePromotionsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialPromotions: PromotionListResultDto | null = null;
  let catalogProducts: ProductListItemDto[] = [];
  let tenantLocale: string | null = null;
  let currency = "COP";
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

      const promotionsSvc = getTenantPromotionsService();
      const productsSvc = getTenantProductsAndMediaService();

      const [promotionsRes, catalogRes, profileRes] = await Promise.allSettled([
        promotionsSvc.listPromotions(context.activeClient.id, { page: 1, limit: 20 }),
        productsSvc.listCatalog(context.activeClient.id, { page: 1, limit: 50, status: "active" }),
        tenantProfileService.getTenantProfile(context.activeClient.id),
      ]);

      if (promotionsRes.status === "fulfilled" && promotionsRes.value.ok) {
        initialPromotions = promotionsRes.value.data;
      }
      if (catalogRes.status === "fulfilled" && catalogRes.value.ok) {
        catalogProducts = catalogRes.value.data.items;
      }
      if (profileRes.status === "fulfilled" && profileRes.value.ok) {
        tenantLocale = profileRes.value.data.locale;
        currency = profileRes.value.data.currency || "COP";
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
    <PromotionsView
      initialPromotions={initialPromotions}
      catalogProducts={catalogProducts}
      canDelete={canDelete}
      locale={locale}
      currency={currency}
    />
  );
}
