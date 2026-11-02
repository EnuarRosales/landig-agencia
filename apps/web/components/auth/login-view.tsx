"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { LoginForm, type LoginFormTranslations } from "./login-form";

export interface LoginViewProps {
  locale: string;
  returnTo?: string;
  enabledProviders: string[];
  t: LoginFormTranslations;
  tOauth: {
    googleButton: string;
    facebookButton: string;
    emailButton: string;
    backToOptions: string;
  };
}

/**
 * Vista interactiva HUD para el inicio de sesión con revelación progresiva (Progressive Disclosure).
 *
 * Muestra inicialmente los métodos de acceso apilados verticalmente (uno debajo del otro):
 * 1. Proveedores federados configurados (Google, Facebook).
 * 2. Botón para acceso con correo y contraseña.
 *
 * Al pulsar en correo electrónico, se despliega el formulario nativo (`LoginForm`)
 * permitiendo regresar a la selección de opciones en cualquier momento.
 */
export function LoginView({
  locale,
  returnTo,
  enabledProviders,
  t,
  tOauth,
}: LoginViewProps) {
  const showGoogle = enabledProviders.includes("google");
  const showFacebook = enabledProviders.includes("facebook");
  const hasProviders = showGoogle || showFacebook;

  // Si no hay proveedores configurados en la plataforma, renderiza directamente el formulario
  const [showEmailForm, setShowEmailForm] = useState(!hasProviders);

  const googleUrl = returnTo
    ? `/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`
    : "/api/auth/google/start";

  const facebookUrl = returnTo
    ? `/api/auth/facebook/start?return_to=${encodeURIComponent(returnTo)}`
    : "/api/auth/facebook/start";

  return (
    <div className="mt-6">
      {!showEmailForm ? (
        <div className="flex flex-col gap-3">
          {/* Botón Google */}
          {showGoogle && (
            <Link
              href={googleUrl}
              data-provider="google"
              className="group flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-stroke bg-bg2/80 px-4 py-3 text-sm font-semibold text-txt shadow-xs transition-all hover:border-white/30 hover:bg-bg2 hover:shadow-md active:scale-98"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
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
              <span>{tOauth.googleButton || "Google"}</span>
            </Link>
          )}

          {/* Botón Facebook */}
          {showFacebook && (
            <Link
              href={facebookUrl}
              data-provider="facebook"
              className="group flex min-h-[48px] w-full items-center justify-center gap-3 rounded-xl border border-stroke bg-bg2/80 px-4 py-3 text-sm font-semibold text-txt shadow-xs transition-all hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10 hover:shadow-md active:scale-98"
            >
              <svg className="h-5 w-5 shrink-0 fill-[#1877F2]" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>{tOauth.facebookButton || "Facebook"}</span>
            </Link>
          )}

          {/* Botón adicional para acceso con Correo y Contraseña */}
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="group flex min-h-[48px] w-full cursor-pointer touch-manipulation items-center justify-center gap-3 rounded-xl border border-stroke bg-bg2/80 px-4 py-3 text-sm font-semibold text-txt shadow-xs transition-all hover:border-a1/60 hover:bg-a1/10 hover:shadow-md active:scale-98"
          >
            <Mail className="h-5 w-5 shrink-0 text-muted transition-colors group-hover:text-a2" />
            <span>{tOauth.emailButton || "Correo Electrónico"}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Botón de regreso a las opciones de inicio de sesión */}
          {hasProviders && (
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              className="inline-flex cursor-pointer touch-manipulation items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-a2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{tOauth.backToOptions || "Volver a opciones de acceso"}</span>
            </button>
          )}

          <LoginForm
            locale={locale}
            returnTo={returnTo}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

