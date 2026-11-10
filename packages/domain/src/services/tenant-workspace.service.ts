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
import { cells } from "../db/schemas/admin/cells";
import { clientRouting } from "../db/schemas/admin/client-routing";
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
 * Constantes de firma y límites de imgproxy.
 */
export const IMGPROXY_DEFAULTS = {
  maxDimensionPx: 4096,
  bucket: "media",
  keyHex: env.IMGPROXY_KEY || "9b8c2d1e0f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
  saltHex: env.IMGPROXY_SALT || "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  baseUrl: (env.IMGPROXY_BASE_URL || env.IMGPROXY_PUBLIC_URL || "http://localhost:8081").replace(/\/+$/, ""),
};

/**
 * Genera la firma HMAC-SHA256 URL-safe en base64 para un path de imgproxy (CEL-RF-019, D-T1.4).
 */
export function signImgproxyPath(
  path: string,
  keyHex: string = IMGPROXY_DEFAULTS.keyHex,
  saltHex: string = IMGPROXY_DEFAULTS.saltHex,
): string {
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
 * Construye la URL completa firmada para imgproxy.
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

  const resizingType = options.resizingType || "fit";
  const format = options.format || "webp";
  const cleanKey = storageKey.replace(/^\/+/, "");
  const path = `/resize:${resizingType}:${width}:${height}:0/plain/s3://${IMGPROXY_DEFAULTS.bucket}/${cleanKey}@${format}`;
  const signature = signImgproxyPath(path);
  return `${IMGPROXY_DEFAULTS.baseUrl}/${signature}${path}`;
}

/**
 * Valida los magic bytes de un archivo multimedia para prevenir extension spoofing y archivos ejecutables (D-T2.3).
 */
export function validateMediaMagicBytes(buffer: Buffer): { valid: boolean; detectedMime?: string; error?: string } {
  if (buffer.length < 4) {
    return { valid: false, error: "Archivo demasiado pequeño o vacío." };
  }

  // Comprobar ejecutable DOS/PE (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: "Archivos ejecutables binarios no están permitidos." };
  }

  // Comprobar ejecutable ELF (0x7F 'E' 'L' 'F')
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { valid: false, error: "Binarios ELF no están permitidos." };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { valid: true, detectedMime: "image/png" };
  }

  // GIF: 'G' 'I' 'F' '8'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { valid: true, detectedMime: "image/gif" };
  }

  // WEBP: 'R' 'I' 'F' 'F' ... 'W' 'E' 'B' 'P'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: "image/webp" };
  }

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: true, detectedMime: "application/pdf" };
  }

  return { valid: false, error: "Formato no admitido. Formatos permitidos: JPEG, PNG, WEBP, GIF, PDF." };
}

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
    cellCode: string;
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

export interface WorkspaceBillingDto {
  plan: {
    id: string;
    code: string;
    name: string;
    description: string;
  };
  quotas: Array<{
    dimension: string;
    label: string;
    used: number;
    limit: number | null;
    unit: string;
  }>;
  capabilities: Record<string, boolean>;
}

export interface MediaUploadResult {
  id: string;
  storageKey: string;
  signedUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

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

    // 2. Celda física asignada
    const [routing] = await portalDb
      .select({
        cellCode: cells.code,
      })
      .from(clientRouting)
      .innerJoin(cells, eq(cells.id, clientRouting.cellId))
      .where(eq(clientRouting.clientId, clientId))
      .limit(1);

