import type {
  PromotionDiscountType,
  PromotionLifecycleStatus,
  PromotionScopeType,
  PromotionTargetType,
} from "../db/schemas/tenant/promotions";
import { calculateProductProfitability } from "../utils/pricing-margin";

/**
 * Nivel del semáforo de rentabilidad proyectada tras aplicar una promoción (`SPEC-18 RN-SPEC-18-04`).
 * - `healthy`: margen bruto `>= 20%` (verde).
 * - `tight`: margen bruto `>= 0%` y `< 20%` (ámbar).
 * - `loss`: margen bruto `< 0%` — venta por debajo del costo de adquisición (rojo).
 */
export type PromotionMarginLevel = "healthy" | "tight" | "loss";

/**
 * Motivo por el cual una campaña candidata no aplica sobre un producto puntual (`SPEC-18 D-06`, `RN-SPEC-18-03`).
 */
export type PromotionProductExclusionReason =
  | "PRICE_NOT_GREATER_THAN_DISCOUNT"
  | "FIXED_PRICE_NOT_LOWER"
  | "NO_SAVINGS";

/**
 * Objetivo normalizado de una promoción (`admin.promotion_targets`).
 */
export interface PromotionTargetRef {
  targetType: PromotionTargetType;
  productId: string | null;
  categoryName: string | null;
}

/**
 * Estructura mínima de una campaña con sus objetivos para el motor determinístico de resolución.
 */
export interface PromotionRecordWithTargets {
  id: string;
  name: string;
  description: string | null;
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  startsAt: Date | string;
  endsAt: Date | string | null;
  maxDiscountedUnits: number | null;
  discountedUnitsSold: number;
  isActive: boolean;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  targets: PromotionTargetRef[];
}

/**
 * Datos mínimos de un producto del catálogo para evaluar elegibilidad y margen promocional.
 */
export interface PromotionCandidateProduct {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  priceCents: number;
  costPriceCents?: number;
  status?: string;
}

/**
 * Promoción efectiva aplicada a un producto del catálogo, pedido o prompt del Bot AI (`SPEC-18 §3`).
 */
export interface AppliedProductPromotionDto {
  promotionId: string;
  name: string;
  description: string | null;
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  originalPriceCents: number;
  effectivePriceCents: number;
  savingsCents: number;
  savingsPct: number;
  startsAt: string;
  endsAt: string | null;
  remainingUnits: number | null;
}

/**
 * Resultado de simulación por producto para el semáforo de rentabilidad en vivo (`SPEC-18 RN-SPEC-18-04`, `D-06`).
 */
export interface PromotionSimulationProductDto {
  productId: string;
  name: string;
  sku: string | null;
  category: string | null;
  originalPriceCents: number;
  costPriceCents: number;
  effectivePriceCents: number | null;
  savingsCents: number;
  savingsPct: number;
  profitCents: number | null;
  marginPct: number | null;
  marginLevel: PromotionMarginLevel | null;
  excludedReason: PromotionProductExclusionReason | null;
}

/**
 * Resumen agregado de impacto comercial y rentabilidad proyectada de una campaña (`SPEC-18 §9.1`).
 */
export interface PromotionImpactSummaryDto {
  matchedProductsCount: number;
  applicableProductsCount: number;
  excludedProductsCount: number;
  lossProductsCount: number;
  tightMarginProductsCount: number;
  healthyMarginProductsCount: number;
  minMarginPct: number | null;
  products: PromotionSimulationProductDto[];
}

/**
 * Borrador de configuración de campaña para simular impacto antes de guardar.
 */
export interface PromotionSimulationDraft {
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  productIds?: string[];
  categories?: string[];
}

function toTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Normaliza nombres de categoría para comparación determinística insensible a mayúsculas y espacios extra.
 */
