"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Globe,
  Lock,
} from "lucide-react";
import type { PaymentGatewayPublicView } from "@mocter/domain";

interface GatewaysConfigFormProps {
  initialGateways: PaymentGatewayPublicView[];
}

export function GatewaysConfigForm({ initialGateways }: GatewaysConfigFormProps) {
  const router = useRouter();
  const [gateways, setGateways] = useState<PaymentGatewayPublicView[]>(initialGateways);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; type: "success" | "error"; message: string } | null>(null);

  // Estados locales para los campos de entrada de cada pasarela
  const [formValues, setFormValues] = useState<Record<string, {
    isEnabled: boolean;
    environment: "sandbox" | "production";
    publicKey: string;
    secretKey: string;
    webhookSecret: string;
  }>>(() => {
    const map: Record<string, any> = {};
    for (const g of initialGateways) {
      map[g.id] = {
        isEnabled: g.isEnabled,
        environment: g.environment,
        publicKey: g.publicKey || "",
        secretKey: "",
        webhookSecret: "",
      };
    }
    return map;
  });

  function handleInputChange(gatewayId: string, field: string, value: any) {
    setFormValues((prev) => ({
      ...prev,
      [gatewayId]: {
        ...prev[gatewayId],
        [field]: value,
      },
    }));
  }

  function handleCopyWebhook(gatewayId: string, path: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://mocter.co";
    const fullUrl = `${origin}${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(gatewayId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSaveGateway(gatewayId: "wompi" | "stripe") {
    setLoadingId(gatewayId);
    setFeedback(null);
    const form = formValues[gatewayId];

    try {
      const res = await fetch("/api/admin/billing/gateways", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gatewayId,
          isEnabled: form.isEnabled,
          environment: form.environment,
          publicKey: form.publicKey.trim() || undefined,
          secretKey: form.secretKey.trim() || undefined,
          webhookSecret: form.webhookSecret.trim() || undefined,
          actor: "platform_owner",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Fallo al actualizar la pasarela");
      }

      setFeedback({
        id: gatewayId,
        type: "success",
        message: `Configuración de ${gatewayId === "wompi" ? "Wompi" : "Stripe"} guardada y cifrada exitosamente.`,
      });

      // Actualizar estado de visualización
      setGateways((prev) =>
        prev.map((g) => (g.id === gatewayId ? json.data : g)),
      );
      // Limpiar campos secretos del formulario
      setFormValues((prev) => ({
        ...prev,
        [gatewayId]: {
          ...prev[gatewayId],
          secretKey: "",
          webhookSecret: "",
        },
      }));
      router.refresh();
    } catch (err) {
      setFeedback({
        id: gatewayId,
        type: "error",
        message: err instanceof Error ? err.message : "Error inesperado al guardar",
      });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {gateways.map((g) => {
          const form = formValues[g.id] || {
            isEnabled: g.isEnabled,
            environment: g.environment,
            publicKey: g.publicKey || "",
            secretKey: "",
            webhookSecret: "",
          };
          const isWompi = g.id === "wompi";
          const isLoading = loadingId === g.id;
          const currentFeedback = feedback?.id === g.id ? feedback : null;

          return (
            <div
              key={g.id}
              className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs flex flex-col justify-between"
            >
              <div>
                {/* Cabecera de la pasarela */}
                <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--dsn-text)]">
                        {isWompi ? "Wompi (Colombia / COP)" : "Stripe (Internacional / USD)"}
                      </h3>
                      <p className="text-xs text-[var(--dsn-text-secondary)]">
                        {isWompi
                          ? "Pasarela doméstica: PSE, Nequi, Bancolombia y tarjetas locales"
                          : "Pasarela global: Tarjetas internacionales en USD vía Payment Intents"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-semibold ${
                        g.isEnabled
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                      }`}
                    >
                      {g.isEnabled ? "Habilitada" : "Deshabilitada"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-semibold ${
                        g.environment === "production"
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {g.environment === "production" ? "Producción" : "Sandbox"}
                    </span>
                  </div>
                </div>

                {currentFeedback && (
                  <div
                    className={`mb-5 flex items-center gap-2 rounded-xl p-3 text-xs border ${
                      currentFeedback.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}
                  >
                    {currentFeedback.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{currentFeedback.message}</span>
                  </div>
                )}

                {/* Formulario de configuración */}
                <div className="space-y-4">
                  {/* Switch y Entorno */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--dsn-surface-secondary)]/40 p-4 rounded-xl border border-[var(--dsn-border)]">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5">
                        Estado Operativo
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] mt-1">
                        <input
                          type="checkbox"
                          checked={form.isEnabled}
                          onChange={(e) => handleInputChange(g.id, "isEnabled", e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--dsn-border)] text-[var(--dsn-accent)] focus:ring-[var(--dsn-accent)]"
                        />
                        <span>Habilitar Cobros En Esta Pasarela</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5">
                        Entorno De Conexión
                      </label>
                      <select
                        value={form.environment}
                        onChange={(e) => handleInputChange(g.id, "environment", e.target.value)}
                        className="w-full min-h-[38px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      >
                        <option value="sandbox">Sandbox (Modo De Pruebas)</option>
                        <option value="production">Producción (Cobros Reales)</option>
                      </select>
                    </div>
                  </div>

                  {/* Llave Pública */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                      {isWompi ? "Llave Pública Wompi (Public Key)" : "Llave Publicable Stripe (Publishable Key)"}
                    </label>
                    <input
                      type="text"
                      placeholder={isWompi ? "pub_test_..." : "pk_test_..."}
                      value={form.publicKey}
                      onChange={(e) => handleInputChange(g.id, "publicKey", e.target.value)}
                      className="w-full min-h-[42px] font-mono rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  {/* Llave Secreta */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-[var(--dsn-text)]">
                        {isWompi ? "Llave Privada Wompi (Private Key)" : "Llave Secreta Stripe (Secret Key)"}
                      </label>
                      {g.hasSecretKey && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <Lock className="h-3 w-3" /> Cifrada En Base De Datos
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      placeholder={g.hasSecretKey ? "•••••••••••••••••••••••• (Configurada, ingresa un nuevo valor para actualizar)" : (isWompi ? "prv_test_..." : "sk_test_...")}
                      value={form.secretKey}
                      onChange={(e) => handleInputChange(g.id, "secretKey", e.target.value)}
                      className="w-full min-h-[42px] font-mono rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  {/* Secreto de Webhook */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-[var(--dsn-text)]">
                        {isWompi ? "Secreto De Eventos Wompi (Checksum Secret)" : "Secreto De Firma Webhook Stripe (whsec_...)"}
                      </label>
                      {g.hasWebhookSecret && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <ShieldCheck className="h-3 w-3" /> Cifrado Con AES-256-GCM
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      placeholder={g.hasWebhookSecret ? "•••••••••••••••••••••••• (Configurado, ingresa un nuevo valor para actualizar)" : (isWompi ? "events_test_..." : "whsec_...")}
                      value={form.webhookSecret}
                      onChange={(e) => handleInputChange(g.id, "webhookSecret", e.target.value)}
                      className="w-full min-h-[42px] font-mono rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  {/* URL canónica del Webhook */}
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 p-3">
                    <label className="block text-[11px] font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      URL Canónica Para El Webhook En La Consola De {isWompi ? "Wompi" : "Stripe"}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--dsn-accent)] truncate select-all">
                        {g.webhookUrl}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyWebhook(g.id, g.webhookUrl)}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)] shrink-0 px-2 py-1 rounded bg-[var(--dsn-surface)] border border-[var(--dsn-border)]"
                      >
                        {copiedId === g.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400">Copiada</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón de guardado */}
              <div className="mt-6 pt-4 border-t border-[var(--dsn-border)]">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleSaveGateway(g.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--dsn-accent),#0ea5e9)] px-4 py-3 text-xs font-bold text-white shadow-md hover:opacity-95 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Guardando Y Cifrando...</span>
                    </>
                  ) : (
                    <span>Guardar Configuración De {isWompi ? "Wompi" : "Stripe"}</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

