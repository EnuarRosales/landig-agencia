import { cookies, headers } from "next/headers";
import {
  botConfigUnifiedService,
  isTenantProfileWriterRole,
  resolveAuthenticatedPortalContext,
  type UnifiedTenantBotConfigDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { BotView } from "./bot-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceBotPage() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialConfig: UnifiedTenantBotConfigDto | null = null;
  let readOnly = true;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      readOnly = !isTenantProfileWriterRole(context.role, context.effectiveRoles);
      const res = await botConfigUnifiedService.getUnifiedConfig(context.activeClient.id, {
        actorEmail: context.user?.email ?? undefined,
      });
      if (res.ok) {
        initialConfig = res.data;
      }
    }
  }

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value ?? null,
    tenantLocale: initialConfig?.context.locale ?? null,
    browserAcceptLanguage: requestHeaders.get("accept-language"),
  });

  return (
    <BotView
      initialConfig={initialConfig}
      readOnly={readOnly}
      locale={locale}
    />
  );
}
