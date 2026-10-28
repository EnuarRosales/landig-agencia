import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { Logo } from "@/components/logo";
import { FloatingBackground } from "@/components/sections/floating-background";
import { VerifyEmailCard } from "@/components/auth/verify-email-card";

type Props = PageProps<"/[locale]">;

export const instant = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });

  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

/**
 * Página de verificación de correo electrónico para cuentas de usuario (AUTH-001 T-09).
 *
 * Muestra la tarjeta HUD de confirmación. En cumplimiento de las directivas de seguridad
 * (AUTH-001 §5.7), el método GET no consume el token, previniendo invalidaciones automáticas
 * provocadas por escáneres o filtros antispam.
 *
 * @param props - Propiedades inyectadas por Next.js App Router.
 * @returns Elemento JSX de la página de verificación.
 */
export default async function VerifyEmailPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const token = typeof sParams?.token === "string" ? sParams.token : undefined;

  const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Logo superior */}
        <div className="mb-8 flex justify-center">
          <Link href={`/${locale}`} className="transition-transform hover:scale-105">
            <Logo />
          </Link>
        </div>

        {/* Tarjeta HUD de Verificación */}
        <VerifyEmailCard
          locale={locale}
          token={token}
          t={{
            title: t("title"),
            subtitle: t("subtitle"),
            missingToken: t("missingToken"),
            confirmButton: t("confirmButton"),
            confirming: t("confirming"),
            successTitle: t("successTitle"),
            successMessage: t("successMessage"),
            goToLogin: t("goToLogin"),
            backToHome: t("backToHome"),
          }}
        />
      </div>
    </div>
  );
}
