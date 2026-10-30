"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@mocter/domain";
import { clientLog } from "@/lib/logger/client";
import { serializeError } from "@/lib/logger/serialize-error";

export interface RegisterFormTranslations {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordHint?: string;
  ruleMinLength?: string;
  ruleUppercase?: string;
  ruleNumber?: string;
  ruleSpecial?: string;
  termsPrefix: string;
  termsLink: string;
  termsSuffix: string;
  submit: string;
  submitting: string;
  genericSuccessTitle: string;
  genericSuccessMessage: string;
  checkEmailPrompt: string;
}

interface RegisterFormProps {
  locale: string;
  selectedPlan: Plan | null;
  t: RegisterFormTranslations;
}

/** Expresión regular para caracteres especiales ASCII estándar (AUTH-001 T-06). */
const ASCII_SPECIAL_REGEX = /[!-/:-@[-`{-~]/;

/**
 * Formulario interactivo HUD para el registro nativo de inquilinos (AUTH-001 T-08).
 *
 * Captura nombre, correo corporativo, contraseña y la autorización explícita de tratamiento de datos personales
 * (Ley 1581 de 2012). Valida dinámicamente las políticas de complejidad de contraseña en tiempo real,
 * desglosa errores específicos de campos de la API y despliega la confirmación genérica anti-enumeración.
 */
export function RegisterForm({ locale, selectedPlan, t }: RegisterFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [treatmentConsent, setTreatmentConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  // Validación en tiempo real de políticas de contraseña (AUTH-001 T-06)
  const hasMinLength = password.length >= 7;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = ASCII_SPECIAL_REGEX.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasNumber && hasSpecial;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!treatmentConsent) {
      setErrorMessage(
        locale === "en"
          ? "You must authorize personal data processing to proceed."
          : "Debe autorizar el tratamiento de datos personales para continuar.",
      );
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage(
        locale === "en"
          ? "The password does not meet the security requirements."
          : "La contraseña no cumple con los requisitos mínimos de seguridad.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
          planCode: selectedPlan?.code,
          treatmentConsent: true,
          policyVersion: "v1.0",
          channel: "register_form",
        }),
      });

      const data = await res.json();

      if (res.status === 202) {
        setIsSuccess(true);
      } else if (res.status === 422) {
        clientLog("warn", "auth.client_register_validation_failed");
        const grouped: Record<string, string[]> = {};
        if (Array.isArray(data.issues)) {
          for (const issue of data.issues) {
            const field = Array.isArray(issue.path) && issue.path[0] ? String(issue.path[0]) : "general";
            if (!grouped[field]) grouped[field] = [];
            if (issue.message) grouped[field].push(issue.message);
          }
        }
        setFieldErrors(grouped);
        const passIssues = grouped.password;
        if (passIssues && passIssues.length > 0) {
          setErrorMessage(passIssues.join(". "));
        } else {
          setErrorMessage(data.error || "Datos ingresados no válidos.");
        }
      } else {
        clientLog("warn", "auth.client_register_rejected", { status: res.status });
        setErrorMessage(data.error || "Ocurrió un error inesperado.");
      }
    } catch (err: unknown) {
      clientLog("error", "auth.client_register_network_error", { err: serializeError(err) });
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
      <div className="rounded-xl border border-a1/40 bg-a1/10 p-6 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-a1/20 text-a2">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-txt">{t.genericSuccessTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.genericSuccessMessage}</p>
        <p className="mt-4 text-xs font-medium text-a2">{t.checkEmailPrompt}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {selectedPlan && (
        <>
          <input type="hidden" name="plan_id" value={selectedPlan.id} />
          <input type="hidden" name="plan_code" value={selectedPlan.code} />
        </>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {t.nameLabel}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) {
              setFieldErrors((prev) => ({ ...prev, name: [] }));
            }
          }}
          placeholder={t.namePlaceholder}
          className={`w-full rounded-xl border ${
            fieldErrors.name?.length ? "border-red-500/70" : "border-stroke"
          } bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1`}
        />
        {fieldErrors.name?.map((err, i) => (
          <p key={i} className="mt-1 text-xs text-red-400">
            {err}
          </p>
        ))}
      </div>

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
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) {
              setFieldErrors((prev) => ({ ...prev, email: [] }));
            }
          }}
          placeholder={t.emailPlaceholder}
          className={`w-full rounded-xl border ${
            fieldErrors.email?.length ? "border-red-500/70" : "border-stroke"
          } bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1`}
        />
        {fieldErrors.email?.map((err, i) => (
          <p key={i} className="mt-1 text-xs text-red-400">
            {err}
          </p>
        ))}
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
          autoComplete="new-password"
          required
          minLength={7}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) {
              setFieldErrors((prev) => ({ ...prev, password: [] }));
            }
          }}
          placeholder={t.passwordPlaceholder}
          className={`w-full rounded-xl border ${
            fieldErrors.password?.length ? "border-red-500/70" : "border-stroke"
          } bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1`}
        />

        {/* Requisitos visuales dinámicos de complejidad de contraseña (AUTH-001 T-06) */}
        <div className="mt-2.5 space-y-1.5 rounded-lg border border-stroke/40 bg-bg2/30 p-2.5 text-[11px]">
          <p className="font-semibold text-muted">
            {t.passwordHint || (locale === "en" ? "Security requirements:" : "Requisitos de seguridad:")}
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <span
              className={`flex items-center gap-1.5 transition-colors ${
                hasMinLength ? "font-medium text-emerald-400" : "text-muted"
              }`}
            >
              <span>{hasMinLength ? "✓" : "○"}</span>
              <span>{t.ruleMinLength || (locale === "en" ? "At least 7 characters" : "Al menos 7 caracteres")}</span>
            </span>
            <span
              className={`flex items-center gap-1.5 transition-colors ${
                hasUppercase ? "font-medium text-emerald-400" : "text-muted"
              }`}
            >
              <span>{hasUppercase ? "✓" : "○"}</span>
              <span>{t.ruleUppercase || (locale === "en" ? "At least 1 uppercase letter" : "Al menos 1 mayúscula (A-Z)")}</span>
            </span>
            <span
              className={`flex items-center gap-1.5 transition-colors ${
                hasNumber ? "font-medium text-emerald-400" : "text-muted"
              }`}
            >
              <span>{hasNumber ? "✓" : "○"}</span>
              <span>{t.ruleNumber || (locale === "en" ? "At least 1 number" : "Al menos 1 número (0-9)")}</span>
            </span>
            <span
              className={`flex items-center gap-1.5 transition-colors ${
                hasSpecial ? "font-medium text-emerald-400" : "text-muted"
              }`}
            >
              <span>{hasSpecial ? "✓" : "○"}</span>
              <span>{t.ruleSpecial || (locale === "en" ? "At least 1 special char" : "Al menos 1 símbolo (!@#$%...)")}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Checkbox obligatorio de Tratamiento de Datos Personales (Ley 1581) */}
      <div className="flex items-start gap-2.5 pt-1">
        <input
          id="treatmentConsent"
          name="treatmentConsent"
          type="checkbox"
          required
          checked={treatmentConsent}
          onChange={(e) => setTreatmentConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-stroke bg-bg2 text-a1 accent-a1 focus:ring-a1"
        />
        <label htmlFor="treatmentConsent" className="cursor-pointer text-xs leading-relaxed text-muted">
          <span>{t.termsPrefix}</span>
          <Link
            href={`/${locale}/privacidad`}
            target="_blank"
            className="font-medium text-a2 underline hover:text-white"
          >
            {t.termsLink}
          </Link>
          <span>{t.termsSuffix}</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 transition-all hover:opacity-95 hover:shadow-a1/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
