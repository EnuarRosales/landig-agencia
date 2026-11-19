import { cookies, headers } from "next/headers";
import {
  getTenantContactsAndUsersService,
  resolveAuthenticatedPortalContext,
  type TeamListResultDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { TeamView } from "./team-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceTeamPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let initialData: TeamListResultDto | null = null;
  let tenantLocale: string | null = null;
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
      try {
        const service = getTenantContactsAndUsersService();
        initialData = await service.listTeamAndInvitations(context.activeClient.id, {
          viewerRole: isOwner ? "tenant_owner" : "tenant_agent",
          page: 1,
          limit: 20,
          sortBy: "joined_at",
          sortDir: "desc",
        });
      } catch {
        // Fallback defensivo
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
    <TeamView
      initialData={initialData}
      isOwner={isOwner}
      locale={locale}
    />
  );
}
