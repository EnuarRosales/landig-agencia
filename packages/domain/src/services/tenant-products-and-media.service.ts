import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import {
  clientPlanOverrides,
  planLimits,
  type PlanLimitDimensionKey,
} from "../db/schemas/admin/plan-catalogs";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  cellClientMedia,
  cellClientUsage,
  cellProductBundleItems,
  cellProductMedia,
  cellProducts,
  type CellProduct,
  type CellProductBundleItem,
  type ProductDynamicAttribute,
} from "../db/schemas/tenant/tenancy-catalog";
import {
  cellPromotions,
  cellPromotionTargets,
  type CellPromotion,
  type CellPromotionTarget,
  type PromotionDiscountType,
  type PromotionScopeType,
} from "../db/schemas/tenant/promotions";
import {
  resolveEffectivePromotionsForProducts,
  type AppliedProductPromotionDto,
  type PromotionRecordWithTargets,
} from "./promotion-resolution";
import {
  MAX_UPLOAD_BYTES_BY_KIND,
  validateMediaMagicBytes,
} from "../utils/media-magic-bytes";
import { appLogger } from "../utils/logger";
import { S3StorageService } from "./s3-storage.service";
import {
  type TransactionalNotificationsAndLeadsService,
} from "./notifications-and-leads.service";
import {
  buildAdminPortalUrl,
  getNotificationDispatcherService,
} from "./notification-dispatcher.service";
import {
  evaluateProductStockAndMargin,
  MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS,
  normalizeProductStatus,
  normalizeStoredAttributes,
  resolveProductMediaUrls,
  validateAndNormalizeAttributes,
  type CatalogListResultDto,
  type LegacyAwareProductStatus,
  type ListCatalogFilter,
  type ProductAvailability,
  type ProductComboComponentDto,
  type ProductComboItemInput,
  type ProductCompositionType,
  type ProductCondition,
  type ProductDetailDto,
  type ProductKind,
  type ProductListItemDto,
  type ProductMediaCountsDto,
  type ProductMediaItemDto,
  type ProductMediaKind,
  type ProductStatus,
} from "./tenant-products-catalog.helpers";

export type MediaKind = ProductMediaKind;

export type {
  CatalogListResultDto,
  ListCatalogFilter,
  ProductAvailability,
  ProductComboComponentDto,
  ProductComboItemInput,
  ProductCompositionType,
  ProductCondition,
  ProductDetailDto,
  ProductKind,
  ProductListItemDto,
  ProductMediaCountsDto,
  ProductMediaItemDto,
  ProductStatus,
};

/**
 * Error de dominio tipado para cargas multimedia y streaming privado (`SPEC-00`, `SPEC-08`).
 */
export class ProductMediaDomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "VALIDATION"
      | "QUOTA_EXCEEDED"
      | "NOT_FOUND"
      | "CONFLICT"
      | "STORAGE_UNAVAILABLE",
    public readonly httpStatus: 400 | 404 | 409 | 422 | 503,
  ) {
    super(message);
    this.name = "ProductMediaDomainError";
  }
}

export interface TenantProductInput {
  name: string;
  description: string;
  priceCents: number;
  costPriceCents?: number | null;
  salePriceCents?: number | null;
  currency?: string;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  category?: string | null;
  kind?: ProductKind;
  compositionType?: ProductCompositionType;
  condition?: ProductCondition;
  availability?: ProductAvailability;
  status?: LegacyAwareProductStatus;
  botMasterPrompt?: string | null;
  attributes?: ProductDynamicAttribute[];
  stockQuantity?: number | null;
  minStockThreshold?: number | null;
  comboItems?: ProductComboItemInput[];
}

export interface ProductMediaAttachmentInput {
  productId: string;
  mediaId: string;
  mediaKind: MediaKind;
  sizeBytes: number;
  altText?: string | null;
  isCover?: boolean;
}

export interface StoredProductMediaRecord {
  id: string;
  clientId: string;
  productId: string;
  mediaId: string;
  mediaKind: MediaKind;
  isCover: boolean;
  altText: string | null;
  sortOrder: number;
  createdAt: Date;
  storageKey: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
}

export interface TenantMediaStreamSource {
  mediaId: string;
  mediaKind: MediaKind;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  storageKey: string;
}

export interface TenantNotificationRecipientInfo {
  businessName: string;
  recipientEmail: string;
  locale: "es" | "en";
}

export interface LowStockEvaluationResult {
  triggered: boolean;
  reset?: boolean;
  reason?: string;
  dispatch?: () => Promise<void>;
}

/**
 * Contrato de persistencia del catálogo de productos, combos, multimedia y cuotas (`SPEC-08`).
 */