export function normalizePromotionCategory(category: string | null | undefined): string {
  if (!category) return "";
  return category.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Clasifica el margen proyectado en los tres niveles del semáforo de rentabilidad (`RN-SPEC-18-04`).
 */
export function classifyPromotionMarginLevel(marginPct: number): PromotionMarginLevel {
  if (marginPct < 0) return "loss";
  if (marginPct < 20) return "tight";
  return "healthy";
}

/**
 * Evalúa de manera determinística el estado operativo en tiempo real de una promoción (`RN-SPEC-18-01`).
 */
export function derivePromotionLifecycleStatus(
  promo: Pick<
    PromotionRecordWithTargets,
    "isActive" | "startsAt" | "endsAt" | "maxDiscountedUnits" | "discountedUnitsSold"
  >,
  now: Date = new Date(),
): PromotionLifecycleStatus {
  if (!promo.isActive) return "paused";
  if (
    promo.maxDiscountedUnits !== null &&
    promo.maxDiscountedUnits !== undefined &&
    promo.discountedUnitsSold >= promo.maxDiscountedUnits
  ) {
    return "depleted";
  }
  const nowMs = now.getTime();
  const startsMs = toTimestampMs(promo.startsAt);
  if (nowMs < startsMs) return "scheduled";
  if (promo.endsAt !== null && promo.endsAt !== undefined) {
    const endsMs = toTimestampMs(promo.endsAt);
    if (nowMs > endsMs) return "expired";
  }
  return "active";
}

/**
 * Determina si una promoción está viva (no eliminada lógicamente) y vigente para aplicarse en catálogo/Bot/pedidos.
 */
export function isPromotionEligible(
  promo: Pick<
    PromotionRecordWithTargets,
    "isActive" | "deletedAt" | "startsAt" | "endsAt" | "maxDiscountedUnits" | "discountedUnitsSold"
  >,
  now: Date = new Date(),
): boolean {
  if (promo.deletedAt !== null && promo.deletedAt !== undefined) return false;
  return derivePromotionLifecycleStatus(promo, now) === "active";
}

/**
 * Calcula el precio promocional candidato para un producto respetando el piso de seguridad y la exclusión
 * preventiva de `fixed_amount` (`RN-SPEC-18-03`, `RN-SPEC-18-04`, `D-06`).
 */
export function computeCandidatePromotionalPrice(
  originalPriceCents: number,
  discountType: PromotionDiscountType,
  discountValue: number,
): { effectivePriceCents: number | null; excludedReason: PromotionProductExclusionReason | null } {
  if (!Number.isFinite(originalPriceCents) || originalPriceCents <= 0) {
    return { effectivePriceCents: null, excludedReason: "NO_SAVINGS" };
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { effectivePriceCents: null, excludedReason: "NO_SAVINGS" };
  }

  if (discountType === "percentage") {
    if (discountValue < 1 || discountValue > 95) {
      return { effectivePriceCents: null, excludedReason: "NO_SAVINGS" };
    }
    const candidate = Math.max(1, Math.round((originalPriceCents * (100 - discountValue)) / 100));
    if (candidate >= originalPriceCents) {
      return { effectivePriceCents: null, excludedReason: "NO_SAVINGS" };
    }
    return { effectivePriceCents: candidate, excludedReason: null };
  }

  if (discountType === "fixed_amount") {
    // D-06: exclusión preventiva cuando el descuento fijo es mayor o igual al precio regular.
    if (originalPriceCents <= discountValue) {
      return {
        effectivePriceCents: null,
        excludedReason: "PRICE_NOT_GREATER_THAN_DISCOUNT",
      };
    }
    return {
      effectivePriceCents: Math.round(originalPriceCents - discountValue),
      excludedReason: null,
    };
  }

  // fixed_price
  const fixedPrice = Math.round(discountValue);
  if (fixedPrice <= 0 || fixedPrice >= originalPriceCents) {
    return {
      effectivePriceCents: null,
      excludedReason: "FIXED_PRICE_NOT_LOWER",
    };
  }
  return { effectivePriceCents: fixedPrice, excludedReason: null };
}

function getPromotionMatchRank(
  product: Pick<PromotionCandidateProduct, "id" | "category">,
  promo: Pick<PromotionRecordWithTargets, "scopeType" | "targets">,
): 1 | 2 | 3 | null {
  if (promo.scopeType === "product") {
    const matched = promo.targets.some(
      (t) => t.targetType === "product" && t.productId === product.id,
    );
    return matched ? 1 : null;
  }

  if (promo.scopeType === "category") {
    const productCat = normalizePromotionCategory(product.category);
    if (!productCat) return null;
    const matched = promo.targets.some(
      (t) =>
        t.targetType === "category" &&
        normalizePromotionCategory(t.categoryName) === productCat,
    );
    return matched ? 2 : null;
  }

  return 3;
}

/**
 * Resuelve la promoción ganadora sin acumulación para un producto puntual (`SPEC-18 D-04`, `RN-SPEC-18-02`).
 *
 * Orden de prioridad determinístico:
 * 1. Mayor especificidad: `product` (1) > `category` (2) > `all_catalog` (3).
 * 2. Menor `effectivePriceCents` (mayor ahorro monetario al comprador).
 * 3. Mayor `createdAt` (campaña creada más recientemente).
 */
export function resolveEffectiveProductPromotion(
  product: Pick<PromotionCandidateProduct, "id" | "category" | "priceCents">,
  promotions: readonly PromotionRecordWithTargets[],
  now: Date = new Date(),
): AppliedProductPromotionDto | null {
  interface RankedCandidate {
    rank: 1 | 2 | 3;
    effectivePriceCents: number;
    createdAtMs: number;
    dto: AppliedProductPromotionDto;
  }

  const candidates: RankedCandidate[] = [];

  for (const promo of promotions) {
    if (!isPromotionEligible(promo, now)) continue;
    const rank = getPromotionMatchRank(product, promo);
    if (rank === null) continue;

    // RN-SPEC-18-03: fixed_price solo es válido para alcance 'product'
    if (promo.discountType === "fixed_price" && promo.scopeType !== "product") {
      continue;
    }

    const priced = computeCandidatePromotionalPrice(
      product.priceCents,
      promo.discountType,
      promo.discountValue,
    );
    if (priced.effectivePriceCents === null) continue;

    const savingsCents = product.priceCents - priced.effectivePriceCents;
    const savingsPct = Math.round((savingsCents / product.priceCents) * 10000) / 100;
    const remainingUnits =
      promo.maxDiscountedUnits !== null && promo.maxDiscountedUnits !== undefined
        ? Math.max(0, promo.maxDiscountedUnits - promo.discountedUnitsSold)
        : null;

    candidates.push({
      rank,
      effectivePriceCents: priced.effectivePriceCents,
      createdAtMs: toTimestampMs(promo.createdAt),
      dto: {
        promotionId: promo.id,
        name: promo.name,
        description: promo.description ?? null,
        scopeType: promo.scopeType,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        originalPriceCents: product.priceCents,
        effectivePriceCents: priced.effectivePriceCents,
        savingsCents,
        savingsPct,
        startsAt: toIsoString(promo.startsAt),
        endsAt: promo.endsAt ? toIsoString(promo.endsAt) : null,
        remainingUnits,
      },
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.effectivePriceCents !== b.effectivePriceCents) {
      return a.effectivePriceCents - b.effectivePriceCents;
    }
    return b.createdAtMs - a.createdAtMs;
  });

  return candidates[0]!.dto;
}

/**
 * Resuelve en lote las promociones efectivas para múltiples productos del catálogo.
 */
export function resolveEffectivePromotionsForProducts(
  products: readonly Pick<PromotionCandidateProduct, "id" | "category" | "priceCents">[],
  promotions: readonly PromotionRecordWithTargets[],
  now: Date = new Date(),
): Map<string, AppliedProductPromotionDto> {
  const result = new Map<string, AppliedProductPromotionDto>();
  if (products.length === 0 || promotions.length === 0) return result;

  const eligible = promotions.filter((promo) => isPromotionEligible(promo, now));
  if (eligible.length === 0) return result;

  for (const product of products) {
    const applied = resolveEffectiveProductPromotion(product, eligible, now);
    if (applied) {
      result.set(product.id, applied);
    }
  }
  return result;
}

/**
 * Simula el impacto de precio, exclusiones (`D-06`) y semáforo de rentabilidad (`RN-SPEC-18-04`)
 * para una campaña configurada o en edición frente al catálogo del inquilino.
 */
export function simulatePromotionImpact(
  draft: PromotionSimulationDraft,
  products: readonly PromotionCandidateProduct[],
): PromotionImpactSummaryDto {
  const productIdSet = new Set(draft.productIds ?? []);
  const categorySet = new Set(
    (draft.categories ?? []).map((c) => normalizePromotionCategory(c)).filter(Boolean),
  );

  const matched = products.filter((p) => {
    if (p.status && p.status !== "active") return false;
    if (draft.scopeType === "all_catalog") return true;
    if (draft.scopeType === "product") return productIdSet.has(p.id);
    if (draft.scopeType === "category") {
      const norm = normalizePromotionCategory(p.category);
      return norm.length > 0 && categorySet.has(norm);
    }
    return false;
  });

  const simulatedProducts: PromotionSimulationProductDto[] = [];
  let applicableProductsCount = 0;
  let excludedProductsCount = 0;
  let lossProductsCount = 0;
  let tightMarginProductsCount = 0;
  let healthyMarginProductsCount = 0;
  let minMarginPct: number | null = null;

  for (const product of matched) {
    const costCents = product.costPriceCents ?? 0;
    const priced = computeCandidatePromotionalPrice(
      product.priceCents,
      draft.discountType,
      draft.discountValue,
    );

    if (priced.effectivePriceCents === null) {
      excludedProductsCount += 1;
      simulatedProducts.push({
        productId: product.id,
        name: product.name,
        sku: product.sku ?? null,
        category: product.category ?? null,
        originalPriceCents: product.priceCents,
        costPriceCents: costCents,
        effectivePriceCents: null,
        savingsCents: 0,
        savingsPct: 0,
        profitCents: null,
        marginPct: null,
        marginLevel: null,
        excludedReason: priced.excludedReason,
      });
      continue;
    }

    applicableProductsCount += 1;
    const savingsCents = product.priceCents - priced.effectivePriceCents;
    const savingsPct = Math.round((savingsCents / product.priceCents) * 10000) / 100;
    const profitability = calculateProductProfitability(costCents, priced.effectivePriceCents);
    const marginLevel = classifyPromotionMarginLevel(profitability.marginPct);

    if (marginLevel === "loss") lossProductsCount += 1;
    else if (marginLevel === "tight") tightMarginProductsCount += 1;
    else healthyMarginProductsCount += 1;

    if (minMarginPct === null || profitability.marginPct < minMarginPct) {
      minMarginPct = profitability.marginPct;
    }

    simulatedProducts.push({
      productId: product.id,
      name: product.name,
      sku: product.sku ?? null,
      category: product.category ?? null,
      originalPriceCents: product.priceCents,
      costPriceCents: costCents,
      effectivePriceCents: priced.effectivePriceCents,
      savingsCents,
      savingsPct,
      profitCents: profitability.profitCents,
      marginPct: profitability.marginPct,
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
    products: simulatedProducts,
  };
}
