"use client";

import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CreditCard,
  Loader2,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import type { TenantOnboardingStateDto } from "@mocter/domain";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface OnboardingPaymentChannelItem {
  channelCode:
    | "nequi"
    | "daviplata"
    | "bancolombia"
    | "bre_b"
    | "pse"
    | "card_link"
    | "cash_on_delivery"
    | "efecty"
    | "bank_transfer"
    | "other";
  displayName: string;
  accountIdentifier: string;
  accountHolderName: string;
  instructions: string;
  isActive: boolean;
}

const CHANNEL_CATALOG: Array<{
  code: OnboardingPaymentChannelItem["channelCode"];
  label: string;
}> = [
  { code: "nequi", label: "Nequi" },
  { code: "daviplata", label: "Daviplata" },
  { code: "bancolombia", label: "Bancolombia" },
  { code: "bre_b", label: "Bre-B" },
  { code: "bank_transfer", label: "Transferencia Bancaria" },
  { code: "cash_on_delivery", label: "Pago contra Entrega" },
  { code: "pse", label: "PSE" },
  { code: "card_link", label: "Link de Pago con Tarjeta" },
  { code: "efecty", label: "Efecty" },
  { code: "other", label: "Otro Medio" },
];

export interface StepAssistantPaymentsProps {
  locale: AdminLocale;
  botCatalog: TenantOnboardingStateDto["botCatalog"];
  botName: string;
  botObjective: string;
  botPresetId: string;
  botToneId: string;
  paymentChannels: OnboardingPaymentChannelItem[];
  orderConfirmationMessage: string;
  loading: boolean;
  onBotNameChange: (val: string) => void;
  onBotObjectiveChange: (val: string) => void;
  onBotPresetIdChange: (val: string) => void;
  onBotToneIdChange: (val: string) => void;
  onPaymentChannelsChange: (channels: OnboardingPaymentChannelItem[]) => void;
  onOrderConfirmationMessageChange: (val: string) => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Paso 4 del onboarding: Configuración sincronizada del asistente virtual, canales de pago y etiquetas iniciales.
 */
export function StepAssistantPayments({
  locale,
  botCatalog,
  botName,
  botObjective,
  botPresetId,
  botToneId,
  paymentChannels,
  orderConfirmationMessage,
  loading,
  onBotNameChange,
  onBotObjectiveChange,
  onBotPresetIdChange,
  onBotToneIdChange,
  onPaymentChannelsChange,
  onOrderConfirmationMessageChange,
  onBack,
  onSubmit,
}: StepAssistantPaymentsProps) {
  const dict = getAdminDictionary(locale).onboarding;

  function updateChannel(index: number, patch: Partial<OnboardingPaymentChannelItem>) {
    const next = paymentChannels.map((ch, idx) => (idx === index ? { ...ch, ...patch } : ch));
    onPaymentChannelsChange(next);
  }

  function addChannel() {
    onPaymentChannelsChange([
      ...paymentChannels,
      {
        channelCode: "other",
        displayName: "Transferencia Bancaria",
        accountIdentifier: "",
        accountHolderName: "",
        instructions: "",
        isActive: true,
      },
    ]);
  }

  function removeChannel(index: number) {
    if (paymentChannels.length <= 1) return;
    onPaymentChannelsChange(paymentChannels.filter((_, idx) => idx !== index));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--dsn-text)]">{dict.step4Title}</h2>
          <p className="mt-1 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
            {dict.step4Subtitle}
          </p>
        </div>
      </div>

