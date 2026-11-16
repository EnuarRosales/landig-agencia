"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bot, CheckCircle2, KeyRound, Lock, Save } from "lucide-react";
import type {
  TenantBotDefaultMessages,
  TenantBusinessHours,
  UnifiedTenantBotConfigDto,
} from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import {
  applyRecommendedClientGeneralPromptTemplate,
  buildClientDefaultBusinessHours,
  buildClientDefaultMessages,
  buildRecommendedClassifierPromptTemplate,
  buildRecommendedClientGeneralPromptTemplate,
  type ShippingPolicyUi,
} from "./bot-ui-helpers";
import { BotIdentityTab } from "./bot-identity-tab";
import { BotPoliciesTab } from "./bot-policies-tab";
import { BotMessagesTab } from "./bot-messages-tab";
import { BotClassifierTab, type EditableBotLabel } from "./bot-classifier-tab";

export interface BotViewProps {
  initialConfig: UnifiedTenantBotConfigDto | null;
  readOnly?: boolean;
  locale?: AdminLocale;
}

type BotTabKey = "identity" | "policies" | "messages" | "classifier";

function normalizeShippingPolicyUi(raw: unknown): ShippingPolicyUi {
  if (!raw || typeof raw !== "object") {
    return { freeShipping: false, defaultCostCents: 0, policyText: "", deliveryRules: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    freeShipping: Boolean(obj.freeShipping),
    defaultCostCents:
      typeof obj.defaultCostCents === "number" ? obj.defaultCostCents : 0,
    policyText: typeof obj.policyText === "string" ? obj.policyText : "",
    deliveryRules: Array.isArray(obj.deliveryRules)
      ? obj.deliveryRules
          .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
          .map((r) => ({
            regionCode: typeof r.regionCode === "string" ? r.regionCode : null,
            city: typeof r.city === "string" ? r.city : null,
            days: typeof r.days === "string" ? r.days : "",
          }))
      : [],
  };
}

/**
 * Vista unificada de configuración del Asistente AI y Políticas (`/workspace/bot`).
 */
export function BotView({
  initialConfig,
  readOnly = false,
  locale = "es",
}: BotViewProps) {
  const dict = getAdminDictionary(locale).workspace;

  const countryCode = initialConfig?.context.countryCode || "CO";
  const currency = initialConfig?.context.currency || "COP";
  const businessName = initialConfig?.context.businessName || "";
  const paymentMethods = useMemo(
    () => initialConfig?.policies.paymentMethods ?? [],
    [initialConfig?.policies.paymentMethods],
  );

  const catalog = useMemo(
    () =>
      initialConfig?.catalog ?? {
        objectives: [],
        presets: [],
        tones: [],
      },
    [initialConfig?.catalog],
  );

  const [activeTab, setActiveTab] = useState<BotTabKey>("identity");

  // Estado identidad & prompt
  const [name, setName] = useState(initialConfig?.bot.name || "Asistente Virtual");
  const [status, setStatus] = useState<"draft" | "active" | "paused">(
    (initialConfig?.bot.status as "draft" | "active" | "paused") || "active",
  );
  const [objective, setObjective] = useState(
    initialConfig?.bot.objective || "Atender consultas y cerrar pedidos",
  );
  const [presetId, setPresetId] = useState<string | null>(
    initialConfig?.bot.presetId ?? catalog.presets[0]?.id ?? null,
  );
  const [toneId, setToneId] = useState<string | null>(
    initialConfig?.bot.toneId ?? catalog.tones[0]?.id ?? null,
  );
  const [persona, setPersona] = useState(initialConfig?.bot.persona || "");
  const [responseLanguage, setResponseLanguage] = useState<"es" | "en" | "auto">(
    (initialConfig?.bot.responseLanguage as "es" | "en" | "auto") || "es",
  );
  const [answerPolicy, setAnswerPolicy] = useState<"solo_conocimiento" | "libre">(
    initialConfig?.bot.answerPolicy === "libre" ? "libre" : "solo_conocimiento",
  );
  const [maxTurns, setMaxTurns] = useState(initialConfig?.bot.maxTurns ?? 20);
  const [maxMessagesPerContact, setMaxMessagesPerContact] = useState(
    initialConfig?.bot.maxMessagesPerContact ?? 60,
  );
  const [allowedTopics, setAllowedTopics] = useState(initialConfig?.bot.allowedTopics || "");
  const [excludedTopics, setExcludedTopics] = useState(initialConfig?.bot.excludedTopics || "");
  const [handoffTriggersText, setHandoffTriggersText] = useState(
    (initialConfig?.bot.handoffTriggers || []).join(", "),
  );
  const [remindersEnabled, setRemindersEnabled] = useState(
    initialConfig?.policies.remindersEnabled ?? false,
  );

  // Estado políticas & envíos
  const [warrantyPolicy, setWarrantyPolicy] = useState(
    initialConfig?.policies.warrantyPolicy || "",
  );
  const [returnsPolicy, setReturnsPolicy] = useState(
    initialConfig?.policies.returnsPolicy || "",
  );
  const [shippingPolicy, setShippingPolicy] = useState<ShippingPolicyUi>(() =>
    normalizeShippingPolicyUi(initialConfig?.policies.shippingPolicy),
  );
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>(
    initialConfig?.policies.faqs || [],
  );

  // Estado mensajes & horarios
  const [defaultMessages, setDefaultMessages] = useState<TenantBotDefaultMessages>(() => {
    const raw = initialConfig?.bot.defaultMessages;
    if (raw && Object.keys(raw).length > 0) {
      return raw;
    }
    return buildClientDefaultMessages(locale);
  });

  const [businessHours, setBusinessHours] = useState<TenantBusinessHours>(() => {
    const raw = initialConfig?.bot.businessHours;
    if (raw && raw.schedule) {
      return raw;
    }
    return buildClientDefaultBusinessHours(countryCode);
  });

  // Estado etiquetas & clasificador
  const [labels, setLabels] = useState<EditableBotLabel[]>(initialConfig?.labels || []);
  const [classifierPrompt, setClassifierPrompt] = useState(
    initialConfig?.bot.classifierPrompt || buildRecommendedClassifierPromptTemplate([]),
  );

  const selectedPreset = useMemo(
    () => catalog.presets.find((p) => p.id === presetId) ?? catalog.presets[0],
    [catalog.presets, presetId],
  );

  const promptContext = useMemo(
    () => ({
      botPreset: selectedPreset?.code || "natural_rhythm",
      presetName:
        (locale === "en" ? selectedPreset?.labels.en : selectedPreset?.labels.es) ||
        "Ritmo Natural",
      presetDescription:
        (locale === "en"
          ? selectedPreset?.recommendedFor?.en
          : selectedPreset?.recommendedFor?.es) || "",
      countryCode,
      currency,
      locale,
      businessName,
      paymentMethods,
      shippingPolicy,
      warrantyPolicy,
      returnsPolicy,
      orderMessage: defaultMessages.order_confirmation?.body || "",
      faqsCount: faqs.length,
    }),
    [
      selectedPreset,
      locale,
      countryCode,
      currency,
      businessName,
      paymentMethods,
      shippingPolicy,
      warrantyPolicy,
      returnsPolicy,
      defaultMessages.order_confirmation?.body,
      faqs.length,
    ],
  );

  const [instructions, setInstructions] = useState(
    () =>
      initialConfig?.bot.instructions ||
      buildRecommendedClientGeneralPromptTemplate({
        countryCode,
        currency,
        businessName,
        paymentMethods,
        shippingPolicy: normalizeShippingPolicyUi(initialConfig?.policies.shippingPolicy),
        warrantyPolicy: initialConfig?.policies.warrantyPolicy || "",
        returnsPolicy: initialConfig?.policies.returnsPolicy || "",
        orderMessage: initialConfig?.policies.orderMessage || "",
        faqsCount: initialConfig?.policies.faqs.length || 0,
      }),
  );

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInsertIdealTemplate() {
    setInstructions((prev) => applyRecommendedClientGeneralPromptTemplate(prev, promptContext));
  }

  function handleResetMessagesAndHours() {
    setDefaultMessages(buildClientDefaultMessages(locale));
    setBusinessHours(buildClientDefaultBusinessHours(countryCode));
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (readOnly) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    const parsedTriggers = handoffTriggersText
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const normalizedRules = (shippingPolicy.deliveryRules || []).filter(
      (rule) => rule.days.trim().length > 0,
    );

    const normalizedDefaultMsgs = {
      welcome: defaultMessages.welcome
        ? { body: defaultMessages.welcome.body, enabled: defaultMessages.welcome.enabled }
        : undefined,
      order_confirmation: defaultMessages.order_confirmation
        ? {
            body: defaultMessages.order_confirmation.body,
            enabled: defaultMessages.order_confirmation.enabled,
          }
        : undefined,
      dispatch_tracking: defaultMessages.dispatch_tracking
        ? {
            body: defaultMessages.dispatch_tracking.body,
            enabled: defaultMessages.dispatch_tracking.enabled,
          }
        : undefined,
      delivery_issue: defaultMessages.delivery_issue
        ? {
            body: defaultMessages.delivery_issue.body,
            enabled: defaultMessages.delivery_issue.enabled,
          }
        : undefined,
      out_of_hours: defaultMessages.out_of_hours
        ? {
            body: defaultMessages.out_of_hours.body,
            enabled: defaultMessages.out_of_hours.enabled,
          }
        : undefined,
      handoff: defaultMessages.handoff
        ? { body: defaultMessages.handoff.body, enabled: defaultMessages.handoff.enabled }
        : undefined,
    };

    try {
      const res = await workspaceFetch<UnifiedTenantBotConfigDto>("/api/tenant/bot", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          status,
          objective: objective.trim(),
          presetId,
          toneId,
          persona: persona.trim() || null,
          instructions: instructions.trim() || null,
          allowedTopics: allowedTopics.trim() || null,
          excludedTopics: excludedTopics.trim() || null,
          handoffTriggers: parsedTriggers,
          responseLanguage,
          answerPolicy,
          maxTurns,
          maxMessagesPerContact,
          classifierPrompt: classifierPrompt.trim() || null,
          defaultMessages: normalizedDefaultMsgs,
          businessHours,
          remindersEnabled,
          returnsPolicy: returnsPolicy.trim() || null,
          warrantyPolicy: warrantyPolicy.trim() || null,
          shippingPolicy: {
            freeShipping: Boolean(shippingPolicy.freeShipping),
            defaultCostCents: shippingPolicy.freeShipping
              ? 0
              : Math.max(0, shippingPolicy.defaultCostCents ?? 0),
            policyText: shippingPolicy.policyText?.trim() || "",
            deliveryRules: normalizedRules,
          },
          orderMessage: defaultMessages.order_confirmation?.body?.trim() || null,
          faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
          labels: labels.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            color: l.color,
            category: l.category,
            activationRule: l.activationRule,
            sideEffects: l.sideEffects,
          })),
        }),
      });

      if (!res.ok) {
        setError(res.error || dict.botSaveError);
        return;
      }

      if (res.data?.labels) {
        setLabels(res.data.labels);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(dict.botConnError);
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ id: BotTabKey; label: string }> = [
    { id: "identity", label: dict.botTabIdentity },
    { id: "policies", label: dict.botTabPolicies },
    { id: "messages", label: dict.botTabMessages },
    { id: "classifier", label: dict.botTabClassifier },
  ];

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dsn-accent)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--dsn-accent)]">
            <Bot className="h-3.5 w-3.5" />
            <span>{dict.botBadge}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)] md:text-2xl">
            {dict.botTitle}
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] md:text-sm">
            {dict.botSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href="/workspace/ai"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
          >
            <KeyRound className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>{dict.botProvidersCta}</span>
          </Link>

          {!readOnly && (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? dict.botSavingCta : dict.botSaveCta}</span>
            </button>
          )}
        </div>
      </header>

      {readOnly && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-medium">{dict.botReadOnlyNotice}</p>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{dict.botSaveSuccess}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pestañas Mobile First */}
      <nav
        aria-label={dict.botTitle}
        className="flex gap-2 overflow-x-auto border-b border-[var(--dsn-border)] pb-2"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--dsn-accent)] text-white"
                  : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <form onSubmit={handleSave}>
        {activeTab === "identity" && (
          <BotIdentityTab
            dict={dict}
            locale={locale}
            readOnly={readOnly}
            name={name}
            onNameChange={setName}
            status={status}
            onStatusChange={setStatus}
            objective={objective}
            onObjectiveChange={setObjective}
            presetId={presetId}
            onPresetChange={setPresetId}
            toneId={toneId}
            onToneChange={setToneId}
            persona={persona}
            onPersonaChange={setPersona}
            responseLanguage={responseLanguage}
            onResponseLanguageChange={setResponseLanguage}
            answerPolicy={answerPolicy}
            onAnswerPolicyChange={setAnswerPolicy}
            maxTurns={maxTurns}
            onMaxTurnsChange={setMaxTurns}
            maxMessagesPerContact={maxMessagesPerContact}
            onMaxMessagesPerContactChange={setMaxMessagesPerContact}
            allowedTopics={allowedTopics}
            onAllowedTopicsChange={setAllowedTopics}
            excludedTopics={excludedTopics}
            onExcludedTopicsChange={setExcludedTopics}
            handoffTriggersText={handoffTriggersText}
            onHandoffTriggersTextChange={setHandoffTriggersText}
            remindersEnabled={remindersEnabled}
            onRemindersEnabledChange={setRemindersEnabled}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            onInsertIdealTemplate={handleInsertIdealTemplate}
            catalog={catalog}
            promptContext={promptContext}
          />
        )}

        {activeTab === "policies" && (
          <BotPoliciesTab
            dict={dict}
            locale={locale}
            readOnly={readOnly}
            currency={currency}
            warrantyPolicy={warrantyPolicy}
            onWarrantyPolicyChange={setWarrantyPolicy}
            returnsPolicy={returnsPolicy}
            onReturnsPolicyChange={setReturnsPolicy}
            shippingPolicy={shippingPolicy}
            onShippingPolicyChange={setShippingPolicy}
            faqs={faqs}
            onFaqsChange={setFaqs}
            promptContext={promptContext}
          />
        )}

        {activeTab === "messages" && (
          <BotMessagesTab
            dict={dict}
            locale={locale}
            readOnly={readOnly}
            countryCode={countryCode}
            defaultMessages={defaultMessages}
            onDefaultMessagesChange={setDefaultMessages}
            businessHours={businessHours}
            onBusinessHoursChange={setBusinessHours}
            onResetDefaults={handleResetMessagesAndHours}
            promptContext={promptContext}
          />
        )}

        {activeTab === "classifier" && (
          <BotClassifierTab
            locale={locale}
            readOnly={readOnly}
            labels={labels}
            onLabelsChange={setLabels}
            classifierPrompt={classifierPrompt}
            onClassifierPromptChange={setClassifierPrompt}
            promptContext={promptContext}
          />
        )}
      </form>
    </div>
  );
}