export interface ITenantProductsRepository {
  getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;
  countActiveProducts(clientId: string): Promise<number>;
  countProductMediaByKind(clientId: string, productId: string, kind: MediaKind): Promise<number>;
  getTenantStorageUsage(clientId: string): Promise<number>;
  createProduct(
    clientId: string,
    input: TenantProductInput,
    actor: string,
  ): Promise<CellProduct>;
  updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor: string,
  ): Promise<CellProduct | null>;
  deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean>;
  listProducts(clientId: string): Promise<CellProduct[]>;
  getProductById(clientId: string, productId: string): Promise<CellProduct | null>;
  getProductsByIds(clientId: string, productIds: string[]): Promise<CellProduct[]>;
  importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor: string,
  ): Promise<CellProduct[]>;
  attachMedia(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string }>;
  detachMedia(clientId: string, productId: string, mediaId: string): Promise<boolean>;

  // Extensiones SPEC-08 con implementaciones reales en repositorio
  findActiveBundleParentsForComponent?(
    clientId: string,
    componentProductId: string,
  ): Promise<Array<{ id: string; name: string }>>;
  replaceBundleItems?(
    clientId: string,
    bundleProductId: string,
    items: ProductComboItemInput[],
    actor: string,
  ): Promise<void>;
  getBundleItemsForProducts?(
    clientId: string,
    bundleProductIds: string[],
  ): Promise<CellProductBundleItem[]>;
  getProductMediaDetails?(
    clientId: string,
    productIds: string[],
  ): Promise<StoredProductMediaRecord[]>;
  setProductMediaCover?(
    clientId: string,
    productId: string,
    mediaId: string,
    actor: string,
  ): Promise<{ status: "ok" } | { status: "not_found" } | { status: "not_image" }>;
  deleteProductMediaAndPromote?(
    clientId: string,
    productId: string,
    mediaId: string,
    actor: string,
  ): Promise<{
    deleted: boolean;
    promotedCoverMediaId: string | null;
    orphanStorageKeyToDelete: string | null;
  }>;
  uploadAndAttachBinaryMedia?(
    clientId: string,
    productId: string,
    params: {
      contentHash: string;
      buffer: Buffer;
      mimeType: string;
      mediaKind: MediaKind;
      ext: string;
      originalFilename: string;
      altText?: string | null;
      setAsCover?: boolean;
    },
    actor: string,
    s3Service: S3StorageService,
  ): Promise<
    Result<{
      mediaRecord: StoredProductMediaRecord;
    }>
  >;
  resolveTenantMediaStreamSource?(
    clientId: string,
    mediaId: string,
  ): Promise<TenantMediaStreamSource | null>;
  listPromotionsForResolution?(clientId: string): Promise<PromotionRecordWithTargets[]>;
  markLowStockAlertSentAtomically?(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean>;
  resetLowStockAlertFlag?(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean>;
  getTenantNotificationRecipient?(
    clientId: string,
  ): Promise<TenantNotificationRecipientInfo | null>;
}

function buildDefaultMediaRecord(
  id: string,
  clientId: string,
  productId: string,
  input: ProductMediaAttachmentInput,
  sortOrder: number,
  isCover: boolean,
): StoredProductMediaRecord {
  return {
    id,
    clientId,
    productId,
    mediaId: input.mediaId,
    mediaKind: input.mediaKind,
    isCover,
    altText: input.altText ?? null,
    sortOrder,
    createdAt: new Date(),
    storageKey: `tenants/${clientId}/products/${productId}/${input.mediaId}`,
    mimeType:
      input.mediaKind === "image"
        ? "image/webp"
        : input.mediaKind === "video"
          ? "video/mp4"
          : input.mediaKind === "audio"
            ? "audio/mpeg"
            : "application/pdf",
    originalFilename: `asset-${input.mediaId}`,
    sizeBytes: input.sizeBytes,
  };
}

/**
 * Repositorio en memoria para pruebas unitarias determinísticas sin base de datos activa (`T6`, `SPEC-08`).
 */
export class InMemoryTenantProductsRepository implements ITenantProductsRepository {
  public quotas = new Map<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }>();
  public products = new Map<string, CellProduct>();
  public productMedia = new Map<string, StoredProductMediaRecord>();
  public bundleItems = new Map<string, CellProductBundleItem[]>();
  public globalMediaByHash = new Map<
    string,
    {
      id: string;
      contentHash: string;
      storageKey: string;
      mediaKind: MediaKind;
      mimeType: string;
      originalFilename: string;
      sizeBytes: number;
    }
  >();
  public clientMedia = new Map<string, { clientId: string; mediaId: string; sizeBytes: number }>();
  public storageUsage = new Map<string, number>();
  public tenantNotifications = new Map<string, TenantNotificationRecipientInfo>();

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    return this.quotas.get(`${clientId}:${dimension}`) ?? { mode: "UNLIMITED", value: null };
  }

  async countActiveProducts(clientId: string): Promise<number> {
    let count = 0;
    for (const p of this.products.values()) {
      if (p.clientId === clientId && !p.deletedAt) count += 1;
    }
    return count;
  }

  async countProductMediaByKind(
    clientId: string,
    productId: string,
    kind: MediaKind,
  ): Promise<number> {
    let count = 0;
    for (const m of this.productMedia.values()) {
      if (m.clientId === clientId && m.productId === productId && m.mediaKind === kind) {
        count += 1;
      }
    }
    return count;
  }

  async getTenantStorageUsage(clientId: string): Promise<number> {
    return this.storageUsage.get(clientId) ?? 0;
  }

  async createProduct(
    clientId: string,
    input: TenantProductInput,
    actor: string,
  ): Promise<CellProduct> {
    const id = `019a0000-0000-7000-8005-${String(this.products.size + 1).padStart(12, "0")}`;
    const kind = input.kind ?? "physical";
    const compositionType = input.compositionType ?? "simple";
    const status = normalizeProductStatus(input.status, "active");
    const botMasterPrompt = input.botMasterPrompt ?? "";

    const product: CellProduct = {
      id,
      clientId,
      sku: input.sku ?? null,
      gtin: input.gtin ?? null,
      mpn: null,
      itemGroupId: null,
      sourceSystem: "manual",
      sourceExternalId: null,
      sourceUrl: null,
      name: input.name,
      description: input.description,
      brand: input.brand ?? null,
      kind,
      compositionType,
      condition: input.condition ?? "new",
      availability: input.availability ?? "in_stock",
      status,
      sortOrder: 0,
      costPriceCents: input.costPriceCents ?? 0,
      priceCents: input.priceCents,
      salePriceCents: input.salePriceCents ?? null,
      currency: input.currency ?? "COP",
      priceNote: null,
      category: input.category ?? null,
      googleProductCategory: null,
      color: null,
      size: null,
      material: null,
      gender: null,
      ageGroup: null,
      pattern: null,
      attributes: input.attributes ?? [],
      prompt: botMasterPrompt || null,
      botMasterPrompt,
      stockQuantity:
        kind === "physical" && compositionType === "simple" ? (input.stockQuantity ?? 0) : null,
      minStockThreshold:
        kind === "physical" && compositionType === "simple"
          ? (input.minStockThreshold ?? null)
          : null,
      lowStockAlertSentAt: null,
      keywords: [],
      mediaTerm: null,
      benefits: [],
      deliveryGroupId: null,
      freeShipping: false,
      shippingCostCents: null,
      sourceShareId: null,
      sourceVersion: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
    };

    this.products.set(id, product);
    if (compositionType === "combo" && input.comboItems) {
      await this.replaceBundleItems(clientId, id, input.comboItems, actor);
    }
    return product;
  }

  async updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor: string,
  ): Promise<CellProduct | null> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt) return null;

    const nextKind = updates.kind ?? (p.kind as ProductKind);
    const nextComp = updates.compositionType ?? (p.compositionType as ProductCompositionType);
    const nextPrompt =
      updates.botMasterPrompt !== undefined ? (updates.botMasterPrompt ?? "") : p.botMasterPrompt;

    const updated: CellProduct = {
      ...p,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.sku !== undefined ? { sku: updates.sku ?? null } : {}),
      ...(updates.gtin !== undefined ? { gtin: updates.gtin ?? null } : {}),
      ...(updates.brand !== undefined ? { brand: updates.brand ?? null } : {}),
      ...(updates.category !== undefined ? { category: updates.category ?? null } : {}),
      ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
      ...(updates.condition !== undefined ? { condition: updates.condition } : {}),
      ...(updates.availability !== undefined ? { availability: updates.availability } : {}),
      ...(updates.costPriceCents !== undefined
        ? { costPriceCents: updates.costPriceCents ?? 0 }
        : {}),
      ...(updates.priceCents !== undefined ? { priceCents: updates.priceCents } : {}),
      ...(updates.salePriceCents !== undefined
        ? { salePriceCents: updates.salePriceCents ?? null }
        : {}),
      ...(updates.status !== undefined
        ? { status: normalizeProductStatus(updates.status, p.status as ProductStatus) }
        : {}),
      ...(updates.attributes !== undefined ? { attributes: updates.attributes } : {}),
      kind: nextKind,
      compositionType: nextComp,
      botMasterPrompt: nextPrompt,
      prompt: nextPrompt || p.prompt,
      stockQuantity:
        nextKind === "physical" && nextComp === "simple"
          ? updates.stockQuantity !== undefined
            ? (updates.stockQuantity ?? 0)
            : (p.stockQuantity ?? 0)
          : null,
      minStockThreshold:
        nextKind === "physical" && nextComp === "simple"
          ? updates.minStockThreshold !== undefined
            ? updates.minStockThreshold
            : p.minStockThreshold
          : null,
      lowStockAlertSentAt:
        nextKind === "physical" && nextComp === "simple" ? p.lowStockAlertSentAt : null,
      updatedAt: new Date(),
      updatedBy: actor,
    };

    this.products.set(productId, updated);
    if (updates.comboItems !== undefined) {
      if (nextComp === "combo") {
        await this.replaceBundleItems(clientId, productId, updates.comboItems, actor);
      } else {
        this.bundleItems.delete(`${clientId}:${productId}`);
      }
    } else if (nextComp !== "combo") {
      this.bundleItems.delete(`${clientId}:${productId}`);
    }
    return updated;
  }

  async deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt) return false;
    p.deletedAt = new Date();
    p.deletedBy = actor;
    return true;
  }

  async listProducts(clientId: string): Promise<CellProduct[]> {
    const list: CellProduct[] = [];
    for (const p of this.products.values()) {
      if (p.clientId === clientId && !p.deletedAt) list.push(p);
    }
    return list;
  }

  async getProductById(clientId: string, productId: string): Promise<CellProduct | null> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt) return null;
    return p;
  }

  async getProductsByIds(clientId: string, productIds: string[]): Promise<CellProduct[]> {
    const wanted = new Set(productIds);
    const out: CellProduct[] = [];
    for (const p of this.products.values()) {
      if (p.clientId === clientId && !p.deletedAt && wanted.has(p.id)) {
        out.push(p);
      }
    }
    return out;
  }

  async importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor: string,
  ): Promise<CellProduct[]> {
    const res: CellProduct[] = [];
    for (const item of items) {
      res.push(await this.createProduct(clientId, item, actor));
    }
    return res;
  }

  async attachMedia(
    clientId: string,
    input: ProductMediaAttachmentInput,
    _actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string }> {
    const id = `019a0000-0000-7000-8006-${String(this.productMedia.size + 1).padStart(12, "0")}`;
    const existingForProduct = Array.from(this.productMedia.values()).filter(
      (m) => m.clientId === clientId && m.productId === input.productId,
    );
    const hasCover = existingForProduct.some((m) => m.isCover);
    const wantsCover =
      input.mediaKind === "image" && (input.isCover === true || !hasCover);

    if (wantsCover) {
      for (const m of existingForProduct) {
        if (m.isCover) m.isCover = false;
      }
    }

    const nextSortOrder =
      existingForProduct.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

    const record = buildDefaultMediaRecord(
      id,
      clientId,
      input.productId,
      input,
      nextSortOrder,
      wantsCover,
    );
    this.productMedia.set(id, record);

    const cmKey = `${clientId}:${input.mediaId}`;
    if (!this.clientMedia.has(cmKey)) {
      this.clientMedia.set(cmKey, {
        clientId,
        mediaId: input.mediaId,
        sizeBytes: input.sizeBytes,
      });
      this.storageUsage.set(clientId, (this.storageUsage.get(clientId) ?? 0) + input.sizeBytes);
    }

    return { id, productId: input.productId, mediaId: input.mediaId };
  }

  async detachMedia(clientId: string, productId: string, mediaId: string): Promise<boolean> {
    const res = await this.deleteProductMediaAndPromote(clientId, productId, mediaId, "system");
    return res.deleted;
  }

  async findActiveBundleParentsForComponent(
    clientId: string,
    componentProductId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const parents: Array<{ id: string; name: string }> = [];
    for (const [key, items] of this.bundleItems.entries()) {
      if (!key.startsWith(`${clientId}:`)) continue;
      if (items.some((i) => i.componentProductId === componentProductId)) {
        const bundleId = key.slice(clientId.length + 1);
        const parent = this.products.get(bundleId);
        if (parent && parent.clientId === clientId && !parent.deletedAt) {
          parents.push({ id: parent.id, name: parent.name });
        }
      }
    }
    return parents;
  }

  async replaceBundleItems(
    clientId: string,
    bundleProductId: string,
    items: ProductComboItemInput[],
    actor: string,
  ): Promise<void> {
    const now = new Date();
    const mapped: CellProductBundleItem[] = items.map((item, idx) => ({
      id: randomUUID(),
      clientId,
      bundleProductId,
      componentProductId: item.componentProductId,
      quantity: item.quantity,
      sortOrder: item.sortOrder ?? idx,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    }));
    this.bundleItems.set(`${clientId}:${bundleProductId}`, mapped);
  }

  async getBundleItemsForProducts(
    clientId: string,
    bundleProductIds: string[],
  ): Promise<CellProductBundleItem[]> {
    const out: CellProductBundleItem[] = [];
    for (const pid of bundleProductIds) {
      const items = this.bundleItems.get(`${clientId}:${pid}`);
      if (items) out.push(...items);
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getProductMediaDetails(
    clientId: string,
    productIds: string[],
  ): Promise<StoredProductMediaRecord[]> {
    const wanted = new Set(productIds);
    return Array.from(this.productMedia.values())
      .filter((m) => m.clientId === clientId && wanted.has(m.productId))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async setProductMediaCover(
    clientId: string,
    productId: string,
    mediaId: string,
    _actor: string,
  ): Promise<{ status: "ok" } | { status: "not_found" } | { status: "not_image" }> {
    const items = Array.from(this.productMedia.values()).filter(
      (m) => m.clientId === clientId && m.productId === productId,
    );
    const target = items.find((m) => m.mediaId === mediaId || m.id === mediaId);
    if (!target) return { status: "not_found" };
    if (target.mediaKind !== "image") return { status: "not_image" };

    for (const item of items) {
      item.isCover = item.id === target.id;
    }
    return { status: "ok" };
  }

  async deleteProductMediaAndPromote(
    clientId: string,
    productId: string,
    mediaId: string,
    _actor: string,
  ): Promise<{
    deleted: boolean;
    promotedCoverMediaId: string | null;
    orphanStorageKeyToDelete: string | null;
  }> {
    let targetKey: string | null = null;
    let targetRecord: StoredProductMediaRecord | null = null;
    for (const [key, item] of this.productMedia.entries()) {
      if (
        item.clientId === clientId &&
        item.productId === productId &&
        (item.mediaId === mediaId || item.id === mediaId)
      ) {
        targetKey = key;
        targetRecord = item;
        break;
      }
    }

    if (!targetKey || !targetRecord) {
      return { deleted: false, promotedCoverMediaId: null, orphanStorageKeyToDelete: null };
    }

    this.productMedia.delete(targetKey);

    let promotedCoverMediaId: string | null = null;
    if (targetRecord.isCover) {
      const remainingImages = Array.from(this.productMedia.values())
        .filter(
          (m) => m.clientId === clientId && m.productId === productId && m.mediaKind === "image",
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
      const nextCover = remainingImages[0];
      if (nextCover) {
        nextCover.isCover = true;
        promotedCoverMediaId = nextCover.mediaId;
      }
    }

    const stillUsedByClient = Array.from(this.productMedia.values()).some(
      (m) => m.clientId === clientId && m.mediaId === targetRecord!.mediaId,
    );
    let orphanStorageKeyToDelete: string | null = null;
    if (!stillUsedByClient) {
      const cmKey = `${clientId}:${targetRecord.mediaId}`;
      const cm = this.clientMedia.get(cmKey);
      if (cm) {
        this.clientMedia.delete(cmKey);
        this.storageUsage.set(
          clientId,
          Math.max(0, (this.storageUsage.get(clientId) ?? 0) - cm.sizeBytes),
        );
      }
      const usedAnywhere = Array.from(this.clientMedia.values()).some(
        (c) => c.mediaId === targetRecord!.mediaId,
      );
      if (!usedAnywhere) {
        orphanStorageKeyToDelete = targetRecord.storageKey;
      }
    }

    return { deleted: true, promotedCoverMediaId, orphanStorageKeyToDelete };
  }

  async uploadAndAttachBinaryMedia(
    clientId: string,
    productId: string,
    params: {
      contentHash: string;
      buffer: Buffer;
      mimeType: string;
      mediaKind: MediaKind;
      ext: string;
      originalFilename: string;
      altText?: string | null;
      setAsCover?: boolean;
    },
    actor: string,
  ): Promise<Result<{ mediaRecord: StoredProductMediaRecord }>> {
    let global = this.globalMediaByHash.get(params.contentHash);
    if (!global) {
      const mediaId = randomUUID();
      global = {
        id: mediaId,
        contentHash: params.contentHash,
        storageKey: `tenants/${clientId}/products/${productId}/${params.contentHash.slice(0, 12)}-${randomUUID()}.${params.ext}`,
        mediaKind: params.mediaKind,
        mimeType: params.mimeType,
        originalFilename: params.originalFilename,
        sizeBytes: params.buffer.byteLength,
      };
      this.globalMediaByHash.set(params.contentHash, global);
    }

    const link = await this.attachMedia(
      clientId,
      {
        productId,
        mediaId: global.id,
        mediaKind: params.mediaKind,
        sizeBytes: params.buffer.byteLength,
        altText: params.altText,
        isCover: params.setAsCover,
      },
      actor,
    );
    const stored = this.productMedia.get(link.id)!;
    stored.storageKey = global.storageKey;
    stored.mimeType = global.mimeType;
    stored.originalFilename = params.originalFilename;
    stored.sizeBytes = params.buffer.byteLength;
    return ok({ mediaRecord: stored });
  }

  async resolveTenantMediaStreamSource(
    clientId: string,
    mediaId: string,
  ): Promise<TenantMediaStreamSource | null> {
    const cm = this.clientMedia.get(`${clientId}:${mediaId}`);
    if (!cm) return null;
    for (const item of this.globalMediaByHash.values()) {
      if (item.id === mediaId) {
        return {
          mediaId: item.id,
          mediaKind: item.mediaKind,
          mimeType: item.mimeType,
          originalFilename: item.originalFilename,
          sizeBytes: item.sizeBytes,
          storageKey: item.storageKey,
        };
      }
    }
    const pm = Array.from(this.productMedia.values()).find(
      (m) => m.clientId === clientId && m.mediaId === mediaId,
    );
    if (!pm) return null;
    return {
      mediaId: pm.mediaId,
      mediaKind: pm.mediaKind,
      mimeType: pm.mimeType,
      originalFilename: pm.originalFilename,
      sizeBytes: pm.sizeBytes,
      storageKey: pm.storageKey,
    };
  }

  async markLowStockAlertSentAtomically(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt || p.lowStockAlertSentAt) {
      return false;
    }
    p.lowStockAlertSentAt = new Date();
    p.updatedAt = new Date();
    p.updatedBy = actor;
    return true;
  }

  async resetLowStockAlertFlag(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt || !p.lowStockAlertSentAt) {
      return false;
    }
    p.lowStockAlertSentAt = null;
    p.updatedAt = new Date();
    p.updatedBy = actor;
    return true;
  }

  async getTenantNotificationRecipient(
    clientId: string,
  ): Promise<TenantNotificationRecipientInfo | null> {
    return this.tenantNotifications.get(clientId) ?? null;
  }
}

/**
 * Tipo funcional para ejecutar transacciones celulares bajo contexto RLS de inquilino.
 */
export type TenantCellTxRunner = <T>(
  clientId: string,
  callback: (tx: any) => Promise<T>,
) => Promise<T>;

/**
 * Implementación Drizzle ORM sobre PostgreSQL (`Control Plane` + `Cell Data Plane` RLS).
 */
export class DrizzleTenantProductsRepository implements ITenantProductsRepository {
  constructor(
    private readonly portalDb: any = getDb(),
    private readonly cellTxRunner: TenantCellTxRunner = withTenantCellTransaction,
  ) {}

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const now = new Date();
    const [override] = await this.portalDb
      .select()
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          eq(clientPlanOverrides.dimension, dimension),
          lte(clientPlanOverrides.validFrom, now),
          or(isNull(clientPlanOverrides.validTo), gt(clientPlanOverrides.validTo, now)),
        ),
      )
      .limit(1);

    if (override) {
      return {
        mode: override.mode as "LIMITED" | "UNLIMITED",
        value: override.value,
      };
    }

    const [client] = await this.portalDb
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      return { mode: "LIMITED", value: 0 };
    }

    const [limitRow] = await this.portalDb
      .select()
      .from(planLimits)
      .where(and(eq(planLimits.planId, client.planId), eq(planLimits.dimension, dimension)))
      .limit(1);

    if (!limitRow) {
      const [planRow] = await this.portalDb
        .select({ code: plans.code })
        .from(plans)
        .where(eq(plans.id, client.planId))
        .limit(1);

      if (planRow?.code === "enterprise") {
        return { mode: "UNLIMITED", value: null };
      }
      return { mode: "LIMITED", value: 0 };
    }

    return {
      mode: limitRow.mode as "LIMITED" | "UNLIMITED",
      value: limitRow.value,
    };
  }

  async countActiveProducts(clientId: string): Promise<number> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [res] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));
      return res?.count ?? 0;
    });
  }

  async countProductMediaByKind(
    clientId: string,
    productId: string,
    kind: MediaKind,
  ): Promise<number> {
    const productRows = await this.cellTxRunner(clientId, async (tx) => {
      return tx
        .select({
          mediaId: cellProductMedia.mediaId,
          mediaKind: cellProductMedia.mediaKind,
        })
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
          ),
        );
    });

    if (productRows.length === 0) {
      return 0;
    }

    if (productRows.every((row: { mediaKind?: unknown }) => typeof row.mediaKind === "string")) {
      return productRows.filter((row: { mediaKind: string }) => row.mediaKind === kind).length;
    }

    const uniqueMediaIds = Array.from(
      new Set<string>(productRows.map((row: { mediaId: string }) => row.mediaId)),
    );

    const matchingMedia = await this.portalDb
      .select({ id: mediaCatalog.id })
      .from(mediaCatalog)
      .where(and(inArray(mediaCatalog.id, uniqueMediaIds), eq(mediaCatalog.mediaKind, kind)));

    const matchingSet = new Set(matchingMedia.map((m: { id: string }) => m.id));
    return productRows.filter((row: { mediaId: string }) => matchingSet.has(row.mediaId)).length;
  }

  async getTenantStorageUsage(clientId: string): Promise<number> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [usage] = await tx
        .select({ used: cellClientUsage.usedValue })
        .from(cellClientUsage)
        .where(
          and(
            eq(cellClientUsage.clientId, clientId),
            eq(cellClientUsage.dimension, "storage_bytes"),
          ),
        )
        .limit(1);
      return usage?.used ?? 0;
    });
  }

  private async upsertBundleItemsTx(
    tx: any,
    clientId: string,
    bundleProductId: string,
    items: ProductComboItemInput[],
    actor: string,
  ): Promise<void> {
    await tx
      .delete(cellProductBundleItems)
      .where(
        and(
          eq(cellProductBundleItems.clientId, clientId),
          eq(cellProductBundleItems.bundleProductId, bundleProductId),
        ),
      );

    if (items.length === 0) return;

    await tx.insert(cellProductBundleItems).values(
      items.map((item, idx) => ({
        clientId,
        bundleProductId,
        componentProductId: item.componentProductId,
        quantity: item.quantity,
        sortOrder: item.sortOrder ?? idx,
        createdBy: actor,
        updatedBy: actor,
      })),
    );
  }

  async createProduct(
    clientId: string,
    input: TenantProductInput,
    actor: string,
  ): Promise<CellProduct> {
    return this.cellTxRunner(clientId, async (tx) => {
      const kind = input.kind ?? "physical";
      const compositionType = input.compositionType ?? "simple";
      const botMasterPrompt = input.botMasterPrompt ?? "";

      const [created] = await tx
        .insert(cellProducts)
        .values({
          clientId,
          name: input.name,
          description: input.description,
          costPriceCents: input.costPriceCents ?? 0,
          priceCents: input.priceCents,
          salePriceCents: input.salePriceCents ?? null,
          currency: input.currency ?? "COP",
          sku: input.sku ?? null,
          gtin: input.gtin ?? null,
          brand: input.brand ?? null,
          category: input.category ?? null,
          kind,
          compositionType,
          condition: input.condition ?? "new",
          availability: input.availability ?? "in_stock",
          status: normalizeProductStatus(input.status, "active"),
          attributes: input.attributes ?? [],
          prompt: botMasterPrompt || null,
          botMasterPrompt,
          stockQuantity:
            kind === "physical" && compositionType === "simple" ? (input.stockQuantity ?? 0) : null,
          minStockThreshold:
            kind === "physical" && compositionType === "simple"
              ? (input.minStockThreshold ?? null)
              : null,
          lowStockAlertSentAt: null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      if (compositionType === "combo" && input.comboItems?.length) {
        await this.upsertBundleItemsTx(tx, clientId, created.id, input.comboItems, actor);
      }

      return created;
    });
  }

  async updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor: string,
  ): Promise<CellProduct | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.id, productId),
            eq(cellProducts.clientId, clientId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .limit(1);

      if (!existing) return null;

      const nextKind = updates.kind ?? (existing.kind as ProductKind);
      const nextComp =
        updates.compositionType ?? (existing.compositionType as ProductCompositionType);
      const nextPrompt =
        updates.botMasterPrompt !== undefined
          ? (updates.botMasterPrompt ?? "")
          : existing.botMasterPrompt;

      const setPayload: Record<string, unknown> = {
        updatedAt: new Date(),
        updatedBy: actor,
        kind: nextKind,
        compositionType: nextComp,
      };

      if (updates.name !== undefined) setPayload.name = updates.name;
      if (updates.description !== undefined) setPayload.description = updates.description;
      if (updates.costPriceCents !== undefined)
        setPayload.costPriceCents = updates.costPriceCents ?? 0;
      if (updates.priceCents !== undefined) setPayload.priceCents = updates.priceCents;
      if (updates.salePriceCents !== undefined)
        setPayload.salePriceCents = updates.salePriceCents ?? null;
      if (updates.currency !== undefined) setPayload.currency = updates.currency;
      if (updates.sku !== undefined) setPayload.sku = updates.sku ?? null;
      if (updates.gtin !== undefined) setPayload.gtin = updates.gtin ?? null;
      if (updates.brand !== undefined) setPayload.brand = updates.brand ?? null;
      if (updates.category !== undefined) setPayload.category = updates.category ?? null;
      if (updates.condition !== undefined) setPayload.condition = updates.condition;
      if (updates.availability !== undefined) setPayload.availability = updates.availability;
      if (updates.status !== undefined) {
        setPayload.status = normalizeProductStatus(
          updates.status,
          existing.status as ProductStatus,
        );
      }
      if (updates.attributes !== undefined) setPayload.attributes = updates.attributes;
      if (updates.botMasterPrompt !== undefined) {
        setPayload.botMasterPrompt = nextPrompt;
        setPayload.prompt = nextPrompt || null;
      }

      if (nextKind === "physical" && nextComp === "simple") {
        if (updates.stockQuantity !== undefined) {
          setPayload.stockQuantity = updates.stockQuantity ?? 0;
        } else if (existing.stockQuantity === null) {
          setPayload.stockQuantity = 0;
        }
        if (updates.minStockThreshold !== undefined) {
          setPayload.minStockThreshold = updates.minStockThreshold ?? null;
        }
      } else {
        setPayload.stockQuantity = null;
        setPayload.minStockThreshold = null;
        setPayload.lowStockAlertSentAt = null;
      }

      const [updated] = await tx
        .update(cellProducts)
        .set(setPayload)
        .where(
          and(
            eq(cellProducts.id, productId),
            eq(cellProducts.clientId, clientId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .returning();

      if (!updated) return null;

      if (nextComp === "combo" && updates.comboItems !== undefined) {
        await this.upsertBundleItemsTx(tx, clientId, productId, updates.comboItems, actor);
      } else if (nextComp !== "combo") {
        await tx
          .delete(cellProductBundleItems)
          .where(
            and(
              eq(cellProductBundleItems.clientId, clientId),
              eq(cellProductBundleItems.bundleProductId, productId),
            ),
          );
      }

      return updated;
    });
  }

  async deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .update(cellProducts)
        .set({ deletedAt: new Date(), deletedBy: actor, updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(cellProducts.id, productId),
            eq(cellProducts.clientId, clientId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .returning({ id: cellProducts.id });
      return rows.length > 0;
    });
  }

  async listProducts(clientId: string): Promise<CellProduct[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      return tx
        .select()
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .orderBy(desc(cellProducts.createdAt));
    });
  }

  async getProductById(clientId: string, productId: string): Promise<CellProduct | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [row] = await tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.id, productId),
            eq(cellProducts.clientId, clientId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    });
  }

  async getProductsByIds(clientId: string, productIds: string[]): Promise<CellProduct[]> {
    if (productIds.length === 0) return [];
    return this.cellTxRunner(clientId, async (tx) => {
      return tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            inArray(cellProducts.id, productIds),
            isNull(cellProducts.deletedAt),
          ),
        );
    });
  }

  async importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor: string,
  ): Promise<CellProduct[]> {
    if (items.length === 0) return [];
    return this.cellTxRunner(clientId, async (tx) => {
      const inserted: CellProduct[] = [];
      for (const item of items) {
        const [row] = await tx
          .insert(cellProducts)
          .values({
            clientId,
            name: item.name,
            description: item.description,
            costPriceCents: item.costPriceCents ?? 0,
            priceCents: item.priceCents,
            salePriceCents: item.salePriceCents ?? null,
            currency: item.currency ?? "COP",
            sku: item.sku ?? null,
            gtin: item.gtin ?? null,
            brand: item.brand ?? null,
            category: item.category ?? null,
            kind: item.kind ?? "physical",
            compositionType: item.compositionType ?? "simple",
            condition: item.condition ?? "new",
            availability: item.availability ?? "in_stock",
            status: normalizeProductStatus(item.status, "active"),
            attributes: item.attributes ?? [],
            botMasterPrompt: item.botMasterPrompt ?? "",
            prompt: item.botMasterPrompt || null,
            stockQuantity:
              (item.kind ?? "physical") === "physical" &&
              (item.compositionType ?? "simple") === "simple"
                ? (item.stockQuantity ?? 0)
                : null,
            minStockThreshold:
              (item.kind ?? "physical") === "physical" &&
              (item.compositionType ?? "simple") === "simple"
                ? (item.minStockThreshold ?? null)
                : null,
            createdBy: actor,
            updatedBy: actor,
          })
          .returning();
        inserted.push(row);
      }
      return inserted;
    });
  }

  private async attachMediaInsideTx(
    tx: any,
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string; isCover: boolean; sortOrder: number; createdAt: Date }> {
    const existingRows = await tx
      .select({
        id: cellProductMedia.id,
        mediaId: cellProductMedia.mediaId,
        isCover: cellProductMedia.isCover,
        sortOrder: cellProductMedia.sortOrder,
        createdAt: cellProductMedia.createdAt,
      })
      .from(cellProductMedia)
      .where(
        and(
          eq(cellProductMedia.clientId, clientId),
          eq(cellProductMedia.productId, input.productId),
        ),
      );

    const existingSameMedia = existingRows.find(
      (r: { mediaId: string }) => r.mediaId === input.mediaId,
    );
    const hasCover = existingRows.some((r: { isCover: boolean }) => r.isCover);
    const wantsCover =
      input.mediaKind === "image" && (input.isCover === true || !hasCover);

    if (wantsCover) {
      await tx
        .update(cellProductMedia)
        .set({ isCover: false, updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, input.productId),
            eq(cellProductMedia.isCover, true),
          ),
        );
    }

    if (existingSameMedia) {
      if (wantsCover && !existingSameMedia.isCover) {
        await tx
          .update(cellProductMedia)
          .set({ isCover: true, updatedAt: new Date(), updatedBy: actor })
          .where(
            and(
              eq(cellProductMedia.clientId, clientId),
              eq(cellProductMedia.id, existingSameMedia.id),
            ),
          );
      }
      return {
        id: existingSameMedia.id,
        productId: input.productId,
        mediaId: existingSameMedia.mediaId,
        isCover: wantsCover || existingSameMedia.isCover,
        sortOrder: existingSameMedia.sortOrder,
        createdAt: existingSameMedia.createdAt,
      };
    }

    const nextSortOrder =
      existingRows.reduce(
        (max: number, r: { sortOrder: number }) => Math.max(max, r.sortOrder),
        0,
      ) + 1;

    const [link] = await tx
      .insert(cellProductMedia)
      .values({
        clientId,
        productId: input.productId,
        mediaId: input.mediaId,
        mediaKind: input.mediaKind,
        isCover: wantsCover,
        altText: input.altText ?? null,
        sortOrder: nextSortOrder,
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    const [existingClientMedia] = await tx
      .select({ id: cellClientMedia.id })
      .from(cellClientMedia)
      .where(
        and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, input.mediaId)),
      )
      .limit(1);

    if (!existingClientMedia) {
      await tx.insert(cellClientMedia).values({
        clientId,
        mediaId: input.mediaId,
        sizeBytes: input.sizeBytes,
        createdBy: actor,
        updatedBy: actor,
      });

      await tx
        .insert(cellClientUsage)
        .values({
          clientId,
          dimension: "storage_bytes",
          usedValue: input.sizeBytes,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [cellClientUsage.clientId, cellClientUsage.dimension],
          set: {
            usedValue: sql`${cellClientUsage.usedValue} + ${input.sizeBytes}`,
            updatedAt: new Date(),
            updatedBy: actor,
          },
        });
    }

    return {
      id: link.id,
      productId: link.productId,
      mediaId: link.mediaId,
      isCover: link.isCover,
      sortOrder: link.sortOrder,
      createdAt: link.createdAt,
    };
  }

  async attachMedia(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string }> {
    const link = await this.cellTxRunner(clientId, (tx) =>
      this.attachMediaInsideTx(tx, clientId, input, actor),
    );
    return { id: link.id, productId: link.productId, mediaId: link.mediaId };
  }

  async detachMedia(clientId: string, productId: string, mediaId: string): Promise<boolean> {
    const res = await this.deleteProductMediaAndPromote(clientId, productId, mediaId, "system");
    return res.deleted;
  }

  async findActiveBundleParentsForComponent(
    clientId: string,
    componentProductId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .select({
          id: cellProducts.id,
          name: cellProducts.name,
        })
        .from(cellProductBundleItems)
        .innerJoin(
          cellProducts,
          and(
            eq(cellProducts.clientId, cellProductBundleItems.clientId),
            eq(cellProducts.id, cellProductBundleItems.bundleProductId),
          ),
        )
        .where(
          and(
            eq(cellProductBundleItems.clientId, clientId),
            eq(cellProductBundleItems.componentProductId, componentProductId),
            isNull(cellProducts.deletedAt),
          ),
        );
      return rows;
    });
  }

  async replaceBundleItems(
    clientId: string,
    bundleProductId: string,
    items: ProductComboItemInput[],
    actor: string,
  ): Promise<void> {
    await this.cellTxRunner(clientId, (tx) =>
      this.upsertBundleItemsTx(tx, clientId, bundleProductId, items, actor),
    );
  }

  async getBundleItemsForProducts(
    clientId: string,
    bundleProductIds: string[],
  ): Promise<CellProductBundleItem[]> {
    if (bundleProductIds.length === 0) return [];
    return this.cellTxRunner(clientId, async (tx) => {
      return tx
        .select()
        .from(cellProductBundleItems)
        .where(
          and(
            eq(cellProductBundleItems.clientId, clientId),
            inArray(cellProductBundleItems.bundleProductId, bundleProductIds),
          ),
        )
        .orderBy(asc(cellProductBundleItems.sortOrder), asc(cellProductBundleItems.createdAt));
    });
  }

  async getProductMediaDetails(
    clientId: string,
    productIds: string[],
  ): Promise<StoredProductMediaRecord[]> {
    if (productIds.length === 0) return [];

    const cellRows = await this.cellTxRunner(clientId, async (tx) => {
      return tx
        .select()
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            inArray(cellProductMedia.productId, productIds),
          ),
        )
        .orderBy(asc(cellProductMedia.sortOrder), asc(cellProductMedia.createdAt));
    });

    if (cellRows.length === 0) return [];

    const uniqueMediaIds = Array.from(
      new Set<string>(cellRows.map((r: { mediaId: string }) => r.mediaId)),
    );
    const catalogRows = await this.portalDb
      .select({
        id: mediaCatalog.id,
        storageKey: mediaCatalog.storageKey,
        mediaKind: mediaCatalog.mediaKind,
        mimeType: mediaCatalog.mimeType,
        originalFilename: mediaCatalog.originalFilename,
        sizeBytes: mediaCatalog.sizeBytes,
      })
      .from(mediaCatalog)
      .where(inArray(mediaCatalog.id, uniqueMediaIds));

    const catalogById = new Map<string, (typeof catalogRows)[number]>();
    for (const row of catalogRows) {
      catalogById.set(row.id, row);
    }

    return cellRows.map((row: any) => {
      const cat = catalogById.get(row.mediaId);
      return {
        id: row.id,
        clientId: row.clientId,
        productId: row.productId,
        mediaId: row.mediaId,
        mediaKind: (cat?.mediaKind ?? row.mediaKind ?? "image") as MediaKind,
        isCover: Boolean(row.isCover),
        altText: row.altText ?? null,
        sortOrder: Number(row.sortOrder ?? 0),
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
        storageKey: cat?.storageKey ?? "",
        mimeType: cat?.mimeType ?? "application/octet-stream",
        originalFilename: cat?.originalFilename ?? "archivo",
        sizeBytes: Number(cat?.sizeBytes ?? 0),
      };
    });
  }

  async setProductMediaCover(
    clientId: string,
    productId: string,
    mediaId: string,
    actor: string,
  ): Promise<{ status: "ok" } | { status: "not_found" } | { status: "not_image" }> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [target] = await tx
        .select()
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
            or(eq(cellProductMedia.mediaId, mediaId), eq(cellProductMedia.id, mediaId)),
          ),
        )
        .limit(1);

      if (!target) return { status: "not_found" };
      if (target.mediaKind !== "image") return { status: "not_image" };

      await tx
        .update(cellProductMedia)
        .set({ isCover: false, updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
            eq(cellProductMedia.isCover, true),
            ne(cellProductMedia.id, target.id),
          ),
        );

      await tx
        .update(cellProductMedia)
        .set({ isCover: true, updatedAt: new Date(), updatedBy: actor })
        .where(and(eq(cellProductMedia.clientId, clientId), eq(cellProductMedia.id, target.id)));

      return { status: "ok" };
    });
  }

  async deleteProductMediaAndPromote(
    clientId: string,
    productId: string,
    mediaId: string,
    actor: string,
  ): Promise<{
    deleted: boolean;
    promotedCoverMediaId: string | null;
    orphanStorageKeyToDelete: string | null;
  }> {
    const txResult = await this.cellTxRunner(clientId, async (tx) => {
      const [target] = await tx
        .select()
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
            or(eq(cellProductMedia.mediaId, mediaId), eq(cellProductMedia.id, mediaId)),
          ),
        )
        .limit(1);

      if (!target) {
        return {
          deleted: false,
          promotedCoverMediaId: null,
          removedMediaId: null as string | null,
          unlinkedFromClient: false,
        };
      }

      await tx
        .delete(cellProductMedia)
        .where(and(eq(cellProductMedia.clientId, clientId), eq(cellProductMedia.id, target.id)));

      let promotedCoverMediaId: string | null = null;
      if (target.isCover) {
        const [nextImage] = await tx
          .select()
          .from(cellProductMedia)
          .where(
            and(
              eq(cellProductMedia.clientId, clientId),
              eq(cellProductMedia.productId, productId),
              eq(cellProductMedia.mediaKind, "image"),
            ),
          )
          .orderBy(asc(cellProductMedia.sortOrder), asc(cellProductMedia.createdAt))
          .limit(1);

        if (nextImage) {
          await tx
            .update(cellProductMedia)
            .set({ isCover: true, updatedAt: new Date(), updatedBy: actor })
            .where(
              and(eq(cellProductMedia.clientId, clientId), eq(cellProductMedia.id, nextImage.id)),
            );
          promotedCoverMediaId = nextImage.mediaId;
        }
      }

      const [remainingCountRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.mediaId, target.mediaId),
          ),
        );

      let unlinkedFromClient = false;
      if ((remainingCountRow?.count ?? 0) === 0) {
        const [deletedClientMedia] = await tx
          .delete(cellClientMedia)
          .where(
            and(
              eq(cellClientMedia.clientId, clientId),
              eq(cellClientMedia.mediaId, target.mediaId),
            ),
          )
          .returning({ sizeBytes: cellClientMedia.sizeBytes });

        if (deletedClientMedia) {
          unlinkedFromClient = true;
          await tx
            .update(cellClientUsage)
            .set({
              usedValue: sql`GREATEST(0, ${cellClientUsage.usedValue} - ${deletedClientMedia.sizeBytes})`,
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(
              and(
                eq(cellClientUsage.clientId, clientId),
                eq(cellClientUsage.dimension, "storage_bytes"),
              ),
            );
        }
      }

      return {
        deleted: true,
        promotedCoverMediaId,
        removedMediaId: target.mediaId as string,
        unlinkedFromClient,
      };
    });

    if (!txResult.deleted || !txResult.removedMediaId) {
      return { deleted: false, promotedCoverMediaId: null, orphanStorageKeyToDelete: null };
    }

    let orphanStorageKeyToDelete: string | null = null;
    if (txResult.unlinkedFromClient) {
      const stillReferencedInCell = await this.cellTxRunner(clientId, async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(cellClientMedia)
          .where(eq(cellClientMedia.mediaId, txResult.removedMediaId!));
        return (row?.count ?? 0) > 0;
      });

      if (!stillReferencedInCell) {
        const [cat] = await this.portalDb
          .select({ storageKey: mediaCatalog.storageKey })
          .from(mediaCatalog)
          .where(eq(mediaCatalog.id, txResult.removedMediaId))
          .limit(1);

        if (cat?.storageKey && cat.storageKey.startsWith(`tenants/${clientId}/`)) {
          orphanStorageKeyToDelete = cat.storageKey;
          await this.portalDb
            .delete(mediaCatalog)
            .where(eq(mediaCatalog.id, txResult.removedMediaId))
            .catch(() => {});
        }
      }
    }

    return {
      deleted: true,
      promotedCoverMediaId: txResult.promotedCoverMediaId,
      orphanStorageKeyToDelete,
    };
  }

  async uploadAndAttachBinaryMedia(
    clientId: string,
    productId: string,
    params: {
      contentHash: string;
      buffer: Buffer;
      mimeType: string;
      mediaKind: MediaKind;
      ext: string;
      originalFilename: string;
      altText?: string | null;
      setAsCover?: boolean;
    },
    actor: string,
    s3Service: S3StorageService,
  ): Promise<Result<{ mediaRecord: StoredProductMediaRecord }>> {
    const storagePoolId = "seaweedfs-main";

    const [existingGlobal] = await this.portalDb
      .select()
      .from(mediaCatalog)
      .where(
        and(
          eq(mediaCatalog.contentHash, params.contentHash),
          eq(mediaCatalog.storagePoolId, storagePoolId),
        ),
      )
      .limit(1);

    let mediaId = existingGlobal?.id as string | undefined;
    let storageKey = existingGlobal?.storageKey as string | undefined;

    // Verificar antes si este archivo incrementa el almacenamiento del inquilino
    const storageQuota = await this.getPlanQuota(clientId, "storage_bytes");
    if (storageQuota.mode === "LIMITED") {
      const resolvedMediaId = mediaId;
      const alreadyLinked =
        resolvedMediaId !== undefined
          ? await this.cellTxRunner(clientId, async (tx) => {
              const [cm] = await tx
                .select({ id: cellClientMedia.id })
                .from(cellClientMedia)
                .where(
                  and(
                    eq(cellClientMedia.clientId, clientId),
                    eq(cellClientMedia.mediaId, resolvedMediaId),
                  ),
                )
                .limit(1);
              return Boolean(cm);
            })
          : false;

      if (!alreadyLinked) {
        const limit = storageQuota.value ?? 0;
        const used = await this.getTenantStorageUsage(clientId);
        if (limit === 0 || used + params.buffer.byteLength > limit) {
          return err(
            "No hay almacenamiento disponible para completar la carga.",
            "STORAGE_QUOTA_EXCEEDED",
          );
        }
      }
    }

    if (!mediaId || !storageKey) {
      storageKey = `tenants/${clientId}/products/${productId}/${params.contentHash.slice(0, 12)}-${randomUUID()}.${params.ext}`;
      const uploadRes = await s3Service.putObject(storageKey, params.buffer, params.mimeType);
      if (!uploadRes.ok) {
        return err(
          `Error al almacenar archivo multimedia en almacenamiento privado: ${uploadRes.error}`,
          "STORAGE_UNAVAILABLE",
        );
      }

      const [insertedCatalog] = await this.portalDb
        .insert(mediaCatalog)
        .values({
          id: sql`uuidv7()` as any,
          contentHash: params.contentHash,
          storagePoolId,
          storageKey,
          sizeBytes: params.buffer.byteLength,
          mediaKind: params.mediaKind,
          mimeType: params.mimeType,
          sourceFormat: params.ext,
          originalFilename: params.originalFilename,
          processingStatus: "ready",
          storageType: "internal",
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [mediaCatalog.contentHash, mediaCatalog.storagePoolId],
          set: { updatedAt: new Date(), updatedBy: actor },
        })
        .returning();

      mediaId = insertedCatalog?.id;
      storageKey = insertedCatalog?.storageKey ?? storageKey;
    }

    if (!mediaId || !storageKey) {
      return err("No se pudo registrar el metadato del archivo multimedia.", "STORAGE_UNAVAILABLE");
    }

    const link = await this.cellTxRunner(clientId, (tx) =>
      this.attachMediaInsideTx(
        tx,
        clientId,
        {
          productId,
          mediaId: mediaId!,
          mediaKind: params.mediaKind,
          sizeBytes: params.buffer.byteLength,
          altText: params.altText,
          isCover: params.setAsCover,
        },
        actor,
      ),
    );

    return ok({
      mediaRecord: {
        id: link.id,
        clientId,
        productId: link.productId,
        mediaId: link.mediaId,
        mediaKind: params.mediaKind,
        isCover: link.isCover,
        altText: params.altText ?? null,
        sortOrder: link.sortOrder,
        createdAt: link.createdAt,
        storageKey,
        mimeType: params.mimeType,
        originalFilename: params.originalFilename,
        sizeBytes: params.buffer.byteLength,
      },
    });
  }

  async resolveTenantMediaStreamSource(
    clientId: string,
    mediaId: string,
  ): Promise<TenantMediaStreamSource | null> {
    const hasAccess = await this.cellTxRunner(clientId, async (tx) => {
      const [cm] = await tx
        .select({ mediaId: cellClientMedia.mediaId })
        .from(cellClientMedia)
        .where(and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, mediaId)))
        .limit(1);
      if (cm) return true;

      const [pm] = await tx
        .select({ mediaId: cellProductMedia.mediaId })
        .from(cellProductMedia)
        .where(and(eq(cellProductMedia.clientId, clientId), eq(cellProductMedia.mediaId, mediaId)))
        .limit(1);
      return Boolean(pm);
    });

    if (!hasAccess) return null;

    const [cat] = await this.portalDb
      .select({
        id: mediaCatalog.id,
        mediaKind: mediaCatalog.mediaKind,
        mimeType: mediaCatalog.mimeType,
        originalFilename: mediaCatalog.originalFilename,
        sizeBytes: mediaCatalog.sizeBytes,
        storageKey: mediaCatalog.storageKey,
      })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.id, mediaId))
      .limit(1);

    if (!cat) return null;

    return {
      mediaId: cat.id,
      mediaKind: cat.mediaKind as MediaKind,
      mimeType: cat.mimeType,
      originalFilename: cat.originalFilename,
      sizeBytes: Number(cat.sizeBytes),
      storageKey: cat.storageKey,
    };
  }

  async markLowStockAlertSentAtomically(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .update(cellProducts)
        .set({
          lowStockAlertSentAt: new Date(),
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            eq(cellProducts.id, productId),
            isNull(cellProducts.deletedAt),
            isNull(cellProducts.lowStockAlertSentAt),
          ),
        )
        .returning({ id: cellProducts.id });
      return rows.length > 0;
    });
  }

  async resetLowStockAlertFlag(
    clientId: string,
    productId: string,
    actor: string,
  ): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .update(cellProducts)
        .set({
          lowStockAlertSentAt: null,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            eq(cellProducts.id, productId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .returning({ id: cellProducts.id });
      return rows.length > 0;
    });
  }

  async getTenantNotificationRecipient(
    clientId: string,
  ): Promise<TenantNotificationRecipientInfo | null> {
    const [client] = await this.portalDb
      .select({
        displayName: clients.displayName,
        commercialEmail: clients.commercialEmail,
        contactEmail: clients.contactEmail,
        locale: clients.locale,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) return null;
    const recipientEmail = (client.commercialEmail || client.contactEmail || "").trim();
    if (!recipientEmail) return null;

    return {
      businessName: client.displayName || "Mocter Store",
      recipientEmail,
      locale: client.locale === "en" ? "en" : "es",
    };
  }

  async listPromotionsForResolution(clientId: string): Promise<PromotionRecordWithTargets[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      const promos: CellPromotion[] = await tx
        .select()
        .from(cellPromotions)
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.isActive, true),
            isNull(cellPromotions.deletedAt),
          ),
        );

      if (promos.length === 0) return [];

      const promoIds = promos.map((p) => p.id);
      const targets: CellPromotionTarget[] = await tx
        .select()
        .from(cellPromotionTargets)
        .where(
          and(
            eq(cellPromotionTargets.clientId, clientId),
            inArray(cellPromotionTargets.promotionId, promoIds),
          ),
        );

      const targetsByPromo = new Map<string, CellPromotionTarget[]>();
      for (const t of targets) {
        const list = targetsByPromo.get(t.promotionId) ?? [];
        list.push(t);
        targetsByPromo.set(t.promotionId, list);
      }

      return promos.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        scopeType: p.scopeType as PromotionScopeType,
        discountType: p.discountType as PromotionDiscountType,
        discountValue: Number(p.discountValue),
        startsAt: p.startsAt,
        endsAt: p.endsAt ?? null,
        maxDiscountedUnits: p.maxDiscountedUnits ?? null,
        discountedUnitsSold: Number(p.discountedUnitsSold ?? 0),
        isActive: Boolean(p.isActive),
        deletedAt: p.deletedAt ?? null,
        createdAt: p.createdAt,
        targets: (targetsByPromo.get(p.id) ?? []).map((t) => ({
          targetType: t.targetType as "product" | "category",
          productId: t.productId ?? null,
          categoryName: t.categoryName ?? null,
        })),
      }));
    });
  }
}

