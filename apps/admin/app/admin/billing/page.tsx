import React from "react";
import { fetchAdminPlans, getBillingService } from "@mocter/domain";
import { BillingTabsView } from "./billing-tabs-view";

export const metadata = {
  title: "Facturación Y Planes · mocter-admin",
  description: "Gobernanza comercial, catálogo de planes, suscripciones de inquilinos y pasarelas Wompi / Stripe.",
};

/**
 * Página principal del módulo de Facturación y Suscripciones SaaS (BILL-001 D-10).
 * Consolida catálogo comercial, suscripciones de inquilinos, comprobantes contables y pasarelas.
 */
export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sParams = await searchParams;
  const initialTab = sParams?.tab || "subscriptions";

  const billingService = getBillingService();
  const [plansList, overviewResult, gatewaysResult] = await Promise.all([
    fetchAdminPlans(),
    billingService.getAdminBillingOverview(),
    billingService.listPaymentGatewaysPublicConfig(),
  ]);

  const overview = overviewResult.ok
    ? overviewResult.data
    : {
        metrics: {
          mrrCents: 0,
          activeCount: 0,
          trialingCount: 0,
          pastDueCount: 0,
          totalInvoicesCount: 0,
        },
        subscriptions: [],
        recentInvoices: [],
        recentReceipts: [],
      };

  const gateways = gatewaysResult.ok ? gatewaysResult.data : [];

  return (
    <BillingTabsView
      initialTab={initialTab}
      plansList={plansList}
      overview={overview}
      gateways={gateways}
    />
  );
}
