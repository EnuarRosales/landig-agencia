import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { withTenantCellTransaction } from "../db/cell-client";
import { cellProducts } from "../db/schemas/tenant/tenancy-catalog";
import {
  cellPromotions,
  cellPromotionTargets,
  PROMOTION_DISCOUNT_TYPE_LIST,
  PROMOTION_SCOPE_TYPE_LIST,
  type CellPromotion,
  type CellPromotionTarget,
  type PromotionDiscountType,
  type PromotionLifecycleStatus,
  type PromotionScopeType,
} from "../db/schemas/tenant/promotions";
import {
  derivePromotionLifecycleStatus,
  normalizePromotionCategory,
  resolveEffectivePromotionsForProducts,
  simulatePromotionImpact,
  type PromotionCandidateProduct,
  type PromotionImpactSummaryDto,
  type PromotionRecordWithTargets,
  type PromotionTargetRef,
} from "./promotion-resolution";

/**
 * Entrada de creación o actualización de una campaña promocional (`SPEC-18 §9.1`).
 */
export interface UpsertPromotionInput {
  name: string;
  description?: string | null;
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  maxDiscountedUnits?: number | null;
  isActive?: boolean;
  productIds?: string[];
  categories?: string[];
}

/**
 * Filtros y paginación para el listado de la Central de Promociones (`SPEC-18 §9.1`).
 */
export interface ListPromotionsFilter {
  q?: string;
  status?: PromotionLifecycleStatus | "all";
  scopeType?: PromotionScopeType | "all";
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "startsAt" | "endsAt" | "name" | "discountedUnitsSold";
  sortDir?: "asc" | "desc";
}

/**
 * Resumen de métricas KPI de la Central de Promociones (`SPEC-18 §9.1`, `§9.2`).
 */
export interface PromotionListSummaryDto {
  activeCount: number;
  scheduledCount: number;
  pausedCount: number;
  expiredOrDepletedCount: number;
  productsOnOfferTodayCount: number;
}

/**
 * Fila enriquecida de promoción para la tabla/tarjetas de `/workspace/promotions`.
 */
export interface PromotionListItemDto {
  id: string;
  name: string;
  description: string | null;
  scopeType: PromotionScopeType;
  discountType: PromotionDiscountType;
  discountValue: number;
  startsAt: string;
  endsAt: string | null;
  maxDiscountedUnits: number | null;
  discountedUnitsSold: number;
  remainingUnits: number | null;
  isActive: boolean;
  lifecycleStatus: PromotionLifecycleStatus;
  productIds: string[];
  categories: string[];
  targetsCount: number;
  matchedProductsCount: number;
  applicableProductsCount: number;
  excludedProductsCount: number;
  lossProductsCount: number;
  tightMarginProductsCount: number;
  minMarginPct: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detalle completo de una promoción incluyendo simulación producto por producto (`GET /api/tenant/promotions/[id]`).
 */
export interface PromotionDetailDto extends PromotionListItemDto {
  simulation: PromotionImpactSummaryDto;
}

/**
 * Respuesta paginada estándar del listado de promociones (`SPEC-18 §9.1`, `SPEC-17`).
 */
export interface PromotionListResultDto {
  items: PromotionListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: PromotionListSummaryDto;
}

/**
 * Registro persistido de promoción junto con sus objetivos.
 */
export interface StoredPromotionAggregate {
  promotion: CellPromotion;
  targets: CellPromotionTarget[];
}

/**
 * Contrato de persistencia celular para promociones comerciales (`SPEC-18`).
 */
export interface ITenantPromotionsRepository {
  listPromotions(clientId: string): Promise<StoredPromotionAggregate[]>;
  getPromotionById(clientId: string, promotionId: string): Promise<StoredPromotionAggregate | null>;
  listCatalogProductsForSimulation(clientId: string): Promise<PromotionCandidateProduct[]>;
  getProductsByIds(clientId: string, productIds: string[]): Promise<PromotionCandidateProduct[]>;
  createPromotion(
    clientId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate>;
  updatePromotion(
    clientId: string,
    promotionId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate | null>;
  setPromotionActive(
    clientId: string,
    promotionId: string,
    isActive: boolean,
    actor: string,
  ): Promise<StoredPromotionAggregate | null>;
  softDeletePromotion(clientId: string, promotionId: string, actor: string): Promise<boolean>;
}

/**
 * Implementación Drizzle sobre el Cell Data Plane (`pg-cell-XX`, `admin.promotions` + `admin.promotion_targets`).
 */
export class DrizzleTenantPromotionsRepository implements ITenantPromotionsRepository {
  constructor(private readonly cellTxRunner = withTenantCellTransaction) {}

  async listPromotions(clientId: string): Promise<StoredPromotionAggregate[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      const promos = await tx
        .select()
        .from(cellPromotions)
        .where(and(eq(cellPromotions.clientId, clientId), isNull(cellPromotions.deletedAt)))
        .orderBy(desc(cellPromotions.createdAt));

      if (promos.length === 0) return [];

      const promoIds = promos.map((p) => p.id);
      const targets = await tx
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

      return promos.map((promotion) => ({
        promotion,
        targets: targetsByPromo.get(promotion.id) ?? [],
      }));
    });
  }

