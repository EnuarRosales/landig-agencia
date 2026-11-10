import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";

/**
 * Guardia de navegación para el subárbol administrativo `/admin/*` (ADM-001 D-35, Feature 12).
 *
 * Restringe el acceso estrictamente a operadores con rol activo de plataforma (`scope === 'platform'`).
 * Si un inquilino o prospecto intenta navegar a rutas `/admin/*`, es interceptado y redirigido
 * de manera determinística a `/workspace` o `/onboarding`.
 */
export default async function AdminSubtreeLayout({ children }: { children: ReactNode }) {
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

  if (context.scope !== "platform") {
    if (context.scope === "tenant" && context.lifecycleStatus === "activo") {
      redirect("/workspace");
    } else {
      redirect("/onboarding");
    }
  }

  return <>{children}</>;
}
