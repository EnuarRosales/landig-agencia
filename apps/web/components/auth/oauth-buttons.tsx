"use client";

import Link from "next/link";

export interface OAuthButtonsTranslations {
  orDivider: string;
  googleButton: string;
  facebookButton: string;
}

interface OAuthButtonsProps {
  returnTo?: string;
  t: OAuthButtonsTranslations;
  /**
   * Lista de proveedores OAuth habilitados en tiempo de ejecución desde `admin.auth_providers_config`
   * (AUTH-001 AUTH-D-08, CA-AUTH-02). Por defecto incluye `["google", "facebook"]`.
   */
  enabledProviders?: Array<"google" | "facebook">;
}

/**
 * Componente HUD para inicio de sesión y registro rápido mediante proveedores federados (Google y Facebook).
 *
 * Respeta dinámicamente el estado `is_enabled` de `admin.auth_providers_config` (CA-AUTH-02):
 * - Si un proveedor está deshabilitado, su botón no se renderiza.
 * - Si todos los proveedores están deshabilitados, el bloque completo (incluyendo el divisor) no se muestra.
 */
export function OAuthButtons({
  returnTo,
  t,
  enabledProviders = ["google", "facebook"],
}: OAuthButtonsProps) {
  const showGoogle = enabledProviders.includes("google");
  const showFacebook = enabledProviders.includes("facebook");

  if (!showGoogle && !showFacebook) {
    return null;
  }

  const returnToQuery = returnTo
    ? `?return_to=${encodeURIComponent(returnTo)}`
    : "";

  const gridColsClass =
    showGoogle && showFacebook ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";

  return (
    <div className="mt-6 space-y-4">
      {/* Separador con texto */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-stroke/60" />
        <span className="absolute bg-surface px-3 text-[11px] font-medium uppercase tracking-wider text-muted">
          {t.orDivider}
        </span>
      </div>

      {/* Botones de Proveedores OAuth */}
      <div className={`grid gap-2.5 ${gridColsClass}`}>
        {showGoogle && (
          <Link
            href={`/api/auth/google/start${returnToQuery}`}
            data-provider="google"
            className="group flex items-center justify-center gap-2.5 rounded-xl border border-stroke bg-bg2/70 px-4 py-2.5 text-xs font-semibold text-txt transition-all hover:border-white/30 hover:bg-bg2 hover:shadow-md"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="truncate">Google</span>
          </Link>
        )}

        {showFacebook && (
          <Link
            href={`/api/auth/facebook/start${returnToQuery}`}
            data-provider="facebook"
            className="group flex items-center justify-center gap-2.5 rounded-xl border border-stroke bg-bg2/70 px-4 py-2.5 text-xs font-semibold text-txt transition-all hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10 hover:shadow-md"
          >
            <svg className="h-4 w-4 shrink-0 fill-[#1877F2]" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span className="truncate">Facebook</span>
          </Link>
        )}
      </div>
    </div>
  );
}
