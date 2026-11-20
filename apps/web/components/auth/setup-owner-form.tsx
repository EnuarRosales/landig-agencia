"use client";

import { useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription, Button, Input, Label } from "@mocter/ui";
import { env } from "@/env";
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

      // Redirección hacia la consola administrativa de Mocter SaaS (mocter-admin)
      window.location.href = env.NEXT_PUBLIC_ADMIN_URL;
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
        <Alert
          role="alert"
          variant="destructive"
          className="rounded-xl border-red-500/40 bg-red-950/40 p-3.5 text-xs text-red-200 backdrop-blur-md animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <AlertDescription className="text-inherit">{errorMessage}</AlertDescription>
          </div>
        </Alert>
      )}

      {/* Token de Setup */}
      <div>
        <Label htmlFor="setup-token" className="mb-1.5 block text-xs font-medium text-muted">
          {isEs ? "Token De Inicialización (SETUP_OWNER_TOKEN)" : "Setup Token (SETUP_OWNER_TOKEN)"}
        </Label>
        <Input
          id="setup-token"
          name="setup-token"
          type={showToken ? "text" : "password"}
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={isEs ? "Introduce el secreto del entorno..." : "Enter the environment secret..."}
          disabled={isSubmitting}
          rightIcon={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowToken(!showToken)}
              tabIndex={-1}
              className="h-7 w-7 text-muted hover:text-txt"
              aria-label={showToken ? "Ocultar token" : "Mostrar token"}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          }
          className="min-h-[42px] rounded-xl bg-bg2/60 pr-10 text-sm text-txt placeholder:text-muted/60"
        />
      </div>

      {/* Nombre Completo */}
      <div>
        <Label htmlFor="name" className="mb-1.5 block text-xs font-medium text-muted">
          {isEs ? "Nombre Del Platform Owner" : "Platform Owner Full Name"}
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isEs ? "Ej. Super Admin Mocter" : "e.g. Super Admin Mocter"}
          disabled={isSubmitting}
          className="min-h-[42px] rounded-xl bg-bg2/60 text-sm text-txt placeholder:text-muted/60"
        />
      </div>

      {/* Correo Electrónico */}
      <div>
        <Label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
          {isEs ? "Correo Electrónico Corporativo" : "Corporate Email Address"}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@mocter.co"
          disabled={isSubmitting}
          className="min-h-[42px] rounded-xl bg-bg2/60 text-sm text-txt placeholder:text-muted/60"
        />
      </div>

      {/* Contraseña Maestra */}
      <div>
        <Label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
          {isEs ? "Contraseña Maestra" : "Master Password"}
        </Label>
        <Input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEs ? "Mínimo 8 caracteres (mayúscula, número, especial)" : "Min 8 chars (upper, number, special)"}
          disabled={isSubmitting}
          rightIcon={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="h-7 w-7 text-muted hover:text-txt"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          }
          className="min-h-[42px] rounded-xl bg-bg2/60 pr-10 text-sm text-txt placeholder:text-muted/60"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        loadingText={isEs ? "Inicializando..." : "Initializing..."}
        className="mt-2 min-h-[44px] w-full rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 hover:opacity-95 hover:shadow-a1/40"
      >
        {isEs ? "Inicializar Plataforma Mocter" : "Initialize Mocter Platform"}
      </Button>
    </form>
  );
}
