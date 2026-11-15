import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { S3StorageService } from "./s3-storage.service";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planLimits, planFeatureValues } from "../db/schemas/admin/plan-catalogs";
import { clientPlanOverrides } from "../db/schemas/admin/plan-catalogs";
import { clientFeatureOverrides } from "../db/schemas/admin/plan-catalogs";
import { chatwootCapabilities } from "../db/schemas/admin/chatwoot-capabilities";
import {
  DrizzleTenantCapabilityGateRepository,
  type ResolvedPlanLimit,
} from "./tenant-capability-gate.service";
import { clientBrandings } from "../db/schemas/admin/client-brandings";
import { DrizzleBillingRepository } from "../repositories/drizzle-billing.repository";
import {
  CheckoutService,
  resolvePlanPricingForCountry,
  type PaymentChannelOption,
} from "./checkout.service";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { tenantInvitations } from "../db/schemas/admin/chatwoot-media-onboarding";
import { users } from "../db/schemas/admin/users";
import {
  cellProducts,
  cellClientUsage,
  cellClientBusinessInfo,
  cellTenantUsers,
} from "../db/schemas/tenant/tenancy-catalog";
import { cellContacts } from "../db/schemas/tenant/crm";
import {
  cellOrders,
  cellOrderItems,
  cellOrderEvents,
} from "../db/schemas/tenant/orders";
import { appLogger } from "../utils/logger";
import {
  IMGPROXY_DEFAULTS,
  signImgproxyPath,
  buildImgproxyUrl,
} from "../utils/imgproxy";
import {
  validateMediaMagicBytes,
  type MediaMagicKind,
} from "../utils/media-magic-bytes";
import type {
  LegacyAwareProductStatus,
  ProductStatus,
} from "./tenant-products-catalog.helpers";
import {
  DrizzleTenantProductsRepository,
  TenantProductsAndMediaService,
} from "./tenant-products-and-media.service";

/**
 * Tipos de medios permitidos en el ecosistema Mocter (`SPEC-08 D-04`).
 */
export type AllowedMediaKind = MediaMagicKind;

export { IMGPROXY_DEFAULTS, signImgproxyPath, buildImgproxyUrl, validateMediaMagicBytes };

// ─────────────────────────────────────────────────────────────
// DTOs de Salida y Entrada
// ─────────────────────────────────────────────────────────────

export interface WorkspaceDashboardDto {
  tenant: {
    id: string;
    name: string;
    slug: string;
    planName: string;
    currency: string;
    logoUrl: string | null;
  };
  metrics: {
    productsCount: number;
    contactsCount: number;
    ordersCount: number;
    storageBytesUsed: number;
    storageQuotaBytes: number | null;
  };
  bot: {
    preset: string;
    remindersEnabled: boolean;
    faqsCount: number;
  };
}

export interface WorkspaceProductDto {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  salePriceCents?: number | null;
  currency: string;
  sku?: string | null;
  status: ProductStatus;
  availability: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  category?: string | null;
  mediaUrls: string[];
  createdAt: string;
}

export interface CreateWorkspaceProductInput {
  name: string;
  description: string;
  priceCents: number;
  salePriceCents?: number | null;
  currency?: string;
  sku?: string | null;
  category?: string | null;
  status?: LegacyAwareProductStatus;
  availability?: "in_stock" | "out_of_stock" | "preorder" | "backorder";
}

export interface WorkspaceContactDto {
  id: string;
  fullName: string;
  email?: string | null;
  phoneMobile?: string | null;
  documentNumber?: string | null;
  stage: string;
  tags: string[];
  createdAt: string;
}

export interface CreateWorkspaceContactInput {
  fullName: string;
  email?: string | null;
  phoneMobile?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  stage?: string;
  tags?: string[];
  notes?: string | null;
}