  async getPromotionById(
    clientId: string,
    promotionId: string,
  ): Promise<StoredPromotionAggregate | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [promotion] = await tx
        .select()
        .from(cellPromotions)
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.id, promotionId),
            isNull(cellPromotions.deletedAt),
          ),
        )
        .limit(1);

      if (!promotion) return null;

      const targets = await tx
        .select()
        .from(cellPromotionTargets)
        .where(
          and(
            eq(cellPromotionTargets.clientId, clientId),
            eq(cellPromotionTargets.promotionId, promotionId),
          ),
        );

      return { promotion, targets };
    });
  }

  async listCatalogProductsForSimulation(clientId: string): Promise<PromotionCandidateProduct[]> {
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .select({
          id: cellProducts.id,
          name: cellProducts.name,
          sku: cellProducts.sku,
          category: cellProducts.category,
          priceCents: cellProducts.priceCents,
          costPriceCents: cellProducts.costPriceCents,
          status: cellProducts.status,
        })
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku ?? null,
        category: r.category ?? null,
        priceCents: Number(r.priceCents),
        costPriceCents: Number(r.costPriceCents ?? 0),
        status: r.status === "published" ? "active" : r.status === "archived" ? "inactive" : r.status,
      }));
    });
  }

  async getProductsByIds(
    clientId: string,
    productIds: string[],
  ): Promise<PromotionCandidateProduct[]> {
    if (productIds.length === 0) return [];
    return this.cellTxRunner(clientId, async (tx) => {
      const rows = await tx
        .select({
          id: cellProducts.id,
          name: cellProducts.name,
          sku: cellProducts.sku,
          category: cellProducts.category,
          priceCents: cellProducts.priceCents,
          costPriceCents: cellProducts.costPriceCents,
          status: cellProducts.status,
        })
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            inArray(cellProducts.id, productIds),
            isNull(cellProducts.deletedAt),
          ),
        );

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku ?? null,
        category: r.category ?? null,
        priceCents: Number(r.priceCents),
        costPriceCents: Number(r.costPriceCents ?? 0),
        status: r.status === "published" ? "active" : r.status === "archived" ? "inactive" : r.status,
      }));
    });
  }

  async createPromotion(
    clientId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [created] = await tx
        .insert(cellPromotions)
        .values({
          clientId,
          name: payload.name,
          description: payload.description,
          scopeType: payload.scopeType,
          discountType: payload.discountType,
          discountValue: payload.discountValue,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          maxDiscountedUnits: payload.maxDiscountedUnits,
          discountedUnitsSold: 0,
          isActive: payload.isActive,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      if (!created) {
        throw new Error("No fue posible crear la promoción comercial en la celda.");
      }

      let insertedTargets: CellPromotionTarget[] = [];
      if (payload.targets.length > 0) {
        insertedTargets = await tx
          .insert(cellPromotionTargets)
          .values(
            payload.targets.map((t) => ({
              clientId,
              promotionId: created.id,
              targetType: t.targetType,
              productId: t.targetType === "product" ? t.productId : null,
              categoryName: t.targetType === "category" ? t.categoryName : null,
              createdBy: actor,
              updatedBy: actor,
            })),
          )
          .returning();
      }

      return { promotion: created, targets: insertedTargets };
    });
  }

  async updatePromotion(
    clientId: string,
    promotionId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [updated] = await tx
        .update(cellPromotions)
        .set({
          name: payload.name,
          description: payload.description,
          scopeType: payload.scopeType,
          discountType: payload.discountType,
          discountValue: payload.discountValue,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          maxDiscountedUnits: payload.maxDiscountedUnits,
          isActive: payload.isActive,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.id, promotionId),
            isNull(cellPromotions.deletedAt),
          ),
        )
        .returning();

      if (!updated) return null;

      await tx
        .delete(cellPromotionTargets)
        .where(
          and(
            eq(cellPromotionTargets.clientId, clientId),
            eq(cellPromotionTargets.promotionId, promotionId),
          ),
        );

      let insertedTargets: CellPromotionTarget[] = [];
      if (payload.targets.length > 0) {
        insertedTargets = await tx
          .insert(cellPromotionTargets)
          .values(
            payload.targets.map((t) => ({
              clientId,
              promotionId,
              targetType: t.targetType,
              productId: t.targetType === "product" ? t.productId : null,
              categoryName: t.targetType === "category" ? t.categoryName : null,
              createdBy: actor,
              updatedBy: actor,
            })),
          )
          .returning();
      }

      return { promotion: updated, targets: insertedTargets };
    });
  }

  async setPromotionActive(
    clientId: string,
    promotionId: string,
    isActive: boolean,
    actor: string,
  ): Promise<StoredPromotionAggregate | null> {
    return this.cellTxRunner(clientId, async (tx) => {
      const [updated] = await tx
        .update(cellPromotions)
        .set({
          isActive,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.id, promotionId),
            isNull(cellPromotions.deletedAt),
          ),
        )
        .returning();

      if (!updated) return null;

      const targets = await tx
        .select()
        .from(cellPromotionTargets)
        .where(
          and(
            eq(cellPromotionTargets.clientId, clientId),
            eq(cellPromotionTargets.promotionId, promotionId),
          ),
        );

      return { promotion: updated, targets };
    });
  }

  async softDeletePromotion(
    clientId: string,
    promotionId: string,
    actor: string,
  ): Promise<boolean> {
    return this.cellTxRunner(clientId, async (tx) => {
      const now = new Date();
      const [deleted] = await tx
        .update(cellPromotions)
        .set({
          isActive: false,
          deletedAt: now,
          deletedBy: actor,
          updatedAt: now,
          updatedBy: actor,
        })
        .where(
          and(
            eq(cellPromotions.clientId, clientId),
            eq(cellPromotions.id, promotionId),
            isNull(cellPromotions.deletedAt),
          ),
        )
        .returning({ id: cellPromotions.id });

      return Boolean(deleted);
    });
  }
}

