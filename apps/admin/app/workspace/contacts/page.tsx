import { cookies, headers } from "next/headers";
import {
  getTenantCrmService,
  resolveAuthenticatedPortalContext,
  tenantProfileService,
  type CrmContactListResultDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { ContactsView } from "./contacts-view";

export const dynamic = "force-dynamic";

/**
 * Página SSR del directorio CRM omnicanal con prioridad WhatsApp (`SPEC-09`).
 */
export default async function WorkspaceContactsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialList: CrmContactListResultDto | null = null;
  let tenantLocale: string | null = null;
  let canDelete = false;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      tenantLocale = context.activeClient.locale ?? null;
      canDelete =
        context.role === "tenant_owner" ||
        Boolean(context.effectiveRoles?.includes("tenant_owner"));

      const crmService = getTenantCrmService();
      const [listRes, profileRes] = await Promise.allSettled([
        crmService.listContacts(context.activeClient.id, {
          page: 1,
          limit: 20,
          sortBy: "whatsapp_priority",
          sortDir: "desc",
        }),
        tenantProfileService.getTenantProfile(context.activeClient.id),
      ]);

      if (listRes.status === "fulfilled" && listRes.value.ok) {
        initialList = listRes.value.data;
      }
      if (profileRes.status === "fulfilled" && profileRes.value.ok) {
        tenantLocale = profileRes.value.data.locale;
      }
    }
  }

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value,
    tenantLocale,
    browserAcceptLanguage: headerStore.get("accept-language"),
  });

  return <ContactsView initialList={initialList} canDelete={canDelete} locale={locale} />;
}