export interface WorkspaceOrderDto {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  currency: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export interface CreateWorkspaceOrderInput {
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  totalCents: number;
  currency?: string;
  subtotalCents?: number;
  shippingCents?: number;
  discountCents?: number;
  notes?: string | null;
}

export interface WorkspaceBotConfigDto {
  botPreset: string;
  remindersEnabled: boolean;
  returnsPolicy?: string | null;
  warrantyPolicy?: string | null;
  orderMessage?: string | null;
  faqs: Array<{ question: string; answer: string }>;
  paymentMethods: string[];
}

export interface UpdateWorkspaceBotConfigInput {
  botPreset?: string;
  remindersEnabled?: boolean;
  returnsPolicy?: string | null;
  warrantyPolicy?: string | null;
  orderMessage?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
  paymentMethods?: string[];
}

export interface WorkspaceTeamMemberDto {
  id: string;
  userId: string;
  email: string;
  displayName?: string | null;
  role: string;
  status: string;
  joinedAt: string;
}

export interface WorkspaceBillingQuotaItem {
  dimension: string;
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  mode: "LIMITED" | "UNLIMITED";
  source: "override" | "plan" | "default";
}

export interface WorkspaceBillingMediaLimitItem {
  dimension: string;
  label: string;
  mode: "LIMITED" | "UNLIMITED";
  value: number | null;
  source: "override" | "plan" | "default";
}

export interface WorkspaceBillingCapabilityItem {
  code: string;
  label: string;
  description: string;
  category: "channels" | "automation" | "ai" | "team";
  enabled: boolean;
}

export interface WorkspaceBillingPlanOptionDto {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMonthlyCents: number;
  priceAnnualCents: number;
  currency: string;
  trialDays: number;
  isPopular: boolean;
}

export interface WorkspaceBillingSubscriptionDto {
  id: string;
  status: string;
  cycle: "monthly" | "annual";
  gateway: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  expiresAt: string;
  daysRemaining: number;
  pendingUpgradePlanId: string | null;
  pendingUpgradeCycle: "monthly" | "annual" | null;
}

export interface WorkspaceBillingPendingBreBDto {
  id: string;
  invoiceId: string;
  targetPlanId: string;
  targetCycle: "monthly" | "annual";
  operationKind: string;
  reportedAmountCents: number;
  expectedAmountCents: number;
  paymentReference: string | null;
  status: string;
  createdAt: string;
}

export interface WorkspaceBillingDto {
  plan: {
    id: string;
    code: string;
    name: string;
    description: string;
    priceMonthlyCents: number;
    priceAnnualCents: number;
    currency: string;
    trialDays: number;
    lifecycleStatus: string;
  };
  quotas: WorkspaceBillingQuotaItem[];
  mediaLimits: {
    imagesPerProduct: WorkspaceBillingMediaLimitItem;
    videosPerProduct: WorkspaceBillingMediaLimitItem;
    audiosPerProduct: WorkspaceBillingMediaLimitItem;
    pdfsPerProduct: WorkspaceBillingMediaLimitItem;
  };
  retentionDays: WorkspaceBillingMediaLimitItem;
  capabilities: Record<string, boolean>;
  capabilityDetails: WorkspaceBillingCapabilityItem[];
  tenant?: {
    id: string;
    country: string;
    currency: string;
    locale: string;
    email: string;
  };
  subscription?: WorkspaceBillingSubscriptionDto | null;
  pendingBreBReport?: WorkspaceBillingPendingBreBDto | null;
  latestRejectedBreBReport?: {
    id: string;
    rejectionReason: string | null;
    reviewedAt: string | null;
  } | null;
  availablePlans?: WorkspaceBillingPlanOptionDto[];
  availableChannels?: PaymentChannelOption[];
}

export interface MediaUploadResult {
  id: string;
  mediaId: string;
  mediaKind: AllowedMediaKind;
  storageKey: string;
  signedUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Error de dominio tipado para el flujo de carga multimedia (`SPEC-00 §9.1`).
 */
export class MediaUploadError extends Error {
  constructor(
    message: string,
    public readonly code: "VALIDATION" | "QUOTA_EXCEEDED" | "NOT_FOUND" | "STORAGE_UNAVAILABLE",
    public readonly httpStatus: 400 | 404 | 422 | 503,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

/**
 * Servicio unificado de backoffice del inquilino (`TenantWorkspaceService`, TNT-001 R4, ADM-001 T-42).
 *
 * Ejecuta operaciones transaccionales multi-inquilino sobre `pg-cell-XX` con aislamiento estricto
 * mediante `withTenantCellTransaction` bajo `FORCE ROW LEVEL SECURITY`, delegando el dominio de
 * productos y multimedia a `TenantProductsAndMediaService` (`SPEC-08 D-01`).
 */
export class TenantWorkspaceService {
  private readonly productsService: TenantProductsAndMediaService;

  constructor(
    private readonly s3Service: S3StorageService = new S3StorageService(),
    productsService?: TenantProductsAndMediaService,
  ) {
    this.productsService =
      productsService ??
      new TenantProductsAndMediaService(new DrizzleTenantProductsRepository(this.s3Service));
  }

  /**
   * Resuelve el resumen consolidado del Tablero del inquilino.
   */
  async getDashboard(clientId: string): Promise<WorkspaceDashboardDto> {
    const portalDb = getDb();

    // 1. Datos del inquilino y plan en control plane
    const [client] = await portalDb
      .select({
        id: clients.id,
        name: clients.displayName,
        slug: clients.slug,
        currency: clients.currency,
        planId: clients.planId,
        logoMediaId: clients.logoMediaId,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Inquilino con ID ${clientId} no encontrado.`);
    }

    const [plan] = await portalDb
      .select({
        name: plans.name,
      })
      .from(plans)
      .where(eq(plans.id, client.planId))
      .limit(1);

    const planName = plan?.name ? ((plan.name as any).es || (plan.name as any).en || "Plan Pro") : "Plan Pro";

    // 2. Logotipo comercial del inquilino (branding personalizado o mediaCatalog)
    let logoUrl: string | null = null;
    const [branding] = await portalDb
      .select({
        logoUrl: clientBrandings.logoUrl,
      })
      .from(clientBrandings)
      .where(eq(clientBrandings.clientId, clientId))
      .limit(1);

    if (branding?.logoUrl) {
      logoUrl = branding.logoUrl;
    } else if (client.logoMediaId) {
      const [logoMedia] = await portalDb
        .select({ storageKey: mediaCatalog.storageKey })
        .from(mediaCatalog)
        .where(eq(mediaCatalog.id, client.logoMediaId))
        .limit(1);

      if (logoMedia?.storageKey) {
        try {
          logoUrl = buildImgproxyUrl(logoMedia.storageKey, { width: 200, height: 200 });
        } catch {
          logoUrl = null;
        }
      }
    }

    // 3. Cuotas y almacenamiento
    const [storageLimit] = await portalDb
      .select({
        value: planLimits.value,
        mode: planLimits.mode,
      })
      .from(planLimits)
      .where(and(eq(planLimits.planId, client.planId), eq(planLimits.dimension, "storage_bytes")))
      .limit(1);

    const storageQuotaBytes = storageLimit?.mode === "UNLIMITED" ? null : (storageLimit?.value ?? null);

    // 4. Métricas celulares con RLS
    const cellMetrics = await withTenantCellTransaction(clientId, async (tx) => {
      // Contar productos activos
      const [prodRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));

      // Contar contactos activos
      const [contactRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)));

      // Contar pedidos
      const [orderRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellOrders)
        .where(eq(cellOrders.clientId, clientId));

      // Almacenamiento usado
      const [usageRes] = await tx
        .select({ used: cellClientUsage.usedValue })
        .from(cellClientUsage)
        .where(and(eq(cellClientUsage.clientId, clientId), eq(cellClientUsage.dimension, "storage_bytes")))
        .limit(1);

      // Info de negocio y bot
      const [bInfo] = await tx
        .select()
        .from(cellClientBusinessInfo)
        .where(eq(cellClientBusinessInfo.clientId, clientId))
        .limit(1);

      const faqsList = (bInfo?.faqs as any[]) || [];

      return {
        productsCount: prodRes?.count ?? 0,
        contactsCount: contactRes?.count ?? 0,
        ordersCount: orderRes?.count ?? 0,
        storageBytesUsed: usageRes?.used ?? 0,
        botPreset: bInfo?.botPreset || "natural_rhythm",
        remindersEnabled: bInfo?.remindersEnabled ?? false,
        faqsCount: faqsList.length,
      };
    });

    return {
      tenant: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        planName,
        currency: client.currency || "COP",
        logoUrl,
      },
      metrics: {
        productsCount: cellMetrics.productsCount,
        contactsCount: cellMetrics.contactsCount,
        ordersCount: cellMetrics.ordersCount,
        storageBytesUsed: cellMetrics.storageBytesUsed,
        storageQuotaBytes,
      },
      bot: {
        preset: cellMetrics.botPreset,
        remindersEnabled: cellMetrics.remindersEnabled,
        faqsCount: cellMetrics.faqsCount,
      },
    };
  }

  /**
   * Lista los productos del catálogo transaccional delegando en `TenantProductsAndMediaService` (`SPEC-08 D-01`).
   */
  async getProducts(clientId: string): Promise<WorkspaceProductDto[]> {
    const res = await this.productsService.listCatalog(clientId, { page: 1, limit: 100 });
    if (!res.ok) return [];

    return res.data.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      salePriceCents: item.salePriceCents,
      currency: item.currency || "COP",
      sku: item.sku,
      status: item.status,
      availability: item.availability,
      category: item.category,
      mediaUrls: item.mediaUrls,
      createdAt: item.createdAt,
    }));
  }

  /**
   * Crea un producto delegando en `TenantProductsAndMediaService` (`SPEC-08 D-01`).
   */
  async createProduct(
    clientId: string,
    input: CreateWorkspaceProductInput,
    actor: string,
  ): Promise<WorkspaceProductDto> {
    const res = await this.productsService.createProduct(
      clientId,
      {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        salePriceCents: input.salePriceCents ?? null,
        currency: input.currency,
        sku: input.sku ?? null,
        category: input.category ?? null,
        status: input.status ?? "draft",
        availability: input.availability ?? "in_stock",
      },
      actor,
    );

    if (!res.ok) {
      throw new Error(res.error);
    }

    const detail = await this.productsService.getProductDetail(clientId, res.data.id);
    if (detail.ok) {
      return {
        id: detail.data.id,
        name: detail.data.name,
        description: detail.data.description,
        priceCents: detail.data.priceCents,
        salePriceCents: detail.data.salePriceCents,
        currency: detail.data.currency || "COP",
        sku: detail.data.sku,
        status: detail.data.status,
        availability: detail.data.availability,
        category: detail.data.category,
        mediaUrls: detail.data.mediaUrls,
        createdAt: detail.data.createdAt,
      };
    }

    return {
      id: res.data.id,
      name: res.data.name,
      description: res.data.description,
      priceCents: res.data.priceCents,
      salePriceCents: res.data.salePriceCents,
      currency: res.data.currency || "COP",
      sku: res.data.sku,
      status: res.data.status as ProductStatus,
      availability: res.data.availability as WorkspaceProductDto["availability"],
      category: res.data.category,
      mediaUrls: [],
      createdAt: res.data.createdAt ? new Date(res.data.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Actualiza un producto existente delegando en `TenantProductsAndMediaService` (`SPEC-08 D-01`).
   */
  async updateProduct(
    clientId: string,
    productId: string,
    input: Partial<CreateWorkspaceProductInput>,
    actor: string,
  ): Promise<WorkspaceProductDto | null> {
    const res = await this.productsService.updateProduct(
      clientId,
      productId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.salePriceCents !== undefined ? { salePriceCents: input.salePriceCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.availability !== undefined ? { availability: input.availability } : {}),
      },
      actor,
    );

    if (!res.ok) {
      if (res.code === "NOT_FOUND" || res.code === "PRODUCT_NOT_FOUND") {
        return null;
      }
      throw new Error(res.error);
    }

    return {
      id: res.data.id,
      name: res.data.name,
      description: res.data.description,
      priceCents: res.data.priceCents,
      salePriceCents: res.data.salePriceCents,
      currency: res.data.currency || "COP",
      sku: res.data.sku,
      status: res.data.status as ProductStatus,
      availability: res.data.availability as WorkspaceProductDto["availability"],
      category: res.data.category,
      mediaUrls: [],
      createdAt: res.data.createdAt ? new Date(res.data.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Elimina lógicamente un producto delegando en `TenantProductsAndMediaService` (`SPEC-08 D-01`).
   */
  async deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean> {
    const res = await this.productsService.deleteProduct(clientId, productId, actor);
    if (!res.ok) {
      if (res.code === "NOT_FOUND" || res.code === "PRODUCT_NOT_FOUND") {
        return false;
      }
      throw new Error(res.error);
    }
    return res.data.deleted;
  }

  /**
   * Carga un archivo multimedia al producto delegando en `TenantProductsAndMediaService` (`SPEC-08 D-01`).
   */
  async uploadProductMedia(
    clientId: string,
    productId: string,
    file: {
      buffer: Buffer;
      mimeType: string;
      originalFilename: string;
    },
    actor: string,
  ): Promise<MediaUploadResult> {
    const res = await this.productsService.uploadAndAttachProductMedia(
      clientId,
      productId,
      file,
      actor,
    );

    if (!res.ok) {
      const code =
        res.code === "PRODUCT_NOT_FOUND"
          ? "NOT_FOUND"
          : res.code === "STORAGE_QUOTA_EXCEEDED" || res.code?.startsWith("QUOTA_EXCEEDED")
            ? "QUOTA_EXCEEDED"
            : res.code === "STORAGE_UNAVAILABLE"
              ? "STORAGE_UNAVAILABLE"
              : "VALIDATION";
      const httpStatus =
        code === "NOT_FOUND"
          ? 404
          : code === "QUOTA_EXCEEDED"
            ? 422
            : code === "STORAGE_UNAVAILABLE"
              ? 503
              : 400;
      throw new MediaUploadError(res.error, code, httpStatus);
    }

    return {
      id: res.data.mediaId,
      mediaId: res.data.mediaId,
      mediaKind: res.data.mediaKind,
      storageKey: res.data.url,
      signedUrl: res.data.url,
      originalFilename: res.data.originalFilename,
      mimeType: res.data.mimeType,
      sizeBytes: res.data.sizeBytes,
    };
  }

  /**
   * Lista los contactos CRM del inquilino bajo RLS.
   */
  async getContacts(clientId: string): Promise<WorkspaceContactDto[]> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const rows = await tx
        .select()
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)))
        .orderBy(desc(cellContacts.createdAt));

      return rows.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        phoneMobile: c.phoneMobile,
        documentNumber: c.documentNumber,
        stage: c.stage,
        tags: (c.tags as string[]) || [],
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      }));
    });
  }

  /**
   * Crea un nuevo contacto en el CRM celular.
   */
  async createContact(
    clientId: string,
    input: CreateWorkspaceContactInput,
    actor: string,
  ): Promise<WorkspaceContactDto> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [created] = await tx
        .insert(cellContacts)
        .values({
          clientId,
          fullName: input.fullName,
          email: input.email?.toLowerCase().trim() || null,
          phoneMobile: input.phoneMobile?.trim() || null,
          documentType: input.documentType || null,
          documentNumber: input.documentNumber || null,
          stage: input.stage || "new",
          tags: input.tags || [],
          notes: input.notes || null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return {
        id: created.id,
        fullName: created.fullName,
        email: created.email,
        phoneMobile: created.phoneMobile,
        documentNumber: created.documentNumber,
        stage: created.stage,
        tags: (created.tags as string[]) || [],
        createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Lista los pedidos comerciales del inquilino.
   */
  async getOrders(clientId: string): Promise<WorkspaceOrderDto[]> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const rows = await tx
        .select()
        .from(cellOrders)
        .where(eq(cellOrders.clientId, clientId))
        .orderBy(desc(cellOrders.createdAt));

      return rows.map((o) => ({
        id: o.id,
        orderNumber: o.number,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        totalCents: o.totalCents,
        currency: o.currency,
        status: o.status,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
      }));
    });
  }

  /**
   * Crea un nuevo pedido comercial en la celda.
   */
  async createOrder(
    clientId: string,
    input: CreateWorkspaceOrderInput,
    actor: string,
  ): Promise<WorkspaceOrderDto> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const orderCount = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellOrders)
        .where(eq(cellOrders.clientId, clientId));

      const seq = (orderCount[0]?.count ?? 0) + 1;
      const datePart = new Date().toISOString().slice(0, 7).replace("-", "");
      const orderNumber = `ORD-${datePart}-${String(seq).padStart(4, "0")}`;

      const [created] = await tx
        .insert(cellOrders)
        .values({
          clientId,
          number: orderNumber,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          paymentMethod: input.paymentMethod || "transferencia",
          paymentStatus: "pending",
          status: "registered",
          subtotalCents: input.subtotalCents ?? input.totalCents,
          shippingCents: input.shippingCents ?? 0,
          discountCents: input.discountCents ?? 0,
          totalCents: input.totalCents,
          currency: input.currency || "COP",
          notes: input.notes || null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return {
        id: created.id,
        orderNumber: created.number,
        customerName: created.customerName,
        customerPhone: created.customerPhone,
        totalCents: created.totalCents,
        currency: created.currency,
        status: created.status,
        paymentStatus: created.paymentStatus,
        createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Actualiza el estado de un pedido y registra el evento de trazabilidad.
   */
  async updateOrderStatus(
    clientId: string,
    orderId: string,
    status: string,
    actor: string,
  ): Promise<boolean> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const rows = await tx
        .update(cellOrders)
        .set({
          status,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellOrders.id, orderId), eq(cellOrders.clientId, clientId)))
        .returning({ id: cellOrders.id, status: cellOrders.status });

      if (rows.length === 0) return false;

      // Registrar evento
      await tx
        .insert(cellOrderEvents)
        .values({
          clientId,
          orderId,
          toStatus: status,
          actor,
          reason: "Actualización desde backoffice",
        });

      return true;
    });
  }

  /**
   * Obtiene la configuración del Asistente AI y políticas comerciales del comercio.
   */
  async getBotConfig(clientId: string): Promise<WorkspaceBotConfigDto> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [info] = await tx
        .select()
        .from(cellClientBusinessInfo)
        .where(eq(cellClientBusinessInfo.clientId, clientId))
        .limit(1);

      return {
        botPreset: info?.botPreset || "natural_rhythm",
        remindersEnabled: info?.remindersEnabled ?? false,
        returnsPolicy: info?.returnsPolicy || null,
        warrantyPolicy: info?.warrantyPolicy || null,
        orderMessage: info?.orderMessage || null,
        faqs: (info?.faqs as Array<{ question: string; answer: string }>) || [],
        paymentMethods: (info?.paymentMethods as string[]) || ["transferencia", "contraentrega"],
      };
    });
  }

  /**
   * Actualiza la configuración del Asistente AI y políticas de atención.
   */
  async updateBotConfig(
    clientId: string,
    input: UpdateWorkspaceBotConfigInput,
    actor: string,
  ): Promise<WorkspaceBotConfigDto> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [updated] = await tx
        .insert(cellClientBusinessInfo)
        .values({
          clientId,
          botPreset: input.botPreset || "natural_rhythm",
          remindersEnabled: input.remindersEnabled ?? false,
          returnsPolicy: input.returnsPolicy || null,
          warrantyPolicy: input.warrantyPolicy || null,
          orderMessage: input.orderMessage || null,
          faqs: input.faqs || [],
          paymentMethods: input.paymentMethods || ["transferencia", "contraentrega"],
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: cellClientBusinessInfo.clientId,
          set: {
            botPreset: input.botPreset !== undefined ? input.botPreset : sql`${cellClientBusinessInfo.botPreset}`,
            remindersEnabled: input.remindersEnabled !== undefined ? input.remindersEnabled : sql`${cellClientBusinessInfo.remindersEnabled}`,
            returnsPolicy: input.returnsPolicy !== undefined ? input.returnsPolicy : sql`${cellClientBusinessInfo.returnsPolicy}`,
            warrantyPolicy: input.warrantyPolicy !== undefined ? input.warrantyPolicy : sql`${cellClientBusinessInfo.warrantyPolicy}`,
            orderMessage: input.orderMessage !== undefined ? input.orderMessage : sql`${cellClientBusinessInfo.orderMessage}`,
            faqs: input.faqs !== undefined ? input.faqs : sql`${cellClientBusinessInfo.faqs}`,
            paymentMethods: input.paymentMethods !== undefined ? input.paymentMethods : sql`${cellClientBusinessInfo.paymentMethods}`,
            updatedAt: new Date(),
            updatedBy: actor,
          },
        })
        .returning();

      return {
        botPreset: updated.botPreset,
        remindersEnabled: updated.remindersEnabled,
        returnsPolicy: updated.returnsPolicy,
        warrantyPolicy: updated.warrantyPolicy,
        orderMessage: updated.orderMessage,
        faqs: (updated.faqs as Array<{ question: string; answer: string }>) || [],
        paymentMethods: (updated.paymentMethods as string[]) || ["transferencia", "contraentrega"],
      };
    });
  }

  /**
   * Lista los miembros y colaboradores del equipo del comercio.
   */
  async getTeamMembers(clientId: string): Promise<WorkspaceTeamMemberDto[]> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const memberships = await tx
        .select()
        .from(cellTenantUsers)
        .where(eq(cellTenantUsers.clientId, clientId))
        .orderBy(desc(cellTenantUsers.joinedAt));

      if (memberships.length === 0) return [];

      const userIds = memberships.map((m) => m.userId);
      const portalDb = getDb();
      const userRows = await portalDb
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(users)
        .where(sql`${users.id} IN ${userIds}`);

      const userMap = new Map<string, { email: string; displayName?: string | null }>();
      for (const u of userRows) {
        userMap.set(u.id, { email: u.email, displayName: u.displayName });
      }

      return memberships.map((m) => {
        const u = userMap.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          email: u?.email || "usuario@mocter.co",
          displayName: u?.displayName || null,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : new Date().toISOString(),
        };
      });
    });
  }

  /**
   * Detalle unificado de facturación, cuotas reales, límites multimedia y capacidades efectivas
   * del plan activo del comercio (SPEC-03 T-04, §9.1).
   */
  async getBillingDetails(clientId: string): Promise<WorkspaceBillingDto> {
    const portalDb = getDb();

    // 1. Obtener cliente y plan asignado
    const [client] = await portalDb
      .select({
        planId: clients.planId,
        locale: clients.locale,
        lifecycleStatus: clients.lifecycleStatus,
        country: clients.country,
        currency: clients.currency,
        contactEmail: clients.contactEmail,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Inquilino con ID ${clientId} no encontrado.`);
    }

    const locale: "es" | "en" = client.locale === "en" ? "en" : "es";

    const [plan] = await portalDb
      .select()
      .from(plans)
      .where(eq(plans.id, client.planId))
      .limit(1);

    const resolveLocalized = (
      raw: unknown,
      fallback: string,
    ): string => {
      if (!raw) return fallback;
      if (typeof raw === "string") return raw;
      const record = raw as { es?: string; en?: string };
      return (locale === "en" ? record.en || record.es : record.es || record.en) || fallback;
    };

    const planName = resolveLocalized(plan?.name, plan?.code || "Plan");
    const planDesc = resolveLocalized(plan?.description, "");

    // 2. Resolver límites y capacidades efectivas desde la fuente única de verdad (plan + overrides)
    const gateRepo = new DrizzleTenantCapabilityGateRepository(() => portalDb);
    const [resolvedLimits, capabilities] = await Promise.all([
      gateRepo.getResolvedLimits(clientId),
      gateRepo.getTenantCapabilities(clientId),
    ]);

    let capCatalogRows: Array<{
      code: string;
      name: unknown;
      description: unknown;
      commercialStatus: string;
    }> = [];
    try {
      capCatalogRows = await portalDb
        .select({
          code: chatwootCapabilities.code,
          name: chatwootCapabilities.name,
          description: chatwootCapabilities.description,
          commercialStatus: chatwootCapabilities.commercialStatus,
        })
        .from(chatwootCapabilities);
    } catch {
      capCatalogRows = [];
    }

    // 3. Consumos celulares reales (productos, contactos, miembros activos y counters de uso)
    const usageMetrics = await withTenantCellTransaction(clientId, async (tx) => {
      const [prodRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));

      const [contactRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)));

      const [usersRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellTenantUsers)
        .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.status, "active")));

