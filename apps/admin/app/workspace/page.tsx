import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { WorkspaceDashboardView } from "./workspace-dashboard-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let initialData = null;
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      try {
        initialData = await tenantWorkspaceService.getDashboard(context.activeClient.id);
      } catch {
        // Fallback defensivo
      }
    }
  }

  return <WorkspaceDashboardView initialData={initialData} />;
}

