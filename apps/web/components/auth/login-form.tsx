"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface LoginFormTranslations {
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  submit: string;
  submitting: string;
  unverifiedNotice: string;
}

interface LoginFormProps {
  locale: string;
  returnTo?: string;
  t: LoginFormTranslations;
}

/**
 * Formulario interactivo HUD para el inicio de sesión nativo (AUTH-001 T-10).
 *
 * Captura credenciales corporativas (correo y contraseña), despacha la solicitud
 * a `POST /api/auth/login`, procesa cookies de sesión/CSRF y redirige a `/admin`.
 */
export function LoginForm({ locale, returnTo, t }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErrorMessage(
          data.error ||
            (locale === "en"
              ? "Invalid credentials. Please verify your details."
              : "Correo o contraseña incorrectos."),
        );
        setIsSubmitting(false);
        return;
      }

      // Si requiere doble factor (TOTP)
      if (data.mfaRequired) {
        const target = returnTo
          ? `/${locale}/auth/2fa?return_to=${encodeURIComponent(returnTo)}`
          : `/${locale}/auth/2fa`;
        router.push(target);
        return;
      }

      // Redirección exitosa hacia el panel administrativo o return_to
      const target = returnTo || `/${locale}/admin`;
      // Utilizar location.href para asegurar la inicialización completa de la sesión
      window.location.href = target;
    } catch {
      setErrorMessage(
        locale === "en"
          ? "Unable to connect to the authentication server. Please check your connection."
          : "No fue posible conectar con el servidor de autenticación. Verifica tu conexión.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 text-xs text-red-200 backdrop-blur-md animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="text-red-400">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {t.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPlaceholder}
          disabled={isSubmitting}
          className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {t.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.passwordPlaceholder}
          disabled={isSubmitting}
          className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 transition-all hover:opacity-95 hover:shadow-a1/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <span>{t.submitting}</span>
          </span>
        ) : (
          t.submit
        )}
      </button>
    </form>
  );
}