/**
 * Repositorio en memoria para pruebas unitarias determinísticas de `TenantPromotionsService`.
 */
export class InMemoryTenantPromotionsRepository implements ITenantPromotionsRepository {
  public readonly promotions = new Map<string, CellPromotion>();
  public readonly targets = new Map<string, CellPromotionTarget[]>();
  public readonly catalogByClient = new Map<string, PromotionCandidateProduct[]>();

  seedCatalog(clientId: string, products: PromotionCandidateProduct[]): void {
    this.catalogByClient.set(clientId, [...products]);
  }

  async listPromotions(clientId: string): Promise<StoredPromotionAggregate[]> {
    return Array.from(this.promotions.values())
      .filter((p) => p.clientId === clientId && p.deletedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((promotion) => ({
        promotion,
        targets: [...(this.targets.get(promotion.id) ?? [])],
      }));
  }

  async getPromotionById(
    clientId: string,
    promotionId: string,
  ): Promise<StoredPromotionAggregate | null> {
    const promotion = this.promotions.get(promotionId);
    if (!promotion || promotion.clientId !== clientId || promotion.deletedAt !== null) {
      return null;
    }
    return {
      promotion,
      targets: [...(this.targets.get(promotion.id) ?? [])],
    };
  }

  async listCatalogProductsForSimulation(clientId: string): Promise<PromotionCandidateProduct[]> {
    return [...(this.catalogByClient.get(clientId) ?? [])];
  }

  async getProductsByIds(
    clientId: string,
    productIds: string[],
  ): Promise<PromotionCandidateProduct[]> {
    const idSet = new Set(productIds);
    return (this.catalogByClient.get(clientId) ?? []).filter((p) => idSet.has(p.id));
  }

  async createPromotion(
    clientId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate> {
    const now = new Date();
    const id = randomUUID();
    const promotion: CellPromotion = {
      id,
      clientId,
      name: payload.name,
      description: payload.description,
      scopeType: payload.scopeType,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      maxDiscountedUnits: payload.maxDiscountedUnits,
      discountedUnitsSold: 0,
      isActive: payload.isActive,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };
    this.promotions.set(id, promotion);

    const targetRows: CellPromotionTarget[] = payload.targets.map((t) => ({
      id: randomUUID(),
      clientId,
      promotionId: id,
      targetType: t.targetType,
      productId: t.targetType === "product" ? t.productId : null,
      categoryName: t.targetType === "category" ? t.categoryName : null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    }));
    this.targets.set(id, targetRows);

    return { promotion, targets: [...targetRows] };
  }

  async updatePromotion(
    clientId: string,
    promotionId: string,
    payload: {
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    },
    actor: string,
  ): Promise<StoredPromotionAggregate | null> {
    const existing = this.promotions.get(promotionId);
    if (!existing || existing.clientId !== clientId || existing.deletedAt !== null) {
      return null;
    }
    const now = new Date();
    const updated: CellPromotion = {
      ...existing,
      name: payload.name,
      description: payload.description,
      scopeType: payload.scopeType,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      maxDiscountedUnits: payload.maxDiscountedUnits,
      isActive: payload.isActive,
      updatedAt: now,
      updatedBy: actor,
    };
    this.promotions.set(promotionId, updated);

    const targetRows: CellPromotionTarget[] = payload.targets.map((t) => ({
      id: randomUUID(),
      clientId,
      promotionId,
      targetType: t.targetType,
      productId: t.targetType === "product" ? t.productId : null,
      categoryName: t.targetType === "category" ? t.categoryName : null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    }));
    this.targets.set(promotionId, targetRows);

    return { promotion: updated, targets: [...targetRows] };
  }

  async setPromotionActive(
    clientId: string,
    promotionId: string,
    isActive: boolean,
    actor: string,
  ): Promise<StoredPromotionAggregate | null> {
    const existing = this.promotions.get(promotionId);
    if (!existing || existing.clientId !== clientId || existing.deletedAt !== null) {
      return null;
    }
    const updated: CellPromotion = {
      ...existing,
      isActive,
      updatedAt: new Date(),
      updatedBy: actor,
    };
    this.promotions.set(promotionId, updated);
    return { promotion: updated, targets: [...(this.targets.get(promotionId) ?? [])] };
  }

  async softDeletePromotion(
    clientId: string,
    promotionId: string,
    actor: string,
  ): Promise<boolean> {
    const existing = this.promotions.get(promotionId);
    if (!existing || existing.clientId !== clientId || existing.deletedAt !== null) {
      return false;
    }
    const now = new Date();
    this.promotions.set(promotionId, {
      ...existing,
      isActive: false,
      deletedAt: now,
      deletedBy: actor,
      updatedAt: now,
      updatedBy: actor,
    });
    return true;
  }
}

function isOwnerOrPlatformRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase();
  return (
    normalized === "tenant_owner" ||
    normalized === "tenancy_owner" ||
    normalized === "platform_owner" ||
    normalized === "platform_admin"
  );
}

function parseDateValue(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPromotionRecordWithTargets(agg: StoredPromotionAggregate): PromotionRecordWithTargets {
  return {
    id: agg.promotion.id,
    name: agg.promotion.name,
    description: agg.promotion.description ?? null,
    scopeType: agg.promotion.scopeType as PromotionScopeType,
    discountType: agg.promotion.discountType as PromotionDiscountType,
    discountValue: Number(agg.promotion.discountValue),
    startsAt: agg.promotion.startsAt,
    endsAt: agg.promotion.endsAt ?? null,
    maxDiscountedUnits: agg.promotion.maxDiscountedUnits ?? null,
    discountedUnitsSold: Number(agg.promotion.discountedUnitsSold ?? 0),
    isActive: Boolean(agg.promotion.isActive),
    deletedAt: agg.promotion.deletedAt ?? null,
    createdAt: agg.promotion.createdAt,
    targets: agg.targets.map((t) => ({
      targetType: t.targetType as "product" | "category",
      productId: t.productId ?? null,
      categoryName: t.categoryName ?? null,
    })),
  };
}

/**
 * Servicio de dominio para la Central de Promociones y Descuentos Comerciales Automáticos (`SPEC-18`).
 */
export class TenantPromotionsService {
  constructor(private readonly repo: ITenantPromotionsRepository) {}

  private buildPromotionItemDto(
    agg: StoredPromotionAggregate,
    catalogProducts: readonly PromotionCandidateProduct[],
    now: Date,
  ): { item: PromotionListItemDto; simulation: PromotionImpactSummaryDto } {
    const record = toPromotionRecordWithTargets(agg);
    const lifecycleStatus = derivePromotionLifecycleStatus(record, now);
    const productIds = agg.targets
      .filter((t) => t.targetType === "product" && t.productId)
      .map((t) => t.productId!);
    const categories = agg.targets
      .filter((t) => t.targetType === "category" && t.categoryName)
      .map((t) => t.categoryName!);

    const simulation = simulatePromotionImpact(
      {
        scopeType: record.scopeType,
        discountType: record.discountType,
        discountValue: record.discountValue,
        productIds,
        categories,
      },
      catalogProducts,
    );

    const remainingUnits =
      record.maxDiscountedUnits !== null
        ? Math.max(0, record.maxDiscountedUnits - record.discountedUnitsSold)
        : null;

    const item: PromotionListItemDto = {
      id: agg.promotion.id,
      name: agg.promotion.name,
      description: agg.promotion.description ?? null,
      scopeType: record.scopeType,
      discountType: record.discountType,
      discountValue: record.discountValue,
      startsAt: new Date(agg.promotion.startsAt).toISOString(),
      endsAt: agg.promotion.endsAt ? new Date(agg.promotion.endsAt).toISOString() : null,
      maxDiscountedUnits: record.maxDiscountedUnits,
      discountedUnitsSold: record.discountedUnitsSold,
      remainingUnits,
      isActive: record.isActive,
      lifecycleStatus,
      productIds,
      categories,
      targetsCount:
        record.scopeType === "all_catalog"
          ? simulation.matchedProductsCount
          : agg.targets.length,
      matchedProductsCount: simulation.matchedProductsCount,
      applicableProductsCount: simulation.applicableProductsCount,
      excludedProductsCount: simulation.excludedProductsCount,
      lossProductsCount: simulation.lossProductsCount,
      tightMarginProductsCount: simulation.tightMarginProductsCount,
      minMarginPct: simulation.minMarginPct,
      createdAt: new Date(agg.promotion.createdAt).toISOString(),
      updatedAt: new Date(agg.promotion.updatedAt).toISOString(),
    };

    return { item, simulation };
  }

  private async validateAndNormalizeInput(
    clientId: string,
    input: UpsertPromotionInput,
  ): Promise<
    Result<{
      name: string;
      description: string | null;
      scopeType: PromotionScopeType;
      discountType: PromotionDiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date | null;
      maxDiscountedUnits: number | null;
      isActive: boolean;
      targets: PromotionTargetRef[];
    }>
  > {
    const name = input.name?.trim() ?? "";
    if (name.length < 2 || name.length > 140) {
      return err(
        "El nombre de la promoción debe tener entre 2 y 140 caracteres.",
        "PROMOTION_NAME_INVALID",
      );
    }

    if (!PROMOTION_SCOPE_TYPE_LIST.includes(input.scopeType)) {
      return err("El alcance de la promoción no es válido.", "PROMOTION_SCOPE_INVALID");
    }

    if (!PROMOTION_DISCOUNT_TYPE_LIST.includes(input.discountType)) {
      return err("El tipo de descuento no es válido.", "PROMOTION_DISCOUNT_TYPE_INVALID");
    }

    const discountValue = Math.round(Number(input.discountValue));
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return err(
        "El valor del descuento debe ser un número entero estrictamente mayor que cero.",
        "PROMOTION_DISCOUNT_VALUE_INVALID",
      );
    }

    if (input.discountType === "percentage" && (discountValue < 1 || discountValue > 95)) {
      return err(
        "El porcentaje de descuento debe estar entre 1% y 95%.",
        "PROMOTION_PERCENTAGE_OUT_OF_RANGE",
      );
    }

    // RN-SPEC-18-03: fixed_price solo aplica sobre scope product
    if (input.discountType === "fixed_price" && input.scopeType !== "product") {
      return err(
        "El tipo 'Precio Promocional Fijo' solo se permite cuando el alcance es por producto o combo exacto.",
        "PROMOTION_FIXED_PRICE_REQUIRES_PRODUCT_SCOPE",
      );
    }

    const startsAt = parseDateValue(input.startsAt);
    if (!startsAt) {
      return err("La fecha y hora de inicio (startsAt) es obligatoria y debe ser válida.", "PROMOTION_STARTS_AT_INVALID");
    }

    let endsAt: Date | null = null;
    if (input.endsAt !== undefined && input.endsAt !== null && input.endsAt !== "") {
      endsAt = parseDateValue(input.endsAt);
      if (!endsAt) {
        return err("La fecha y hora de finalización (endsAt) no es válida.", "PROMOTION_ENDS_AT_INVALID");
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        return err(
          "La fecha y hora de finalización debe ser estrictamente posterior a la fecha de inicio.",
          "PROMOTION_WINDOW_INVALID",
        );
      }
    }

    let maxDiscountedUnits: number | null = null;
    if (input.maxDiscountedUnits !== undefined && input.maxDiscountedUnits !== null) {
      const parsedUnits = Math.round(Number(input.maxDiscountedUnits));
      if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
        return err(
          "El cupo máximo de unidades promocionales debe ser un entero mayor a cero.",
          "PROMOTION_MAX_UNITS_INVALID",
        );
      }
      maxDiscountedUnits = parsedUnits;
    }

    const targets: PromotionTargetRef[] = [];

    if (input.scopeType === "product") {
      const uniqueProductIds = Array.from(
        new Set((input.productIds ?? []).map((id) => id.trim()).filter(Boolean)),
      );
      if (uniqueProductIds.length === 0) {
        return err(
          "Debes seleccionar al menos un producto o combo para este alcance.",
          "PROMOTION_TARGETS_REQUIRED",
        );
      }
      const existingProducts = await this.repo.getProductsByIds(clientId, uniqueProductIds);
      if (existingProducts.length !== uniqueProductIds.length) {
        return err(
          "Uno o más productos seleccionados no existen o no pertenecen a tu catálogo.",
          "PROMOTION_TARGET_PRODUCT_NOT_FOUND",
        );
      }

      if (input.discountType === "fixed_price") {
        const invalidProducts = existingProducts.filter((p) => discountValue >= p.priceCents);
        if (invalidProducts.length > 0) {
          return err(
            `El precio promocional fijo debe ser estrictamente menor al precio regular de todos los productos seleccionados (${invalidProducts.map((p) => p.name).join(", ")}).`,
            "PROMOTION_FIXED_PRICE_NOT_LOWER",
          );
        }
      }

      for (const productId of uniqueProductIds) {
        targets.push({ targetType: "product", productId, categoryName: null });
      }
    } else if (input.scopeType === "category") {
      const seenNormalized = new Set<string>();
      const cleanCategories: string[] = [];
      for (const raw of input.categories ?? []) {
        const trimmed = raw.trim().replace(/\s+/g, " ");
        const norm = normalizePromotionCategory(trimmed);
        if (!norm || seenNormalized.has(norm)) continue;
        seenNormalized.add(norm);
        cleanCategories.push(trimmed.slice(0, 120));
      }
      if (cleanCategories.length === 0) {
        return err(
          "Debes seleccionar al menos una categoría para este alcance.",
          "PROMOTION_TARGETS_REQUIRED",
        );
      }
      for (const categoryName of cleanCategories) {
        targets.push({ targetType: "category", productId: null, categoryName });
      }
    }

    const description =
      typeof input.description === "string" && input.description.trim().length > 0
        ? input.description.trim()
        : null;

    return ok({
      name,
      description,
      scopeType: input.scopeType,
      discountType: input.discountType,
      discountValue,
      startsAt,
      endsAt,
      maxDiscountedUnits,
      isActive: input.isActive ?? true,
      targets,
    });
  }