      {/* Nombre y Objetivo del Asistente */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="onb-bot-name"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step4BotNameLabel}
          </label>
          <input
            id="onb-bot-name"
            type="text"
            required
            minLength={2}
            value={botName}
            onChange={(e) => onBotNameChange(e.target.value)}
            placeholder="Ej. Asistente Comercial"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div>
          <label
            htmlFor="onb-bot-objective"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step4BotObjectiveLabel}
          </label>
          <select
            id="onb-bot-objective"
            value={botObjective}
            onChange={(e) => onBotObjectiveChange(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            {botCatalog.objectives.map((obj) => {
              const label = obj.labels[locale] || obj.labels.es;
              return (
                <option
                  key={obj.code}
                  value={label}
                  className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]"
                >
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Preset de Modelo */}
      {botCatalog.presets.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.step4BotPresetLabel}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {botCatalog.presets.map((preset) => {
              const active = preset.id === botPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onBotPresetIdChange(preset.id)}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition-colors ${
                    active
                      ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 ring-1 ring-[var(--dsn-accent)]"
                      : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 hover:border-[var(--dsn-accent)]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[var(--dsn-text)]">
                      {preset.labels[locale] || preset.labels.es}
                    </span>
                    {active && <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--dsn-text-secondary)]">
                    {preset.recommendedFor[locale] || preset.recommendedFor.es}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tono Comunicacional */}
      {botCatalog.tones.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.step4BotToneLabel}</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {botCatalog.tones.map((tone) => {
              const active = tone.id === botToneId;
              return (
                <button
                  key={tone.id}
                  type="button"
                  onClick={() => onBotToneIdChange(tone.id)}
                  className={`flex items-start justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10"
                      : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 hover:border-[var(--dsn-accent)]/40"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[var(--dsn-text)]">
                      {tone.labels[locale] || tone.labels.es}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--dsn-text-secondary)]">
                      {tone.description[locale] || tone.description.es}
                    </p>
                  </div>
                  {active && <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Canales De Pago Para Tus Clientes */}
      <div className="space-y-3 border-t border-[var(--dsn-border)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--dsn-accent)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--dsn-text)]">
                {dict.step4PaymentsTitle}
              </h3>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {dict.step4PaymentsSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={addChannel}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
          >
            <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
            <span>{dict.step4PaymentsAddCta}</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {paymentChannels.map((ch, idx) => (
            <div
              key={`${ch.channelCode}-${idx}`}
              className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3 grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-center"
            >
              <div className="sm:col-span-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ch.isActive}
                  onChange={(e) => updateChannel(idx, { isActive: e.target.checked })}
                  aria-label={`Activar ${ch.displayName}`}
                  className="h-4 w-4 accent-[var(--dsn-accent)]"
                />
                <select
                  value={ch.channelCode}
                  onChange={(e) => {
                    const nextCode = e.target.value as OnboardingPaymentChannelItem["channelCode"];
                    const presetLabel =
                      CHANNEL_CATALOG.find((c) => c.code === nextCode)?.label || ch.displayName;
                    updateChannel(idx, { channelCode: nextCode, displayName: presetLabel });
                  }}
                  className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {CHANNEL_CATALOG.map((option) => (
                    <option
                      key={option.code}
                      value={option.code}
                      className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={ch.accountIdentifier}
                  onChange={(e) => updateChannel(idx, { accountIdentifier: e.target.value })}
                  placeholder={dict.step4PaymentsAccountPlaceholder}
                  className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={ch.instructions}
                  onChange={(e) => updateChannel(idx, { instructions: e.target.value })}
                  placeholder="Instrucciones breves (opcional)"
                  className="w-full min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={paymentChannels.length <= 1}
                  onClick={() => removeChannel(idx)}
                  aria-label="Quitar canal"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dsn-border)] text-[var(--dsn-text-secondary)] hover:text-rose-500 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mensaje De Confirmación De Pedido */}
      <AiEnhanceTextarea
        id="onb-order-message"
        fieldKey="bot.order_confirmation_message"
        label={dict.step4OrderMsgLabel}
        value={orderConfirmationMessage}
        onChange={onOrderConfirmationMessageChange}
        rows={3}
        locale={locale}
      />

      {/* Aviso de Etiquetas Iniciales */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3.5 flex items-start gap-2.5 text-xs">
        <Tag className="h-4 w-4 text-[var(--dsn-accent)] shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-[var(--dsn-text)]">{dict.step4LabelsTitle}</p>
          <p className="mt-0.5 text-[var(--dsn-text-secondary)]">{dict.step4LabelsDesc}</p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-[var(--dsn-border)] pt-4 sm:flex-row sm:justify-between">
        <button
          type="button"
          disabled={loading}
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-5 py-2.5 text-sm font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{dict.backCta}</span>
        </button>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-sm font-bold text-[var(--dsn-accent-fg)] shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{dict.savingLabel}</span>
            </>
          ) : (
            <>
              <span>{dict.step4SubmitCta}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
