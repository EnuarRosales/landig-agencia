import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { TeamView } from "./team-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceTeamPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let initialMembers: any[] = [];
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      try {
        initialMembers = await tenantWorkspaceService.getTeamMembers(context.activeClient.id);
      } catch {
        // Fallback defensivo
      }
    }
  }

  return <TeamView initialMembers={initialMembers} />;
}