  /**
   * Lista las promociones del inquilino con filtros, paginación y métricas KPI (`SPEC-18 §9.1`).
   */
  async listPromotions(
    clientId: string,
    filter: ListPromotionsFilter = {},
    now: Date = new Date(),
  ): Promise<Result<PromotionListResultDto>> {
    const [aggregates, catalogProducts] = await Promise.all([
      this.repo.listPromotions(clientId),
      this.repo.listCatalogProductsForSimulation(clientId),
    ]);

    const activeCatalogProducts = catalogProducts.filter((p) => !p.status || p.status === "active");
    const recordsForResolution = aggregates.map(toPromotionRecordWithTargets);
    const activePromotionsByProduct = resolveEffectivePromotionsForProducts(
      activeCatalogProducts,
      recordsForResolution,
      now,
    );

    const allItems = aggregates.map((agg) =>
      this.buildPromotionItemDto(agg, catalogProducts, now).item,
    );

    const summary: PromotionListSummaryDto = {
      activeCount: allItems.filter((p) => p.lifecycleStatus === "active").length,
      scheduledCount: allItems.filter((p) => p.lifecycleStatus === "scheduled").length,
      pausedCount: allItems.filter((p) => p.lifecycleStatus === "paused").length,
      expiredOrDepletedCount: allItems.filter(
        (p) => p.lifecycleStatus === "expired" || p.lifecycleStatus === "depleted",
      ).length,
      productsOnOfferTodayCount: activePromotionsByProduct.size,
    };

    const q = filter.q?.trim().toLowerCase() ?? "";
    const filtered = allItems.filter((item) => {
      if (filter.status && filter.status !== "all" && item.lifecycleStatus !== filter.status) {
        return false;
      }
      if (filter.scopeType && filter.scopeType !== "all" && item.scopeType !== filter.scopeType) {
        return false;
      }
      if (q) {
        const haystack = [item.name, item.description ?? "", ...item.categories]
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
      } else if (sortBy === "startsAt") {
        cmp = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      } else if (sortBy === "endsAt") {
        const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : Number.MAX_SAFE_INTEGER;
        cmp = aEnd - bEnd;
      } else if (sortBy === "discountedUnitsSold") {
        cmp = a.discountedUnitsSold - b.discountedUnitsSold;
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

    return ok({
      items: filtered.slice(start, start + limit),
      pagination: { page, limit, total, totalPages },
      summary,
    });
  }

  /**
   * Obtiene el detalle completo de una promoción junto con la simulación producto por producto.
   */
  async getPromotionDetail(
    clientId: string,
    promotionId: string,
    now: Date = new Date(),
  ): Promise<Result<PromotionDetailDto>> {
    const [agg, catalogProducts] = await Promise.all([
      this.repo.getPromotionById(clientId, promotionId),
      this.repo.listCatalogProductsForSimulation(clientId),
    ]);
    if (!agg) {
      return err("Promoción no encontrada.", "PROMOTION_NOT_FOUND");
    }

    const { item, simulation } = this.buildPromotionItemDto(agg, catalogProducts, now);
    return ok({ ...item, simulation });
  }

  /**
   * Crea una nueva promoción comercial validando alcances, vigencias y reglas de margen (`SPEC-18`).
   */
  async createPromotion(
    clientId: string,
    input: UpsertPromotionInput,
    actor = "system",
    now: Date = new Date(),
  ): Promise<Result<PromotionDetailDto>> {
    const validated = await this.validateAndNormalizeInput(clientId, input);
    if (!validated.ok) return validated;

    const created = await this.repo.createPromotion(clientId, validated.data, actor);
    const catalogProducts = await this.repo.listCatalogProductsForSimulation(clientId);
    const { item, simulation } = this.buildPromotionItemDto(created, catalogProducts, now);
    return ok({ ...item, simulation });
  }

  /**
   * Actualiza una promoción comercial y reemplaza transaccionalmente sus objetivos.
   */
  async updatePromotion(
    clientId: string,
    promotionId: string,
    input: UpsertPromotionInput,
    actor = "system",
    now: Date = new Date(),
  ): Promise<Result<PromotionDetailDto>> {
    const existing = await this.repo.getPromotionById(clientId, promotionId);
    if (!existing) {
      return err("Promoción no encontrada.", "PROMOTION_NOT_FOUND");
    }

    const validated = await this.validateAndNormalizeInput(clientId, input);
    if (!validated.ok) return validated;

    const updated = await this.repo.updatePromotion(clientId, promotionId, validated.data, actor);
    if (!updated) {
      return err("Promoción no encontrada.", "PROMOTION_NOT_FOUND");
    }

    const catalogProducts = await this.repo.listCatalogProductsForSimulation(clientId);
    const { item, simulation } = this.buildPromotionItemDto(updated, catalogProducts, now);
    return ok({ ...item, simulation });
  }

  /**
   * Alterna el estado administrativo `is_active` (pausar / reactivar) de una promoción.
   */
  async togglePromotionStatus(
    clientId: string,
    promotionId: string,
    isActive: boolean,
    actor = "system",
    now: Date = new Date(),
  ): Promise<Result<PromotionDetailDto>> {
    const updated = await this.repo.setPromotionActive(clientId, promotionId, isActive, actor);
    if (!updated) {
      return err("Promoción no encontrada.", "PROMOTION_NOT_FOUND");
    }
    const catalogProducts = await this.repo.listCatalogProductsForSimulation(clientId);
    const { item, simulation } = this.buildPromotionItemDto(updated, catalogProducts, now);
    return ok({ ...item, simulation });
  }

  /**
   * Ejecuta la eliminación lógica (soft delete) de una promoción (`SPEC-18 §6`, `D-08`).
   * Exclusivo para `tenant_owner` (bloqueado para `tenant_agent` con código `FORBIDDEN`).
   */
  async deletePromotion(
    clientId: string,
    promotionId: string,
    actor = "system",
    actorRole?: string | null,
  ): Promise<Result<{ id: string; deleted: true }>> {
    if (!isOwnerOrPlatformRole(actorRole)) {
      return err(
        "Solo el propietario del comercio puede eliminar promociones comerciales.",
        "FORBIDDEN",
      );
    }

    const deleted = await this.repo.softDeletePromotion(clientId, promotionId, actor);
    if (!deleted) {
      return err("Promoción no encontrada.", "PROMOTION_NOT_FOUND");
    }
    return ok({ id: promotionId, deleted: true });
  }

  /**
   * Retorna todas las promociones no eliminadas del inquilino en formato listo para `PromotionResolutionEngine`.
   */
  async listPromotionsForResolution(clientId: string): Promise<PromotionRecordWithTargets[]> {
    const aggregates = await this.repo.listPromotions(clientId);
    return aggregates.map(toPromotionRecordWithTargets);
  }
}

let singletonService: TenantPromotionsService | null = null;

/**
 * Obtiene la instancia compartida de `TenantPromotionsService` conectada a `pg-cell-XX`.
 */
export function getTenantPromotionsService(): TenantPromotionsService {
  if (!singletonService) {
    singletonService = new TenantPromotionsService(new DrizzleTenantPromotionsRepository());
  }
  return singletonService;
}

/**
 * Permite reemplazar o limpiar el singleton de `TenantPromotionsService` durante pruebas automatizadas.
 */
export function setTenantPromotionsServiceForTest(
  service: TenantPromotionsService | null,
): void {
  singletonService = service;
}
