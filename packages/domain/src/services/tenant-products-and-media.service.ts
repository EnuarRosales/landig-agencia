import { eq, and, sql, isNull, desc } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planLimits, type PlanLimitDimensionKey } from "../db/schemas/admin/plan-catalogs";
import { clientPlanOverrides } from "../db/schemas/admin/plan-catalogs";
import {
  cellProducts,
  cellProductMedia,
  cellClientMedia,
  cellClientUsage,
  type CellProduct,
  type NewCellProduct,
} from "../db/schemas/tenant/tenancy-catalog";

export type MediaKind = "image" | "video" | "pdf";

export interface TenantProductInput {
  name: string;
  description: string;
  priceCents: number;
  currency?: string;
  sku?: string | null;
  gtin?: string | null;
  brand?: string | null;
  category?: string | null;
  kind?: "physical" | "digital" | "service";
  condition?: "new" | "refurbished" | "used";
  availability?: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  status?: "draft" | "published" | "archived";
}

export interface ProductMediaAttachmentInput {
  productId: string;
  mediaId: string;
  mediaKind: MediaKind;
  sizeBytes: number;
  altText?: string | null;
}

export interface ITenantProductsRepository {
  getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;
  countActiveProducts(clientId: string): Promise<number>;
  countProductMediaByKind(clientId: string, productId: string, kind: MediaKind): Promise<number>;
  getTenantStorageUsage(clientId: string): Promise<number>;
  createProduct(clientId: string, input: TenantProductInput, actor: string): Promise<CellProduct>;
  updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor: string,
  ): Promise<CellProduct | null>;
  deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean>;
  listProducts(clientId: string): Promise<CellProduct[]>;
  getProductById(clientId: string, productId: string): Promise<CellProduct | null>;
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
}

/**
 * Repositorio en memoria para pruebas unitarias sin base de datos activa.
 */
