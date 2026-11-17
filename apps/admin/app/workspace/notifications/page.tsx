import { cookies, headers } from "next/headers";
import {
  getNotificationDispatcherService,
  resolveAuthenticatedPortalContext,
  type TenantNotificationsResponseDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { TenantNotificationsView } from "./notifications-view";

export const dynamic = "force-dynamic";

const EMPTY_NOTIFICATIONS_DATA: TenantNotificationsResponseDto = {
  unreadCount: 0,
  notifications: [],
  total: 0,
  page: 1,
  limit: 20,
  canManagePreferences: false,
  preferences: [],
};

/**
 * Vista principal de `/workspace/notifications`: Centro De Mensajes y Preferencias De Alertas del comercio (`SPEC-14`).
 */
export default async function WorkspaceNotificationsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialData: TenantNotificationsResponseDto = EMPTY_NOTIFICATIONS_DATA;
  let tenantLocale: string | null = null;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      tenantLocale = context.activeClient.locale ?? null;
      const isOwner =
        context.role === "tenant_owner" ||
        context.role === "tenancy_owner" ||
        Boolean(context.effectiveRoles?.includes("tenant_owner")) ||
        Boolean(context.effectiveRoles?.includes("tenancy_owner"));

      try {
        const service = getNotificationDispatcherService();
        initialData = await service.listTenantInboxAndPreferences(context.activeClient.id, {
          unreadOnly: false,
          page: 1,
          limit: 20,
          viewerRole: isOwner ? "tenant_owner" : "tenant_agent",
        });
      } catch {
        initialData = { ...EMPTY_NOTIFICATIONS_DATA, canManagePreferences: isOwner };
      }
    }
  }

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value,
    tenantLocale,
    browserAcceptLanguage: headerStore.get("accept-language"),
  });

  return <TenantNotificationsView initialData={initialData} locale={locale} />;
}
