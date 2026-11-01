import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { ReferrerPanelView } from "@/components/admin/referrals/referrer-panel-view";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.referrals" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista de panel de referidos para el inquilino / referente (REF-001 T-07, RF-05.1).
 */
export default async function ReferralsPage({ params }: Props) {
  return (
    <main className="min-h-screen bg-background py-8">
      <ReferrerPanelView
        referralCode="MOCTER842"
        referralLink="https://mocter.co/register?ref=MOCTER842"
        currency="COP"
        metrics={{
          totalReferred: 6,
          pendingCount: 2,
          rewardedCount: 3,
          totalEarnedCents: 15000000,
          availableCreditCents: 10000000,
        }}
        referrals={[
          {
            id: "ref-1",
            code: "MOCTER842",
            status: "rewarded",
            attributedAt: "2026-10-18T10:00:00.000Z",
          },
          {
            id: "ref-2",
            code: "MOCTER842",
            status: "pending",
            attributedAt: "2026-10-28T14:30:00.000Z",
          },
          {
            id: "ref-3",
            code: "MOCTER842",
            status: "rejected",
            attributedAt: "2026-10-10T09:15:00.000Z",
            rejectedReason: "Autorreferencia detectada",
          },
        ]}
      />
    </main>
  );
}
