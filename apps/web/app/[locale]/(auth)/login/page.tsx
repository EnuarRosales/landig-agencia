import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/routing";
import { Logo } from "@/components/logo";
import { FloatingBackground } from "@/components/sections/floating-background";

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
export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo superior */}
        <div className="mb-8 flex justify-center">
          <Link href={`/${locale}`} className="transition-transform hover:scale-105">
            <Logo />
          </Link>
        </div>

        {/* Tarjeta HUD de Login */}
        <div className="rounded-2xl border border-stroke bg-surface/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-txt">{t("title")}</h1>
            <p className="mt-1.5 text-sm text-muted">{t("subtitle")}</p>
          </header>

          <form className="space-y-4" action="#" method="POST">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
              >
                {t("emailLabel")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={t("emailPlaceholder")}
                className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
              >
                {t("passwordLabel")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder={t("passwordPlaceholder")}
                className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1"
              />
            </div>

            <button
              type="submit"
              className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 transition-all hover:opacity-95 hover:shadow-a1/40"
            >
              {t("submit")}
            </button>
          </form>

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
