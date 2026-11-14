import { cookies, headers } from "next/headers";
import {
  isTenantProfileWriterRole,
  resolveAuthenticatedPortalContext,
  tenantPaymentChannelsService,
  tenantProfileService,
  type TenantPaymentChannelDto,
  type TenantProfileDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

/**
 * Página del servidor para Perfil Del Negocio (`/workspace/profile`).
 * Resuelve el contexto autenticado del comercio, el idioma activo y carga perfil y canales de pago en paralelo.
 */
export default async function WorkspaceProfilePage() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialProfile: TenantProfileDto | null = null;
  let initialChannels: TenantPaymentChannelDto[] = [];
  let readOnly = true;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context && context.activeClient?.id) {
      readOnly = !isTenantProfileWriterRole(context.role, context.effectiveRoles);

      const [profileRes, channelsRes] = await Promise.all([
        tenantProfileService.getTenantProfile(context.activeClient.id),
        tenantPaymentChannelsService.listChannels(context.activeClient.id),
      ]);

      if (profileRes.ok) {
        initialProfile = profileRes.data;
      }
      if (channelsRes.ok) {
        initialChannels = channelsRes.data;
      }
    }
  }

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value ?? null,
    tenantLocale: initialProfile?.locale ?? null,
    browserAcceptLanguage: requestHeaders.get("accept-language"),
  });

  return (
    <ProfileView
      initialProfile={initialProfile}
      initialChannels={initialChannels}
      readOnly={readOnly}
      locale={locale}
    />
  );
}
