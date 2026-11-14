"use client";

import React, { useMemo, useState } from "react";
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Save,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type {
  SupportedLlmProviderCode,
  TenantAiSettingsOverviewDto,
} from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface AiSettingsViewProps {
  initialOverview: TenantAiSettingsOverviewDto | null;
  isOwner: boolean;
  locale?: AdminLocale;
}

/**
 * Vista de gestión segura de proveedores LLM y llaves propias (BYOK) del comercio.
 *
 * - Diseño Mobile First con tokens `--dsn-*`.
 * - Etiquetas de formulario estrictamente en Title Case.
 * - Nunca expone ni almacena en el navegador la API Key en texto plano tras el guardado.
 * - Usa `ConfirmationModal` para revocar credenciales (cero diálogos nativos).
 */
export function AiSettingsView({
  initialOverview,
  isOwner,
  locale = "es",
}: AiSettingsViewProps) {
  const dict = getAdminDictionary(locale).workspace;
  const isEn = locale === "en";
  const [overview, setOverview] = useState<TenantAiSettingsOverviewDto | null>(
    initialOverview,
  );

  const defaultProvider =
    overview?.activeByok?.providerCode ??
    overview?.catalog[0]?.code ??
    "openai";
  const [providerCode, setProviderCode] =
    useState<SupportedLlmProviderCode>(defaultProvider);

  const selectedProviderMeta = useMemo(
    () => overview?.catalog.find((p) => p.code === providerCode) ?? null,
    [overview, providerCode],
  );

  const configuredForSelected = useMemo(
    () =>
      overview?.configuredProviders.find((p) => p.providerCode === providerCode) ??
      null,
    [overview, providerCode],
  );

  const defaultModelForSelected = useMemo(
    () =>
      selectedProviderMeta?.models.find((m) => m.isDefault) ??
      selectedProviderMeta?.models[0] ??
      null,
    [selectedProviderMeta],
  );

  const [modelId, setModelId] = useState<string>(
    configuredForSelected?.selectedModelId ??
      overview?.activeByok?.selectedModelId ??
      defaultModelForSelected?.id ??
      "",
  );
  const [apiKey, setApiKey] = useState("");
  const [temperature, setTemperature] = useState(
    configuredForSelected?.temperature ??
      overview?.activeByok?.temperature ??
      defaultModelForSelected?.defaultTemperature ??
      "0.7",
  );
  const [maxTokens, setMaxTokens] = useState(
    String(
      configuredForSelected?.maxTokens ??
        overview?.activeByok?.maxTokens ??
        defaultModelForSelected?.defaultMaxTokens ??
        1000,
    ),
  );
  const [priorityRole, setPriorityRole] = useState<
    "primary" | "secondary" | "standby"
  >(
    configuredForSelected?.priorityRole ??
      (overview?.activeByok ? "secondary" : "primary"),
  );
  const [verifyImmediately, setVerifyImmediately] = useState(true);

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [providerToRevoke, setProviderToRevoke] =
    useState<SupportedLlmProviderCode | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function renderProviderVisual(
    name: string,
    code: string,
    logoUrl?: string | null,
  ) {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={name}
          className="h-7 w-7 rounded-lg object-cover border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] shrink-0"
        />
      );
    }
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/15 text-[11px] font-bold font-mono text-[var(--dsn-accent)] shrink-0"
      >
        {code.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  function handleProviderChange(nextCode: SupportedLlmProviderCode) {
    setProviderCode(nextCode);
    setFeedback(null);
    const prov = overview?.catalog.find((p) => p.code === nextCode);
    const existing = overview?.configuredProviders.find(
      (p) => p.providerCode === nextCode,
    );
    const provDefaultModel =
      prov?.models.find((m) => m.isDefault) ?? prov?.models[0] ?? null;

    if (existing) {
      setModelId(existing.selectedModelId ?? provDefaultModel?.id ?? "");
      setTemperature(existing.temperature);
      setMaxTokens(String(existing.maxTokens));
      setPriorityRole(existing.priorityRole ?? "standby");
    } else if (provDefaultModel) {
      setModelId(provDefaultModel.id);
      setTemperature(provDefaultModel.defaultTemperature);
      setMaxTokens(String(provDefaultModel.defaultMaxTokens));
      const hasActivePrimary = Boolean(
        overview?.configuredProviders.some(
          (p) => p.priorityRole === "primary" && p.status === "active",
        ),
      );
      setPriorityRole(hasActivePrimary ? "secondary" : "primary");
    } else {
      setModelId("");
      setPriorityRole("secondary");
    }
  }

  function handleModelChange(nextModelId: string) {
    setModelId(nextModelId);
    const chosen = selectedProviderMeta?.models.find((m) => m.id === nextModelId);
    if (chosen) {
      setTemperature(chosen.defaultTemperature);
      setMaxTokens(String(chosen.defaultMaxTokens));
    }
  }

  async function refreshOverview() {
    const res = await workspaceFetch<TenantAiSettingsOverviewDto>(
      "/api/tenant/ai/settings",
    );
    if (res.ok && res.data) {
      setOverview(res.data);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);

    try {
      const res = await workspaceFetch("/api/tenant/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          providerCode,
          modelId: modelId || undefined,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          temperature: Number.parseFloat(temperature) || 0.7,
          maxTokens: Number.parseInt(maxTokens, 10) || 1000,
          priorityRole,
          verifyImmediately,
        }),
      });

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            res.error ??
            (isEn
              ? "Could not save AI configuration."
              : "No fue posible guardar la configuración AI."),
        });
        return;
      }

      setApiKey("");
      await refreshOverview();
      setFeedback({
        type: "success",
        message: isEn
          ? "AI provider credential and preferences saved successfully."
          : "Credencial y preferencias del proveedor AI guardadas correctamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickPriorityChange(
    targetProviderCode: SupportedLlmProviderCode,
    nextRole: "primary" | "secondary" | "standby",
  ) {
    setFeedback(null);
    setSaving(true);
    try {
      const res = await workspaceFetch("/api/tenant/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          providerCode: targetProviderCode,
          priorityRole: nextRole,
          verifyImmediately: false,
        }),
      });

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            res.error ??
            (isEn
              ? "Could not update provider priority role."
              : "No fue posible actualizar la prioridad del proveedor."),
        });
        return;
      }

      if (targetProviderCode === providerCode) {
        setPriorityRole(nextRole);
      }
      await refreshOverview();
      setFeedback({
        type: "success",
        message: isEn
          ? "Provider priority role updated."
          : "Rol de prioridad del proveedor actualizado.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyConnection(targetProvider?: SupportedLlmProviderCode) {
    setFeedback(null);
    setVerifying(true);
    try {
      const res = await workspaceFetch<{
        valid: boolean;
        providerCode: string;
        apiKeyLast4: string;
        latencyMs: number;
      }>("/api/tenant/ai/settings/verify", {
        method: "POST",
        body: JSON.stringify({ providerCode: targetProvider ?? providerCode }),
      });

      if (!res.ok || !res.data) {
        await refreshOverview();
        setFeedback({
          type: "error",
          message:
            res.error ??
            (isEn
              ? "Could not verify the AI credential."
              : "No fue posible verificar la credencial AI."),
        });
        return;
      }

      await refreshOverview();
      setFeedback({
        type: "success",
        message: isEn
          ? `Connection verified successfully (ending ••••${res.data.apiKeyLast4}, latency ${res.data.latencyMs} ms).`
          : `Conexión verificada con éxito (terminación ••••${res.data.apiKeyLast4}, latencia ${res.data.latencyMs} ms).`,
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleConfirmRevoke() {
    if (!providerToRevoke) return;
    setRevoking(true);
    setFeedback(null);

    try {
      const res = await workspaceFetch<{ revokedCount: number }>(
        `/api/tenant/ai/settings?providerCode=${encodeURIComponent(providerToRevoke)}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        setFeedback({
          type: "error",
          message:
            res.error ??
            (isEn
              ? "Could not revoke the AI credential."
              : "No fue posible revocar la credencial AI."),
        });
        return;
      }

      setRevokeModalOpen(false);
      setProviderToRevoke(null);
      await refreshOverview();
      setFeedback({
        type: "success",
        message: isEn
          ? "BYOK credential revoked safely."
          : "Credencial BYOK revocada de forma segura.",
      });
    } finally {
      setRevoking(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-base font-bold text-[var(--dsn-text)]">
              {dict.aiSettingsTitle}
            </h1>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
              {dict.aiSettingsOwnerOnly}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const modeBadge =
    overview?.effectiveMode === "byok"
      ? {
          label: dict.aiSettingsModeByok,
          classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        }
      : overview?.effectiveMode === "platform_trial"
        ? {
            label: dict.aiSettingsModeTrial,
            classes: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
          }
        : {
            label: dict.aiSettingsModeRequired,
            classes: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.aiSettingsTitle}
            </h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${modeBadge.classes}`}
            >
              {modeBadge.label}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--dsn-text-secondary)] mt-1">
            {dict.aiSettingsSubtitle}
          </p>
        </div>
      </header>

      {overview?.effectiveMode === "platform_trial" && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--dsn-text)] space-y-1">
            <p className="font-semibold">
              {isEn
                ? "Your store is operating with included AI access during the trial period."
                : "Tu comercio está operando con acceso AI incluido durante el periodo de prueba."}
            </p>
            <p className="text-[var(--dsn-text-secondary)]">
              {overview.trialEndsAt
                ? isEn
                  ? `Estimated trial period end: ${new Date(overview.trialEndsAt).toLocaleDateString("en-US")}. You can connect your own API Key anytime to take direct control.`
                  : `Vigencia estimada del periodo de prueba: ${new Date(overview.trialEndsAt).toLocaleDateString("es-CO")}. Puedes conectar tu propia API Key en cualquier momento para tomar el control directo.`
                : isEn
                  ? "You can connect your own API Key at any time to operate without trial limits."
                  : "Puedes conectar tu propia API Key en cualquier momento para operar sin límites de prueba."}
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border p-3.5 text-xs font-medium ${
            feedback.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario BYOK Mobile First */}
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-2 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
            <div className="flex items-center gap-2.5">
              {selectedProviderMeta ? (
                renderProviderVisual(
                  selectedProviderMeta.name,
                  selectedProviderMeta.code,
                  selectedProviderMeta.logoUrl,
                )
              ) : (
                <KeyRound className="h-4 w-4 text-[var(--dsn-accent)]" />
              )}
              <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                {isEn ? "Configure Provider Credential" : "Configurar Credencial Del Proveedor"}
              </h2>
            </div>
            {selectedProviderMeta?.docsUrl && (
              <a
                href={selectedProviderMeta.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--dsn-accent)] hover:underline"
              >
                <span>{isEn ? "Get API Key" : "Obtener Llave"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="byok-provider-select"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsProviderLabel}
              </label>
              <select
                id="byok-provider-select"
                value={providerCode}
                onChange={(e) =>
                  handleProviderChange(e.target.value as SupportedLlmProviderCode)
                }
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
              >
                {(overview?.catalog ?? []).map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="byok-model-select"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsModelLabel}
              </label>
              <select
                id="byok-model-select"
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
              >
                {(selectedProviderMeta?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.modelId})
                    {m.isDefault ? ` — ${dict.aiSettingsDefaultModelTag}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="byok-priority-select"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {dict.aiSettingsPriorityLabel}
            </label>
            <select
              id="byok-priority-select"
              value={priorityRole}
              onChange={(e) =>
                setPriorityRole(
                  e.target.value as "primary" | "secondary" | "standby",
                )
              }
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
            >
              <option value="primary">{dict.aiSettingsPriorityPrimary}</option>
              <option value="secondary">{dict.aiSettingsPrioritySecondary}</option>
              <option value="standby">{dict.aiSettingsPriorityStandby}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="byok-api-key-input"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {dict.aiSettingsKeyLabel}
            </label>
            <input
              id="byok-api-key-input"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                configuredForSelected
                  ? isEn
                    ? `Active key (••••${configuredForSelected.apiKeyLast4}) — paste a new one only to rotate`
                    : `Clave actual activa (••••${configuredForSelected.apiKeyLast4}) — pega una nueva solo para rotar`
                  : isEn
                    ? "Paste your private key here (e.g. sk-..., AIza..., sk-ant-...)"
                    : "Pega aquí tu clave privada (ej. sk-..., AIza..., sk-ant-...)"
              }
              className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 px-3 text-xs font-mono text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/60 focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
            <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
              {isEn
                ? "Your API Key is encrypted on the server with AES-256-GCM and is never shown again in plaintext."
                : "Tu API Key se cifra en servidor con AES-256-GCM y nunca vuelve a mostrarse en texto plano."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="byok-temperature-input"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsTempLabel} (0.0 – 2.0)
              </label>
              <input
                id="byok-temperature-input"
                type="number"
                step="0.01"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 px-3 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
              />
            </div>

            <div>
              <label
                htmlFor="byok-max-tokens-input"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsTokensLabel}
              </label>
              <input
                id="byok-max-tokens-input"
                type="number"
                min="64"
                max="32768"
                step="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 px-3 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-[var(--dsn-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={verifyImmediately}
              onChange={(e) => setVerifyImmediately(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--dsn-border)] accent-[var(--dsn-accent)]"
            />
            <span>{dict.aiSettingsVerifyOnSaveLabel}</span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[var(--dsn-border)]">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>
                {saving
                  ? isEn
                    ? "Validating And Saving..."
                    : "Validando y Guardando..."
                  : dict.aiSettingsSaveAction}
              </span>
            </button>
          </div>
        </form>

        {/* Estado Actual y Llaves Guardadas */}
        <aside className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              {isEn ? "Saved Credentials" : "Credenciales Guardadas"}
            </h2>
          </div>

          {!overview || overview.configuredProviders.length === 0 ? (
            <p className="text-xs text-[var(--dsn-text-secondary)]">
              {isEn
                ? "You don't have your own API Key configured yet. Register a credential to operate directly with your account."
                : "Aún no tienes ninguna API Key propia configurada. Registra una credencial para operar directamente con tu cuenta."}
            </p>
          ) : (
            <div className="space-y-3">
              {overview.configuredProviders.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderProviderVisual(
                        item.providerName,
                        item.providerCode,
                        item.logoUrl,
                      )}
                      <span className="text-xs font-bold text-[var(--dsn-text)] truncate">
                        {item.providerName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          item.priorityRole === "primary"
                            ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                            : item.priorityRole === "secondary"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                        }`}
                      >
                        {item.priorityRole === "primary"
                          ? dict.aiSettingsPriorityPrimary
                          : item.priorityRole === "secondary"
                            ? dict.aiSettingsPrioritySecondary
                            : dict.aiSettingsPriorityStandby}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {item.status === "active"
                          ? isEn
                            ? "Active"
                            : "Activa"
                          : isEn
                            ? "Invalid"
                            : "Inválida"}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-[var(--dsn-text-secondary)] space-y-0.5">
                    <p>
                      {isEn ? "Masked Key" : "Llave Enmascarada"}: ••••{item.apiKeyLast4}
                    </p>
                    {item.selectedModelCode && (
                      <p>
                        {isEn ? "Model" : "Modelo"}: {item.selectedModelCode}
                      </p>
                    )}
                    {item.lastVerifiedAt && (
                      <p>
                        {isEn ? "Verified" : "Verificada"}:{" "}
                        {new Date(item.lastVerifiedAt).toLocaleString(isEn ? "en-US" : "es-CO")}
                      </p>
                    )}
                    {item.lastVerificationError && (
                      <p className="text-rose-400">
                        {isEn ? "Last error" : "Último error"}: {item.lastVerificationError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {item.status === "active" && item.priorityRole !== "primary" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickPriorityChange(item.providerCode, "primary")
                        }
                        disabled={saving}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50"
                      >
                        <span>{dict.aiSettingsMakePrimaryAction}</span>
                      </button>
                    )}
                    {item.status === "active" && item.priorityRole !== "secondary" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickPriorityChange(item.providerCode, "secondary")
                        }
                        disabled={saving}
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <span>{dict.aiSettingsMakeSecondaryAction}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleVerifyConnection(item.providerCode)}
                      disabled={verifying}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`}
                      />
                      <span>{dict.aiSettingsTestAction}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProviderToRevoke(item.providerCode);
                        setRevokeModalOpen(true);
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{dict.aiSettingsRevokeAction}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <ConfirmationModal
        isOpen={revokeModalOpen}
        onClose={() => {
          if (!revoking) {
            setRevokeModalOpen(false);
            setProviderToRevoke(null);
          }
        }}
        onConfirm={handleConfirmRevoke}
        title={
          isEn
            ? "Revoke AI Provider Credential"
            : "Revocar Credencial De Proveedor AI"
        }
        subtitle={
          isEn
            ? "If you do not have another active key or valid trial period, AI assistance and your bot will pause until a new key is configured."
            : "Si no cuentas con otra llave activa ni periodo de prueba vigente, la asistencia AI y el bot quedarán pausados hasta configurar una nueva."
        }
        warningTitle={
          isEn
            ? "Irreversible Action On Current Credential"
            : "Acción Irreversible Sobre La Credencial Actual"
        }
        warningMessage={
          isEn
            ? "You will need to enter the secret key again if you want to reactivate this provider later."
            : "Tendrás que ingresar nuevamente la clave secreta si deseas reactivar este proveedor más adelante."
        }
        confirmText={isEn ? "Confirm Revocation" : "Confirmar Revocación"}
        confirmLoadingText={isEn ? "Revoking..." : "Revocando..."}
        cancelText={isEn ? "Cancel" : "Cancelar"}
        variant="danger"
        loading={revoking}
        details={
          providerToRevoke
            ? [
                {
                  label: isEn ? "Selected Provider" : "Proveedor Seleccionado",
                  value: providerToRevoke,
                },
                {
                  label: isEn ? "Registered Ending" : "Terminación Registrada",
                  mono: true,
                  value: `••••${
                    overview?.configuredProviders.find(
                      (p) => p.providerCode === providerToRevoke,
                    )?.apiKeyLast4 ?? "****"
                  }`,
                },
              ]
            : undefined
        }
      />
    </div>
  );
}
