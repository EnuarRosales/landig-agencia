"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import type {
  ProductListItemDto,
  PromotionDetailDto,
  PromotionDiscountType,
  PromotionListItemDto,
  PromotionScopeType,
} from "@mocter/domain";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import {
  formatPromotionMoneyCents,
  fromDatetimeLocalValue,
  simulatePromotionImpactClient,
  toDatetimeLocalValue,
} from "./promotion-ui-helpers";

export interface PromotionFormModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  initialPromotion: PromotionListItemDto | null;
  catalogProducts: ProductListItemDto[];
  currency: string;
  locale?: AdminLocale;
  hasInferenceAccess?: boolean;
  onClose: () => void;
  onSaved: (detail: PromotionDetailDto, meta: { isCreate: boolean }) => void;
}

/**
 * Modal de creación y edición de promociones automáticas con asistencia AI y semáforo de margen en vivo.
 */
export function PromotionFormModal(props: PromotionFormModalProps) {
  if (!props.isOpen) return null;
  const resetKey = `${props.mode}:${props.initialPromotion?.id ?? "new"}`;
  return <PromotionFormModalContent key={resetKey} {...props} />;
}

function PromotionFormModalContent({
  mode,
  initialPromotion,
  catalogProducts,
  currency,
  locale = "es",
  hasInferenceAccess = true,
  onClose,
  onSaved,
}: PromotionFormModalProps) {
  const dict = getAdminDictionary(locale).workspace;
  const editTarget = mode === "edit" ? initialPromotion : null;

  const [name, setName] = useState(editTarget?.name ?? "");
  const [description, setDescription] = useState(editTarget?.description ?? "");
  const [scopeType, setScopeType] = useState<PromotionScopeType>(
    editTarget?.scopeType ?? "all_catalog",
  );
  const [discountType, setDiscountType] = useState<PromotionDiscountType>(
    editTarget?.discountType ?? "percentage",
  );
  const [discountInput, setDiscountInput] = useState(() => {
    if (!editTarget) return "15";
    return editTarget.discountType === "percentage"
      ? String(editTarget.discountValue)
      : String(Math.round(editTarget.discountValue / 100));
  });
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    editTarget?.startsAt
      ? toDatetimeLocalValue(editTarget.startsAt)
      : toDatetimeLocalValue(new Date().toISOString()),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(() =>
    editTarget?.endsAt ? toDatetimeLocalValue(editTarget.endsAt) : "",
  );
  const [maxUnitsInput, setMaxUnitsInput] = useState(() =>
    editTarget?.maxDiscountedUnits ? String(editTarget.maxDiscountedUnits) : "",
  );
  const [isActive, setIsActive] = useState(editTarget?.isActive ?? true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    editTarget?.productIds ?? [],
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    editTarget?.categories ?? [],
  );
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeProducts = useMemo(
    () => catalogProducts.filter((p) => p.status === "active"),
    [catalogProducts],
  );

  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of activeProducts) {
      const clean = p.category?.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    }
    for (const c of selectedCategories) {
      const clean = c.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [activeProducts, selectedCategories]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return activeProducts;
    return activeProducts.filter((p) =>
      [p.name, p.sku ?? "", p.category ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [activeProducts, productSearch]);

  const numericDiscountValue = useMemo(() => {
    const raw = Number(discountInput);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return discountType === "percentage" ? Math.round(raw) : Math.round(raw * 100);
  }, [discountInput, discountType]);

  const liveSimulation = useMemo(
    () =>
      simulatePromotionImpactClient({
        scopeType,
        discountType,
        discountValue: numericDiscountValue,
        productIds: selectedProductIds,
        categories: selectedCategories,
        products: activeProducts,
      }),
    [
      scopeType,
      discountType,
      numericDiscountValue,
      selectedProductIds,
      selectedCategories,
      activeProducts,
    ],
  );

  function handleScopeChange(nextScope: PromotionScopeType) {
    setScopeType(nextScope);
    if (nextScope !== "product" && discountType === "fixed_price") {
      setDiscountType("percentage");
      setDiscountInput("15");
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  }

  function toggleCategory(categoryName: string) {
    const key = categoryName.trim().toLowerCase();
    setSelectedCategories((prev) => {
      const exists = prev.some((c) => c.trim().toLowerCase() === key);
      if (exists) return prev.filter((c) => c.trim().toLowerCase() !== key);
      return [...prev, categoryName.trim()];
    });
  }

  function handleAddCustomCategory() {
    const clean = customCategoryInput.trim().replace(/\s+/g, " ");
    if (!clean) return;
    const key = clean.toLowerCase();
    setSelectedCategories((prev) =>
      prev.some((c) => c.trim().toLowerCase() === key) ? prev : [...prev, clean],
    );
    setCustomCategoryInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const startsAtIso = fromDatetimeLocalValue(startsAtLocal);
    if (!startsAtIso) {
      setErrorMessage(
        locale === "en"
          ? "Start date and time are required."
          : "La fecha y hora de inicio son obligatorias.",
      );
      return;
    }

    const endsAtIso = endsAtLocal.trim() ? fromDatetimeLocalValue(endsAtLocal) : null;
    if (endsAtLocal.trim() && !endsAtIso) {
      setErrorMessage(
        locale === "en"
          ? "End date and time are not valid."
          : "La fecha y hora de finalización no son válidas.",
      );
      return;
    }

    const maxDiscountedUnits = maxUnitsInput.trim()
      ? Math.round(Number(maxUnitsInput))
      : null;

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      scopeType,
      discountType,
      discountValue: numericDiscountValue,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      maxDiscountedUnits,
      isActive,
      productIds: scopeType === "product" ? selectedProductIds : [],
      categories: scopeType === "category" ? selectedCategories : [],
    };

    setSubmitting(true);
    try {
      const url =
        mode === "create"
          ? "/api/tenant/promotions"
          : `/api/tenant/promotions/${encodeURIComponent(editTarget!.id)}`;
      const res = await workspaceFetch<PromotionDetailDto>(url, {
        method: mode === "create" ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.data) {
        setErrorMessage(
          res.error ||
            (locale === "en"
              ? "Unable to save the promotion."
              : "No fue posible guardar la promoción."),
        );
        return;
      }

      onSaved(res.data, { isCreate: mode === "create" });
    } catch {
      setErrorMessage(
        locale === "en"
          ? "Network error while saving the promotion."
          : "Error de conexión al guardar la promoción.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-form-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--dsn-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
              <Tag className="h-4 w-4" />
            </span>
            <h2
              id="promotion-form-modal-title"
              className="text-base md:text-lg font-bold text-[var(--dsn-text)]"
            >
              {mode === "create" ? dict.promotionsModalCreateTitle : dict.promotionsModalEditTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.promotionsCancel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dsn-border)] text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-accent)] hover:text-[var(--dsn-text)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  htmlFor="promo-name"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldName} *
                </label>
                <input
                  id="promo-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={dict.promotionsFieldNamePlaceholder}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3.5 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <AiEnhanceTextarea
                  id="promo-description"
                  fieldKey="promotion.description"
                  label={dict.promotionsFieldDescription}
                  value={description}
                  onChange={setDescription}
                  placeholder={dict.promotionsFieldDescriptionPlaceholder}
                  rows={3}
                  hasInferenceAccess={hasInferenceAccess}
                  locale={locale}
                  context={{
                    promotionName: name,
                    scopeType,
                    discountType,
                    discountValue: discountInput,
                    currency,
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="promo-scope"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldScope} *
                </label>
                <select
                  id="promo-scope"
                  value={scopeType}
                  onChange={(e) => handleScopeChange(e.target.value as PromotionScopeType)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                >
                  <option value="all_catalog">{dict.promotionsScopeAllCatalog}</option>
                  <option value="category">{dict.promotionsScopeCategory}</option>
                  <option value="product">{dict.promotionsScopeProduct}</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="promo-discount-type"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldDiscountType} *
                </label>
                <select
                  id="promo-discount-type"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                >
                  <option value="percentage">{dict.promotionsDiscountPercentage}</option>
                  <option value="fixed_amount">{dict.promotionsDiscountFixedAmount}</option>
                  {scopeType === "product" && (
                    <option value="fixed_price">{dict.promotionsDiscountFixedPrice}</option>
                  )}
                </select>
                {scopeType !== "product" && (
                  <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsFieldFixedPriceScopeNote}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="promo-discount-value"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldDiscountValue}{" "}
                  {discountType === "percentage" ? "(%)" : `(${currency})`} *
                </label>
                <input
                  id="promo-discount-value"
                  type="number"
                  required
                  min={1}
                  max={discountType === "percentage" ? 95 : undefined}
                  step={discountType === "percentage" ? 1 : "any"}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3.5 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
                {discountType === "percentage" && (
                  <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsFieldPercentageHint}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="promo-max-units"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldMaxUnits}
                </label>
                <input
                  id="promo-max-units"
                  type="number"
                  min={1}
                  step={1}
                  value={maxUnitsInput}
                  onChange={(e) => setMaxUnitsInput(e.target.value)}
                  placeholder="Ej. 25"
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3.5 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                  {dict.promotionsFieldMaxUnitsHint}
                </p>
              </div>

              <div>
                <label
                  htmlFor="promo-starts-at"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldStartsAt} *
                </label>
                <input
                  id="promo-starts-at"
                  type="datetime-local"
                  required
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="promo-ends-at"
                  className="mb-1.5 block text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {dict.promotionsFieldEndsAt}
                </label>
                <input
                  id="promo-ends-at"
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                  {dict.promotionsFieldEndsAtHint}
                </p>
              </div>
            </div>

            {scopeType === "category" && (
              <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4">
                <div>
                  <div className="text-xs font-semibold text-[var(--dsn-text)]">
                    {dict.promotionsFieldCategories} *
                  </div>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsFieldCategoriesHint}
                  </p>
                </div>

                {availableCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((cat) => {
                      const active = selectedCategories.some(
                        (c) => c.trim().toLowerCase() === cat.toLowerCase(),
                      );
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
                              : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-accent)]"
                          }`}
                        >
                          <span>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomCategory();
                      }
                    }}
                    placeholder={dict.promotionsFieldCustomCategoryPlaceholder}
                    className="flex-1 min-h-[38px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomCategory}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <span>{dict.promotionsFieldAddCategory}</span>
                  </button>
                </div>
              </div>
            )}

            {scopeType === "product" && (
              <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs font-semibold text-[var(--dsn-text)]">
                    {dict.promotionsFieldProducts} * ({selectedProductIds.length})
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={dict.promotionsFieldProductsSearch}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {filteredProducts.map((prod) => {
                    const checked = selectedProductIds.includes(prod.id);
                    return (
                      <label
                        key={prod.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors ${
                          checked
                            ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10"
                            : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] hover:border-[var(--dsn-accent)]/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduct(prod.id)}
                            className="h-4 w-4 accent-[var(--dsn-accent)]"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--dsn-text)]">
                              {prod.name}
                            </div>
                            <div className="truncate text-[11px] text-[var(--dsn-text-secondary)]">
                              {[prod.category, prod.sku].filter(Boolean).join(" · ") ||
                                formatPromotionMoneyCents(prod.priceCents, prod.currency, locale)}
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono font-semibold text-[var(--dsn-text)]">
                          {formatPromotionMoneyCents(prod.priceCents, prod.currency, locale)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[var(--dsn-text)]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--dsn-accent)]"
              />
              <span>{dict.promotionsFieldIsActive}</span>
            </label>

            {/* Semáforo de Rentabilidad en Vivo */}
            <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-[var(--dsn-text)]">
                    {dict.promotionsPreviewTitle}
                  </h3>
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsPreviewSubtitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                    {liveSimulation.healthyMarginProductsCount} {dict.promotionsMarginHealthy}
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
                    {liveSimulation.tightMarginProductsCount} {dict.promotionsMarginTight}
                  </span>
                  <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-rose-700 dark:text-rose-300">
                    {liveSimulation.lossProductsCount} {dict.promotionsMarginLoss}
                  </span>
                </div>
              </div>

              {liveSimulation.excludedProductsCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{liveSimulation.excludedProductsCount}</strong>{" "}
                    {dict.promotionsPreviewExcludedWarning}
                  </span>
                </div>
              )}

              {liveSimulation.lossProductsCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{liveSimulation.lossProductsCount}</strong>{" "}
                    {dict.promotionsPreviewLossWarning}
                  </span>
                </div>
              )}

              {liveSimulation.products.length === 0 ? (
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {dict.promotionsPreviewNoMatches}
                </p>
              ) : (
                <div className="max-h-48 overflow-x-auto overflow-y-auto rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-background)] text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                      <tr>
                        <th className="px-3 py-2">{dict.promotionsPreviewColProduct}</th>
                        <th className="px-3 py-2 text-right">{dict.promotionsPreviewColRegular}</th>
                        <th className="px-3 py-2 text-right">{dict.promotionsPreviewColPromo}</th>
                        <th className="px-3 py-2 text-right">{dict.promotionsPreviewColMargin}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)]">
                      {liveSimulation.products.slice(0, 12).map((row) => (
                        <tr key={row.productId}>
                          <td className="px-3 py-2 font-medium text-[var(--dsn-text)]">
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[var(--dsn-text-secondary)]">
                            {formatPromotionMoneyCents(row.originalPriceCents, currency, locale)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-[var(--dsn-text)]">
                            {row.effectivePriceCents !== null ? (
                              formatPromotionMoneyCents(row.effectivePriceCents, currency, locale)
                            ) : (
                              <span className="text-amber-600 dark:text-amber-300">
                                {dict.promotionsPreviewExcludedBadge}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.marginPct !== null ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                                  row.marginLevel === "loss"
                                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                    : row.marginLevel === "tight"
                                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                }`}
                              >
                                {row.marginPct.toFixed(1)}%
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--dsn-border)] px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
            >
              {dict.promotionsCancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitting ? dict.promotionsSaving : dict.promotionsSave}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