export class InMemoryTenantProductsRepository implements ITenantProductsRepository {
  public quotas = new Map<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }>();
  public products = new Map<string, CellProduct>();
  public productMedia = new Map<
    string,
    { id: string; clientId: string; productId: string; mediaId: string; kind: MediaKind; sizeBytes: number }
  >();
  public storageUsage = new Map<string, number>();

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const key = `${clientId}:${dimension}`;
    return this.quotas.get(key) ?? { mode: "UNLIMITED", value: null };
  }

  async countActiveProducts(clientId: string): Promise<number> {
    let count = 0;
    for (const p of this.products.values()) {
      if (p.clientId === clientId && !p.deletedAt) {
        count += 1;
      }
    }
    return count;
  }

  async countProductMediaByKind(clientId: string, productId: string, kind: MediaKind): Promise<number> {
    let count = 0;
    for (const m of this.productMedia.values()) {
      if (m.clientId === clientId && m.productId === productId && m.kind === kind) {
        count += 1;
      }
    }
    return count;
  }

  async getTenantStorageUsage(clientId: string): Promise<number> {
    return this.storageUsage.get(clientId) ?? 0;
  }

  async createProduct(clientId: string, input: TenantProductInput, actor: string): Promise<CellProduct> {
    const id = `019a0000-0000-7000-8005-${String(this.products.size + 1).padStart(12, "0")}`;
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
      kind: input.kind ?? "physical",
      condition: input.condition ?? "new",
      availability: input.availability ?? "in_stock",
      status: input.status ?? "draft",
      sortOrder: 0,
      priceCents: input.priceCents,
      salePriceCents: null,
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
      attributes: {},
      prompt: null,
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
    const updated: CellProduct = {
      ...p,
      ...updates,
      updatedAt: new Date(),
      updatedBy: actor,
    };
    this.products.set(productId, updated);
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
      if (p.clientId === clientId && !p.deletedAt) {
        list.push(p);
      }
    }
    return list;
  }

  async getProductById(clientId: string, productId: string): Promise<CellProduct | null> {
    const p = this.products.get(productId);
    if (!p || p.clientId !== clientId || p.deletedAt) return null;
    return p;
  }

  async importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor: string,
  ): Promise<CellProduct[]> {
    const res: CellProduct[] = [];
    for (const item of items) {
      const p = await this.createProduct(clientId, item, actor);
      res.push(p);
    }
    return res;
  }

  async attachMedia(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string }> {
    const id = `019a0000-0000-7000-8006-${String(this.productMedia.size + 1).padStart(12, "0")}`;
    this.productMedia.set(id, {
      id,
      clientId,
      productId: input.productId,
      mediaId: input.mediaId,
      kind: input.mediaKind,
      sizeBytes: input.sizeBytes,
    });
    const current = this.storageUsage.get(clientId) ?? 0;
    this.storageUsage.set(clientId, current + input.sizeBytes);
    return { id, productId: input.productId, mediaId: input.mediaId };
  }

  async detachMedia(clientId: string, productId: string, mediaId: string): Promise<boolean> {
    for (const [id, m] of this.productMedia.entries()) {
      if (m.clientId === clientId && m.productId === productId && m.mediaId === mediaId) {
        this.productMedia.delete(id);
        const current = this.storageUsage.get(clientId) ?? 0;
        this.storageUsage.set(clientId, Math.max(0, current - m.sizeBytes));
        return true;
      }
    }
    return false;
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
 * Repositorio Drizzle ORM sobre PostgreSQL.
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
    // 1. Revisar overrides vigentes del inquilino
    const now = new Date();
    const [override] = await this.portalDb
      .select()
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          eq(clientPlanOverrides.dimension, dimension),
          sql`${clientPlanOverrides.validFrom} <= ${now}`,
          sql`(${clientPlanOverrides.validTo} IS NULL OR ${clientPlanOverrides.validTo} > ${now})`,
        ),
      )
      .limit(1);

    if (override) {
      return { mode: "LIMITED", value: override.value };
    }

    // 2. Consultar plan asignado al cliente
    const [client] = await this.portalDb
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      return { mode: "UNLIMITED", value: null };
    }

    const [limitRow] = await this.portalDb
      .select()
      .from(planLimits)
      .where(and(eq(planLimits.planId, client.planId), eq(planLimits.dimension, dimension)))
      .limit(1);

    if (!limitRow) {
      return { mode: "UNLIMITED", value: null };
    }

    return {
      mode: limitRow.limitMode as "LIMITED" | "UNLIMITED",
      value: limitRow.limitMode === "UNLIMITED" ? null : (limitRow.value ?? 0),
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
    return this.cellTxRunner(clientId, async (tx) => {
      const [res] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
          ),
        );
      return res?.count ?? 0;
    });
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

  async createProduct(clientId: string, input: TenantProductInput, actor: string): Promise<CellProduct> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [created] = await tx
        .insert(cellProducts)
        .values({
          clientId,
          name: input.name,
          description: input.description,
          priceCents: input.priceCents,
          currency: input.currency ?? "COP",
          sku: input.sku ?? null,
          gtin: input.gtin ?? null,
          brand: input.brand ?? null,
          category: input.category ?? null,
          kind: input.kind ?? "physical",
          condition: input.condition ?? "new",
          availability: input.availability ?? "in_stock",
          status: input.status ?? "draft",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
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
      const [updated] = await tx
        .update(cellProducts)
        .set({
          ...updates,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellProducts.id, productId), eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .returning();
      return updated ?? null;
    });
  }

  async deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .update(cellProducts)
        .set({
          deletedAt: new Date(),
          deletedBy: actor,
        })
        .where(and(eq(cellProducts.id, productId), eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
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
      const [product] = await tx
        .select()
        .from(cellProducts)
        .where(and(eq(cellProducts.id, productId), eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .limit(1);
      return product ?? null;
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
            priceCents: item.priceCents,
            currency: item.currency ?? "COP",
            sku: item.sku ?? null,
            gtin: item.gtin ?? null,
            brand: item.brand ?? null,
            category: item.category ?? null,
            kind: item.kind ?? "physical",
            condition: item.condition ?? "new",
            availability: item.availability ?? "in_stock",
            status: item.status ?? "draft",
            createdBy: actor,
            updatedBy: actor,
          })
          .returning();
        inserted.push(row);
      }
      return inserted;
    });
  }

  async attachMedia(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor: string,
  ): Promise<{ id: string; productId: string; mediaId: string }> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [link] = await tx
        .insert(cellProductMedia)
        .values({
          clientId,
          productId: input.productId,
          mediaId: input.mediaId,
          altText: input.altText ?? null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      // Actualizar uso de almacenamiento atómicamente
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

      return { id: link.id, productId: link.productId, mediaId: link.mediaId };
    });
  }

  async detachMedia(clientId: string, productId: string, mediaId: string): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const deleted = await tx
        .delete(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            eq(cellProductMedia.productId, productId),
            eq(cellProductMedia.mediaId, mediaId),
          ),
        )
        .returning();
      return deleted.length > 0;
    });
  }
}

/**
 * Servicio de gestión de productos, archivos y cuotas de inquilinos con enforcement atómico (T6, S3, S7, S10).
 */
