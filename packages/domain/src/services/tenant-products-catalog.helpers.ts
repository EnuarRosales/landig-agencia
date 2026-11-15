import type { ProductDynamicAttribute } from "../db/schemas/tenant/tenancy-catalog";
import { err, ok, type Result } from "../types/result";
import { buildImgproxyUrl } from "../utils/imgproxy";
import {
  calculateProductProfitability,
  type ProductProfitabilitySummary,
} from "../utils/pricing-margin";

/**
 * Longitud máxima admitida para el Prompt Maestro del bot por producto (`SPEC-08 §7.1`, `PRD-04`).
 */
export const MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS = 32_000;

/**
 * Límites de atributos dinámicos configurables por producto (`SPEC-08 RN-SPEC-08-04`).
 */
export const MAX_PRODUCT_DYNAMIC_ATTRIBUTES = 20;
export const MAX_PRODUCT_ATTRIBUTE_VALUES = 50;

export type ProductKind = "physical" | "digital" | "service";
export type ProductCompositionType = "simple" | "combo";
export type ProductStatus = "active" | "inactive" | "draft";
export type LegacyAwareProductStatus = ProductStatus | "published" | "archived";
export type ProductCondition = "new" | "refurbished" | "used";
export type ProductAvailability = "in_stock" | "out_of_stock" | "preorder" | "backorder";
export type ProductMediaKind = "image" | "video" | "audio" | "pdf";

export interface ProductComboItemInput {
  componentProductId: string;
  quantity: number;
  sortOrder?: number;
}

export interface ProductMediaItemDto {
  id: string;
  mediaId: string;
  mediaKind: ProductMediaKind;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  isCover: boolean;
  altText: string | null;
  sortOrder: number;
  url: string;
  thumbUrl: string | null;
  createdAt: string;
}

export interface ProductComboComponentDto {
  componentProductId: string;
  name: string;
  sku: string | null;
  kind: ProductKind;
  status: ProductStatus;
  priceCents: number;
  costPriceCents: number;
  stockQuantity: number | null;
  quantity: number;
  sortOrder: number;
  coverImageUrl: string | null;
}

export interface ProductMediaCountsDto {
  image: number;
  video: number;
  audio: number;
  pdf: number;
}

export interface ProductListItemDto {
  id: string;
  name: string;
  description: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  kind: ProductKind;
  compositionType: ProductCompositionType;
  condition: ProductCondition;
  availability: ProductAvailability;
  status: ProductStatus;
  currency: string;
  costPriceCents: number;
  priceCents: number;
  salePriceCents: number | null;
  profitability: ProductProfitabilitySummary;
  stockQuantity: number | null;
  minStockThreshold: number | null;
  effectiveStock: number | null;
  isLowStock: boolean;
  hasInactiveComboComponent: boolean;
  coverImageUrl: string | null;
  mediaUrls: string[];
  mediaCounts: ProductMediaCountsDto;
  attributesCount: number;
  comboComponentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetailDto extends ProductListItemDto {
  botMasterPrompt: string;
  attributes: ProductDynamicAttribute[];
  comboComponents: ProductComboComponentDto[];
  suggestedComboCostCents: number | null;
  lowStockAlertSentAt: string | null;
  media: {
    images: ProductMediaItemDto[];
    videos: ProductMediaItemDto[];
    audios: ProductMediaItemDto[];
    pdfs: ProductMediaItemDto[];
  };
}

export interface ListCatalogFilter {
  q?: string;
  status?: ProductStatus | "all";
  kind?: ProductKind | "all";
  compositionType?: ProductCompositionType | "all";
  lowStock?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "priceCents" | "stock" | "status";
  sortDir?: "asc" | "desc";
}

export interface CatalogPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogSummaryMeta {
  totalActive: number;
  lowStockCount: number;
  comboCount: number;
}

export interface CatalogListResultDto {
  items: ProductListItemDto[];
  pagination: CatalogPaginationMeta;
  summary: CatalogSummaryMeta;
}

/**
 * Normaliza un estado de producto incluyendo aliases heredados (`published` -> `active`, `archived` -> `inactive`).
 */
export function normalizeProductStatus(
  rawStatus?: string | null,
  fallback: ProductStatus = "active",
): ProductStatus {
  const normalized = (rawStatus ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === "published") return "active";
  if (normalized === "inactive" || normalized === "archived") return "inactive";
  if (normalized === "draft") return "draft";
  return fallback;
}

/**
 * Normaliza atributos JSONB provenientes de registros heredados (`{}` -> `[]`) asegurando arreglos válidos.
 */
export function normalizeStoredAttributes(raw: unknown): ProductDynamicAttribute[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductDynamicAttribute[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { name?: unknown; values?: unknown; requiredForOrder?: unknown };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const values = Array.isArray(item.values)
      ? Array.from(
          new Set(
            item.values
              .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()))
              .filter((v) => v.length > 0),
          ),
        )
      : [];
    if (name.length > 0 && values.length > 0) {
      out.push({
        name,
        values,
        ...(typeof item.requiredForOrder === "boolean"
          ? { requiredForOrder: item.requiredForOrder }
          : {}),
      });
    }
  }
  return out;
}