    const cellCode = routing?.cellCode || "cell-01";

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
        cellCode,
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
    // 1. Validar magic bytes (D-T2.3)
    const magic = validateMediaMagicBytes(file.buffer);
    if (!magic.valid) {
      throw new Error(magic.error || "Formato de archivo inválido.");
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
      throw new Error("El producto indicado no existe o no pertenece al inquilino.");
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
          throw new Error(`Has alcanzado el límite de almacenamiento de ${Math.round(limit.value / (1024 * 1024))} MB de tu plan.`);
        }
      }
    }

    const mime = magic.detectedMime || file.mimeType;
    const ext = file.originalFilename.split(".").pop() || "webp";
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const storageKey = `products/${clientId}/${contentHash}.${ext}`;

    // 4. Subir a SeaweedFS S3
    const uploadRes = await this.s3Service.putObject(storageKey, file.buffer, mime);
    if (!uploadRes.ok) {
      appLogger.error(`[uploadProductMedia] Falló la subida a S3: ${uploadRes.error}`);
      throw new Error(`Error al almacenar el archivo multimedia en S3: ${uploadRes.error}`);
    }

    // 5. Registrar en catálogo de medios de control plane
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
        mediaKind: mime.startsWith("image/") ? "image" : "pdf",
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

    // 6. Vincular archivo en la celda y actualizar consumo (D-T2.4)
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

    // 5. Generar URL firmada de imgproxy
    const signedUrl = buildImgproxyUrl(storageKey, { width: 600, height: 600 });

    return {
      id: actualMediaId,
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
   * Detalle de facturación, cuotas y capacidades del plan activo del comercio.
   */
  async getBillingDetails(clientId: string): Promise<WorkspaceBillingDto> {
    const portalDb = getDb();

    // 1. Obtener cliente y plan
    const [client] = await portalDb
      .select({ planId: clients.planId })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Inquilino con ID ${clientId} no encontrado.`);
    }

    const [plan] = await portalDb
      .select()
      .from(plans)
      .where(eq(plans.id, client.planId))
      .limit(1);

    const planName = plan?.name ? ((plan.name as any).es || (plan.name as any).en || "Plan Pro") : "Plan Pro";
    const planDesc = plan?.description ? ((plan.description as any).es || (plan.description as any).en || "Plan operativo") : "Plan operativo";

    // 2. Límites y cuotas
    const limits = await portalDb
      .select()
      .from(planLimits)
      .where(eq(planLimits.planId, client.planId));

    // Consumos celulares
    const usageMetrics = await withTenantCellTransaction(clientId, async (tx) => {
      const [prodRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)));

      const [contactRes] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cellContacts)
        .where(and(eq(cellContacts.clientId, clientId), isNull(cellContacts.deletedAt)));

      const [usageRes] = await tx
        .select({ used: cellClientUsage.usedValue })
        .from(cellClientUsage)
        .where(and(eq(cellClientUsage.clientId, clientId), eq(cellClientUsage.dimension, "storage_bytes")))
        .limit(1);

      return {
        products: prodRes?.count ?? 0,
        contacts: contactRes?.count ?? 0,
        storageBytes: usageRes?.used ?? 0,
      };
    });

    const quotas = [
      {
        dimension: "products",
        label: "Productos Activos",
        used: usageMetrics.products,
        limit: limits.find((l) => l.dimension === "products")?.mode === "UNLIMITED"
          ? null
          : (limits.find((l) => l.dimension === "products")?.value ?? 50),
        unit: "productos",
      },
      {
        dimension: "contacts",
        label: "Contactos CRM",
        used: usageMetrics.contacts,
        limit: limits.find((l) => l.dimension === "contacts")?.mode === "UNLIMITED"
          ? null
          : (limits.find((l) => l.dimension === "contacts")?.value ?? 500),
        unit: "contactos",
      },
      {
        dimension: "storage_bytes",
        label: "Almacenamiento Multimedia",
        used: usageMetrics.storageBytes,
        limit: limits.find((l) => l.dimension === "storage_bytes")?.mode === "UNLIMITED"
          ? null
          : (limits.find((l) => l.dimension === "storage_bytes")?.value ?? 1073741824), // 1GB default
        unit: "bytes",
      },
    ];

    // 3. Capacidades efectivas
    const features = await portalDb
      .select({
        featureKey: planFeatureValues.featureKey,
        enabled: planFeatureValues.enabled,
      })
      .from(planFeatureValues)
      .where(eq(planFeatureValues.planId, client.planId));

    const capabilities: Record<string, boolean> = {};
    for (const f of features) {
      capabilities[f.featureKey] = f.enabled;
    }

    return {
      plan: {
        id: plan?.id || client.planId,
        code: plan?.code || "pro",
        name: planName,
        description: planDesc,
      },
      quotas,
      capabilities,
    };
  }
}

export const tenantWorkspaceService = new TenantWorkspaceService();
