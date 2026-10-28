"use client";

import { useState } from "react";
import Link from "next/link";

interface VerifyEmailTranslations {
  title: string;
  subtitle: string;
  missingToken: string;
  confirmButton: string;
  confirming: string;
  successTitle: string;
  successMessage: string;
  goToLogin: string;
  backToHome: string;
}

interface VerifyEmailCardProps {
  locale: string;
  token?: string;
  t: VerifyEmailTranslations;
}

/**
 * Tarjeta interactiva HUD para confirmación de verificación de correo (AUTH-001 T-09).
 *
 * El token NO se consume en el GET inicial (para neutralizar escáneres automáticos de correo).
 * La confirmación se despacha mediante una acción explícita del usuario vía POST hacia
 * `/api/auth/email/verify/confirm`.
 */
export function VerifyEmailCard({ locale, token, t }: VerifyEmailCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="rounded-2xl border border-stroke bg-surface/80 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-txt">{t.title}</h1>
        <p className="mt-2 text-sm text-muted">{t.missingToken}</p>
        <div className="mt-6">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center text-xs text-muted transition-colors hover:text-txt hover:underline"
          >
            ← {t.backToHome}
          </Link>
        </div>
      </div>
    );
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/email/verify/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (res.ok) {
        setIsSuccess(true);
      } else {
        setErrorMessage(data.error || "El token es inválido o ha expirado.");
      }
    } catch {
      setErrorMessage(
        locale === "en"
          ? "Connection error. Please try again."
          : "Error de conexión. Por favor intente nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-a1/40 bg-surface/80 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-a1/20 text-a2">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-txt">{t.successTitle}</h1>
        <p className="mt-2 text-sm text-muted">{t.successMessage}</p>
        <div className="mt-6">
          <Link
            href={`/${locale}/login`}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 transition-all hover:opacity-95 hover:shadow-a1/40"
          >
            {t.goToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stroke bg-surface/80 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-a1/10 text-a2">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      <h1 className="text-xl font-bold text-txt">{t.title}</h1>
      <p className="mt-2 text-sm text-muted">{t.subtitle}</p>

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleConfirm}
        className="mt-6 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 transition-all hover:opacity-95 hover:shadow-a1/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t.confirming : t.confirmButton}
      </button>

      <div className="mt-6 border-t border-stroke/60 pt-4 text-center">
        <Link
          href={`/${locale}`}
          className="text-xs text-muted transition-colors hover:text-txt hover:underline"
        >
          ← {t.backToHome}
        </Link>
      </div>
    </div>
  );
}