export class TenantProductsAndMediaService {
  private inFlightLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly repo: ITenantProductsRepository) {}

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

  /**
   * Crea un producto manual verificando atómicamente la cuota `products` (CA-005, RN-006).
   */
  async createProduct(
    clientId: string,
    input: TenantProductInput,
    actor = "system",
  ): Promise<Result<CellProduct>> {
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

      const product = await this.repo.createProduct(clientId, input, actor);
      return ok(product);
    });
  }

  /**
   * Importa productos en lote consumiendo la misma cuota compartida `products` (CA-005).
   * La validación es atómica: si el lote supera la cuota restante, se rechaza completo.
   */
  async importProducts(
    clientId: string,
    items: TenantProductInput[],
    actor = "system",
  ): Promise<Result<{ importedCount: number; products: CellProduct[] }>> {
    if (items.length === 0) {
      return ok({ importedCount: 0, products: [] });
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
   * Actualiza un producto existente. No consume cupo adicional (S3).
   */
  async updateProduct(
    clientId: string,
    productId: string,
    updates: Partial<TenantProductInput>,
    actor = "system",
  ): Promise<Result<CellProduct>> {
    const updated = await this.repo.updateProduct(clientId, productId, updates, actor);
    if (!updated) {
      return err("Producto no encontrado o ya eliminado.", "PRODUCT_NOT_FOUND");
    }
    return ok(updated);
  }

  /**
   * Elimina un producto liberando su cuota (S3).
   */
  async deleteProduct(
    clientId: string,
    productId: string,
    actor = "system",
  ): Promise<Result<{ deleted: boolean }>> {
    const deleted = await this.repo.deleteProduct(clientId, productId, actor);
    if (!deleted) {
      return err("Producto no encontrado o ya eliminado.", "PRODUCT_NOT_FOUND");
    }
    return ok({ deleted: true });
  }

  /**
   * Asocia un archivo a un producto verificando tanto la cuota del tipo de archivo
   * (`images_per_product`, `videos_per_product`, `pdfs_per_product`) como el
   * almacenamiento global `storage_bytes` (CA-004, CA-006, S10).
   */
  async attachMediaToProduct(
    clientId: string,
    input: ProductMediaAttachmentInput,
    actor = "system",
  ): Promise<Result<{ id: string; productId: string; mediaId: string }>> {
    return this.withTenantLock(clientId, async () => {
      // 1. Determinar dimensión del tipo de archivo
      let fileDimension: PlanLimitDimensionKey;
      let resourceLabel: string;
      if (input.mediaKind === "image") {
        fileDimension = "images_per_product";
        resourceLabel = "imágenes por producto";
      } else if (input.mediaKind === "video") {
        fileDimension = "videos_per_product";
        resourceLabel = "videos por producto";
      } else {
        fileDimension = "pdfs_per_product";
        resourceLabel = "archivos PDF por producto";
      }

      // 2. Validar cuota por producto
      const fileQuota = await this.repo.getPlanQuota(clientId, fileDimension);
      if (fileQuota.mode === "LIMITED") {
        const fileLimit = fileQuota.value ?? 0;
        const currentFiles = await this.repo.countProductMediaByKind(
          clientId,
          input.productId,
          input.mediaKind,
        );

        if (fileLimit === 0 || currentFiles + 1 > fileLimit) {
          return err(
            `Has alcanzado el límite de ${resourceLabel} incluido en tu plan.`,
            `QUOTA_EXCEEDED_${fileDimension.toUpperCase()}`,
          );
        }
      }

      // 3. Validar almacenamiento global
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

      // 4. Confirmar asociación y consumo
      const link = await this.repo.attachMedia(clientId, input, actor);
      return ok(link);
    });
  }

  /**
   * Desvincula un archivo de un producto y libera almacenamiento.
   */
  async detachMediaFromProduct(
    clientId: string,
    productId: string,
    mediaId: string,
  ): Promise<Result<{ detached: boolean }>> {
    const detached = await this.repo.detachMedia(clientId, productId, mediaId);
    if (!detached) {
      return err("Vínculo de archivo no encontrado.", "MEDIA_LINK_NOT_FOUND");
    }
    return ok({ detached: true });
  }

  async listProducts(clientId: string): Promise<Result<CellProduct[]>> {
    const list = await this.repo.listProducts(clientId);
    return ok(list);
  }

  async getProductById(clientId: string, productId: string): Promise<Result<CellProduct>> {
    const product = await this.repo.getProductById(clientId, productId);
    if (!product) {
      return err("Producto no encontrado.", "PRODUCT_NOT_FOUND");
    }
    return ok(product);
  }
}
