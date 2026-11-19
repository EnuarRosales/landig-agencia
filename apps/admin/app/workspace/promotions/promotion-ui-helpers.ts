import type {
  ProductListItemDto,
  PromotionDiscountType,
  PromotionImpactSummaryDto,
  PromotionLifecycleStatus,
  PromotionMarginLevel,
  PromotionScopeType,
  PromotionSimulationProductDto,
} from "@mocter/domain";
import { calculateProductProfitability } from "@/lib/pricing-margin";
import type { AdminLocale } from "@/lib/i18n";

/**
 * Formatea un monto en centavos en representación legible de moneda del comercio.
 */
export function formatPromotionMoneyCents(
  cents: number | null | undefined,
  currency = "COP",
  locale: AdminLocale = "es",
): string {
  const safe = Number(cents ?? 0) / 100;
  const intlLocale = locale === "en" ? "en-US" : "es-CO";
  return `$${safe.toLocaleString(intlLocale, {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Formatea una fecha ISO en formato corto legible según el idioma activo.
 */
export function formatPromotionDateTime(
  iso: string | null | undefined,
  locale: AdminLocale = "es",
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Convierte una fecha ISO a formato `YYYY-MM-DDTHH:mm` en hora local para inputs `datetime-local`.
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convierte el valor de un input `datetime-local` a cadena ISO 8601 UTC.
 */
export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Formatea la etiqueta compacta de beneficio (ej. `-15%`, `-$10.000 COP`, `Precio $80.000 COP`).
 */
export function formatDiscountSummary(
  discountType: PromotionDiscountType,
  discountValue: number,
  currency = "COP",
  locale: AdminLocale = "es",
): string {
  if (discountType === "percentage") {
    return `-${discountValue}%`;
  }
  const formatted = formatPromotionMoneyCents(discountValue, currency, locale);
  if (discountType === "fixed_amount") {
    return `-${formatted}`;
  }
  return locale === "en" ? `Fixed ${formatted}` : `Fijo ${formatted}`;
}

function normalizeCategory(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function classifyMargin(marginPct: number): PromotionMarginLevel {
  if (marginPct < 0) return "loss";
  if (marginPct < 20) return "tight";
  return "healthy";
}

/**
 * Espejo cliente puro de `simulatePromotionImpact` para previsualización en tiempo real dentro del modal.
 */
export function simulatePromotionImpactClient(params: {
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  productIds: string[];
  categories: string[];
  products: readonly Pick<
    ProductListItemDto,
    "id" | "name" | "sku" | "category" | "priceCents" | "costPriceCents" | "status"
  >[];
}): PromotionImpactSummaryDto {
  const productIdSet = new Set(params.productIds);
  const categorySet = new Set(params.categories.map(normalizeCategory).filter(Boolean));

  const matched = params.products.filter((p) => {
    if (p.status !== "active") return false;
    if (params.scopeType === "all_catalog") return true;
    if (params.scopeType === "product") return productIdSet.has(p.id);
    const normCat = normalizeCategory(p.category);
    return normCat.length > 0 && categorySet.has(normCat);
  });

  const rows: PromotionSimulationProductDto[] = [];
  let applicableProductsCount = 0;
  let excludedProductsCount = 0;
  let lossProductsCount = 0;
  let tightMarginProductsCount = 0;
  let healthyMarginProductsCount = 0;
  let minMarginPct: number | null = null;

  for (const product of matched) {
    let effectivePriceCents: number | null = null;
    let excludedReason: PromotionSimulationProductDto["excludedReason"] = null;

    if (!Number.isFinite(params.discountValue) || params.discountValue <= 0) {
      excludedReason = "NO_SAVINGS";
    } else if (params.discountType === "percentage") {
      if (params.discountValue >= 1 && params.discountValue <= 95) {
        const cand = Math.max(
          1,
          Math.round((product.priceCents * (100 - params.discountValue)) / 100),
        );
        if (cand < product.priceCents) {
          effectivePriceCents = cand;
        } else {
          excludedReason = "NO_SAVINGS";
        }
      } else {
        excludedReason = "NO_SAVINGS";
      }
    } else if (params.discountType === "fixed_amount") {
      if (product.priceCents <= params.discountValue) {
        excludedReason = "PRICE_NOT_GREATER_THAN_DISCOUNT";
      } else {
        effectivePriceCents = Math.round(product.priceCents - params.discountValue);
      }
    } else {
      const fixed = Math.round(params.discountValue);
      if (fixed <= 0 || fixed >= product.priceCents) {
        excludedReason = "FIXED_PRICE_NOT_LOWER";
      } else {
        effectivePriceCents = fixed;
      }
    }

    if (effectivePriceCents === null) {
      excludedProductsCount += 1;
      rows.push({
        productId: product.id,
        name: product.name,
        sku: product.sku ?? null,
        category: product.category ?? null,
        originalPriceCents: product.priceCents,
        costPriceCents: product.costPriceCents,
        effectivePriceCents: null,
        savingsCents: 0,
        savingsPct: 0,
        profitCents: null,
        marginPct: null,
        marginLevel: null,
        excludedReason,
      });
      continue;
    }

    applicableProductsCount += 1;
    const savingsCents = product.priceCents - effectivePriceCents;
    const savingsPct = Math.round((savingsCents / product.priceCents) * 10000) / 100;
    const prof = calculateProductProfitability(product.costPriceCents, effectivePriceCents);
    const marginLevel = classifyMargin(prof.marginPct);

    if (marginLevel === "loss") lossProductsCount += 1;
    else if (marginLevel === "tight") tightMarginProductsCount += 1;
    else healthyMarginProductsCount += 1;

    if (minMarginPct === null || prof.marginPct < minMarginPct) {
      minMarginPct = prof.marginPct;
    }

    rows.push({
      productId: product.id,
      name: product.name,
      sku: product.sku ?? null,
      category: product.category ?? null,
      originalPriceCents: product.priceCents,
      costPriceCents: product.costPriceCents,
      effectivePriceCents,
      savingsCents,
      savingsPct,
      profitCents: prof.profitCents,
      marginPct: prof.marginPct,
      marginLevel,
      excludedReason: null,
    });
  }

  return {
    matchedProductsCount: matched.length,
    applicableProductsCount,
    excludedProductsCount,
    lossProductsCount,
    tightMarginProductsCount,
    healthyMarginProductsCount,
    minMarginPct,
    products: rows,
  };
}

/**
 * Clases de badge semántico para cada estado derivado de campaña.
 */
export function getPromotionStatusBadgeClass(status: PromotionLifecycleStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30";
    case "scheduled":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30";
    case "paused":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30";
    case "depleted":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30";
    case "expired":
    default:
      return "bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30";
  }
}
