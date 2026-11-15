import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveAuthenticatedPortalContext,
  tenantOnboardingService,
  tenantWorkspaceService,
} from "@mocter/domain";
import { resolveActiveLocale } from "@/lib/i18n";
import { TenantOnboardingWizard } from "./tenant-onboarding-wizard";

export const dynamic = "force-dynamic";

export interface OnboardingPageProps {
  searchParams?: Promise<{ plan?: string }>;
}

/**
 * Página principal del asistente unificado de onboarding en 5 pasos (`SPEC-06`).
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const cookieStore = await cookies();
  const sid = (
    cookieStore.get("__Host-mocter_sid")?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();

  if (!sid) {
    redirect("/es/login");
  }

  const portalContext = await resolveAuthenticatedPortalContext(sid);
  if (!portalContext?.user) {
    redirect("/es/login");
  }

  if (portalContext.scope === "tenant" && portalContext.lifecycleStatus === "activo") {
    redirect("/workspace");
  }

  const resolvedParams = searchParams ? await searchParams : undefined;
  const preselectedPlanCode = resolvedParams?.plan?.trim() || undefined;

  const stateRes = await tenantOnboardingService.getOnboardingState(portalContext.user.id, {
    preselectedPlanCode,
  });

  const initialState = stateRes.ok
    ? stateRes.data
    : {
        step: 1 as const,
        stepKey: "business" as const,
        client: null,
        draft: {},
        availablePlans: [],
        botCatalog: { tones: [], presets: [], objectives: [] },
        paymentChannels: [],
      };

  const clientIdForBilling =
    portalContext.activeClientId || (stateRes.ok ? stateRes.data.client?.id : undefined);
  let initialBilling = null;
  if (clientIdForBilling) {
    try {
      initialBilling = await tenantWorkspaceService.getBillingDetails(clientIdForBilling);
    } catch {
      // Fallback defensivo si no hay detalle de facturación aún
    }
  }

  const initialLocale = resolveActiveLocale({
    tenantLocale: initialState.client?.locale || initialState.draft.business?.locale,
  });

  return (
    <TenantOnboardingWizard
      initialState={initialState}
      initialBilling={initialBilling}
      initialLocale={initialLocale}
    />
  );
}