      const usageRows = await tx
        .select({ dimension: cellClientUsage.dimension, used: cellClientUsage.usedValue })
        .from(cellClientUsage)
        .where(eq(cellClientUsage.clientId, clientId));

      const usageMap = new Map<string, number>();
      for (const row of usageRows) {
        usageMap.set(row.dimension, Number(row.used ?? 0));
      }

      return {
        products: prodRes?.count ?? 0,
        contacts: contactRes?.count ?? 0,
        tenantUsers: usersRes?.count ?? 0,
        storageBytes: usageMap.get("storage_bytes") ?? 0,
        chatwootAgents: usageMap.get("chatwoot_agents") ?? 0,
        chatwootInboxes: usageMap.get("chatwoot_inboxes") ?? 0,
        chatwootOutboundEmails: usageMap.get("chatwoot_outbound_emails") ?? 0,
      };
    });

    const buildQuota = (
      dimension: keyof typeof resolvedLimits,
      labelEs: string,
      labelEn: string,
      used: number,
      unitEs: string,
      unitEn: string,
    ): WorkspaceBillingQuotaItem => {
      const resolved: ResolvedPlanLimit = resolvedLimits[dimension];
      return {
        dimension,
        label: locale === "en" ? labelEn : labelEs,
        used,
        limit: resolved.mode === "UNLIMITED" ? null : resolved.value,
        unit: locale === "en" ? unitEn : unitEs,
        mode: resolved.mode,
        source: resolved.source,
      };
    };

    const quotas: WorkspaceBillingQuotaItem[] = [
      buildQuota("products", "Productos Del Catálogo", "Catalog Products", usageMetrics.products, "productos", "products"),
      buildQuota("contacts", "Contactos CRM", "CRM Contacts", usageMetrics.contacts, "contactos", "contacts"),
      buildQuota("tenant_users", "Miembros Del Equipo", "Team Members", usageMetrics.tenantUsers, "usuarios", "users"),
      buildQuota("storage_bytes", "Almacenamiento Multimedia", "Media Storage", usageMetrics.storageBytes, "bytes", "bytes"),
      buildQuota("chatwoot_agents", "Agentes De Atención", "Support Agents", usageMetrics.chatwootAgents, "agentes", "agents"),
      buildQuota("chatwoot_inboxes", "Canales Y Bandejas", "Channels & Inboxes", usageMetrics.chatwootInboxes, "bandejas", "inboxes"),
      buildQuota("chatwoot_outbound_emails", "Correos Salientes", "Outbound Emails", usageMetrics.chatwootOutboundEmails, "correos", "emails"),
    ];

    const buildMediaLimit = (
      dimension: keyof typeof resolvedLimits,
      labelEs: string,
      labelEn: string,
    ): WorkspaceBillingMediaLimitItem => {
      const resolved = resolvedLimits[dimension];
      return {
        dimension,
        label: locale === "en" ? labelEn : labelEs,
        mode: resolved.mode,
        value: resolved.mode === "UNLIMITED" ? null : resolved.value,
        source: resolved.source,
      };
    };

    const mediaLimits = {
      imagesPerProduct: buildMediaLimit("images_per_product", "Imágenes Por Producto", "Images Per Product"),
      videosPerProduct: buildMediaLimit("videos_per_product", "Videos Por Producto", "Videos Per Product"),
      audiosPerProduct: buildMediaLimit("audios_per_product", "Pistas De Audio Por Producto", "Audio Tracks Per Product"),
      pdfsPerProduct: buildMediaLimit("pdfs_per_product", "Archivos PDF Por Producto", "PDF Files Per Product"),
    };

    const retentionDays = buildMediaLimit("chat_retention_days", "Retención De Conversaciones", "Conversation Retention");

    const categorizeCapability = (code: string): "channels" | "automation" | "ai" | "team" => {
      if (code.startsWith("channel_") || code === "chatwoot_inboxes" || code === "inbox_management") {
        return "channels";
      }
      if (code.includes("captain") || code.includes("ai")) {
        return "ai";
      }
      if (code.includes("automation") || code.includes("macros") || code.includes("campaigns")) {
        return "automation";
      }
      return "team";
    };

    const capabilityDetails: WorkspaceBillingCapabilityItem[] = capCatalogRows
      .filter((c) => c.commercialStatus === "commercial")
      .map((c) => ({
        code: c.code,
        label: resolveLocalized(c.name, c.code),
        description: resolveLocalized(c.description, ""),
        category: categorizeCapability(c.code),
        enabled: Boolean(capabilities[c.code]),
      }));

    if (capabilityDetails.length === 0) {
      for (const [code, enabled] of Object.entries(capabilities)) {
        capabilityDetails.push({
          code,
          label: code,
          description: "",
          category: categorizeCapability(code),
          enabled: Boolean(enabled),
        });
      }
    }

    // 4. Información extendida SPEC-04 (suscripción, reportes Bre-B, planes y canales habilitados)
    let subscriptionDto: WorkspaceBillingSubscriptionDto | null = null;
    let pendingBreBReport: WorkspaceBillingPendingBreBDto | null = null;
    let latestRejectedBreBReport: WorkspaceBillingDto["latestRejectedBreBReport"] = null;
    let availablePlans: WorkspaceBillingPlanOptionDto[] = [];
    let availableChannels: PaymentChannelOption[] = [];

    const clientCountry = (client.country || "CO").trim().toUpperCase();
    const clientCurrency: "COP" | "USD" = clientCountry === "CO" ? "COP" : "USD";

    try {
      const billingRepo = new DrizzleBillingRepository(portalDb);
      const checkoutSvc = new CheckoutService(billingRepo);

      const [subRow, pendingRow, rejectedRow, publicPlans, channelsRes] = await Promise.all([
        billingRepo.getSubscriptionByClientId(clientId),
        billingRepo.getPendingManualReportByClientId(clientId),
        billingRepo.getLatestRejectedManualReportByClientId(clientId),
        billingRepo.listActivePublicPlans(),
        checkoutSvc.listAvailableChannelsForTenant(clientCountry, clientCurrency),
      ]);

      if (subRow) {
        const expiresAtDate =
          subRow.status === "trialing" && subRow.trialEndsAt
            ? subRow.trialEndsAt
            : subRow.currentPeriodEnd;
        const diffMs = expiresAtDate.getTime() - Date.now();
        const daysRemaining = diffMs <= 0 ? 0 : Math.ceil(diffMs / 86_400_000);
        subscriptionDto = {
          id: subRow.id,
          status: subRow.status,
          cycle: subRow.cycle === "annual" ? "annual" : "monthly",
          gateway: subRow.gateway ?? null,
          trialEndsAt: subRow.trialEndsAt ? subRow.trialEndsAt.toISOString() : null,
          currentPeriodEnd: subRow.currentPeriodEnd.toISOString(),
          expiresAt: expiresAtDate.toISOString(),
          daysRemaining,
          pendingUpgradePlanId: subRow.pendingUpgradePlanId ?? null,
          pendingUpgradeCycle:
            subRow.pendingUpgradeCycle === "annual"
              ? "annual"
              : subRow.pendingUpgradeCycle === "monthly"
                ? "monthly"
                : null,
        };
      }

      if (pendingRow) {
        pendingBreBReport = {
          id: pendingRow.id,
          invoiceId: pendingRow.invoiceId,
          targetPlanId: pendingRow.targetPlanId,
          targetCycle: pendingRow.targetCycle === "annual" ? "annual" : "monthly",
          operationKind: pendingRow.operationKind,
          reportedAmountCents: Number(pendingRow.reportedAmountCents),
          expectedAmountCents: Number(pendingRow.expectedAmountCents),
          paymentReference: pendingRow.paymentReference ?? null,
          status: pendingRow.status,
          createdAt: pendingRow.createdAt.toISOString(),
        };
      }

      if (rejectedRow) {
        latestRejectedBreBReport = {
          id: rejectedRow.id,
          rejectionReason: rejectedRow.rejectionReason ?? null,
          reviewedAt: rejectedRow.reviewedAt ? rejectedRow.reviewedAt.toISOString() : null,
        };
      }

      availablePlans = publicPlans.map((p) => {
        const localizedPricing = resolvePlanPricingForCountry(p, clientCountry);
        return {
          id: p.id,
          code: p.code,
          name: resolveLocalized(p.name, p.code),
          description: resolveLocalized(p.description, ""),
          priceMonthlyCents: localizedPricing.priceMonthlyCents,
          priceAnnualCents: localizedPricing.priceAnnualCents,
          currency: localizedPricing.currency,
          trialDays: Number(p.trialDays),
          isPopular: Boolean(p.isPopular),
        };
      });

      if (channelsRes.ok) {
        availableChannels = channelsRes.data;
      }
    } catch {
      // Mantiene retrocompatibilidad cuando mocks unitarios solo simulan catálogo/cuotas base.
    }

    const activePlanPricing = resolvePlanPricingForCountry(plan, clientCountry);

    return {
      plan: {
        id: plan?.id || client.planId,
        code: plan?.code || "pro",
        name: planName,
        description: planDesc,
        priceMonthlyCents: activePlanPricing.priceMonthlyCents,
        priceAnnualCents: activePlanPricing.priceAnnualCents,
        currency: activePlanPricing.currency,
        trialDays: Number(plan?.trialDays ?? 0),
        lifecycleStatus: client.lifecycleStatus,
      },
      quotas,
      mediaLimits,
      retentionDays,
      capabilities,
      capabilityDetails,
      tenant: {
        id: clientId,
        country: clientCountry,
        currency: clientCurrency,
        locale,
        email: client.contactEmail || "",
      },
      subscription: subscriptionDto,
      pendingBreBReport,
      latestRejectedBreBReport,
      availablePlans,
      availableChannels,
    };
  }
}

export const tenantWorkspaceService = new TenantWorkspaceService();
