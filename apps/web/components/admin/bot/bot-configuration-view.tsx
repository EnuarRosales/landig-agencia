"use client";

import React, { useState } from "react";

export interface BotToneOption {
  id: string;
  code: string;
  label: string;
  description: string;
}

export interface BotPresetOption {
  id: string;
  code: string;
  label: string;
  modelName: string;
  recommendedFor: string;
}

export interface BotProviderOption {
  id: string;
  code: string;
  name: string;
}

export interface BotModelOption {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
}

export interface BotChannelOption {
  id: string;
  code: string;
  label: string;
  provisioning: "api" | "oauth" | string;
  notes?: string;
  isConfigured: boolean;
  inboxId?: number | null;
  enabled: boolean;
}

export interface ByokKeyItem {
  id: string;
  providerId: string;
  providerName: string;
  maskedApiKey: string;
  status: string;
}

export interface BotConfigData {
  id?: string;
  name: string;
  objective: string;
  toneId: string;
  presetId: string | null;
  providerId: string | null;
  modelId: string | null;
  status: "draft" | "active" | "paused";
  persona: string | null;
  greetingMessage: string | null;
  fallbackMessage: string | null;
  answerPolicy: "solo_conocimiento" | "libre";
}

export interface BotConfigurationViewProps {
  initialBot: BotConfigData;
  tones: BotToneOption[];
  presets: BotPresetOption[];
  providers: BotProviderOption[];
  models: BotModelOption[];
  channels: BotChannelOption[];
  byokKeys: ByokKeyItem[];
  t?: Partial<Record<string, string>>;
  onSaveBot?: (bot: BotConfigData) => Promise<boolean>;
  onUpdateStatus?: (status: "draft" | "active" | "paused") => Promise<boolean>;
  onToggleChannel?: (channelTypeId: string, enabled: boolean) => Promise<boolean>;
  onSaveByokKey?: (providerId: string, apiKey: string) => Promise<boolean>;
}

const defaultTranslations: Record<string, string> = {
  title: "Configuración Del Bot De Atención",
  subtitle: "Gobernanza conversacional, modelos de lenguaje, canales habilitados y credenciales BYOK",
  statusDraft: "Borrador",
  statusActive: "Operativo",
  statusPaused: "Pausado",
  labelName: "Nombre Del Bot",
  labelObjective: "Objetivo Principal De Atención",
  labelTone: "Tono Comunicacional",
  labelModelSelection: "Estrategia De Modelo De Lenguaje",
  modelStrategyPreset: "Preset Optimizado Por Mocter (Recomendado)",
  modelStrategyCustom: "Proveedor Y Modelo Específico (BYOK / Personalizado)",
  labelPreset: "Preset De Modelo",
  labelProvider: "Proveedor De Inteligencia Artificial",
  labelModel: "Modelo De Lenguaje",
  labelPersona: "Personalidad Del Asistente",
  labelGreeting: "Mensaje De Saludo Predeterminado",
  labelFallback: "Mensaje De Respaldo (Fallback)",
  labelAnswerPolicy: "Política De Respuesta",
  policyOnlyKnowledge: "Restringido Exclusivamente A Base De Conocimiento",
  policyFree: "Conversación Abierta Con Contexto Comercial",
  channelsSectionTitle: "Canales De Atención E Integraciones",
  channelsSectionDesc: "Gestiona los canales conectados y el aprovisionamiento de inboxes",
  channelProvisionApi: "Conexión Directa Por API",
  channelProvisionOAuth: "Flujo Seguro Mediado Por Chatwoot",
  channelEnable: "Habilitar Canal",
  channelDisable: "Desactivar Canal",
  byokSectionTitle: "Credenciales Propias (BYOK)",
  byokSectionDesc: "Registra y rota de forma segura tus claves de API cifradas con AES-256-GCM",
  labelApiKey: "Clave De API Del Proveedor",
  saveKeyButton: "Registrar Clave Cifrada",
  saveBotButton: "Guardar Configuración Del Bot",
  activateBotButton: "Poner Bot En Producción",
  pauseBotButton: "Pausar Operación Del Bot",
  saveSuccess: "Configuración del bot guardada exitosamente.",
};

