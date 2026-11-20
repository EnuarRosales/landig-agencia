"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import type {
  ProductListItemDto,
  PromotionDetailDto,
  PromotionDiscountType,
  PromotionListItemDto,
  PromotionScopeType,
} from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
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
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0"
        closeAriaLabel={dict.promotionsCancel}
        aria-labelledby="promotion-form-modal-title"
        disableEscapeKeyDown={submitting}
        disableInteractOutside={submitting}
      >
        <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
            <Tag className="h-4 w-4" />
          </span>
          <DialogTitle
            id="promotion-form-modal-title"
            className="text-base font-bold text-[var(--dsn-text)] md:text-lg"
          >
            {mode === "create" ? dict.promotionsModalCreateTitle : dict.promotionsModalEditTitle}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {errorMessage && (
              <Alert role="alert" variant="error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="promo-name" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldName} *
                </Label>
                <Input
                  id="promo-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={dict.promotionsFieldNamePlaceholder}
                  className="min-h-[42px]"
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
                <Label htmlFor="promo-scope" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldScope} *
                </Label>
                <Select
                  id="promo-scope"
                  value={scopeType}
                  onChange={(e) => handleScopeChange(e.target.value as PromotionScopeType)}
                  className="min-h-[42px]"
                >
                  <option value="all_catalog">{dict.promotionsScopeAllCatalog}</option>
                  <option value="category">{dict.promotionsScopeCategory}</option>
                  <option value="product">{dict.promotionsScopeProduct}</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="promo-discount-type" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldDiscountType} *
                </Label>
                <Select
                  id="promo-discount-type"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)}
                  className="min-h-[42px]"
                >
                  <option value="percentage">{dict.promotionsDiscountPercentage}</option>
                  <option value="fixed_amount">{dict.promotionsDiscountFixedAmount}</option>
                  {scopeType === "product" && (
                    <option value="fixed_price">{dict.promotionsDiscountFixedPrice}</option>
                  )}
                </Select>
                {scopeType !== "product" && (
                  <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsFieldFixedPriceScopeNote}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="promo-discount-value" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldDiscountValue}{" "}
                  {discountType === "percentage" ? "(%)" : `(${currency})`} *
                </Label>
                <Input
                  id="promo-discount-value"
                  type="number"
                  required
                  min={1}
                  max={discountType === "percentage" ? 95 : undefined}
                  step={discountType === "percentage" ? 1 : "any"}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="min-h-[42px]"
                />
                {discountType === "percentage" && (
                  <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                    {dict.promotionsFieldPercentageHint}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="promo-max-units" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldMaxUnits}
                </Label>
                <Input
                  id="promo-max-units"
                  type="number"
                  min={1}
                  step={1}
                  value={maxUnitsInput}
                  onChange={(e) => setMaxUnitsInput(e.target.value)}
                  placeholder="Ej. 25"
                  className="min-h-[42px]"
                />
                <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                  {dict.promotionsFieldMaxUnitsHint}
                </p>
              </div>

              <div>
                <Label htmlFor="promo-starts-at" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldStartsAt} *
                </Label>
                <Input
                  id="promo-starts-at"
                  type="datetime-local"
                  required
                  value={startsAtLocal}
                  onChange={(e) => setStartsAtLocal(e.target.value)}
                  className="min-h-[42px]"
                />
              </div>

              <div>
                <Label htmlFor="promo-ends-at" className="mb-1.5 block text-xs font-semibold">
                  {dict.promotionsFieldEndsAt}
                </Label>
                <Input
                  id="promo-ends-at"
                  type="datetime-local"
                  value={endsAtLocal}
                  onChange={(e) => setEndsAtLocal(e.target.value)}
                  className="min-h-[42px]"
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
                        <Button
                          key={cat}
                          type="button"
                          variant={active ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => toggleCategory(cat)}
                          className={`min-h-[34px] rounded-full px-3 py-1 text-xs font-medium ${
                            active
                              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]"
                              : ""
                          }`}
                        >
                          <span>{cat}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
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
                    className="min-h-[38px] flex-1 px-3 py-1.5 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomCategory}
                    className="min-h-[38px]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <span>{dict.promotionsFieldAddCategory}</span>
                  </Button>
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
                    <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
                    <Input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={dict.promotionsFieldProductsSearch}
                      className="h-8 py-1.5 pr-3 pl-8 text-xs"
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
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleProduct(prod.id)}
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
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
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
                  <Badge variant="success">
                    {liveSimulation.healthyMarginProductsCount} {dict.promotionsMarginHealthy}
                  </Badge>
                  <Badge variant="warning">
                    {liveSimulation.tightMarginProductsCount} {dict.promotionsMarginTight}
                  </Badge>
                  <Badge variant="destructive">
                    {liveSimulation.lossProductsCount} {dict.promotionsMarginLoss}
                  </Badge>
                </div>
              </div>

              {liveSimulation.excludedProductsCount > 0 && (
                <Alert variant="warning" className="p-2.5 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <AlertDescription>
                    <strong>{liveSimulation.excludedProductsCount}</strong>{" "}
                    {dict.promotionsPreviewExcludedWarning}
                  </AlertDescription>
                </Alert>
              )}

              {liveSimulation.lossProductsCount > 0 && (
                <Alert variant="error" className="p-2.5 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <AlertDescription>
                    <strong>{liveSimulation.lossProductsCount}</strong>{" "}
                    {dict.promotionsPreviewLossWarning}
                  </AlertDescription>
                </Alert>
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
                              <Badge
                                variant={
                                  row.marginLevel === "loss"
                                    ? "destructive"
                                    : row.marginLevel === "tight"
                                      ? "warning"
                                      : "success"
                                }
                              >
                                {row.marginPct.toFixed(1)}%
                              </Badge>
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

          <DialogFooter className="border-t border-[var(--dsn-border)] px-5 py-3.5">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {dict.promotionsCancel}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              loading={submitting}
              loadingText={dict.promotionsSaving}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{dict.promotionsSave}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
