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
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmationModal,
  FormSaveBar,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { workspaceFetch } from "@/lib/workspace-client";
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

  const [savedSnapshot, setSavedSnapshot] = useState(() => ({
    providerCode,
    modelId,
    temperature,
    maxTokens,
    priorityRole,
    verifyImmediately,
  }));

  const isDirty =
    isOwner &&
    (apiKey.trim().length > 0 ||
      providerCode !== savedSnapshot.providerCode ||
      modelId !== savedSnapshot.modelId ||
      temperature !== savedSnapshot.temperature ||
      maxTokens !== savedSnapshot.maxTokens ||
      priorityRole !== savedSnapshot.priorityRole ||
      verifyImmediately !== savedSnapshot.verifyImmediately);

  function handleDiscardSettings() {
    handleProviderChange(savedSnapshot.providerCode);
    setModelId(savedSnapshot.modelId);
    setApiKey("");
    setTemperature(savedSnapshot.temperature);
    setMaxTokens(savedSnapshot.maxTokens);
    setPriorityRole(savedSnapshot.priorityRole);
    setVerifyImmediately(savedSnapshot.verifyImmediately);
    setFeedback(null);
  }

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
    setApiKey("");
    const prov = overview?.catalog.find((p) => p.code === nextCode);
    const existing = overview?.configuredProviders.find(
      (p) => p.providerCode === nextCode,
    );
    const provDefaultModel =
      prov?.models.find((m) => m.isDefault) ?? prov?.models[0] ?? null;

    if (existing) {
      const nextModel = existing.selectedModelId ?? provDefaultModel?.id ?? "";
      const nextMax = String(existing.maxTokens);
      const nextRole = existing.priorityRole ?? "standby";
      setModelId(nextModel);
      setTemperature(existing.temperature);
      setMaxTokens(nextMax);
      setPriorityRole(nextRole);
      setSavedSnapshot({
        providerCode: nextCode,
        modelId: nextModel,
        temperature: existing.temperature,
        maxTokens: nextMax,
        priorityRole: nextRole,
        verifyImmediately,
      });
    } else if (provDefaultModel) {
      const hasActivePrimary = Boolean(
        overview?.configuredProviders.some(
          (p) => p.priorityRole === "primary" && p.status === "active",
        ),
      );
      const nextMax = String(provDefaultModel.defaultMaxTokens);
      const nextRole = hasActivePrimary ? "secondary" : "primary";
      setModelId(provDefaultModel.id);
      setTemperature(provDefaultModel.defaultTemperature);
      setMaxTokens(nextMax);
      setPriorityRole(nextRole);
      setSavedSnapshot({
        providerCode: nextCode,
        modelId: provDefaultModel.id,
        temperature: provDefaultModel.defaultTemperature,
        maxTokens: nextMax,
        priorityRole: nextRole,
        verifyImmediately,
      });
    } else {
      setModelId("");
      setPriorityRole("secondary");
      setSavedSnapshot({
        providerCode: nextCode,
        modelId: "",
        temperature,
        maxTokens,
        priorityRole: "secondary",
        verifyImmediately,
      });
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

  async function handleSaveSettings(e?: React.FormEvent) {
    e?.preventDefault();
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
      setSavedSnapshot({
        providerCode,
        modelId,
        temperature,
        maxTokens,
        priorityRole,
        verifyImmediately,
      });
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
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <Alert variant="warning" className="p-6">
          <ShieldCheck className="h-5 w-5" />
          <AlertTitle className="text-base font-bold text-[var(--dsn-text)]">
            {dict.aiSettingsTitle}
          </AlertTitle>
          <AlertDescription className="text-xs text-[var(--dsn-text-secondary)]">
            {dict.aiSettingsOwnerOnly}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const modeBadge: {
    label: string;
    variant: "success" | "accent" | "warning";
  } =
    overview?.effectiveMode === "byok"
      ? {
          label: dict.aiSettingsModeByok,
          variant: "success",
        }
      : overview?.effectiveMode === "platform_trial"
        ? {
            label: dict.aiSettingsModeTrial,
            variant: "accent",
          }
        : {
            label: dict.aiSettingsModeRequired,
            variant: "warning",
          };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {dict.aiSettingsTitle}
            </h1>
            <Badge variant={modeBadge.variant} className="text-[11px]">
              {modeBadge.label}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[var(--dsn-text-secondary)] mt-1">
            {dict.aiSettingsSubtitle}
          </p>
        </div>

        {isOwner && (
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSaveSettings()}
            disabled={saving}
            loading={saving}
            loadingText={dict.saveBarSavingCta}
            className="min-h-[40px] shrink-0 text-xs"
          >
            <Save className="h-4 w-4" />
            <span>{dict.saveBarSaveCta}</span>
          </Button>
        )}
      </header>

      {overview?.effectiveMode === "platform_trial" && (
        <Alert variant="info">
          <Sparkles className="h-4 w-4" />
          <AlertTitle className="text-xs">
            {isEn
              ? "Your store is operating with included AI access during the trial period."
              : "Tu comercio está operando con acceso AI incluido durante el periodo de prueba."}
          </AlertTitle>
          <AlertDescription className="text-xs" suppressHydrationWarning>
            {overview.trialEndsAt
              ? isEn
                ? `Estimated trial period end: ${new Date(overview.trialEndsAt).toLocaleDateString("en-US", { timeZone: "America/Bogota" })}. You can connect your own API Key anytime to take direct control.`
                : `Vigencia estimada del periodo de prueba: ${new Date(overview.trialEndsAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}. Puedes conectar tu propia API Key en cualquier momento para tomar el control directo.`
              : isEn
                ? "You can connect your own API Key at any time to operate without trial limits."
                : "Puedes conectar tu propia API Key en cualquier momento para operar sin límites de prueba."}
          </AlertDescription>
        </Alert>
      )}

      {feedback && (
        <Alert variant={feedback.type === "success" ? "success" : "destructive"} role="status">
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className="text-xs font-medium">{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario BYOK Mobile First */}
        <Card asChild>
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-2 rounded-2xl p-5 sm:p-6 space-y-5"
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
                {isEn ? "Configure Provider Credential" : "Configurar Credencial del Proveedor"}
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
              <Label
                htmlFor="byok-provider-select"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsProviderLabel}
              </Label>
              <Select
                id="byok-provider-select"
                value={providerCode}
                onChange={(e) =>
                  handleProviderChange(e.target.value as SupportedLlmProviderCode)
                }
                className="min-h-[44px] text-xs"
              >
                {(overview?.catalog ?? []).map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label
                htmlFor="byok-model-select"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsModelLabel}
              </Label>
              <Select
                id="byok-model-select"
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                className="min-h-[44px] text-xs"
              >
                {(selectedProviderMeta?.models ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.modelId})
                    {m.isDefault ? ` — ${dict.aiSettingsDefaultModelTag}` : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label
              htmlFor="byok-priority-select"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {dict.aiSettingsPriorityLabel}
            </Label>
            <Select
              id="byok-priority-select"
              value={priorityRole}
              onChange={(e) =>
                setPriorityRole(
                  e.target.value as "primary" | "secondary" | "standby",
                )
              }
              className="min-h-[44px] text-xs"
            >
              <option value="primary">{dict.aiSettingsPriorityPrimary}</option>
              <option value="secondary">{dict.aiSettingsPrioritySecondary}</option>
              <option value="standby">{dict.aiSettingsPriorityStandby}</option>
            </Select>
          </div>

          <div>
            <Label
              htmlFor="byok-api-key-input"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {dict.aiSettingsKeyLabel}
            </Label>
            <Input
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
              className="min-h-[44px] font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
              {isEn
                ? "Your API Key is encrypted on the server with AES-256-GCM and is never shown again in plaintext."
                : "Tu API Key se cifra en servidor con AES-256-GCM y nunca vuelve a mostrarse en texto plano."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="byok-temperature-input"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsTempLabel} (0.0 – 2.0)
              </Label>
              <Input
                id="byok-temperature-input"
                type="number"
                step="0.01"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="min-h-[44px] font-mono text-xs"
              />
            </div>

            <div>
              <Label
                htmlFor="byok-max-tokens-input"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.aiSettingsTokensLabel}
              </Label>
              <Input
                id="byok-max-tokens-input"
                type="number"
                min="64"
                max="32768"
                step="1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="min-h-[44px] font-mono text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-[var(--dsn-text)] cursor-pointer">
            <Checkbox
              checked={verifyImmediately}
              onCheckedChange={(checked) => setVerifyImmediately(checked === true)}
            />
            <span>{dict.aiSettingsVerifyOnSaveLabel}</span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[var(--dsn-border)]">
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
              loading={saving}
              loadingText={isEn ? "Validating And Saving..." : "Validando y Guardando..."}
              className="min-h-[44px] text-xs"
            >
              <Save className="h-4 w-4" />
              <span>{dict.aiSettingsSaveAction}</span>
            </Button>
          </div>

          {isOwner && (
            <FormSaveBar
              isDirty={isDirty}
              dirtySectionsCount={isDirty ? 1 : 0}
              sectionName={dict.aiSettingsTitle}
              onSave={() => void handleSaveSettings()}
              onDiscard={handleDiscardSettings}
              locale={locale}
              saving={saving}
              submitType="button"
            />
          )}
          </form>
        </Card>

        {/* Estado Actual y Llaves Guardadas */}
        <Card asChild>
          <aside className="rounded-2xl p-5 sm:p-6 space-y-4">
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
                      <Badge
                        variant={
                          item.priorityRole === "primary"
                            ? "accent"
                            : item.priorityRole === "secondary"
                              ? "warning"
                              : "outline"
                        }
                        className="text-[10px]"
                      >
                        {item.priorityRole === "primary"
                          ? dict.aiSettingsPriorityPrimary
                          : item.priorityRole === "secondary"
                            ? dict.aiSettingsPrioritySecondary
                            : dict.aiSettingsPriorityStandby}
                      </Badge>
                      <Badge
                        variant={item.status === "active" ? "success" : "destructive"}
                        className="text-[10px]"
                      >
                        {item.status === "active"
                          ? isEn
                            ? "Active"
                            : "Activa"
                          : isEn
                            ? "Invalid"
                            : "Inválida"}
                      </Badge>
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleQuickPriorityChange(item.providerCode, "primary")
                        }
                        disabled={saving}
                        className="min-h-[38px] text-[11px] border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
                      >
                        <span>{dict.aiSettingsMakePrimaryAction}</span>
                      </Button>
                    )}
                    {item.status === "active" && item.priorityRole !== "secondary" && (
                      <Button
                        type="button"
                        variant="warning"
                        size="sm"
                        onClick={() =>
                          handleQuickPriorityChange(item.providerCode, "secondary")
                        }
                        disabled={saving}
                        className="min-h-[38px] text-[11px]"
                      >
                        <span>{dict.aiSettingsMakeSecondaryAction}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleVerifyConnection(item.providerCode)}
                      disabled={verifying}
                      className="min-h-[38px] text-[11px]"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`}
                      />
                      <span>{dict.aiSettingsTestAction}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setProviderToRevoke(item.providerCode);
                        setRevokeModalOpen(true);
                      }}
                      className="min-h-[38px] text-[11px]"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{dict.aiSettingsRevokeAction}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </aside>
        </Card>
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
            : "Revocar Credencial de Proveedor AI"
        }
        subtitle={
          isEn
            ? "If you do not have another active key or valid trial period, AI assistance and your bot will pause until a new key is configured."
            : "Si no cuentas con otra llave activa ni periodo de prueba vigente, la asistencia AI y el bot quedarán pausados hasta configurar una nueva."
        }
        warningTitle={
          isEn
            ? "Irreversible Action On Current Credential"
            : "Acción Irreversible sobre la Credencial Actual"
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
