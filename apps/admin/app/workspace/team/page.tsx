import { cookies, headers } from "next/headers";
import {
  getTenantContactsAndUsersService,
  resolveAuthenticatedPortalContext,
  type TeamListResultDto,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { TeamView } from "./team-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceTeamPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  let initialData: TeamListResultDto | null = null;
  let tenantLocale: string | null = null;
  let isOwner = false;

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
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

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value,
    tenantLocale,
    browserAcceptLanguage: headerStore.get("accept-language"),
  });

  return (
    <TeamView
      initialData={initialData}
      isOwner={isOwner}
      locale={locale}
    />
  );
}
