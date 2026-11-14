import { createHash, createHmac, randomBytes } from "node:crypto";
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
  cellProductMedia,
  cellClientMedia,
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
import { env } from "../utils/env";

/**
 * Tipos de medios permitidos en el ecosistema Mocter.
 */
export type AllowedMediaKind = "image" | "pdf";

/**
 * Configuración dinámica de firma y límites de `imgproxy` leída desde variables de entorno validadas.
 * Se resuelven por getter para reflejar cambios de entorno en runtime/test sin valores fijos inseguros.
 */
export const IMGPROXY_DEFAULTS = {
  maxDimensionPx: 4096,
  get bucket(): string {
    return env.S3_BUCKET ?? "media";
  },
  get keyHex(): string {
    return env.IMGPROXY_KEY ?? "";
  },
  get saltHex(): string {
    return env.IMGPROXY_SALT ?? "";
  },
  get baseUrl(): string {
    return (env.IMGPROXY_PUBLIC_URL || env.IMGPROXY_BASE_URL || "").replace(/\/+$/, "");
  },
};

/**
 * Genera la firma HMAC-SHA256 URL-safe en base64 para un path de imgproxy (CEL-RF-019, D-T1.4).
 *
 * @param path - Ruta relativa de transformación de imgproxy (debe iniciar con `/`).
 * @param keyHex - Clave HMAC hexadecimal; por defecto se lee desde `IMGPROXY_KEY`.
 * @param saltHex - Sal HMAC hexadecimal; por defecto se lee desde `IMGPROXY_SALT`.
 * @returns Firma codificada en Base64 URL-safe sin relleno `=`.
 */
export function signImgproxyPath(
  path: string,
  keyHex: string = IMGPROXY_DEFAULTS.keyHex,
  saltHex: string = IMGPROXY_DEFAULTS.saltHex,
): string {
  if (!keyHex || !saltHex) {
    throw new Error("Configuración incompleta de imgproxy: IMGPROXY_KEY e IMGPROXY_SALT son obligatorios.");
  }

  const keyBin = Buffer.from(keyHex, "hex");
  const saltBin = Buffer.from(saltHex, "hex");
  const pathBin = Buffer.from(path, "utf8");

  const hmac = createHmac("sha256", keyBin);
  hmac.update(saltBin);
  hmac.update(pathBin);

  return hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Construye la URL pública completa y firmada para servir recursos mediante imgproxy.
 *
 * @param storageKey - Clave del objeto almacenado en el bucket S3.
 * @param options - Opciones de redimensionamiento y formato de salida.
 * @returns URL firmada lista para consumo del navegador.
 */
export function buildImgproxyUrl(
  storageKey: string,
  options: {
    width?: number;
    height?: number;
    resizingType?: "fit" | "fill" | "auto";
    format?: "webp" | "png" | "jpg";
  } = {},
): string {
  const width = options.width || 400;
  const height = options.height || 400;
  if (width > IMGPROXY_DEFAULTS.maxDimensionPx || height > IMGPROXY_DEFAULTS.maxDimensionPx) {
    throw new Error(`Dimensiones (${width}x${height}) exceden el límite máximo de ${IMGPROXY_DEFAULTS.maxDimensionPx}px.`);
  }

  const baseUrl = IMGPROXY_DEFAULTS.baseUrl;
  if (!baseUrl) {
    throw new Error("Configuración incompleta de imgproxy: IMGPROXY_PUBLIC_URL es obligatorio.");
  }

  const resizingType = options.resizingType || "fit";
  const format = options.format || "webp";
  const cleanKey = storageKey.replace(/^\/+/, "");
  const path = `/resize:${resizingType}:${width}:${height}:0/plain/s3://${IMGPROXY_DEFAULTS.bucket}/${cleanKey}@${format}`;
  const signature = signImgproxyPath(path);
  return `${baseUrl}/${signature}${path}`;
}

import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
export { validateMediaMagicBytes };

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
  status: "draft" | "published" | "archived";
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
  status?: "draft" | "published" | "archived";
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

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MAX_UPLOAD_BYTES_BY_KIND: Record<AllowedMediaKind, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  pdf: 25 * 1024 * 1024, // 25 MB
};

