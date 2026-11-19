import { cookies, headers } from "next/headers";
import {
  resolveAuthenticatedPortalContext,
  tenantOrdersService,
  tenantProfileService,
  type OrderListResultDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { OrdersView } from "./orders-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceOrdersPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialOrderList: OrderListResultDto | null = null;
  let tenantLocale: string | null = null;
  let initialCurrency = "COP";
  let isOwner = false;
  let context = null;

  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    if (context?.activeClient?.id) {
      tenantLocale = context.activeClient.locale ?? null;
      isOwner =
        context.role === "tenant_owner" ||
        Boolean(context.effectiveRoles?.includes("tenant_owner"));

      const [ordersRes, profileRes] = await Promise.allSettled([
        tenantOrdersService.listOrders(context.activeClient.id, {
          page: 1,
          limit: 20,
          sortBy: "created_at",
          sortDir: "desc",
        }),
        tenantProfileService.getTenantProfile(context.activeClient.id),
      ]);

      if (ordersRes.status === "fulfilled" && ordersRes.value.ok) {
        initialOrderList = ordersRes.value.data;
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
    <OrdersView
      initialOrderList={initialOrderList}
      isOwner={isOwner}
      locale={locale}
      initialCurrency={initialCurrency}
    />
  );
}
