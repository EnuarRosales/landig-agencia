"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, Button, Input, Label } from "@mocter/ui";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

interface SetupPasswordCardProps {
  locale: string;
  token?: string;
}

export function SetupPasswordCard({ locale, token }: SetupPasswordCardProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isEs = locale !== "en";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError(
        isEs
          ? "El enlace no contiene un token válido o ha expirado."
          : "The link does not contain a valid token or has expired."
      );
      return;
    }

    if (password.length < 8) {
      setError(
        isEs
          ? "La contraseña debe tener al menos 8 caracteres."
          : "Password must be at least 8 characters long."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        isEs ? "Las contraseñas no coinciden." : "Passwords do not match."
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || (isEs ? "No se pudo establecer la contraseña." : "Failed to set password."));
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-stroke bg-surface/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl text-center">
        {/* Logo de Mocter en círculo prominente */}
        <div className="mb-6 flex justify-center">
          <Link
            href={`/${locale}`}
            aria-label="Mocter"
            className="group relative flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          >
            <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-[#2f6bff] via-[#22d3ee] to-[#2f6bff] opacity-50 blur-xl transition-all duration-300 group-hover:opacity-85" />
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

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-txt">
          {isEs ? "¡Cuenta Activada Con Éxito!" : "Account Activated Successfully!"}
        </h2>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          {isEs
            ? "Tu contraseña ha sido establecida correctamente. Ya puedes ingresar al portal administrativo con tu correo o tus credenciales federadas."
            : "Your password has been configured. You can now access your administration portal."}
        </p>

        <div className="mt-6">
          <Link
            href={`/${locale}/login`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-a1 px-4 py-2.5 text-xs font-semibold text-black hover:opacity-90 active:scale-98 transition-all"
          >
            {isEs ? "Iniciar Sesión" : "Sign In"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stroke bg-surface/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl">
      <header className="mb-6 text-center">
        {/* Logo de Mocter en círculo prominente con medallón HUD idéntico a Login */}
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

        <h1 className="text-2xl font-bold tracking-tight text-txt">
          {isEs ? "Bienvenido a Mocter" : "Welcome to Mocter"}
        </h1>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">
          {isEs
            ? "Activa tu cuenta creando tu contraseña de acceso o continúa directamente con Google o Facebook usando tu correo registrado."
            : "Activate your account by setting a password or continue directly with Google or Facebook."}
        </p>
      </header>

      {/* Opción A: Proveedores Federados (Google / Facebook) */}
      <div className="mb-6">
        <OAuthButtons
          returnTo={process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003"}
          t={{
            orDivider: isEs ? "O Configura Una Contraseña" : "Or Set A Password",
            googleButton: isEs ? "Continuar con Google" : "Continue with Google",
            facebookButton: isEs ? "Continuar con Facebook" : "Continue with Facebook",
          }}
          dividerPosition="top"
        />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2 rounded-xl p-3 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-inherit">{error}</AlertDescription>
        </Alert>
      )}

      {/* Opción B: Formulario de Contraseña */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-txt">
            {isEs ? "Nueva Contraseña" : "New Password"}
          </Label>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            rightIcon={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="h-7 w-7 text-muted hover:text-txt"
                aria-label={showPassword ? "Ocultar" : "Mostrar"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            }
            className="min-h-[42px] rounded-xl bg-bg2/60 px-3.5 py-2.5 pr-10 font-mono text-xs text-txt placeholder:text-muted/50"
          />
          <p className="mt-1 text-[11px] text-muted">
            {isEs ? "Mínimo 8 caracteres." : "At least 8 characters."}
          </p>
        </div>

        <div>
          <Label htmlFor="confirm-password" className="mb-1.5 block text-xs font-semibold text-txt">
            {isEs ? "Confirmar Contraseña" : "Confirm Password"}
          </Label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••••••"
            className="min-h-[42px] rounded-xl bg-bg2/60 px-3.5 py-2.5 font-mono text-xs text-txt placeholder:text-muted/50"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          loadingText={isEs ? "Guardando Contraseña..." : "Saving Password..."}
          disabled={loading || !token}
          className="mt-2 min-h-[44px] w-full gap-2 rounded-xl bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] py-3 text-sm font-semibold text-white shadow-lg shadow-a1/25 hover:opacity-95 hover:shadow-a1/40"
        >
          <Lock className="h-4 w-4 text-white" />
          <span>{isEs ? "Guardar Contraseña Y Activar Cuenta" : "Save Password & Activate Account"}</span>
        </Button>
      </form>
    </div>
  );
}

