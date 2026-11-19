import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { defaultAuthRepository } from "@mocter/domain";
import { locales } from "@/i18n/routing";
import { FloatingBackground } from "@/components/sections/floating-background";
import { SetupOwnerForm } from "@/components/auth";

export const instant = false;

type Props = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      locale === "en"
        ? "Platform Setup · Mocter"
        : "Inicialización de Plataforma · Mocter",
    description:
      locale === "en"
        ? "Bootstrap initial Platform Owner for Mocter SaaS"
        : "Inicialización del primer Platform Owner para Mocter SaaS",
    robots: {
      index: false,
      follow: false,
    },
  };
}

/**
 * Pantalla de primer arranque (bootstrap) de la SaaS Mocter (AUTH-001 T-27).
 *
 * Valida que no exista ningún operador en Router Global (`countPlatformOperators() === 0`).
 * Si ya existe al menos un operador, sella permanentemente la ruta respondiendo `404 Not Found`.
 */
export default async function SetupOwnerPage({ params }: Props) {
  const { locale } = await params;

  // 1. Verificación en tiempo de ejecución: sellar con 404 si ya existen operadores
  const operatorCount = await defaultAuthRepository.countPlatformOperators();
  if (operatorCount > 0) {
    notFound();
  }

  const isEs = locale !== "en";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-[clamp(18px,4vw,32px)] py-12">
      <FloatingBackground />

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Tarjeta HUD de Setup Owner */}
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

            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-a1/40 bg-a1/10 px-3 py-1 text-[11px] font-semibold tracking-wider text-a1">
              <span>⚡</span>
              <span>{isEs ? "Primer Arranque" : "Bootstrap Setup"}</span>
            </div>
            <h1 className="font-heading text-xl font-bold tracking-tight text-txt sm:text-2xl">
              {isEs ? "Inicializar Platform Owner" : "Initialize Platform Owner"}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {isEs
                ? "Configuración del primer superadministrador del Router Global de Mocter."
                : "Initial superadministrator setup for Mocter Global Router."}
            </p>
          </header>

          <SetupOwnerForm locale={locale} />
        </div>
      </div>
    </div>
  );
}