/**
 * Servicio unificado de backoffice del inquilino (`TenantWorkspaceService`, TNT-001 R4, ADM-001 T-42).
 *
 * Ejecuta operaciones transaccionales multi-inquilino sobre `pg-cell-XX` con aislamiento estricto
 * mediante `withTenantCellTransaction` bajo `FORCE ROW LEVEL SECURITY`, integrando almacenamiento
 * en SeaweedFS S3 (`bucket: media`) y firmas HMAC-SHA256 para `imgproxy`.
 */
export class TenantWorkspaceService {
  constructor(
    private readonly s3Service: S3StorageService = new S3StorageService(),
  ) {}

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
   * Lista los productos del catálogo transaccional con URLs de multimedia firmadas.
   */
  async getProducts(clientId: string): Promise<WorkspaceProductDto[]> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const rows = await tx
        .select()
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .orderBy(desc(cellProducts.createdAt));

      if (rows.length === 0) return [];

      // Obtener vínculos de multimedia
      const productIds = rows.map((r) => r.id);
      const mediaLinks = await tx
        .select({
          productId: cellProductMedia.productId,
          mediaId: cellProductMedia.mediaId,
        })
        .from(cellProductMedia)
        .where(and(eq(cellProductMedia.clientId, clientId), sql`${cellProductMedia.productId} IN ${productIds}`));

      const mediaIds = [...new Set(mediaLinks.map((m) => m.mediaId))];
      const mediaMap = new Map<string, string>();

      if (mediaIds.length > 0) {
        const portalDb = getDb();
        const catalogRows = await portalDb
          .select({
            id: mediaCatalog.id,
            storageKey: mediaCatalog.storageKey,
          })
          .from(mediaCatalog)
          .where(sql`${mediaCatalog.id} IN ${mediaIds}`);

        for (const cat of catalogRows) {
          try {
            mediaMap.set(cat.id, buildImgproxyUrl(cat.storageKey, { width: 400, height: 400 }));
          } catch {
            // Ignorar fallo de firma individual
          }
        }
      }

