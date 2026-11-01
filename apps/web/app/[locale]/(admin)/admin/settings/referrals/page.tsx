import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { ReferralManagementDashboard } from "@/components/admin/referrals/referral-management-dashboard";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: _locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.referralSettings" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista de backoffice SaaS para gestión comercial del programa de referidos (REF-001 T-06, RF-06.1).
 */
export default async function ReferralSettingsPage({ params, searchParams }: Props) {
  const { locale: _locale } = await params;
  const sParams = await searchParams;

  const rawRole = typeof sParams?.role === "string" ? sParams.role : "platform_admin";
  const userRole = rawRole === "platform_sales" ? "platform_sales" : "platform_admin";

  return (
    <main className="min-h-screen bg-background py-8">
      <ReferralManagementDashboard
        userRole={userRole}
        initialConfig={{
          id: "prog-001",
          name: "Programa General Mocter 2026",
          status: "active",
          rewardType: "fixed",
          rewardValue: 5000000, // 50.000 COP
          currency: "COP",
          attributionDays: 60,
          capReferralsPerReferrer: null, // Sin tope por defecto
          creditValidityDays: 365,
        }}
        initialMetrics={{
          totalReferrals: 18,
          pendingCount: 5,
          qualifiedCount: 3,
          rewardedCount: 9,
          rejectedCount: 1,
          totalRewardsIssuedCents: 45000000,
          totalCreditsRedeemedCents: 20000000,
          totalCreditsAvailableCents: 25000000,
        }}
      />
    </main>
  );
}
