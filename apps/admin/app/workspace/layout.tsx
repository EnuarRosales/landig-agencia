import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";

/**
 * Guardia de navegación para el subárbol operativo del comercio `/workspace/*` (TNT-001 R2, Feature 12).
 *
 * Restringe el acceso a inquilinos autenticados en estado operativo (`scope === 'tenant'` y `lifecycleStatus === 'activo'`).
 * Si un operador de plataforma accede aquí, es redirigido a `/admin`.
 * Si un prospecto o inquilino en estado 'alta' accede, es redirigido a `/onboarding`.
 */
export default async function WorkspaceSubtreeLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    redirect("/es/login");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context) {
    redirect("/es/login");
  }

  if (context.scope !== "tenant" || context.lifecycleStatus !== "activo") {
    if (context.scope === "platform") {
      redirect("/admin");
    } else if (context.lifecycleStatus === "alta" || context.scope === "onboarding_prospect") {
      redirect("/onboarding");
    } else {
      // Cuentas suspendidas o bloqueadas no deben derivarse a onboarding
      redirect("/es/login?error=account_suspended");
    }
  }

  return <>{children}</>;
}
