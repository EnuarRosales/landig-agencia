"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Lock,
  QrCode,
} from "lucide-react";
import type { PaymentGatewayPublicView, SupportedPaymentGatewayId } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Select,
} from "@mocter/ui";

interface GatewaysConfigFormProps {
  initialGateways: PaymentGatewayPublicView[];
}

interface GatewayFormState {
  isEnabled: boolean;
  environment: "sandbox" | "production";
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  breBKeyType: string;
  breBKeyValue: string;
  breBRecipientName: string;
}

const BRE_B_KEY_TYPE_OPTIONS = [
  { value: "phone", label: "Celular" },
  { value: "email", label: "Correo Electrónico" },
  { value: "document", label: "Documento / NIT" },
  { value: "alphanumeric", label: "Llave Alfanumérica" },
  { value: "merchant_code", label: "Código de Comercio" },
] as const;

export function GatewaysConfigForm({ initialGateways }: GatewaysConfigFormProps) {
  const router = useRouter();
  const [gateways, setGateways] = useState<PaymentGatewayPublicView[]>(initialGateways);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    id: string;
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [formValues, setFormValues] = useState<Record<string, GatewayFormState>>(() => {
    const map: Record<string, GatewayFormState> = {};
    for (const g of initialGateways) {
      map[g.id] = {
        isEnabled: g.isEnabled,
        environment: g.environment,
        publicKey: g.publicKey || "",
        secretKey: "",
        webhookSecret: "",
        breBKeyType: g.breBKeyType || "email",
        breBKeyValue: g.breBKeyValue || "",
        breBRecipientName: g.breBRecipientName || "",
      };
    }
    return map;
  });

  function handleInputChange<K extends keyof GatewayFormState>(
    gatewayId: string,
    field: K,
    value: GatewayFormState[K],
  ) {
    setFormValues((prev) => ({
      ...prev,
      [gatewayId]: {
        ...(prev[gatewayId] ?? {
          isEnabled: false,
          environment: "sandbox",
          publicKey: "",
          secretKey: "",
          webhookSecret: "",
          breBKeyType: "email",
          breBKeyValue: "",
          breBRecipientName: "",
        }),
        [field]: value,
      },
    }));
  }

  function handleCopyWebhook(gatewayId: string, path: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = origin ? `${origin}${path}` : path;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(gatewayId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSaveGateway(gatewayId: SupportedPaymentGatewayId) {
    setLoadingId(gatewayId);
    setFeedback(null);
    const form = formValues[gatewayId];
    if (!form) {
      setLoadingId(null);
      return;
    }

    try {
      const payload =
        gatewayId === "bre_b"
          ? {
              id: gatewayId,
              isEnabled: form.isEnabled,
              environment: form.environment,
              supportedCountries: ["CO"],
              breBKeyType: form.breBKeyType || "email",
              breBKeyValue: form.breBKeyValue.trim() || null,
              breBRecipientName: form.breBRecipientName.trim() || null,
            }
          : {
              id: gatewayId,
              isEnabled: form.isEnabled,
              environment: form.environment,
              publicKey: form.publicKey.trim() || undefined,
              secretKey: form.secretKey.trim() || undefined,
              webhookSecret: form.webhookSecret.trim() || undefined,
            };

      const res = await fetch("/api/admin/billing/gateways", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        data?: PaymentGatewayPublicView;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.detail || json.error || "Fallo al actualizar la configuración del canal.");
      }

      const labelMap: Record<SupportedPaymentGatewayId, string> = {
        wompi: "Wompi",
        stripe: "Stripe",
        bre_b: "Bre-B",
      };

      setFeedback({
        id: gatewayId,
        type: "success",
        message: `Configuración de ${labelMap[gatewayId]} guardada correctamente.`,
      });

      setGateways((prev) => prev.map((g) => (g.id === gatewayId ? json.data! : g)));
      setFormValues((prev) => ({
        ...prev,
        [gatewayId]: {
          ...prev[gatewayId]!,
          secretKey: "",
          webhookSecret: "",
        },
      }));
      router.refresh();
    } catch (err) {
      setFeedback({
        id: gatewayId,
        type: "error",
        message: err instanceof Error ? err.message : "Error inesperado al guardar.",
      });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {gateways.map((g) => {
          const form = formValues[g.id] || {
            isEnabled: g.isEnabled,
            environment: g.environment,
            publicKey: g.publicKey || "",
            secretKey: "",
            webhookSecret: "",
            breBKeyType: g.breBKeyType || "email",
            breBKeyValue: g.breBKeyValue || "",
            breBRecipientName: g.breBRecipientName || "",
          };
          const isWompi = g.id === "wompi";
          const isBreB = g.id === "bre_b";
          const isLoading = loadingId === g.id;
          const currentFeedback = feedback?.id === g.id ? feedback : null;

          return (
            <Card
              key={g.id}
              className="rounded-2xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--dsn-border)] pb-4 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/20 shrink-0">
                      {isBreB ? <QrCode className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[var(--dsn-text)]">
                        {isBreB
                          ? "Bre-B (Colombia / COP)"
                          : isWompi
                            ? "Wompi (Colombia / COP)"
                            : "Stripe (Internacional / USD)"}
                      </h3>
                      <p className="text-xs text-[var(--dsn-text-secondary)]">
                        {isBreB
                          ? "Pago inmediato con QR Dinámico sin comisión de pasarela · Revisión manual"
                          : isWompi
                            ? "Pasarela doméstica: PSE, Nequi, Bancolombia y tarjetas locales"
                            : "Pasarela global: Tarjetas internacionales en USD"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={g.isEnabled ? "success" : "outline"}
                      className="font-mono text-[10px]"
                    >
                      {g.isEnabled ? "Habilitado" : "Deshabilitado"}
                    </Badge>
                    {isBreB ? (
                      <Badge variant="accent" className="font-mono text-[10px]">
                        Solo CO / COP
                      </Badge>
                    ) : (
                      <Badge
                        variant={g.environment === "production" ? "purple" : "warning"}
                        className="font-mono text-[10px]"
                      >
                        {g.environment === "production" ? "Producción" : "Sandbox"}
                      </Badge>
                    )}
                  </div>
                </div>

                {currentFeedback && (
                  <Alert
                    variant={currentFeedback.type === "success" ? "success" : "destructive"}
                    className="mb-5"
                  >
                    {currentFeedback.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertDescription className="text-xs">
                      {currentFeedback.message}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--dsn-surface-secondary)]/40 p-4 rounded-xl border border-[var(--dsn-border)]">
                    <div>
                      <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5">
                        Estado Operativo
                      </Label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--dsn-text)] mt-1">
                        <Checkbox
                          checked={form.isEnabled}
                          onCheckedChange={(checked) =>
                            handleInputChange(g.id, "isEnabled", checked === true)
                          }
                        />
                        <span>Habilitar En El Checkout</span>
                      </label>
                    </div>

                    <div>
                      <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5">
                        Entorno De Operación
                      </Label>
                      <Select
                        value={form.environment}
                        onChange={(e) =>
                          handleInputChange(
                            g.id,
                            "environment",
                            e.target.value === "production" ? "production" : "sandbox",
                          )
                        }
                        className="min-h-[38px] bg-[var(--dsn-surface)] text-xs"
                      >
                        <option value="sandbox">Sandbox (Pruebas)</option>
                        <option value="production">Producción (Real)</option>
                      </Select>
                    </div>
                  </div>

                  {isBreB ? (
                    <>
                      <div>
                        <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                          Tipo De Llave Bre-B
                        </Label>
                        <Select
                          value={form.breBKeyType}
                          onChange={(e) => handleInputChange(g.id, "breBKeyType", e.target.value)}
                          className="min-h-[42px] text-xs"
                        >
                          {BRE_B_KEY_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                          Valor De Llave Bre-B
                        </Label>
                        <Input
                          type="text"
                          placeholder="Ej. pagos@mocter.co o 3001234567"
                          value={form.breBKeyValue}
                          onChange={(e) => handleInputChange(g.id, "breBKeyValue", e.target.value)}
                          className="min-h-[42px] font-mono text-xs"
                        />
                      </div>

                      <div>
                        <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                          Nombre Del Titular Receptor
                        </Label>
                        <Input
                          type="text"
                          placeholder="Ej. MOCTER SAS"
                          value={form.breBRecipientName}
                          onChange={(e) =>
                            handleInputChange(g.id, "breBRecipientName", e.target.value)
                          }
                          className="min-h-[42px] text-xs"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
                          {isWompi
                            ? "Llave Pública Wompi (Public Key)"
                            : "Llave Publicable Stripe (Publishable Key)"}
                        </Label>
                        <Input
                          type="text"
                          placeholder={isWompi ? "pub_test_..." : "pk_test_..."}
                          value={form.publicKey}
                          onChange={(e) => handleInputChange(g.id, "publicKey", e.target.value)}
                          className="min-h-[42px] font-mono text-xs"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="block text-xs font-semibold text-[var(--dsn-text)]">
                            {isWompi
                              ? "Llave Privada Wompi (Private Key)"
                              : "Llave Secreta Stripe (Secret Key)"}
                          </Label>
                          {g.hasSecretKey && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              <Lock className="h-3 w-3" /> Cifrada En Base De Datos
                            </span>
                          )}
                        </div>
                        <Input
                          type="password"
                          placeholder={
                            g.hasSecretKey
                              ? "•••••••••••••••••••••••• (Configurada)"
                              : isWompi
                                ? "prv_test_..."
                                : "sk_test_..."
                          }
                          value={form.secretKey}
                          onChange={(e) => handleInputChange(g.id, "secretKey", e.target.value)}
                          className="min-h-[42px] font-mono text-xs"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="block text-xs font-semibold text-[var(--dsn-text)]">
                            {isWompi
                              ? "Secreto de Eventos Wompi (Checksum Secret)"
                              : "Secreto de Firma Webhook Stripe (whsec_...)"}
                          </Label>
                          {g.hasWebhookSecret && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              <ShieldCheck className="h-3 w-3" /> Cifrado con AES-256-GCM
                            </span>
                          )}
                        </div>
                        <Input
                          type="password"
                          placeholder={
                            g.hasWebhookSecret
                              ? "•••••••••••••••••••••••• (Configurado)"
                              : isWompi
                                ? "events_test_..."
                                : "whsec_..."
                          }
                          value={form.webhookSecret}
                          onChange={(e) => handleInputChange(g.id, "webhookSecret", e.target.value)}
                          className="min-h-[42px] font-mono text-xs"
                        />
                      </div>
                    </>
                  )}

                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 p-3">
                    <Label className="block text-[11px] font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      {isBreB
                        ? "Ruta de Recepción de Comprobantes Bre-B"
                        : `URL Canónica para el Webhook de ${isWompi ? "Wompi" : "Stripe"}`}
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--dsn-accent)] truncate select-all">
                        {g.webhookUrl}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopyWebhook(g.id, g.webhookUrl)}
                        className="ml-auto h-auto min-h-0 px-2 py-1 text-[11px] shrink-0"
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
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--dsn-border)]">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isLoading}
                  loading={isLoading}
                  loadingText="Guardando Configuración..."
                  onClick={() => handleSaveGateway(g.id)}
                  className="w-full min-h-[44px] rounded-xl font-bold text-xs shadow-md"
                >
                  <span>
                    {isBreB
                      ? "Guardar Configuración de Bre-B"
                      : `Guardar Configuración de ${isWompi ? "Wompi" : "Stripe"}`}
                  </span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
