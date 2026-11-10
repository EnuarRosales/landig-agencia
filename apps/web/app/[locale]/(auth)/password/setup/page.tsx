import type { Metadata } from "next";
import Link from "next/link";
import { locales } from "@/i18n/routing";
import { Logo } from "@/components/logo";
import { FloatingBackground } from "@/components/sections/floating-background";
import { SetupPasswordCard } from "@/components/auth/setup-password-card";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const instant = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      locale === "en"
        ? "Account Setup · Mocter"
        : "Configuración de Cuenta · Mocter",
    description:
      locale === "en"
        ? "Activate your account and configure your credentials"
        : "Activa tu cuenta y configura tus credenciales de acceso",
    robots: {
      index: false,
      follow: false,
    },
  };
}

/**
 * Pantalla canónica de configuración de contraseña inicial para inquilinos (ADM-001, AUTH-001).
 * Accesible también bajo la ruta corta /es/password/setup?token=...
 */
export default async function ShortSetupPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const token = typeof sParams?.token === "string" ? sParams.token : undefined;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Tarjeta HUD de Setup de Contraseña */}
        <SetupPasswordCard locale={locale} token={token} />
      </div>
    </div>
  );
}