/**
 * Servicio unificado de gestión del catálogo comercial, combos, stock, portada y multimedia (`SPEC-08`, `T6`, `S3`).
 */
export class TenantProductsAndMediaService {
  private inFlightLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: ITenantProductsRepository = new DrizzleTenantProductsRepository(),
    private readonly s3Service: S3StorageService = new S3StorageService(),
    private readonly notificationsService?: Pick<TransactionalNotificationsAndLeadsService, "enqueueEmail">,
  ) {}

  private async withTenantLock<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
    while (this.inFlightLocks.has(clientId)) {
      await this.inFlightLocks.get(clientId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((r) => {
      resolveLock = r;
    });
    this.inFlightLocks.set(clientId, lockPromise);

    try {
      return await fn();
    } finally {
      this.inFlightLocks.delete(clientId);
      resolveLock();
    }
  }

  private getMediaQuotaConfig(mediaKind: MediaKind): {
    dimension: PlanLimitDimensionKey;
    label: string;
  } {
    switch (mediaKind) {
      case "image":
        return { dimension: "images_per_product", label: "imágenes por producto" };
      case "audio":
        return { dimension: "audios_per_product", label: "pistas de audio por producto" };
      case "video":
        return { dimension: "videos_per_product", label: "videos por producto" };
      case "pdf":
        return { dimension: "pdfs_per_product", label: "archivos PDF por producto" };
    }
  }

  private validateAndNormalizeProductFields(
    input: Partial<TenantProductInput>,
    isCreate: boolean,
  ): Result<{
    normalizedAttributes?: ProductDynamicAttribute[];
    normalizedComboItems?: ProductComboItemInput[];
  }> {
    if (isCreate && (!input.name || input.name.trim().length < 2)) {
      return err("El nombre del producto es obligatorio.", "INVALID_PRODUCT_NAME");
    }
    if (input.name !== undefined && input.name.trim().length < 2) {
      return err("El nombre del producto es obligatorio.", "INVALID_PRODUCT_NAME");
    }
    if (input.priceCents !== undefined && (!Number.isFinite(input.priceCents) || input.priceCents < 0)) {
      return err("El precio de venta no puede ser negativo.", "INVALID_PRICE");
    }
    if (
      input.costPriceCents !== undefined &&
      input.costPriceCents !== null &&
      (!Number.isFinite(input.costPriceCents) || input.costPriceCents < 0)
    ) {
      return err("El precio de costo no puede ser negativo.", "INVALID_COST_PRICE");
    }
    if (
      input.salePriceCents !== undefined &&
      input.salePriceCents !== null &&
      input.priceCents !== undefined &&
      input.salePriceCents >= input.priceCents
    ) {
      return err(
        "El precio promocional debe ser menor al precio regular de venta.",
        "INVALID_SALE_PRICE",
      );
    }
    if (
      input.botMasterPrompt !== undefined &&
      input.botMasterPrompt !== null &&
      input.botMasterPrompt.length > MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS
    ) {
      return err(
        `El prompt maestro no puede superar ${MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS} caracteres.`,
        "BOT_PROMPT_TOO_LONG",
      );
    }
    if (
      input.stockQuantity !== undefined &&
      input.stockQuantity !== null &&
      (!Number.isInteger(input.stockQuantity) || input.stockQuantity < 0)
    ) {
      return err("El stock vigente debe ser un entero mayor o igual a cero.", "INVALID_STOCK");
    }
    if (
      input.minStockThreshold !== undefined &&
      input.minStockThreshold !== null &&
      (!Number.isInteger(input.minStockThreshold) || input.minStockThreshold < 0)
    ) {
      return err(
        "El umbral mínimo de stock debe ser un entero mayor o igual a cero.",
        "INVALID_MIN_STOCK",
      );
    }

    let normalizedAttributes: ProductDynamicAttribute[] | undefined;
    if (input.attributes !== undefined) {
      const attrRes = validateAndNormalizeAttributes(input.attributes);
      if (!attrRes.ok) return attrRes;
      normalizedAttributes = attrRes.data;
    }

    let normalizedComboItems: ProductComboItemInput[] | undefined;
    if (input.comboItems !== undefined) {
      const seen = new Set<string>();
      normalizedComboItems = [];
      for (let i = 0; i < input.comboItems.length; i++) {
        const item = input.comboItems[i]!;
        if (!item.componentProductId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          return err(
            "Cada componente del combo requiere producto válido y cantidad entera positiva.",
            "INVALID_COMBO_ITEM",
          );
        }
        if (seen.has(item.componentProductId)) {
          return err(
            "No puedes agregar dos veces el mismo producto componente en un combo.",
            "DUPLICATE_COMBO_COMPONENT",
          );
        }
        seen.add(item.componentProductId);
        normalizedComboItems.push({
          componentProductId: item.componentProductId,
          quantity: item.quantity,
          sortOrder: item.sortOrder ?? i,
        });
      }
    }

    return ok({ normalizedAttributes, normalizedComboItems });
  }

  private async validateComboConstraints(
    clientId: string,
    targetProductId: string | null,
    compositionType: ProductCompositionType,
    comboItems: ProductComboItemInput[] | undefined,
  ): Promise<Result<true>> {
    if (targetProductId && compositionType === "combo" && this.repo.findActiveBundleParentsForComponent) {
      const parentCombos = await this.repo.findActiveBundleParentsForComponent(
        clientId,
        targetProductId,
      );
      if (parentCombos.length > 0) {
        return err(
          `Este producto pertenece al combo "${parentCombos[0]!.name}" y no puede convertirse en combo para evitar ciclos.`,
          "PRODUCT_USED_IN_COMBO",
        );
      }
    }

    if (compositionType !== "combo") {
      return ok(true);
    }

    if (!comboItems || comboItems.length === 0) {
      return err(
        "Un combo debe incluir al menos un producto componente simple.",
        "COMBO_REQUIRES_COMPONENTS",
      );
    }

    if (targetProductId && comboItems.some((i) => i.componentProductId === targetProductId)) {
      return err(
        "Un combo no puede incluirse a sí mismo como componente.",
        "NESTED_COMBO_NOT_ALLOWED",
      );
    }

    const componentIds = comboItems.map((i) => i.componentProductId);
    const componentRows = await this.repo.getProductsByIds(clientId, componentIds);
    const byId = new Map(componentRows.map((p) => [p.id, p]));

    for (const item of comboItems) {
      const comp = byId.get(item.componentProductId);
      if (!comp) {
        return err(
          "Uno o más productos componentes no existen o no pertenecen a tu comercio.",
          "COMPONENT_NOT_FOUND",
        );
      }
      if (comp.compositionType === "combo") {
        return err(
          `El producto "${comp.name}" es un combo. No se permiten combos anidados.`,
          "NESTED_COMBO_NOT_ALLOWED",
        );
      }
    }

    return ok(true);
  }

  private mapMediaRecordToDto(m: StoredProductMediaRecord): ProductMediaItemDto {
    const urls = resolveProductMediaUrls({
      mediaId: m.mediaId,
      mediaKind: m.mediaKind,
      storageKey: m.storageKey,
    });
    return {
      id: m.id,
      mediaId: m.mediaId,
      mediaKind: m.mediaKind,
      mimeType: m.mimeType,
      originalFilename: m.originalFilename,
      sizeBytes: m.sizeBytes,
      isCover: m.isCover,
      altText: m.altText,
      sortOrder: m.sortOrder,
      url: urls.url,
      thumbUrl: urls.thumbUrl,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private async hydrateProducts(
    clientId: string,
    rows: CellProduct[],
  ): Promise<{
    listItems: ProductListItemDto[];
    mediaByProduct: Map<string, ProductMediaItemDto[]>;
    comboByProduct: Map<string, ProductComboComponentDto[]>;
  }> {
    if (rows.length === 0) {
      return {
        listItems: [],
        mediaByProduct: new Map(),
        comboByProduct: new Map(),
      };
    }

    const productIds = rows.map((r) => r.id);
    const bundleIds = rows
      .filter((r) => r.compositionType === "combo")
      .map((r) => r.id);

    const [allBundleLinks, allProductMedia, activePromotions] = await Promise.all([
      bundleIds.length > 0 && this.repo.getBundleItemsForProducts
        ? this.repo.getBundleItemsForProducts(clientId, bundleIds)
        : Promise.resolve([]),
      this.repo.getProductMediaDetails
        ? this.repo.getProductMediaDetails(clientId, productIds)
        : Promise.resolve([]),
      this.repo.listPromotionsForResolution
        ? this.repo.listPromotionsForResolution(clientId)
        : Promise.resolve([]),
    ]);

    const effectivePromotionsByProduct = resolveEffectivePromotionsForProducts(
      rows.map((r) => ({
        id: r.id,
        category: r.category ?? null,
        priceCents: r.priceCents,
      })),
      activePromotions,
    );

    const componentProductIds = Array.from(
      new Set(allBundleLinks.map((b) => b.componentProductId)),
    );
    const [componentRows, componentMedia] = await Promise.all([
      componentProductIds.length > 0
        ? this.repo.getProductsByIds(clientId, componentProductIds)
        : Promise.resolve([]),
      componentProductIds.length > 0 && this.repo.getProductMediaDetails
        ? this.repo.getProductMediaDetails(clientId, componentProductIds)
        : Promise.resolve([]),
    ]);

    const componentProductMap = new Map(componentRows.map((c) => [c.id, c]));
    const componentCoverMap = new Map<string, string>();
    for (const cm of componentMedia) {
      if (cm.mediaKind !== "image") continue;
      if (cm.isCover || !componentCoverMap.has(cm.productId)) {
        const { thumbUrl, url } = resolveProductMediaUrls({
          mediaId: cm.mediaId,
          mediaKind: "image",
          storageKey: cm.storageKey,
        });
        componentCoverMap.set(cm.productId, thumbUrl ?? url);
      }
    }

    const comboByProduct = new Map<string, ProductComboComponentDto[]>();
    for (const link of allBundleLinks) {
      const comp = componentProductMap.get(link.componentProductId);
      if (!comp) continue;
      const arr = comboByProduct.get(link.bundleProductId) ?? [];
      arr.push({
        componentProductId: comp.id,
        name: comp.name,
        sku: comp.sku ?? null,
        kind: comp.kind as ProductKind,
        status: normalizeProductStatus(comp.status, "active"),
        priceCents: comp.priceCents,
        costPriceCents: comp.costPriceCents ?? 0,
        stockQuantity: comp.stockQuantity ?? null,
        quantity: link.quantity,
        sortOrder: link.sortOrder,
        coverImageUrl: componentCoverMap.get(comp.id) ?? null,
      });
      comboByProduct.set(link.bundleProductId, arr);
    }

    const mediaByProduct = new Map<string, ProductMediaItemDto[]>();
    for (const m of allProductMedia) {
      const arr = mediaByProduct.get(m.productId) ?? [];
      arr.push(this.mapMediaRecordToDto(m));
      mediaByProduct.set(m.productId, arr);
    }

    const listItems: ProductListItemDto[] = rows.map((p) => {
      const kind = (p.kind || "physical") as ProductKind;
      const compositionType = (p.compositionType || "simple") as ProductCompositionType;
      const status = normalizeProductStatus(p.status, "active");
      const comboComponents = comboByProduct.get(p.id) ?? [];
      const mediaItems = mediaByProduct.get(p.id) ?? [];
      const imageItems = mediaItems.filter((m) => m.mediaKind === "image");
      const coverItem = imageItems.find((m) => m.isCover) ?? imageItems[0] ?? null;

      const mediaCounts: ProductMediaCountsDto = {
        image: imageItems.length,
        video: mediaItems.filter((m) => m.mediaKind === "video").length,
        audio: mediaItems.filter((m) => m.mediaKind === "audio").length,
        pdf: mediaItems.filter((m) => m.mediaKind === "pdf").length,
      };

      const activePromotion: AppliedProductPromotionDto | null =
        effectivePromotionsByProduct.get(p.id) ?? null;
      const effectiveSalePriceCents = activePromotion
        ? activePromotion.effectivePriceCents
        : (p.salePriceCents ?? null);

      const metrics = evaluateProductStockAndMargin({
        kind,
        compositionType,
        status,
        costPriceCents: p.costPriceCents ?? 0,
        priceCents: p.priceCents,
        salePriceCents: effectiveSalePriceCents,
        stockQuantity: p.stockQuantity ?? null,
        minStockThreshold: p.minStockThreshold ?? null,
        comboComponents,
      });

      const attributes = normalizeStoredAttributes(p.attributes);

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        sku: p.sku ?? null,
        category: p.category ?? null,
        brand: p.brand ?? null,
        kind,
        compositionType,
        condition: (p.condition || "new") as ProductCondition,
        availability: (p.availability || "in_stock") as ProductAvailability,
        status,
        currency: p.currency || "COP",
        costPriceCents: p.costPriceCents ?? 0,
        priceCents: p.priceCents,
        salePriceCents: effectiveSalePriceCents,
        activePromotion,
        profitability: metrics.profitability,
        stockQuantity:
          kind === "physical" && compositionType === "simple" ? (p.stockQuantity ?? 0) : null,
        minStockThreshold:
          kind === "physical" && compositionType === "simple"
            ? (p.minStockThreshold ?? null)
            : null,
        effectiveStock: metrics.effectiveStock,
        isLowStock: metrics.isLowStock,
        hasInactiveComboComponent: metrics.hasInactiveComboComponent,
        coverImageUrl: coverItem ? (coverItem.thumbUrl ?? coverItem.url) : null,
        mediaUrls: imageItems.map((i) => i.thumbUrl ?? i.url),
        mediaCounts,
        attributesCount: attributes.length,
        comboComponentsCount: comboComponents.length,
        sourceShareId: p.sourceShareId ?? null,
        sourceVersion: p.sourceVersion ?? null,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      };
    });

    return { listItems, mediaByProduct, comboByProduct };
  }

  /**
   * Crea un producto simple o combo verificando atómicamente la cuota `products` y reglas de negocio (`SPEC-08`, `CA-005`).
   */
  async createProduct(
    clientId: string,
    input: TenantProductInput,
    actor = "system",
  ): Promise<Result<CellProduct>> {
    const validated = this.validateAndNormalizeProductFields(input, true);
    if (!validated.ok) return validated;

    const nextComposition = input.compositionType ?? "simple";
    const comboCheck = await this.validateComboConstraints(
      clientId,
      null,
      nextComposition,
      validated.data.normalizedComboItems,
    );
    if (!comboCheck.ok) return comboCheck;

    const normalizedInput: TenantProductInput = {
      ...input,
      ...(validated.data.normalizedAttributes !== undefined
        ? { attributes: validated.data.normalizedAttributes }
        : {}),
      ...(validated.data.normalizedComboItems !== undefined
        ? { comboItems: validated.data.normalizedComboItems }
        : {}),
    };

    return this.withTenantLock(clientId, async () => {
      const quota = await this.repo.getPlanQuota(clientId, "products");

      if (quota.mode === "LIMITED") {
        const limit = quota.value ?? 0;
        const currentCount = await this.repo.countActiveProducts(clientId);

        if (limit === 0 || currentCount + 1 > limit) {
          return err(
            "Has alcanzado el límite de productos incluido en tu plan.",
            "QUOTA_EXCEEDED_PRODUCTS",
          );
        }
      }

      const product = await this.repo.createProduct(clientId, normalizedInput, actor);
      appLogger.info("tenant.product.created", {
        clientId,
        productId: product.id,
        compositionType: product.compositionType,
        kind: product.kind,
      });
      return ok(product);
    });
  }

  /**
   * Importa productos en lote consumiendo atómicamente la cuota `products` (`CA-005`).
   */
  async importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor = "system",
  ): Promise<Result<{ importedCount: number; products: CellProduct[] }>> {
    if (items.length === 0) {
      return ok({ importedCount: 0, products: [] });
    }

    for (const item of items) {
      const v = this.validateAndNormalizeProductFields(item, true);
      if (!v.ok) return v;
    }

    return this.withTenantLock(clientId, async () => {
      const quota = await this.repo.getPlanQuota(clientId, "products");

      if (quota.mode === "LIMITED") {
        const limit = quota.value ?? 0;
        const currentCount = await this.repo.countActiveProducts(clientId);

        if (limit === 0 || currentCount + items.length > limit) {
          return err(
            "Has alcanzado el límite de productos incluido en tu plan.",
            "QUOTA_EXCEEDED_PRODUCTS",
          );
        }
      }

      const products = await this.repo.importProducts(clientId, items, actor);
      return ok({ importedCount: products.length, products });
    });
  }

  /**
   * Actualiza un producto existente validando márgenes, atributos, combos y reglas de inventario (`SPEC-08`).
   */
  async updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor = "system",
  ): Promise<Result<CellProduct>> {
    const existing = await this.repo.getProductById(clientId, productId);
    if (!existing) {
      return err("Producto no encontrado o ya eliminado.", "PRODUCT_NOT_FOUND");
    }

    const effectivePrice = updates.priceCents ?? existing.priceCents;
    const effectiveSalePrice =
      updates.salePriceCents !== undefined ? updates.salePriceCents : existing.salePriceCents;

    const validated = this.validateAndNormalizeProductFields(
      {
        ...updates,
        priceCents: effectivePrice,
        salePriceCents: effectiveSalePrice,
      },
      false,
    );
    if (!validated.ok) return validated;

    const nextComposition =
      updates.compositionType ?? (existing.compositionType as ProductCompositionType);
    let comboItemsToCheck = validated.data.normalizedComboItems;
    if (
      nextComposition === "combo" &&
      comboItemsToCheck === undefined &&
      this.repo.getBundleItemsForProducts
    ) {
      const currentLinks = await this.repo.getBundleItemsForProducts(clientId, [productId]);
      comboItemsToCheck = currentLinks.map((l) => ({
        componentProductId: l.componentProductId,
        quantity: l.quantity,
        sortOrder: l.sortOrder,
      }));
    }

    const comboCheck = await this.validateComboConstraints(
      clientId,
      productId,
      nextComposition,
      comboItemsToCheck,
    );
    if (!comboCheck.ok) return comboCheck;

    const updated = await this.repo.updateProduct(
      clientId,
      productId,
      {
        ...updates,
        ...(validated.data.normalizedAttributes !== undefined
          ? { attributes: validated.data.normalizedAttributes }
          : {}),
        ...(validated.data.normalizedComboItems !== undefined
          ? { comboItems: validated.data.normalizedComboItems }
          : {}),
      },
      actor,
    );

    if (!updated) {
      return err("Producto no encontrado o ya eliminado.", "PRODUCT_NOT_FOUND");
    }
    return ok(updated);
  }

  /**
   * Cambia explícitamente el estado operativo del producto (`active`, `inactive`, `draft`) (`SPEC-08 §9.3`).
   */
  async updateProductStatus(
    clientId: string,
    productId: string,
    status: LegacyAwareProductStatus,
    actor = "system",
  ): Promise<Result<ProductDetailDto>> {
    const normalized = normalizeProductStatus(status, "active");
    const updatedRes = await this.updateProduct(clientId, productId, { status: normalized }, actor);
    if (!updatedRes.ok) return updatedRes;

    appLogger.info("tenant.product.status_changed", {
      clientId,
      productId,
      status: normalized,
      actor,
    });

    return this.getProductDetail(clientId, productId);
  }

  /**
   * Elimina lógicamente un producto impidiendo la operación si pertenece a un combo activo (`RN-SPEC-08-05`).
   */
  async deleteProduct(
    clientId: string,
    productId: string,
    actor = "system",
  ): Promise<Result<{ deleted: boolean }>> {
    if (this.repo.findActiveBundleParentsForComponent) {
      const parents = await this.repo.findActiveBundleParentsForComponent(clientId, productId);
      if (parents.length > 0) {
        const comboNames = parents.map((c) => `"${c.name}"`).join(", ");
        return err(
          `No es posible eliminar el producto porque forma parte de combo(s) activos: ${comboNames}. Retíralo del combo o inactívalo primero.`,
          "PRODUCT_USED_IN_COMBO",
        );
      }
    }

    const deleted = await this.repo.deleteProduct(clientId, productId, actor);
    if (!deleted) {
      return err("Producto no encontrado o ya eliminado.", "PRODUCT_NOT_FOUND");
    }
    return ok({ deleted: true });
  }

  /**
   * Lista paginada, filtrada y ordenable del catálogo según contrato estándar `SPEC-17` y `SPEC-08 §9.1`.
   */
  async listCatalog(
    clientId: string,
    filter: ListCatalogFilter = {},
  ): Promise<Result<CatalogListResultDto>> {
    const rawRows = await this.repo.listProducts(clientId);
    const { listItems } = await this.hydrateProducts(clientId, rawRows);

    const summary = {
      totalActive: listItems.filter((p) => p.status === "active").length,
      lowStockCount: listItems.filter((p) => p.isLowStock).length,
      comboCount: listItems.filter((p) => p.compositionType === "combo").length,
    };

    const q = filter.q?.trim().toLowerCase() ?? "";
    const filtered = listItems.filter((item) => {
      if (filter.status && filter.status !== "all" && item.status !== filter.status) {
        return false;
      }
      if (filter.kind && filter.kind !== "all" && item.kind !== filter.kind) {
        return false;
      }
      if (
        filter.compositionType &&
        filter.compositionType !== "all" &&
        item.compositionType !== filter.compositionType
      ) {
        return false;
      }
      if (filter.lowStock === true && !item.isLowStock) {
        return false;
      }
      if (q) {
        const haystack = [item.name, item.sku ?? "", item.category ?? "", item.brand ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sortBy = filter.sortBy ?? "createdAt";
    const sortDir = filter.sortDir === "asc" ? 1 : -1;

    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === "priceCents") {
        cmp = a.priceCents - b.priceCents;
      } else if (sortBy === "stock") {
        const aStock = a.effectiveStock ?? Number.MAX_SAFE_INTEGER;
        const bStock = b.effectiveStock ?? Number.MAX_SAFE_INTEGER;
        cmp = aStock - bStock;
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return cmp * sortDir;
    });

    const limit = Math.min(50, Math.max(1, filter.limit ?? 20));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(totalPages, Math.max(1, filter.page ?? 1));
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return ok({
      items,
      pagination: { page, limit, total, totalPages },
      summary,
    });
  }

  /**
   * Obtiene la ficha integral de un producto (medios agrupados con `isCover`, combo, atributos, márgenes y prompt maestro).
   */
  async getProductDetail(clientId: string, productId: string): Promise<Result<ProductDetailDto>> {
    const row = await this.repo.getProductById(clientId, productId);
    if (!row) {
      return err("Producto no encontrado.", "PRODUCT_NOT_FOUND");
    }

    const { listItems, mediaByProduct, comboByProduct } = await this.hydrateProducts(clientId, [
      row,
    ]);
    const summaryItem = listItems[0]!;
    const mediaItems = mediaByProduct.get(row.id) ?? [];
    const comboComponents = comboByProduct.get(row.id) ?? [];
    const derived =
      summaryItem.compositionType === "combo"
        ? evaluateProductStockAndMargin({
            kind: summaryItem.kind,
            compositionType: "combo",
            status: summaryItem.status,
            costPriceCents: summaryItem.costPriceCents,
            priceCents: summaryItem.priceCents,
            salePriceCents: summaryItem.salePriceCents,
            stockQuantity: null,
            minStockThreshold: null,
            comboComponents,
          })
        : null;

    return ok({
      ...summaryItem,
      botMasterPrompt: row.botMasterPrompt || row.prompt || "",
      attributes: normalizeStoredAttributes(row.attributes),
      comboComponents,
      suggestedComboCostCents: derived?.suggestedComboCostCents ?? null,
      lowStockAlertSentAt: row.lowStockAlertSentAt
        ? new Date(row.lowStockAlertSentAt).toISOString()
        : null,
      media: {
        images: mediaItems.filter((m) => m.mediaKind === "image"),
        videos: mediaItems.filter((m) => m.mediaKind === "video"),
        audios: mediaItems.filter((m) => m.mediaKind === "audio"),
        pdfs: mediaItems.filter((m) => m.mediaKind === "pdf"),
      },
    });
  }

  /**
   * Valida magic bytes, peso máximo y cuotas por tipo (`images/videos/audios/pdfs_per_product` + `storage_bytes`),
   * persiste el binario en SeaweedFS y lo vincula al producto con soporte automático/explícito de `is_cover` (`SPEC-08`, `SPEC-03`).
   */
  async uploadAndAttachProductMedia(
    clientId: string,
    productId: string,
    file: {
      buffer: Buffer;
      mimeType?: string;
      originalFilename: string;
    },
    actor = "system",
    options: { altText?: string | null; setAsCover?: boolean } = {},
  ): Promise<Result<ProductMediaItemDto>> {
    const magic = validateMediaMagicBytes(file.buffer);
    if (!magic.valid || !magic.mediaKind || !magic.detectedMime || !magic.ext) {
      return err(magic.error || "Formato de archivo inválido.", "VALIDATION");
    }

    const mediaKind = magic.mediaKind;
    const maxBytes = MAX_UPLOAD_BYTES_BY_KIND[mediaKind];
    if (file.buffer.byteLength > maxBytes) {
      return err(
        `El archivo supera el tamaño máximo permitido de ${Math.round(maxBytes / (1024 * 1024))} MB para ${mediaKind}.`,
        "VALIDATION",
      );
    }

    const contentHash = createHash("sha256").update(file.buffer).digest("hex");

    return this.withTenantLock(clientId, async () => {
      const product = await this.repo.getProductById(clientId, productId);
      if (!product) {
        return err("El producto indicado no existe o no pertenece al comercio.", "PRODUCT_NOT_FOUND");
      }

      const { dimension, label } = this.getMediaQuotaConfig(mediaKind);
      const kindQuota = await this.repo.getPlanQuota(clientId, dimension);
      if (kindQuota.mode === "LIMITED") {
        const limit = kindQuota.value ?? 0;
        const currentFiles = await this.repo.countProductMediaByKind(
          clientId,
          productId,
          mediaKind,
        );
        if (limit === 0 || currentFiles + 1 > limit) {
          return err(
            `Has alcanzado el límite de ${label} incluido en tu plan.`,
            `QUOTA_EXCEEDED_${dimension.toUpperCase()}`,
          );
        }
      }

      if (!this.repo.uploadAndAttachBinaryMedia) {
        return err("Repositorio no soporta carga binaria directa.", "STORAGE_UNAVAILABLE");
      }

      const storedRes = await this.repo.uploadAndAttachBinaryMedia(
        clientId,
        productId,
        {
          contentHash,
          buffer: file.buffer,
          mimeType: magic.detectedMime!,
          mediaKind,
          ext: magic.ext!,
          originalFilename: file.originalFilename,
          altText: options.altText,
          setAsCover: options.setAsCover,
        },
        actor,
        this.s3Service,
      );

      if (!storedRes.ok) return storedRes;

      return ok(this.mapMediaRecordToDto(storedRes.data.mediaRecord));
    });
  }

  /**
   * Asocia un mediaId ya existente a un producto verificando cuota por tipo y almacenamiento (`CA-004`, `CA-006`, `SPEC-03`).
   */
  async attachMediaToProduct(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor = "system",
  ): Promise<Result<{ id: string; productId: string; mediaId: string }>> {
    return this.withTenantLock(clientId, async () => {
      const { dimension, label } = this.getMediaQuotaConfig(input.mediaKind);

      const fileQuota = await this.repo.getPlanQuota(clientId, dimension);
      if (fileQuota.mode === "LIMITED") {
        const fileLimit = fileQuota.value ?? 0;
        const currentFiles = await this.repo.countProductMediaByKind(
          clientId,
          input.productId,
          input.mediaKind,
        );

        if (fileLimit === 0 || currentFiles + 1 > fileLimit) {
          return err(
            `Has alcanzado el límite de ${label} incluido en tu plan.`,
            `QUOTA_EXCEEDED_${dimension.toUpperCase()}`,
          );
        }
      }

      const storageQuota = await this.repo.getPlanQuota(clientId, "storage_bytes");
      if (storageQuota.mode === "LIMITED") {
        const storageLimit = storageQuota.value ?? 0;
        const currentStorage = await this.repo.getTenantStorageUsage(clientId);

        if (storageLimit === 0 || currentStorage + input.sizeBytes > storageLimit) {
          return err(
            "No hay almacenamiento disponible para completar la carga.",
            "STORAGE_QUOTA_EXCEEDED",
          );
        }
      }

      const link = await this.repo.attachMedia(clientId, input, actor);
      return ok(link);
    });
  }

  /**
   * Establece una imagen del producto como portada principal (`is_cover = true`), rechazando audio/video/PDF (`SPEC-08 §9.4`).
   */
  async setProductMediaCover(
    clientId: string,
    productId: string,
    mediaId: string,
    actor = "system",
  ): Promise<Result<{ productId: string; coverMediaId: string }>> {
    const product = await this.repo.getProductById(clientId, productId);
    if (!product) {
      return err("Producto no encontrado.", "PRODUCT_NOT_FOUND");
    }

    if (!this.repo.setProductMediaCover) {
      return err("Operación de portada no soportada por el repositorio.", "VALIDATION");
    }

    const res = await this.repo.setProductMediaCover(clientId, productId, mediaId, actor);
    if (res.status === "not_found") {
      return err("Archivo multimedia no vinculado a este producto.", "MEDIA_LINK_NOT_FOUND");
    }
    if (res.status === "not_image") {
      return err(
        "Únicamente las imágenes pueden definirse como portada principal del producto.",
        "INVALID_COVER_MEDIA_KIND",
      );
    }

    return ok({ productId, coverMediaId: mediaId });
  }

  /**
   * Elimina el archivo de un producto, libera cuota/almacenamiento, limpia S3 si quedó huérfano y promueve portada si corresponde.
   */
  async deleteProductMedia(
    clientId: string,
    productId: string,
    mediaId: string,
    actor = "system",
  ): Promise<Result<{ deleted: boolean; promotedCoverMediaId: string | null }>> {
    if (!this.repo.deleteProductMediaAndPromote) {
      const detached = await this.repo.detachMedia(clientId, productId, mediaId);
      if (!detached) {
        return err("Vínculo de archivo no encontrado.", "MEDIA_LINK_NOT_FOUND");
      }
      return ok({ deleted: true, promotedCoverMediaId: null });
    }

    const res = await this.repo.deleteProductMediaAndPromote(clientId, productId, mediaId, actor);
    if (!res.deleted) {
      return err("Vínculo de archivo no encontrado.", "MEDIA_LINK_NOT_FOUND");
    }

    if (res.orphanStorageKeyToDelete) {
      const s3Del = await this.s3Service.deleteObject(res.orphanStorageKeyToDelete);
      if (!s3Del.ok) {
        appLogger.warn(
          "[TenantProductsAndMediaService.deleteProductMedia] Limpieza diferida en SeaweedFS falló",
          {
            clientId,
            productId,
            mediaId,
            storageKey: res.orphanStorageKeyToDelete,
            error: s3Del.error,
          },
        );
      }
    }

    return ok({
      deleted: true,
      promotedCoverMediaId: res.promotedCoverMediaId,
    });
  }

  /**
   * Wrapper compatible para desvincular archivo de producto (`SPEC-03`).
   */
  async detachMediaFromProduct(
    clientId: string,
    productId: string,
    mediaId: string,
  ): Promise<Result<{ detached: boolean }>> {
    const res = await this.deleteProductMedia(clientId, productId, mediaId, "system");
    if (!res.ok) return res;
    return ok({ detached: true });
  }

  /**
   * Resuelve metadatos de streaming autenticado para `GET /api/tenant/media/[mediaId]` (`D-04`).
   */
  async resolveTenantMediaStreamSource(
    clientId: string,
    mediaId: string,
  ): Promise<Result<TenantMediaStreamSource>> {
    if (!this.repo.resolveTenantMediaStreamSource) {
      return err("Streaming privado no soportado por el repositorio.", "NOT_FOUND");
    }
    const source = await this.repo.resolveTenantMediaStreamSource(clientId, mediaId);
    if (!source) {
      return err("Archivo multimedia no encontrado para este comercio.", "MEDIA_NOT_FOUND");
    }
    return ok(source);
  }

  /**
   * Evalúa si una mutación de stock requiere emitir alerta `tenant.inventory.low_stock` o rearmar el ciclo (`D-05`).
   *
   * Nunca lanza excepciones hacia la ruta solicitante; provee callback `dispatch` para ejecutar vía `after()`.
   */
  async evaluateLowStockAfterStockMutation(
    clientId: string,
    productId: string,
    actor = "system",
  ): Promise<Result<LowStockEvaluationResult>> {
    const product = await this.repo.getProductById(clientId, productId);
    if (!product) {
      return err("Producto no encontrado.", "PRODUCT_NOT_FOUND");
    }

    if (product.kind !== "physical" || product.compositionType !== "simple") {
      return ok({ triggered: false, reason: "NON_PHYSICAL_OR_COMBO" });
    }

    const threshold = product.minStockThreshold ?? 0;
    const stock = product.stockQuantity ?? 0;

    // Reponer por encima del umbral rearma futuras alertas en un nuevo ciclo
    if (threshold > 0 && stock > threshold && product.lowStockAlertSentAt) {
      if (this.repo.resetLowStockAlertFlag) {
        await this.repo.resetLowStockAlertFlag(clientId, productId, actor);
      }
      return ok({ triggered: false, reset: true, reason: "RESTOCKED_ABOVE_THRESHOLD" });
    }

    if (
      product.status !== "active" ||
      threshold <= 0 ||
      stock > threshold ||
      product.lowStockAlertSentAt !== null
    ) {
      return ok({ triggered: false, reason: "NO_TRANSITION" });
    }

    const marked = this.repo.markLowStockAlertSentAtomically
      ? await this.repo.markLowStockAlertSentAtomically(clientId, productId, actor)
      : true;

    if (!marked) {
      return ok({ triggered: false, reason: "ALREADY_ALERTED" });
    }

    const recipientInfo = this.repo.getTenantNotificationRecipient
      ? await this.repo.getTenantNotificationRecipient(clientId)
      : null;

    if (!recipientInfo) {
      appLogger.warn("tenant.product.low_stock_no_recipient", {
        clientId,
        productId,
        stock,
        threshold,
      });
      return ok({ triggered: false, reason: "NO_RECIPIENT_EMAIL" });
    }

    const productAdminUrl = buildAdminPortalUrl("/workspace/products");
    const idempotencyKey = `low-stock:${clientId}:${productId}:${Date.now()}`;

    const dispatch = async (): Promise<void> => {
      try {
        const variables = {
          business_name: recipientInfo.businessName,
          product_name: product.name,
          sku: product.sku || "N/A",
          current_stock: String(stock),
          min_threshold: String(threshold),
          product_admin_url: productAdminUrl,
        };

        if (this.notificationsService) {
          const res = this.notificationsService.enqueueEmail({
            eventKey: "tenant.inventory.low_stock",
            recipient: recipientInfo.recipientEmail,
            locale: recipientInfo.locale,
            variables,
            idempotencyKey,
          });

          appLogger.info("tenant.product.low_stock_triggered", {
            clientId,
            productId,
            currentStock: stock,
            minThreshold: threshold,
            dispatched: res.ok,
          });
          return;
        }

        const isEn = recipientInfo.locale === "en";
        const dispatchRes = await getNotificationDispatcherService().dispatchTenantNotification({
          clientId,
          eventKey: "tenant.inventory.low_stock",
          locale: recipientInfo.locale,
          variables,
          idempotencyKey,
          actorUserId: actor,
          inAppPayload: {
            title: isEn
              ? `Low stock: ${product.name}`
              : `Stock mínimo alcanzado: ${product.name}`,
            body: isEn
              ? `${product.name} (${product.sku || "N/A"}) reached ${stock} units (minimum: ${threshold}).`
              : `${product.name} (${product.sku || "N/A"}) quedó en ${stock} unidades (mínimo configurado: ${threshold}).`,
            severity: "warning",
            actionUrl: `/workspace/products?highlight=${encodeURIComponent(product.id)}`,
          },
        });

        appLogger.info("tenant.product.low_stock_triggered", {
          clientId,
          productId,
          currentStock: stock,
          minThreshold: threshold,
          dispatched: dispatchRes.ok ? dispatchRes.data.dispatched : false,
        });
      } catch (dispatchError) {
        appLogger.error(
          "[TenantProductsAndMediaService.evaluateLowStockAfterStockMutation] Fallo no fatal enviando alerta",
          dispatchError,
          { clientId, productId },
        );
      }
    };

    return ok({ triggered: true, dispatch });
  }

  /**
   * Lista cruda heredada para callers internos existentes (`TenantProductsAndMediaService` tests).
   */
  async listProducts(clientId: string): Promise<Result<CellProduct[]>> {
    const list = await this.repo.listProducts(clientId);
    return ok(list);
  }

  /**
   * Consulta cruda de producto heredada (`CellProduct`).
   */
  async getProductById(clientId: string, productId: string): Promise<Result<CellProduct>> {
    const product = await this.repo.getProductById(clientId, productId);
    if (!product) {
      return err("Producto no encontrado.", "PRODUCT_NOT_FOUND");
    }
    return ok(product);
  }
}

let defaultTenantProductsAndMediaService: TenantProductsAndMediaService | null = null;

/**
 * Retorna la instancia singleton de autoridad del catálogo comercial (`SPEC-08`).
 */
export function getTenantProductsAndMediaService(): TenantProductsAndMediaService {
  if (!defaultTenantProductsAndMediaService) {
    defaultTenantProductsAndMediaService = new TenantProductsAndMediaService();
  }
  return defaultTenantProductsAndMediaService;
}
