import { cookies, headers } from "next/headers";
import {
  resolveAuthenticatedPortalContext,
  tenantAiSettingsService,
  type TenantAiSettingsOverviewDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { AiSettingsView } from "./ai-settings-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceAiSettingsPage() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value ?? null,
    browserAcceptLanguage: requestHeaders.get("accept-language"),
  });

  let initialOverview: TenantAiSettingsOverviewDto | null = null;
  let isOwner = false;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
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

  return (
    <AiSettingsView
      initialOverview={initialOverview}
      isOwner={isOwner}
      locale={locale}
    />
  );
}
