import { cookies, headers } from "next/headers";
import {
  resolveAuthenticatedPortalContext,
  tenantAiSettingsService,
  type TenantAiSettingsOverviewDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { AiSettingsView } from "./ai-settings-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceAiSettingsPage() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = requestHeaders.get("accept-language");

  let initialOverview: TenantAiSettingsOverviewDto | null = null;
  let isOwner = false;
  let context = null;

  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    if (context && context.activeClient?.id) {
      isOwner =
        context.role === "tenant_owner" ||
        context.role === "tenancy_owner" ||
        context.effectiveRoles.includes("tenant_owner");

      if (isOwner) {
        const res = await tenantAiSettingsService.getSettingsOverview(
          context.activeClient.id,
        );
        if (res.ok) {
          initialOverview = res.data;
        }
      }
    }
  }

  const locale = resolvePortalPageLocale({
    context,
    cookieLocale,
    acceptLanguage,
  });

  return (
    <AiSettingsView
      initialOverview={initialOverview}
      isOwner={isOwner}
      locale={locale}
    />
  );
}