export function BotConfigurationView({
  initialBot,
  tones,
  presets,
  providers,
  models,
  channels: initialChannels,
  byokKeys: initialByokKeys,
  t = {},
  onSaveBot,
  onUpdateStatus,
  onToggleChannel,
  onSaveByokKey,
}: BotConfigurationViewProps) {
  const i18n = { ...defaultTranslations, ...t };

  const [bot, setBot] = useState<BotConfigData>(initialBot);
  const [channels, setChannels] = useState<BotChannelOption[]>(initialChannels);
  const [byokKeys, setByokKeys] = useState<ByokKeyItem[]>(initialByokKeys);
  const [modelStrategy, setModelStrategy] = useState<"preset" | "custom">(
    initialBot.presetId ? "preset" : "custom",
  );

  // BYOK form
  const [selectedProviderForByok, setSelectedProviderForByok] = useState(
    providers[0]?.id || "",
  );
  const [plainApiKey, setPlainApiKey] = useState("");
  const [byokSuccessMsg, setByokSuccessMsg] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const availableModels = models.filter((m) => m.providerId === bot.providerId);

  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedBot = { ...bot };
    if (modelStrategy === "preset") {
      updatedBot.providerId = null;
      updatedBot.modelId = null;
    } else {
      updatedBot.presetId = null;
    }

    if (onSaveBot) {
      await onSaveBot(updatedBot);
    }
    setSaveSuccessMsg(i18n.saveSuccess || "Configuración guardada.");
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleStatusChange = async (newStatus: "draft" | "active" | "paused") => {
    if (onUpdateStatus) {
      await onUpdateStatus(newStatus);
    }
    setBot((prev) => ({ ...prev, status: newStatus }));
  };

  const handleToggleChannel = async (channelId: string, currentEnabled: boolean) => {
    const nextState = !currentEnabled;
    if (onToggleChannel) {
      await onToggleChannel(channelId, nextState);
    }
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channelId ? { ...c, enabled: nextState, isConfigured: true } : c,
      ),
    );
  };

  const handleSaveByok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plainApiKey.trim() || plainApiKey.trim().length < 8) return;

    if (onSaveByokKey) {
      await onSaveByokKey(selectedProviderForByok, plainApiKey.trim());
    }

    const providerObj = providers.find((p) => p.id === selectedProviderForByok);
    const newKey: ByokKeyItem = {
      id: `byok-${Date.now()}`,
      providerId: selectedProviderForByok,
      providerName: providerObj?.name || "Proveedor",
      maskedApiKey: `••••${plainApiKey.trim().slice(-4)}`,
      status: "active",
    };

    setByokKeys((prev) => [
      ...prev.filter((k) => k.providerId !== selectedProviderForByok),
      newKey,
    ]);
    setPlainApiKey("");
    setByokSuccessMsg("Clave BYOK cifrada y registrada correctamente.");
    setTimeout(() => setByokSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-8 font-mono">
      {/* Encabezado y Estado Operativo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white font-mono">
              {i18n.title}
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                bot.status === "active"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : bot.status === "paused"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
              }`}
            >
              {bot.status === "active"
                ? i18n.statusActive
                : bot.status === "paused"
                  ? i18n.statusPaused
                  : i18n.statusDraft}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">{i18n.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          {bot.status !== "active" ? (
            <button
              type="button"
              onClick={() => handleStatusChange("active")}
              className="rounded bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              {i18n.activateBotButton}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStatusChange("paused")}
              className="rounded bg-amber-600/80 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
            >
              {i18n.pauseBotButton}
            </button>
          )}
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="rounded border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-400">
          {saveSuccessMsg}
        </div>
      )}

      {/* Formulario Principal de Configuración */}
      <form onSubmit={handleSaveBot} className="space-y-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-300">
                {i18n.labelName} *
              </label>
              <input
                type="text"
                required
                value={bot.name}
                onChange={(e) => setBot({ ...bot, name: e.target.value })}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                {i18n.labelTone} *
              </label>
              <select
                value={bot.toneId}
                onChange={(e) => setBot({ ...bot, toneId: e.target.value })}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              >
                {tones.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300">
              {i18n.labelObjective} *
            </label>
            <input
              type="text"
              required
              value={bot.objective}
              onChange={(e) => setBot({ ...bot, objective: e.target.value })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Estrategia de Selección de Modelo */}
          <div className="pt-2 border-t border-zinc-800/80">
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              {i18n.labelModelSelection}
            </label>
            <div className="flex gap-4 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-200">
                <input
                  type="radio"
                  name="modelStrategy"
                  checked={modelStrategy === "preset"}
                  onChange={() => setModelStrategy("preset")}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                {i18n.modelStrategyPreset}
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-200">
                <input
                  type="radio"
                  name="modelStrategy"
                  checked={modelStrategy === "custom"}
                  onChange={() => setModelStrategy("custom")}
                  className="text-emerald-500 focus:ring-emerald-500"
                />
                {i18n.modelStrategyCustom}
              </label>
            </div>

            {modelStrategy === "preset" ? (
              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-400">
                  {i18n.labelPreset}
                </label>
                <select
                  value={bot.presetId || presets[0]?.id || ""}
                  onChange={(e) => setBot({ ...bot, presetId: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} - {p.modelName} ({p.recommendedFor})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    {i18n.labelProvider}
                  </label>
                  <select
                    value={bot.providerId || providers[0]?.id || ""}
                    onChange={(e) => {
                      const newPId = e.target.value;
                      const firstModel = models.find((m) => m.providerId === newPId);
                      setBot({
                        ...bot,
                        providerId: newPId,
                        modelId: firstModel?.id || null,
                      });
                    }}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400">
                    {i18n.labelModel}
                  </label>
                  <select
                    value={bot.modelId || availableModels[0]?.id || ""}
                    onChange={(e) => setBot({ ...bot, modelId: e.target.value })}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName} ({m.modelId})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Opciones Conversacionales Avanzadas */}
          <div className="pt-2 border-t border-zinc-800/80 space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300">
                {i18n.labelPersona}
              </label>
              <textarea
                rows={2}
                value={bot.persona || ""}
                onChange={(e) => setBot({ ...bot, persona: e.target.value || null })}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelGreeting}
                </label>
                <input
                  type="text"
                  value={bot.greetingMessage || ""}
                  onChange={(e) =>
                    setBot({ ...bot, greetingMessage: e.target.value || null })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  {i18n.labelFallback}
                </label>
                <input
                  type="text"
                  value={bot.fallbackMessage || ""}
                  onChange={(e) =>
                    setBot({ ...bot, fallbackMessage: e.target.value || null })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300">
                {i18n.labelAnswerPolicy}
              </label>
              <select
                value={bot.answerPolicy}
                onChange={(e) =>
                  setBot({
                    ...bot,
                    answerPolicy: e.target.value as "solo_conocimiento" | "libre",
                  })
                }
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="solo_conocimiento">{i18n.policyOnlyKnowledge}</option>
                <option value="libre">{i18n.policyFree}</option>
              </select>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              {i18n.saveBotButton}
            </button>
          </div>
        </div>
      </form>

      {/* Sección: Canales de Atención e Integraciones */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">{i18n.channelsSectionTitle}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{i18n.channelsSectionDesc}</p>
        </div>

        <div className="divide-y divide-zinc-800/80">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <p className="text-sm font-semibold text-white">{ch.label}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400">
                  <span className="font-mono text-zinc-500">{ch.code}</span>
                  <span>•</span>
                  <span>
                    {ch.provisioning === "api"
                      ? i18n.channelProvisionApi
                      : i18n.channelProvisionOAuth}
                  </span>
                  {ch.inboxId && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 font-mono">
                        Inbox #{ch.inboxId}
                      </span>
                    </>
                  )}
                </div>
                {ch.notes && <p className="text-[11px] text-zinc-500 mt-0.5">{ch.notes}</p>}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleToggleChannel(ch.id, ch.enabled)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                    ch.enabled
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {ch.enabled ? i18n.channelDisable : i18n.channelEnable}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sección: Credenciales BYOK */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">{i18n.byokSectionTitle}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{i18n.byokSectionDesc}</p>
        </div>

        {byokSuccessMsg && (
          <div className="rounded border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-400">
            {byokSuccessMsg}
          </div>
        )}

        <form onSubmit={handleSaveByok} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-300">
              {i18n.labelProvider}
            </label>
            <select
              value={selectedProviderForByok}
              onChange={(e) => setSelectedProviderForByok(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300">
              {i18n.labelApiKey}
            </label>
            <input
              type="password"
              placeholder="sk-..."
              required
              value={plainApiKey}
              onChange={(e) => setPlainApiKey(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
            >
              {i18n.saveKeyButton}
            </button>
          </div>
        </form>

        {byokKeys.length > 0 && (
          <div className="pt-3 border-t border-zinc-800/80">
            <div className="divide-y divide-zinc-800/60">
              {byokKeys.map((k) => (
                <div key={k.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">{k.providerName}</span>
                  <span className="font-mono text-zinc-400">{k.maskedApiKey}</span>
                  <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5">
                    {k.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

