"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clientLog } from "@/lib/logger/client";
import { serializeError } from "@/lib/logger/serialize-error";

interface SetupOwnerFormProps {
  locale: string;
}

/**
 * Formulario interactivo HUD para el bootstrap del primer Platform Owner (AUTH-001 T-27).
 *
 * Captura:
 * - Token de aprovisionamiento de infraestructura (`SETUP_OWNER_TOKEN`).
 * - Nombre completo del operador.
 * - Correo electrónico institucional.
 * - Contraseña maestra con requisitos de robustez.
 */
export function SetupOwnerForm({ locale }: SetupOwnerFormProps) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEs = locale !== "en";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/setup-owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        clientLog("warn", "auth.client_setup_owner_rejected", { status: response.status });
        setErrorMessage(
          data.error ||
            (isEs
              ? "Error al inicializar el usuario Platform Owner. Verifique el token y las credenciales."
              : "Failed to initialize Platform Owner. Please verify the setup token and credentials."),
        );
        setIsSubmitting(false);
        return;
      }

      // Redirección hacia la consola administrativa
      router.push(`/${locale}/admin`);
    } catch (err: unknown) {
      clientLog("error", "auth.client_setup_owner_network_error", { err: serializeError(err) });
      setErrorMessage(
        isEs
          ? "No fue posible conectar con el servidor de inicialización. Verifica tu conexión."
          : "Unable to connect to the initialization server. Please check your connection.",
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

      {/* Token de Setup */}
      <div>
        <label
          htmlFor="setup-token"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {isEs ? "Token de Inicialización (SETUP_OWNER_TOKEN)" : "Setup Token (SETUP_OWNER_TOKEN)"}
        </label>
        <div className="relative">
          <input
            id="setup-token"
            name="setup-token"
            type={showToken ? "text" : "password"}
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={isEs ? "Introduce el secreto del entorno..." : "Enter the environment secret..."}
            disabled={isSubmitting}
            className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 pr-10 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-txt"
          >
            {showToken ? "👁️" : "🔒"}
          </button>
        </div>
      </div>

      {/* Nombre Completo */}
      <div>
        <label
          htmlFor="name"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {isEs ? "Nombre del Platform Owner" : "Platform Owner Full Name"}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isEs ? "Ej. Super Admin Mocter" : "e.g. Super Admin Mocter"}
          disabled={isSubmitting}
          className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
        />
      </div>

      {/* Correo Electrónico */}
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {isEs ? "Correo Electrónico Corporativo" : "Corporate Email Address"}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@mocter.co"
          disabled={isSubmitting}
          className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
        />
      </div>

      {/* Contraseña Maestra */}
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {isEs ? "Contraseña Maestra" : "Master Password"}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEs ? "Mínimo 8 caracteres (mayúscula, número, especial)" : "Min 8 chars (upper, number, special)"}
            disabled={isSubmitting}
            className="w-full rounded-xl border border-stroke bg-bg2/60 px-4 py-2.5 pr-10 text-sm text-txt placeholder:text-muted/60 transition-all focus:border-a1 focus:outline-none focus:ring-1 focus:ring-a1 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-txt"
          >
            {showPassword ? "👁️" : "🔒"}
          </button>
        </div>
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
            <span>{isEs ? "Inicializando..." : "Initializing..."}</span>
          </span>
        ) : isEs ? (
          "Inicializar Plataforma Mocter"
        ) : (
          "Initialize Mocter Platform"
        )}
      </button>
    </form>
  );
}
