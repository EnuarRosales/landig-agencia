import { cookies, headers } from "next/headers";
import {
  resolveAuthenticatedPortalContext,
  tenantChatwootEmbedService,
  type WorkspaceConversationsPageState,
} from "@mocter/domain";
import { env } from "@/env";
import { resolveActiveLocale } from "@/lib/i18n";
import { WorkspaceConversationsView } from "./conversations-view";

export const dynamic = "force-dynamic";

/**
 * Página del módulo «Conversaciones» en el Backoffice del comercio (`SPEC-13`).
 *
 * Resuelve en el servidor la sesión, el idioma activo, el preflight de acceso/cuenta en Chatwoot
 * y delega la interacción y el ciclo del iframe same-site a {@link WorkspaceConversationsView}.
 */
export default async function WorkspaceConversationsPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (
    cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  const requestId = headerStore.get("x-request-id") ?? undefined;
  let tenantLocale: string | null = null;
  let initialState: WorkspaceConversationsPageState = {
    status: "no_capability",
    accountId: null,
    isOwner: false,
  };

  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    if (context?.user) {
      tenantLocale = context.activeClient?.locale ?? null;
      initialState = await tenantChatwootEmbedService.resolveWorkspacePageState({
        clientId: context.activeClient?.id,
        userId: context.user.id,
        role: context.role,
        effectiveRoles: context.effectiveRoles,
        hasCapability: Boolean(context.capabilities?.chatwoot_inboxes),
      });
    }
  }

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value,
    tenantLocale,
    browserAcceptLanguage: headerStore.get("accept-language"),
  });

  return (
    <WorkspaceConversationsView
      initialState={initialState}
      locale={locale}
      requestId={requestId}
    />
  );
}
