import React from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveAuthenticatedPortalContext,
  tenantOnboardingService,
  tenantWorkspaceService,
} from "@mocter/domain";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";
import { TenantOnboardingWizard } from "./tenant-onboarding-wizard";

export const dynamic = "force-dynamic";

export interface OnboardingPageProps {
  searchParams?: Promise<{ plan?: string }>;
}

/**
 * Página principal del asistente unificado de onboarding en 5 pasos (`SPEC-06`).
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const sid = (
    cookieStore.get("__Host-mocter_sid")?.value || cookieStore.get("mocter_sid")?.value
  )?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  if (!sid) {
    redirect("/es/login");
  }

  const portalContext = await resolveAuthenticatedPortalContext(sid, {
    browserAcceptLanguage: acceptLanguage,
    cookieLocale,
  });
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

  const initialLocale = resolvePortalPageLocale({
    context: portalContext,
    cookieLocale,
    tenantLocale: initialState.client?.locale || initialState.draft.business?.locale,
    acceptLanguage,
  });

  return (
    <TenantOnboardingWizard
      initialState={initialState}
      initialBilling={initialBilling}
      initialLocale={initialLocale}
    />
  );
}