/**
 * Valida y normaliza el arreglo de atributos dinámicos según `RN-SPEC-08-04`.
 */
export function validateAndNormalizeAttributes(
  raw: ProductDynamicAttribute[] | undefined,
): Result<ProductDynamicAttribute[]> {
  if (!raw || raw.length === 0) return ok([]);
  if (raw.length > MAX_PRODUCT_DYNAMIC_ATTRIBUTES) {
    return err(
      `Se permiten como máximo ${MAX_PRODUCT_DYNAMIC_ATTRIBUTES} atributos dinámicos por producto.`,
      "TOO_MANY_ATTRIBUTES",
    );
  }

  const seenNames = new Set<string>();
  const normalized: ProductDynamicAttribute[] = [];

  for (const attr of raw) {
    const cleanName = attr.name.trim();
    if (!cleanName) {
      return err("Cada atributo dinámico debe tener un nombre no vacío.", "INVALID_ATTRIBUTE_NAME");
    }
    const lowerKey = cleanName.toLowerCase();
    if (seenNames.has(lowerKey)) {
      return err(
        `El atributo dinámico "${cleanName}" está duplicado en el producto.`,
        "DUPLICATE_ATTRIBUTE_NAME",
      );
    }
    seenNames.add(lowerKey);

    const uniqueValues = Array.from(
      new Set(attr.values.map((v) => v.trim()).filter((v) => v.length > 0)),
    );
    if (uniqueValues.length === 0) {
      return err(
        `El atributo "${cleanName}" debe incluir al menos un valor válido.`,
        "EMPTY_ATTRIBUTE_VALUES",
      );
    }
    if (uniqueValues.length > MAX_PRODUCT_ATTRIBUTE_VALUES) {
      return err(
        `El atributo "${cleanName}" supera el máximo de ${MAX_PRODUCT_ATTRIBUTE_VALUES} valores.`,
        "TOO_MANY_ATTRIBUTE_VALUES",
      );
    }

    normalized.push({
      name: cleanName,
      values: uniqueValues,
      ...(typeof attr.requiredForOrder === "boolean"
        ? { requiredForOrder: attr.requiredForOrder }
        : {}),
    });
  }

  return ok(normalized);
}

/**
 * Calcula métricas derivadas de un combo (stock efectivo dinámico, costo sugerido y alerta de hijos inactivos) (`D-03`).
 */
