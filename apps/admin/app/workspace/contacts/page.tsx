import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext, tenantWorkspaceService } from "@mocter/domain";
import { ContactsView } from "./contacts-view";

export const dynamic = "force-dynamic";

export default async function WorkspaceContactsPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let initialContacts: any[] = [];
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.activeClient?.id) {
      try {
        initialContacts = await tenantWorkspaceService.getContacts(context.activeClient.id);
      } catch {
        // Fallback defensivo
      }
    }
  }

  return <ContactsView initialContacts={initialContacts} />;
}

