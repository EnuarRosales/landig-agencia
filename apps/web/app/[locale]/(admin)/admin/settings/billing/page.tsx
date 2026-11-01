import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { getPublicPlans } from "@mocter/domain";
import { UpgradePlanView } from "@/components/admin/billing/upgrade-plan-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.billing" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista de administración de suscripción, facturación y upgrade de planes en mocter-admin (LND-001 T-08, CA-LND-05).
 * Permite al inquilino visualizar su plan actual y seleccionar un plan superior para upgrade con prorrateo.
 */
export default async function BillingSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const currentPlanCode =
    typeof sParams?.current_plan === "string" ? sParams.current_plan : "starter";

  const [tBilling, tPricing] = await Promise.all([
    getTranslations({ locale, namespace: "admin.billing" }),
    getTranslations({ locale, namespace: "pricing" }),
  ]);

  const availablePlans = await getPublicPlans();

  return (
    <main className="min-h-screen bg-bg text-txt py-8">
      <UpgradePlanView
        locale={locale}
        currentPlanCode={currentPlanCode}
        availablePlans={availablePlans}
        t={{
          title: tBilling("title"),
          subtitle: tBilling("subtitle"),
          currentPlan: tBilling("currentPlan"),
          upgradePlan: tBilling("upgradePlan"),
          changePlan: tBilling("changePlan"),
          currentStatus: tBilling("currentStatus"),
          active: tBilling("active"),
          prorationNotice: tBilling("prorationNotice"),
          availablePlans: tBilling("availablePlans"),
          selectPlan: tBilling("selectPlan"),
          confirmUpgrade: tBilling("confirmUpgrade"),
          checkoutButton: tBilling("checkoutButton"),
          backToSettings: tBilling("backToSettings"),
          monthly: tPricing("monthly"),
          annual: tPricing("annual"),
          saveBadge: tPricing("discountBadge"),
        }}
      />
    </main>
  );
}
