import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { FloatingBackground } from "@/components/sections/floating-background";
import { LoginView } from "@/components/auth";
import { authService } from "@mocter/domain";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const instant = false;

type Props = PageProps<"/[locale]">;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });

  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

/**
 * Página de inicio de sesión para administradores y agentes de inquilinos en Mocter.
 *
 * Implementa la interfaz de acceso por credenciales con enlace cruzado directo hacia
 * la pantalla de registro (`/[locale]/register`), respetando el sistema de diseño HUD.
 *
 * @param props - Propiedades de página inyectadas por el App Router de Next.js.
 * @returns Elemento JSX que representa la vista de autenticación.
 */
export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const returnTo =
    typeof sParams?.return_to === "string"
      ? sParams.return_to
      : typeof sParams?.returnUrl === "string"
        ? sParams.returnUrl
        : undefined;
  const reason = typeof sParams?.reason === "string" ? sParams.reason : undefined;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  const tOauth = await getTranslations({ locale, namespace: "auth.oauth" });
  const enabledProviders = (await authService.getEnabledOAuthProviders())
    .map((provider) => provider.id);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Tarjeta HUD de Login */}
        <div className="rounded-2xl border border-stroke bg-surface/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <header className="mb-6 text-center">
            {/* Logo de Mocter en círculo prominente */}
            <div className="mb-6 flex justify-center">
              <Link
                href={`/${locale}`}
                aria-label="Mocter"
                className="group relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
              >
                {/* Halo de luz ambiental con el gradiente de Mocter */}
                <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-[#2f6bff] via-[#22d3ee] to-[#2f6bff] opacity-50 blur-xl transition-all duration-300 group-hover:opacity-85" />

                {/* Medallón circular blanco con borde de contraste y relieve */}
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/60 bg-white p-3 shadow-[0_10px_35px_rgba(34,211,238,0.35),0_2px_10px_rgba(0,0,0,0.4)] ring-4 ring-white/15">
                  <Image
                    src="/images/mocter-logo.png"
                    alt="Mocter Logo"
                    width={64}
                    height={64}
                    className="h-14 w-14 object-contain transition-transform duration-200 group-hover:scale-110"
                    priority
                  />
                </div>
              </Link>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-txt">
              {t("title")}
            </h1>
            <p className="mt-1.5 text-sm text-muted">{t("subtitle")}</p>
          </header>

          {/* Banner HUD de sesión expirada */}
          {reason === "expired" && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-200 backdrop-blur-sm"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold text-amber-300">
                  {locale === "es" ? "Sesión Expirada" : "Session Expired"}
                </p>
                <p className="mt-0.5 text-amber-200/80">
                  {locale === "es"
                    ? "Tu sesión ha expirado por inactividad. Por favor, ingresa tus credenciales para continuar."
                    : "Your session has expired due to inactivity. Please sign in again to continue."}
                </p>
              </div>
            </div>
          )}

          {/* Banner HUD de sesión cerrada voluntariamente */}
          {reason === "logged_out" && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-200 backdrop-blur-sm"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold text-emerald-300">
                  {locale === "es" ? "Sesión Finalizada" : "Signed Out Successfully"}
                </p>
                <p className="mt-0.5 text-emerald-200/80">
                  {locale === "es"
                    ? "Has cerrado tu sesión administrativa de manera segura. ¡Hasta pronto!"
                    : "You have signed out of your administrative session safely. See you soon!"}
                </p>
              </div>
            </div>
          )}

          <LoginView
            locale={locale}
            returnTo={returnTo}
            enabledProviders={enabledProviders}
            t={{
              emailLabel: t("emailLabel"),
              emailPlaceholder: t("emailPlaceholder"),
              passwordLabel: t("passwordLabel"),
              passwordPlaceholder: t("passwordPlaceholder"),
              submit: t("submit"),
              submitting: t("submitting"),
              unverifiedNotice: t("unverifiedNotice"),
            }}
            tOauth={{
              googleButton: tOauth("googleButton"),
              facebookButton: tOauth("facebookButton"),
              emailButton: tOauth("emailButton"),
              backToOptions: tOauth("backToLoginOptions") || tOauth("backToOptions"),
            }}
          />

          {/* Enlace inferior hacia Registro */}
          <div className="mt-6 border-t border-stroke/60 pt-6 text-center text-xs text-muted">
            <span>{t("noAccount")} </span>
            <Link
              href={`/${locale}/register`}
              className="font-semibold text-a2 transition-colors hover:underline"
            >
              {t("registerLink")}
            </Link>
          </div>
        </div>

        {/* Retorno al inicio */}
        <div className="mt-6 text-center">
          <Link
            href={`/${locale}`}
            className="text-xs text-muted transition-colors hover:text-txt hover:underline"
          >
            ← {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
