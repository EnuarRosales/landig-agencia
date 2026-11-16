"use client";

import React, { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { ConfirmationModal } from "@/components/confirmation-modal";
import type { getAdminDictionary } from "@/lib/i18n";
import type { ShippingPolicyUi } from "./bot-ui-helpers";

export interface BotPoliciesTabProps {
  dict: ReturnType<typeof getAdminDictionary>["workspace"];
  locale: "es" | "en";
  readOnly: boolean;
  currency: string;
  warrantyPolicy: string;
  onWarrantyPolicyChange: (v: string) => void;
  returnsPolicy: string;
  onReturnsPolicyChange: (v: string) => void;
  shippingPolicy: ShippingPolicyUi;
  onShippingPolicyChange: (next: ShippingPolicyUi) => void;
  faqs: Array<{ question: string; answer: string }>;
  onFaqsChange: (next: Array<{ question: string; answer: string }>) => void;
  promptContext: Record<string, unknown>;
}

/**
 * Pestaña de Políticas Comerciales, Cobertura de Envíos Estructurada y Preguntas Frecuentes.
 */
export function BotPoliciesTab({
  dict,
  locale,
  readOnly,
  currency,
  warrantyPolicy,
  onWarrantyPolicyChange,
  returnsPolicy,
  onReturnsPolicyChange,
  shippingPolicy,
  onShippingPolicyChange,
  faqs,
  onFaqsChange,
  promptContext,
}: BotPoliciesTabProps) {
  const [faqDeleteIdx, setFaqDeleteIdx] = useState<number | null>(null);

  const deliveryRules = shippingPolicy.deliveryRules ?? [];
  const costUnits =
    typeof shippingPolicy.defaultCostCents === "number"
      ? String(Math.round(shippingPolicy.defaultCostCents / 100))
      : "0";

  function handleAddRule() {
    onShippingPolicyChange({
      ...shippingPolicy,
      deliveryRules: [...deliveryRules, { regionCode: null, city: null, days: "" }],
    });
  }

  function handleUpdateRule(
    index: number,
    patch: Partial<{ regionCode: string | null; city: string | null; days: string }>,
  ) {
    onShippingPolicyChange({
      ...shippingPolicy,
      deliveryRules: deliveryRules.map((item, idx) =>
        idx === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function handleRemoveRule(index: number) {
    onShippingPolicyChange({
      ...shippingPolicy,
      deliveryRules: deliveryRules.filter((_, idx) => idx !== index),
    });
  }

  function handleAddFaq() {
    onFaqsChange([...faqs, { question: "", answer: "" }]);
  }

  function handleUpdateFaq(index: number, field: "question" | "answer", value: string) {
    onFaqsChange(faqs.map((faq, idx) => (idx === index ? { ...faq, [field]: value } : faq)));
  }

  function handleConfirmRemoveFaq() {
    if (faqDeleteIdx === null) return;
    onFaqsChange(faqs.filter((_, idx) => idx !== faqDeleteIdx));
    setFaqDeleteIdx(null);
  }

  return (
    <div className="space-y-6">
      {/* Cobertura y Políticas de Envío */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
          <Truck className="h-4 w-4 text-[var(--dsn-accent)]" />
          <h2 className="text-sm font-bold text-[var(--dsn-text)]">
            {dict.botShippingSectionTitle}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 px-4 py-3">
            <span className="text-xs font-semibold text-[var(--dsn-text)]">
              {dict.botShippingFreeLabel}
            </span>
            <input
              type="checkbox"
              disabled={readOnly}
              checked={Boolean(shippingPolicy.freeShipping)}
              onChange={(e) =>
                onShippingPolicyChange({
                  ...shippingPolicy,
                  freeShipping: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[var(--dsn-accent)]"
            />
          </label>

          <div>
            <label
              htmlFor="bot-shipping-cost"
              className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
            >
              {dict.botShippingCostLabel} ({currency})
            </label>
            <input
              id="bot-shipping-cost"
              type="number"
              min={0}
              disabled={readOnly || Boolean(shippingPolicy.freeShipping)}
              value={costUnits}
              onChange={(e) => {
                const numeric = Math.max(0, Number(e.target.value) || 0);
                onShippingPolicyChange({
                  ...shippingPolicy,
                  defaultCostCents: Math.round(numeric * 100),
                });
              }}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <AiEnhanceTextarea
          id="bot-shipping-policy"
          fieldKey="policy.shipping"
          label={dict.botShippingPolicyLabel}
          rows={3}
          disabled={readOnly}
          locale={locale}
          value={shippingPolicy.policyText || ""}
          onChange={(policyText) =>
            onShippingPolicyChange({
              ...shippingPolicy,
              policyText,
            })
          }
          context={promptContext}
        />

        {/* Reglas de entrega por región / ciudad */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[var(--dsn-text)]">
              {dict.botShippingRulesTitle}
            </h3>
            {!readOnly && (
              <button
                type="button"
                onClick={handleAddRule}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>{dict.botShippingRulesAddCta}</span>
              </button>
            )}
          </div>

          {deliveryRules.length > 0 && (
            <div className="space-y-2">
              {deliveryRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/15 p-3 sm:grid-cols-12"
                >
                  <input
                    type="text"
                    disabled={readOnly}
                    value={rule.regionCode || ""}
                    onChange={(e) =>
                      handleUpdateRule(idx, {
                        regionCode: e.target.value.trim() || null,
                      })
                    }
                    placeholder={dict.botShippingRuleRegionPlaceholder}
                    className="sm:col-span-3 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                  />
                  <input
                    type="text"
                    disabled={readOnly}
                    value={rule.city || ""}
                    onChange={(e) =>
                      handleUpdateRule(idx, { city: e.target.value.trim() || null })
                    }
                    placeholder={dict.botShippingRuleCityPlaceholder}
                    className="sm:col-span-4 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                  />
                  <input
                    type="text"
                    disabled={readOnly}
                    value={rule.days}
                    onChange={(e) => handleUpdateRule(idx, { days: e.target.value })}
                    placeholder={dict.botShippingRuleDaysPlaceholder}
                    className="sm:col-span-4 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
                  />
                  {!readOnly && (
                    <div className="flex items-center justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="rounded p-1.5 text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Garantías y Devoluciones */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs space-y-4">
        <AiEnhanceTextarea
          id="bot-warranty-policy"
          fieldKey="policy.warranty"
          label={dict.botWarrantyLabel}
          rows={3}
          disabled={readOnly}
          locale={locale}
          value={warrantyPolicy}
          onChange={onWarrantyPolicyChange}
          context={promptContext}
        />

        <AiEnhanceTextarea
          id="bot-returns-policy"
          fieldKey="policy.returns"
          label={dict.botReturnsLabel}
          rows={3}
          disabled={readOnly}
          locale={locale}
          value={returnsPolicy}
          onChange={onReturnsPolicyChange}
          context={promptContext}
        />
      </section>

      {/* Preguntas Frecuentes */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dsn-border)] pb-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">{dict.botFaqsTitle}</h2>
            <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.botFaqsSubtitle}</p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddFaq}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
            >
              <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{dict.botFaqsAddCta}</span>
            </button>
          )}
        </div>

        {faqs.length === 0 ? (
          <p className="py-4 text-center text-xs italic text-[var(--dsn-text-secondary)]">
            {dict.botFaqsEmpty}
          </p>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="space-y-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    disabled={readOnly}
                    value={faq.question}
                    onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                    className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-60"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setFaqDeleteIdx(index)}
                      className="rounded-md p-1.5 text-rose-400 transition-colors hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  disabled={readOnly}
                  value={faq.answer}
                  onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                  className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-60"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmationModal
        isOpen={faqDeleteIdx !== null}
        onClose={() => setFaqDeleteIdx(null)}
        onConfirm={handleConfirmRemoveFaq}
        variant="danger"
        title={dict.botFaqRemoveTitle}
        details={
          faqDeleteIdx !== null && faqs[faqDeleteIdx]
            ? [{ label: dict.botFaqsTitle, value: faqs[faqDeleteIdx].question || "—" }]
            : []
        }
        warningMessage={dict.botFaqRemoveWarning}
      />
    </div>
  );
}
