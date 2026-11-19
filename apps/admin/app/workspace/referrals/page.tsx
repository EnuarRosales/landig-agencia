import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getReferralsService,
  resolveAuthenticatedPortalContext,
  type TenantReferralsOverviewDto,
} from "@mocter/domain";
import { env } from "@/env";
import { TenantReferralsView } from "./referrals-view";

export const dynamic = "force-dynamic";

/**
 * Página del Programa de Referidos para el propietario del comercio (`/workspace/referrals`, `SPEC-16`).
 *
 * Restringida exclusivamente a propietarios (`tenant_owner` / `tenancy_owner`); los agentes
 * son redirigidos al tablero principal del comercio.
 */
export default async function WorkspaceReferralsPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialData: TenantReferralsOverviewDto | null = null;
  let locale: "es" | "en" = "es";

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context) {
      locale = context.activeClient?.locale === "en" ? "en" : "es";
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

  return <TenantReferralsView initialData={initialData} locale={locale} />;
}
