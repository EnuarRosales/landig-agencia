import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { FloatingBackground } from "@/components/sections/floating-background";
import { RegisterView } from "@/components/auth";
import { authService, getPlanByCode, type Plan } from "@mocter/domain";

export const instant = false;

type Props = PageProps<"/[locale]">;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.register" });

  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

/**
 * Página de registro y alta para nuevos inquilinos en Mocter.
 *
 * Captura nombre, correo corporativo y contraseña. Si la URL incluye el parámetro
 * `plan_code`, consulta el plan canónico en el Router Global mediante {@link getPlanByCode},
 * despliega un distintivo visual con el nombre localizado del plan y asocia el identificador
 * UUID correspondiente al formulario de alta.
 *
 * Dispone de navegación cruzada hacia la pantalla de inicio de sesión (`/[locale]/login`).
 *
 * @param props - Propiedades de página inyectadas por el App Router de Next.js.
 * @returns Elemento JSX que representa la vista de registro.
 */
export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sParams = await searchParams;
  const planCodeParam = typeof sParams?.plan_code === "string" ? sParams.plan_code : undefined;

  let selectedPlan: Plan | null = null;
  if (planCodeParam) {
    try {
      selectedPlan = await getPlanByCode(planCodeParam);
    } catch {
      selectedPlan = null;
    }
  }

  const t = await getTranslations({ locale, namespace: "auth.register" });
  const tOauth = await getTranslations({ locale, namespace: "auth.oauth" });
  const enabledProviders = (await authService.getEnabledOAuthProviders())
    .map((provider) => provider.id);
  const lang = locale === "en" ? "en" : "es";
  const planName = selectedPlan
    ? selectedPlan.name?.[lang] || selectedPlan.name?.es || selectedPlan.code
    : undefined;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Tarjeta HUD de Registro */}
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

            <h1 className="text-2xl font-bold tracking-tight text-txt">{t("title")}</h1>
            <p className="mt-1.5 text-sm text-muted">{t("subtitle")}</p>

            {/* Badge de Plan Seleccionado */}
            {selectedPlan && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-a1/40 bg-a1/10 px-3.5 py-1 text-xs font-semibold text-a2">
                <span className="text-muted">{t("selectedPlan")}:</span>
                <span className="font-bold text-white">{planName}</span>
              </div>
            )}
          </header>

          {/* Opciones de registro vertical y formulario por revelación progresiva */}
          <RegisterView
            locale={locale}
            selectedPlan={selectedPlan}
            enabledProviders={enabledProviders}
            t={{
              nameLabel: t("nameLabel"),
              namePlaceholder: t("namePlaceholder"),
              emailLabel: t("emailLabel"),
              emailPlaceholder: t("emailPlaceholder"),
              passwordLabel: t("passwordLabel"),
              passwordPlaceholder: t("passwordPlaceholder"),
              passwordHint: t("passwordHint"),
              ruleMinLength: t("ruleMinLength"),
              ruleUppercase: t("ruleUppercase"),
              ruleNumber: t("ruleNumber"),
              ruleSpecial: t("ruleSpecial"),
              termsPrefix: t("termsPrefix"),
              termsLink: t("termsLink"),
              termsSuffix: t("termsSuffix"),
              submit: t("submit"),
              submitting: t("submitting"),
              genericSuccessTitle: t("genericSuccessTitle"),
              genericSuccessMessage: t("genericSuccessMessage"),
              checkEmailPrompt: t("checkEmailPrompt"),
            }}
            tOauth={{
              googleButton: tOauth("googleButton"),
              facebookButton: tOauth("facebookButton"),
              emailButton: tOauth("emailButton"),
              backToOptions: tOauth("backToOptions"),
            }}
          />

          {/* Enlace inferior hacia Login */}
          <div className="mt-6 border-t border-stroke/60 pt-6 text-center text-xs text-muted">
            <span>{t("hasAccount")} </span>
            <Link
              href={`/${locale}/login`}
              className="font-semibold text-a2 transition-colors hover:underline"
            >
              {t("loginLink")}
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
