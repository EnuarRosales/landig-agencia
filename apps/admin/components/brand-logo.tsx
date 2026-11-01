import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export interface BrandLogoProps {
  /**
   * URL de la imagen del logotipo institucional (opcional).
   * Si no se especifica, toma `siteConfig.logoUrl` o renderiza el imagotipo SVG institucional canónico.
   */
  logoUrl?: string;
  /**
   * Nombre de marca de la SaaS (opcional).
   * Si no se especifica, toma `siteConfig.name`.
   */
  brandName?: string;
  /**
   * Texto de la insignia complementaria (ej. "SaaS Admin", "Core", "Control Plane").
   */
  badgeText?: string;
  /**
   * Controla si se visualiza la insignia de rol o plano de control.
   */
  showBadge?: boolean;
  /**
   * Tamaño del logotipo ("sm" para barra móvil, "md" para barra lateral).
   */
  size?: "sm" | "md";
  /**
   * Si es true, envuelve el logotipo en un enlace hacia la raíz "/".
   */
  linkToHome?: boolean;
  /**
   * Clases CSS complementarias.
   */
  className?: string;
}

/**
 * Logotipo institucional parametrizable de la plataforma SaaS (ADM-001, DSN-001).
 *
 * Provee:
 * 1. Parametrización dinámica por URL de imagen personalizada (`logoUrl` o `siteConfig.logoUrl`).
 * 2. Renderizado vectorial nativo (SVG chip con gradiente de marca + monograma 'M' y wordmark).
 * 3. Insignia HUD de contexto operativo ("SaaS Admin" / "Core") con tokens semánticos.
 */
export function BrandLogo({
  logoUrl = siteConfig.logoUrl,
  brandName = siteConfig.name,
  badgeText = siteConfig.badge,
  showBadge = true,
  size = "md",
  linkToHome = true,
  className = "",
}: BrandLogoProps) {
  const isSm = size === "sm";

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {logoUrl ? (
        // Renderizado de logotipo externo parametrizado
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={brandName}
          className={`${isSm ? "h-7 w-auto" : "h-8 w-auto"} max-w-[140px] object-contain`}
        />
      ) : (
        // Imagotipo vectorial SVG institucional canónico de Mocter
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 38 38"
            role="img"
            aria-label={`${brandName} Icon`}
            className={`${isSm ? "h-7 w-7" : "h-8 w-8"} shrink-0 rounded-xl shadow-xs`}
          >
            <defs>
              <linearGradient id="brand-chip-glow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2f6bff" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <rect
              x="1"
              y="1"
              width="36"
              height="36"
              rx="10"
              fill="var(--dsn-surface, #0f172a)"
              stroke="var(--dsn-border, rgba(255,255,255,0.12))"
            />
            <rect
              x="1"
              y="1"
              width="36"
              height="36"
              rx="10"
              fill="url(#brand-chip-glow)"
              opacity="0.18"
            />
            {/* Trazo vectorial en 'M' redondeado */}
            <path
              d="M10 28V12L19 23L28 12V28"
              fill="none"
              stroke="url(#brand-chip-glow)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Wordmark tipográfico */}
          <span
            className={`font-bold tracking-tight text-[var(--dsn-text)] ${
              isSm ? "text-sm" : "text-base"
            }`}
          >
            {brandName}
          </span>
        </div>
      )}

      {showBadge && badgeText && (
        <span className="rounded bg-[var(--dsn-accent)]/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20">
          {badgeText}
        </span>
      )}
    </div>
  );

  if (linkToHome) {
    return (
      <Link
        href="/"
        className="inline-flex items-center transition-opacity hover:opacity-90 active:scale-98"
        aria-label={`${brandName} Home`}
      >
        {content}
      </Link>
    );
  }

  return content;
}