export function computeComboDerivedMetrics(components: ProductComboComponentDto[]): {
  effectiveStock: number | null;
  suggestedCostCents: number;
  hasInactiveComponent: boolean;
  isLowStock: boolean;
} {
  let suggestedCostCents = 0;
  let hasInactiveComponent = false;
  let hasPhysicalComponent = false;
  let minAvailableUnits: number | null = null;
  let hasLowPhysicalComponent = false;

  for (const comp of components) {
    const unitCostBasis = comp.costPriceCents > 0 ? comp.costPriceCents : comp.priceCents;
    suggestedCostCents += unitCostBasis * comp.quantity;

    if (comp.status === "inactive") {
      hasInactiveComponent = true;
    }

    if (comp.kind === "physical") {
      hasPhysicalComponent = true;
      if (comp.status === "inactive") {
        minAvailableUnits = 0;
      } else {
        const availableForBundle = Math.floor(
          Math.max(0, comp.stockQuantity ?? 0) / Math.max(1, comp.quantity),
        );
        minAvailableUnits =
          minAvailableUnits === null
            ? availableForBundle
            : Math.min(minAvailableUnits, availableForBundle);
        if (availableForBundle === 0) {
          hasLowPhysicalComponent = true;
        }
      }
    }
  }

  const effectiveStock = hasPhysicalComponent ? (minAvailableUnits ?? 0) : null;
  const isLowStock =
    hasPhysicalComponent && (hasLowPhysicalComponent || (effectiveStock !== null && effectiveStock <= 0));

  return {
    effectiveStock,
    suggestedCostCents,
    hasInactiveComponent,
    isLowStock,
  };
}

/**
 * Resuelve las URLs de entrega (`imgproxy` para imágenes y proxy autenticado `/api/tenant/media/[mediaId]` para video/audio/PDF) (`D-04`).
 */
export function resolveProductMediaUrls(params: {
  mediaId: string;
  mediaKind: ProductMediaKind;
  storageKey?: string | null;
}): { url: string; thumbUrl: string | null } {
  const proxyUrl = `/api/tenant/media/${params.mediaId}`;

  if (params.mediaKind !== "image" || !params.storageKey) {
    return { url: proxyUrl, thumbUrl: null };
  }

  try {
    const url = buildImgproxyUrl(params.storageKey, {
      width: 1200,
      height: 1200,
      resizingType: "fit",
    });
    const thumbUrl = buildImgproxyUrl(params.storageKey, {
      width: 240,
      height: 240,
      resizingType: "fill",
    });
    return { url, thumbUrl };
  } catch {
    return { url: proxyUrl, thumbUrl: proxyUrl };
  }
}

/**
 * Calcula rentabilidad y determina si un producto simple físico se encuentra en umbral bajo de stock.
 */
export function evaluateProductStockAndMargin(params: {
  kind: ProductKind;
  compositionType: ProductCompositionType;
  status: ProductStatus;
  costPriceCents: number;
  priceCents: number;
  salePriceCents: number | null;
  stockQuantity: number | null;
  minStockThreshold: number | null;
  comboComponents?: ProductComboComponentDto[];
}): {
  profitability: ProductProfitabilitySummary;
  effectiveStock: number | null;
  isLowStock: boolean;
  hasInactiveComboComponent: boolean;
  suggestedComboCostCents: number | null;
} {
  const effectiveSalePrice =
    params.salePriceCents !== null && params.salePriceCents > 0
      ? params.salePriceCents
      : params.priceCents;

  const profitability = calculateProductProfitability(params.costPriceCents, effectiveSalePrice);

  if (params.compositionType === "combo") {
    const derived = computeComboDerivedMetrics(params.comboComponents ?? []);
    return {
      profitability,
      effectiveStock: derived.effectiveStock,
      isLowStock: derived.isLowStock,
      hasInactiveComboComponent: derived.hasInactiveComponent,
      suggestedComboCostCents: derived.suggestedCostCents,
    };
  }

  if (params.kind !== "physical") {
    return {
      profitability,
      effectiveStock: null,
      isLowStock: false,
      hasInactiveComboComponent: false,
      suggestedComboCostCents: null,
    };
  }

  const effectiveStock = params.stockQuantity ?? 0;
  const threshold = params.minStockThreshold ?? 0;
  const isLowStock =
    params.status === "active" && threshold > 0 && effectiveStock <= threshold;

  return {
    profitability,
    effectiveStock,
    isLowStock,
    hasInactiveComboComponent: false,
    suggestedComboCostCents: null,
  };
}
