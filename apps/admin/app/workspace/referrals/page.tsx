import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getReferralsService,
  resolveAuthenticatedPortalContext,
  type TenantReferralsOverviewDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { TenantReferralsView } from "./referrals-view";

export const dynamic = "force-dynamic";

/**
 * Página del Programa de Referidos para el propietario del comercio (`/workspace/referrals`, `SPEC-16`).
 *
 * Restringida exclusivamente a propietarios (`tenant_owner` / `tenancy_owner`); los agentes
 * son redirigidos al tablero principal del comercio.
 */
export default async function WorkspaceReferralsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialData: TenantReferralsOverviewDto | null = null;
  let context = null;

  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    if (context) {
      const isOwner =
        context.role === "tenant_owner" ||
        context.role === "tenancy_owner" ||
        context.effectiveRoles.includes("tenant_owner") ||
        context.effectiveRoles.includes("tenancy_owner");

      if (!isOwner) {
        redirect("/workspace");
      }

      if (context.activeClient?.id) {
        const res = await getReferralsService().getTenantReferralsOverview(
          context.activeClient.id,
          context.activeClient.slug || "comercio",
          env.NEXT_PUBLIC_APP_URL,
          { page: 1, limit: 20 },
        );
        if (res.ok) {
          initialData = res.data;
        }
      }
    }
  }

  const locale = resolvePortalPageLocale({
    context,
    cookieLocale,
    acceptLanguage,
  });

  return <TenantReferralsView initialData={initialData} locale={locale} />;
}
