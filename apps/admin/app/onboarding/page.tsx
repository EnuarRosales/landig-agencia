import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveAuthenticatedPortalContext,
  tenantOnboardingService,
} from "@mocter/domain";
import { TenantOnboardingWizard } from "./tenant-onboarding-wizard";

export const dynamic = "force-dynamic";

/**
 * Página principal del Asistente de Onboarding en 3 Pasos (ADM-001 D-36, TNT-001 RF-03).
 *
 * Servidor autoritativo:
 * - Resuelve la sesión y verifica que el usuario sea prospecto o inquilino en estado 'alta'.
 * - Carga el estado inicial (pre-cargando los datos del comercio en alta manual o vacío en alta autónoma).
 * - Renderiza el cascarón limpio sin barras laterales corporativas ni de comercio (PortalShellRouter).
 */
export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    redirect("/es/login");
  }

  const portalContext = await resolveAuthenticatedPortalContext(sid);
  if (!portalContext?.user) {
    redirect("/es/login");
  }

  // Si el inquilino ya está activado, enviarlo a su espacio de trabajo
  if (portalContext.scope === "tenant" && portalContext.lifecycleStatus === "activo") {
    redirect("/workspace");
  }

  const stateRes = await tenantOnboardingService.getOnboardingState(portalContext.user.id);
  const initialState = stateRes.ok
    ? stateRes.data
    : {
        step: 1 as const,
        client: null,
        draft: {},
        availablePlans: [],
      };

  return <TenantOnboardingWizard initialState={initialState} />;
}