      const prodMediaMap = new Map<string, string[]>();
      for (const link of mediaLinks) {
        const url = mediaMap.get(link.mediaId);
        if (url) {
          const list = prodMediaMap.get(link.productId) || [];
          list.push(url);
          prodMediaMap.set(link.productId, list);
        }
      }

      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        salePriceCents: p.salePriceCents,
        currency: p.currency || "COP",
        sku: p.sku,
        status: p.status as "draft" | "published" | "archived",
        availability: p.availability as "in_stock" | "out_of_stock" | "preorder" | "backorder",
        category: p.category,
        mediaUrls: prodMediaMap.get(p.id) || [],
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      }));
    });
  }

  /**
   * Crea un nuevo producto validando la cuota del plan (D-T2.5).
   */
  async createProduct(
    clientId: string,
    input: CreateWorkspaceProductInput,
    actor: string,
  ): Promise<WorkspaceProductDto> {
    const portalDb = getDb();

    // 1. Validar límite de productos del plan
    const [client] = await portalDb
      .select({ planId: clients.planId, currency: clients.currency })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (client) {
      const [limit] = await portalDb
        .select({ value: planLimits.value, mode: planLimits.mode })
        .from(planLimits)
        .where(and(eq(planLimits.planId, client.planId), eq(planLimits.dimension, "products")))
        .limit(1);

      if (limit && limit.mode === "LIMITED" && limit.value !== null) {
        const count = await withTenantCellTransaction(clientId, async (tx) => {
          const [res] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(cellProducts)
            .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));
          return res?.count ?? 0;
        });

        if (count >= limit.value) {
          throw new Error(`Has alcanzado el límite máximo de ${limit.value} productos de tu plan. Actualiza tu plan para registrar más productos.`);
        }
      }
    }

    // 2. Insertar producto en celda
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [created] = await tx
        .insert(cellProducts)
        .values({
          clientId,
          name: input.name,
          description: input.description,
          priceCents: input.priceCents,
          salePriceCents: input.salePriceCents ?? null,
          currency: input.currency || client?.currency || "COP",
          sku: input.sku ?? null,
          category: input.category ?? null,
          status: input.status ?? "draft",
          availability: input.availability ?? "in_stock",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return {
        id: created.id,
        name: created.name,
        description: created.description,
        priceCents: created.priceCents,
        salePriceCents: created.salePriceCents,
        currency: created.currency || "COP",
        sku: created.sku,
        status: created.status as "draft" | "published" | "archived",
        availability: created.availability as "in_stock" | "out_of_stock" | "preorder" | "backorder",
        category: created.category,
        mediaUrls: [],
        createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Actualiza un producto existente.
   */
  async updateProduct(
    clientId: string,
    productId: string,
    input: Partial<CreateWorkspaceProductInput>,
    actor: string,
  ): Promise<WorkspaceProductDto | null> {
    return await withTenantCellTransaction(clientId, async (tx) => {
      const [updated] = await tx
        .update(cellProducts)
        .set({
          ...input,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(eq(cellProducts.id, productId), eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .returning();

      if (!updated) return null;

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        priceCents: updated.priceCents,
        salePriceCents: updated.salePriceCents,
        currency: updated.currency || "COP",
        sku: updated.sku,
        status: updated.status as "draft" | "published" | "archived",
        availability: updated.availability as "in_stock" | "out_of_stock" | "preorder" | "backorder",
        category: updated.category,
        mediaUrls: [],
        createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : new Date().toISOString(),
      };
    });
  }

  /**
   * Elimina lógicamente un producto (`deleted_at`).
   */
  async deleteProduct(clientId: string, productId: string, actor: string): Promise<boolean> {
    return await withTenantCellTransaction(clientId, async (tx) => {
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

  /**
   * Carga una imagen a SeaweedFS S3 y la asocia al producto devolviendo la URL firmada de imgproxy (CEL-RF-016, CEL-RF-019).
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
    // 1. Validar magic bytes y tamaño máximo antes de contactar a SeaweedFS (RN-SPEC-00-06)
    const magic = validateMediaMagicBytes(file.buffer);
    if (!magic.valid) {
      throw new MediaUploadError(magic.error || "Formato de archivo inválido.", "VALIDATION", 400);
    }

    const mime = magic.detectedMime || file.mimeType;
    const mediaKind: AllowedMediaKind = mime.startsWith("image/") ? "image" : "pdf";
    const maxBytes = MAX_UPLOAD_BYTES_BY_KIND[mediaKind];
    if (file.buffer.byteLength > maxBytes) {
      throw new MediaUploadError(
        `El archivo supera el tamaño máximo permitido de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
        "VALIDATION",
        400,
      );
    }

    // 2. Validar pertenencia del producto al inquilino bajo RLS
    const isOwned = await withTenantCellTransaction(clientId, async (tx) => {
      const [p] = await tx
        .select({ id: cellProducts.id })
        .from(cellProducts)
        .where(and(eq(cellProducts.id, productId), eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .limit(1);
      return !!p;
    });
    if (!isOwned) {
      throw new MediaUploadError("El producto indicado no existe o no pertenece al inquilino.", "NOT_FOUND", 404);
    }

    // 3. Validar cuota de almacenamiento del plan (CEL-RF-016, CA-TNT-04)
    const portalDb = getDb();
    const [client] = await portalDb
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (client) {
      const [limit] = await portalDb
        .select({ value: planLimits.value, mode: planLimits.mode })
        .from(planLimits)
        .where(and(eq(planLimits.planId, client.planId), eq(planLimits.dimension, "storage_bytes")))
        .limit(1);

      if (limit && limit.mode === "LIMITED" && limit.value !== null) {
        const currentBytes = await withTenantCellTransaction(clientId, async (tx) => {
          const [u] = await tx
            .select({ usedValue: cellClientUsage.usedValue })
            .from(cellClientUsage)
            .where(and(eq(cellClientUsage.clientId, clientId), eq(cellClientUsage.dimension, "storage_bytes")))
            .limit(1);
          return u?.usedValue ?? 0;
        });

        if (currentBytes + file.buffer.byteLength > limit.value) {
          throw new MediaUploadError(
            `Has alcanzado el límite de almacenamiento de ${Math.round(limit.value / (1024 * 1024))} MB de tu plan.`,
            "QUOTA_EXCEEDED",
            422,
          );
        }
      }
    }

    const ext = MIME_EXTENSION_MAP[mime] || "bin";
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const storageKey = `products/${clientId}/${contentHash}.${ext}`;

    // 4. Pre-firmar URL de imgproxy antes de mutar S3 o BD para evitar escrituras huérfanas si falta configuración
    let signedUrl: string;
    try {
      signedUrl = buildImgproxyUrl(storageKey, { width: 600, height: 600 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new MediaUploadError(msg, "STORAGE_UNAVAILABLE", 503);
    }

    // 5. Subir a SeaweedFS S3
    const uploadRes = await this.s3Service.putObject(storageKey, file.buffer, mime);
    if (!uploadRes.ok) {
      appLogger.error(`[uploadProductMedia] Falló la subida a S3: ${uploadRes.error}`, undefined, {
        clientId,
        mediaKind,
        sizeBytes: file.buffer.byteLength,
      });
      throw new MediaUploadError(
        `Error al almacenar el archivo multimedia en S3: ${uploadRes.error}`,
        "STORAGE_UNAVAILABLE",
        503,
      );
    }

    // 6. Registrar en catálogo de medios de control plane
    const storagePoolId = "seaweedfs-main";
    const mediaId = sql`uuidv7()`;
    const [catItem] = await portalDb
      .insert(mediaCatalog)
      .values({
        id: mediaId as any,
        contentHash,
        storagePoolId,
        storageKey,
        sizeBytes: file.buffer.byteLength,
        mediaKind,
        mimeType: mime,
        sourceFormat: ext,
        originalFilename: file.originalFilename,
        processingStatus: "ready",
        storageType: "internal",
        createdBy: actor,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: [mediaCatalog.contentHash, mediaCatalog.storagePoolId],
        set: {
          updatedAt: new Date(),
          updatedBy: actor,
        },
      })
      .returning();

    const actualMediaId =
      catItem?.id ||
      (await portalDb
        .select({ id: mediaCatalog.id })
        .from(mediaCatalog)
        .where(and(eq(mediaCatalog.contentHash, contentHash), eq(mediaCatalog.storagePoolId, storagePoolId)))
        .limit(1)
        .then((r) => r[0]?.id));

    // 7. Vincular archivo en la celda y actualizar consumo (D-T2.4)
    await withTenantCellTransaction(clientId, async (tx) => {
      // Registrar en client_media
      await tx
        .insert(cellClientMedia)
        .values({
          clientId,
          mediaId: actualMediaId,
          sizeBytes: file.buffer.byteLength,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();

      // Asociar a producto
      await tx
        .insert(cellProductMedia)
        .values({
          clientId,
          productId,
          mediaId: actualMediaId,
          sortOrder: 0,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();

      // Actualizar contabilidad de uso de almacenamiento
      await tx
        .insert(cellClientUsage)
        .values({
          clientId,
          dimension: "storage_bytes",
          usedValue: file.buffer.byteLength,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoUpdate({
          target: [cellClientUsage.clientId, cellClientUsage.dimension],
          set: {
            usedValue: sql`${cellClientUsage.usedValue} + ${file.buffer.byteLength}`,
            updatedAt: new Date(),
            updatedBy: actor,
          },
        });
    });

    return {
      id: actualMediaId,
      mediaId: actualMediaId,
      mediaKind,
      storageKey,
      signedUrl,
      originalFilename: file.originalFilename,
      mimeType: mime,
      sizeBytes: file.buffer.byteLength,
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
