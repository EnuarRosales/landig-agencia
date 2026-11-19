import { cookies, headers } from "next/headers";
import {
  DrizzleTenantCapabilityGateRepository,
  getCommunitiesGovernanceService,
  resolveAuthenticatedPortalContext,
  TenantCapabilityGateService,
  type TenantCommunitiesOverviewDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { CommunityView } from "./community-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Comunidad de Comercios · mocter-admin",
  description:
    "Catálogo compartido B2B, clonación segura de productos, redes colaborativas y radar de impacto.",
};

/**
 * Página SSR de Comunidades y Catálogo Compartido del comercio (`SPEC-15`).
 */
export default async function WorkspaceCommunityPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const [cookieStore, headerStore, resolvedSearchParams] = await Promise.all([
    cookies(),
    headers(),
    props.searchParams ?? Promise.resolve({}),
  ]);

  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialOverview: TenantCommunitiesOverviewDto | null = null;
  let capabilityEnabled = false;
  let isOwner = false;
  let tenantLocale: string | null = null;
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
        context.role === "tenancy_owner" ||
        Boolean(context.effectiveRoles?.includes("tenant_owner")) ||
        Boolean(context.effectiveRoles?.includes("tenancy_owner"));

      const gate = new TenantCapabilityGateService(
        new DrizzleTenantCapabilityGateRepository(),
      );
      const capRes = await gate.assertCapability(context.activeClient.id, "community_feed");
      capabilityEnabled = capRes.ok;

      if (capabilityEnabled) {
        const govRes = await getCommunitiesGovernanceService().getTenantOverview(
          context.activeClient.id,
        );
        if (govRes.ok) {
          initialOverview = govRes.data;
        }
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
    <CommunityView
      initialOverview={initialOverview}
      capabilityEnabled={capabilityEnabled}
      isOwner={isOwner}
      locale={locale}
      initialTab={(resolvedSearchParams as { tab?: string }).tab}
    />
  );
}
