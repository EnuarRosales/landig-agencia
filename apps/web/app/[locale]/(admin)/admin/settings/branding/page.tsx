import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { WhiteLabelEditor } from "@/components/admin/branding/white-label-editor";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.branding" });

  return {
    title: `${t("title")} | Mocter Admin`,
    description: t("subtitle"),
  };
}

/**
 * Vista de administración de marca blanca y personalización de identidad visual (DSN-001 T-09, T-10, ADM-001 RF-15).
 * Permite al inquilino con plan autorizado personalizar paleta de colores con validación AA y marca propia.
 */
export default async function WhiteLabelSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;

  const rawMode = typeof sParams?.plan_mode === "string" ? sParams.plan_mode : "completa";
  const planMode = rawMode === "none" || rawMode === "paleta" || rawMode === "completa" ? rawMode : "completa";

  const t = await getTranslations({ locale, namespace: "admin.branding" });

  return (
    <main className="min-h-screen bg-bg text-txt py-8">
      <WhiteLabelEditor
        clientId="01930000-0000-7000-8000-000000000001"
        planMode={planMode}
        initialBranding={{
          brandName: "Acme Corp",
          logoUrl: "https://acme.com/logo.svg",
          faviconUrl: "https://acme.com/favicon.ico",
          palette: {
            primary: "#1E3A8A",
            primaryForeground: "#FFFFFF",
            accent: "#0EA5E9",
          },
          removeMocterBranding: true,
          customDomain: "portal.acme.com",
          customFont: "Space Grotesk",
        }}
        t={{
          title: t("title"),
          subtitle: t("subtitle"),
          planBadge: t("planBadge"),
          noPlanWarning: t("noPlanWarning"),
          layer1Title: t("layer1Title"),
          brandNameLabel: t("brandNameLabel"),
          logoUrlLabel: t("logoUrlLabel"),
          faviconUrlLabel: t("faviconUrlLabel"),
          layer2Title: t("layer2Title"),
          primaryColorLabel: t("primaryColorLabel"),
          primaryTextColorLabel: t("primaryTextColorLabel"),
          accentColorLabel: t("accentColorLabel"),
          contrastRatioLabel: t("contrastRatioLabel"),
          contrastPassed: t("contrastPassed"),
          contrastFailed: t("contrastFailed"),
          layer3Title: t("layer3Title"),
          customDomainLabel: t("customDomainLabel"),
          customFontLabel: t("customFontLabel"),
          removeBrandingLabel: t("removeBrandingLabel"),
          previewTitle: t("previewTitle"),
          previewButtonText: t("previewButtonText"),
          saveButton: t("saveButton"),
          resetButton: t("resetButton"),
          saving: t("saving"),
          successMessage: t("successMessage"),
        }}
      />
    </main>
  );
}
