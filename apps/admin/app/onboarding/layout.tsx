import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";

/**
 * Guardia de navegación para el subárbol de alta y conversión `/onboarding/*` (TNT-001 R2/R3, Feature 12).
 *
 * Permite el acceso a prospectos e inquilinos en estado 'alta'.
 * Si un inquilino ya activado (`lifecycleStatus === 'activo'`) visita esta ruta, es redirigido a `/workspace`.
 */
export default async function OnboardingSubtreeLayout({ children }: { children: ReactNode }) {
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

  if (context.scope === "tenant" && context.lifecycleStatus === "activo") {
    redirect("/workspace");
  }

  return <>{children}</>;
}
