"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Propiedades de configuración para la barra de navegación principal {@link Nav}.
 */
export interface NavProps {
  /**
   * Indica si existen planes comerciales públicos activos para inyectar el enlace '#planes'
   * en el menú de navegación tipo cápsula.
   */
  hasPublicPlans?: boolean;
}

/**
 * Barra de navegación superior con diseño Floating Glass Island y soporte de internacionalización.
 *
 * Incluye acceso directo a inicio de sesión, enlace condicional a planes comerciales,
 * selector de idioma y conmutador de tema visual.
 *
 * @param props - Propiedades del componente {@link NavProps}.
 * @returns Elemento JSX que representa la cabecera fija de la aplicación.
 */
export function Nav({ hasPublicPlans = false }: NavProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: `/${locale}#features`, label: t("features") },
    { href: `/${locale}#sectors`, label: t("sectors") },
    { href: `/${locale}#how`, label: t("how") },
    ...(hasPublicPlans ? [{ href: `/${locale}#planes`, label: t("pricing") }] : []),
    { href: `/${locale}#demo`, label: t("demo") },
  ];

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[clamp(18px,5vw,60px)] py-3.5 backdrop-blur-[14px] transition-colors duration-300 ${
        scrolled
          ? "border-b border-stroke bg-[var(--nav-bg-scrolled)]"
          : "border-b border-transparent bg-[var(--nav-bg)]"
      }`}
    >
      <a href={`/${locale}`} className="flex shrink-0 items-center" aria-label={t("logoAria")}>
        <Logo className="block h-auto w-[132px]" />
      </a>

      {/* Menú centrado tipo Cápsula / Floating Glass Island */}
      <div className="hidden flex-1 items-center justify-center md:flex">
        <div className="flex items-center gap-1 rounded-full border border-stroke/80 bg-surface/75 p-1 shadow-[0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur-md dark:bg-surface/60 dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-1.5 text-[14px] font-medium text-muted transition-all duration-200 hover:bg-stroke/40 hover:text-txt dark:hover:bg-white/10 dark:hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Extremo derecho: Login, CTA, ThemeToggle y LocaleSwitcher */}
      <div className="flex shrink-0 items-center gap-2.5">
        <a
          href={`/${locale}/login`}
          className="inline-flex items-center gap-1.5 rounded-full border border-stroke/90 bg-surface/80 px-4 py-2 text-[14px] font-medium text-txt transition-all hover:bg-stroke/40 dark:hover:bg-white/10"
        >
          {t("login")}
        </a>
        <a
          href={`/${locale}#demo-form`}
          className="hidden cursor-pointer items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_30px_rgba(47,107,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(47,107,255,0.6)] lg:inline-flex"
        >
          {t("cta")}
        </a>
        <ThemeToggle />
        <LocaleSwitcher />
      </div>
    </nav>
  );
}
