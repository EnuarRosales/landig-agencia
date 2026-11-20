import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cellDatabasePoolManager, withTenantCellTransaction } from "../db/cell-client";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import {
  cloneSyncPolicies,
  organizationMembers,
  organizations,
  productAdoptions,
  productShares,
  productShareVersions,
  syncRuns,
  type CloneSyncPolicy,
  type ProductAdoption,
  type ProductShare,
  type ProductShareVersion,
  type SyncRun,
} from "../db/schemas/admin/communities-and-cloning";
import {
  cellClientMedia,
  cellClientUsage,
  cellProductBundleItems,
  cellProductMedia,
  cellProducts,
  type CellProduct,
  type ProductDynamicAttribute,
} from "../db/schemas/tenant/tenancy-catalog";
import { appLogger } from "../utils/logger";
import { resolveProductMediaUrls } from "./tenant-products-catalog.helpers";
import {
  DrizzleTenantCapabilityGateRepository,
  TenantCapabilityGateService,
} from "./tenant-capability-gate.service";
import { S3StorageService } from "./s3-storage.service";

/**
 * Atributos seguros permitidos para sincronización automática y selectiva sin afectar precio ni inventario propios (`SPEC-15-D08`).
 */
export const SAFE_AUTO_SYNC_ATTRIBUTES = [
  "name",
  "description",
  "category",
  "brand",
  "botMasterPrompt",
  "attributes",
  "media",
] as const;

export type SafeAutoSyncAttribute = (typeof SAFE_AUTO_SYNC_ATTRIBUTES)[number];

/**
 * Atributos del adoptante estrictamente protegidos contra sobreescritura automática (`SPEC-15-D08`).
 */
export const PROTECTED_ADOPTER_ATTRIBUTES = [
  "priceCents",
  "salePriceCents",
  "stockQuantity",
] as const;

export type ShareModerationStatus = "approved" | "pending_review" | "rejected";
export type ShareStatus = "active" | "archived";
export type IncludeMediaMode = "all_compatible" | "cover_only" | "none";

export type PlanQuotaDimension =
  | "products"
  | "storage_bytes"
  | "images_per_product"
  | "videos_per_product"
  | "audios_per_product"
  | "pdfs_per_product";

export interface PlanQuotaViolationDto {
  dimension: PlanQuotaDimension;
  currentUsed: number;
  requiredDelta: number;
  projectedTotal: number;
  limitValue: number;
}

export interface AdoptionPlanEligibilityDto {
  allowed: boolean;
  includeMediaMode: IncludeMediaMode;
  violations: PlanQuotaViolationDto[];
  summary: {
    productsUsed: number;
    productsNeeded: number;
    productsLimit: number | null;
    storageUsedBytes: number;
    storageNeededBytes: number;
    storageLimitBytes: number | null;
  };
}

/**
 * Selecciona los ítems multimedia del snapshot aplicables al modo elegido (`SPEC-15-D10`).
 */
export function selectMediaCandidatesForMode(
  mediaList: ShareSnapshotMediaItem[],
  includeMediaMode: IncludeMediaMode,
): ShareSnapshotMediaItem[] {
  if (includeMediaMode === "none" || mediaList.length === 0) {
    return [];
  }
  if (includeMediaMode === "cover_only") {
    return mediaList
      .filter((m) => m.mediaKind === "image")
      .sort((a, b) => (a.isCover === b.isCover ? a.sortOrder - b.sortOrder : a.isCover ? -1 : 1))
      .slice(0, 1);
  }
  return [...mediaList].sort((a, b) => a.sortOrder - b.sortOrder);
}

function formatBytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Construye un mensaje legible explicando qué variables exactas del plan impiden incorporar el producto (`RN-SPEC-15-04`).
 */
export function formatPlanQuotaViolationsMessage(
  violations: PlanQuotaViolationDto[],
  locale: "es" | "en" = "es",
): string {
  if (violations.length === 0) {
    return locale === "en"
      ? "Your plan quota prevents adding this product."
      : "Tu plan actual impide incorporar este producto en el catálogo.";
  }

  const lines = violations.map((v) => {
    if (v.dimension === "products") {
      return locale === "en"
        ? `Catalog Products (products): using ${v.currentUsed} of ${v.limitValue}, requires +${v.requiredDelta}.`
        : `Límite de Productos en Catálogo (products): usas ${v.currentUsed} de ${v.limitValue} permitido(s), requiere +${v.requiredDelta}.`;
    }
    if (v.dimension === "storage_bytes") {
      return locale === "en"
        ? `Storage Space (storage_bytes): using ${formatBytesLabel(v.currentUsed)} of ${formatBytesLabel(v.limitValue)}, requires +${formatBytesLabel(v.requiredDelta)}.`
        : `Almacenamiento Disponible (storage_bytes): usas ${formatBytesLabel(v.currentUsed)} de ${formatBytesLabel(v.limitValue)}, requiere +${formatBytesLabel(v.requiredDelta)}.`;
    }

    const kindMapEs: Record<string, string> = {
      images_per_product: "Imágenes por Producto",
      videos_per_product: "Videos por Producto",
      audios_per_product: "Audios por Producto",
      pdfs_per_product: "PDFs por Producto",
    };
    const kindMapEn: Record<string, string> = {
      images_per_product: "Images per Product",
      videos_per_product: "Videos per Product",
      audios_per_product: "Audios per Product",
      pdfs_per_product: "PDFs per Product",
    };

    const label =
      locale === "en"
        ? kindMapEn[v.dimension] ?? v.dimension
        : kindMapEs[v.dimension] ?? v.dimension;

    return locale === "en"
      ? `${label} (${v.dimension}): product includes ${v.requiredDelta}, your plan allows max ${v.limitValue}.`
      : `${label} (${v.dimension}): el producto incluye ${v.requiredDelta} y tu plan permite máximo ${v.limitValue}.`;
  });

  const prefix =
    locale === "en"
      ? "Plan capacity exceeded:"
      : "No es posible clonar porque supera la capacidad de tu plan:";
  return `${prefix} ${lines.join(" ")}`;
}

export interface ShareSnapshotMediaItem {
  mediaId: string;
  storageKey: string;
  contentHash: string;
  mediaKind: "image" | "video" | "audio" | "pdf";
  mimeType: string;
  sourceFormat: string;
  originalFilename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  storageType: "internal" | "external";
  sourceUrl: string | null;
  provider: string | null;
  isCover: boolean;
  altText: string | null;
  sortOrder: number;
}

export interface ShareSnapshotBundleComponent {
  sourceComponentProductId: string;
  name: string;
  description: string;
  sku: string | null;
  gtin: string | null;
  mpn: string | null;
  kind: "physical" | "digital" | "service";
  condition: "new" | "refurbished" | "used";
  availability: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  brand: string | null;
  category: string | null;
  priceCents: number;
  costPriceCents: number;
  currency: string;
  botMasterPrompt: string;
  attributes: ProductDynamicAttribute[];
  quantity: number;
  sortOrder: number;
  media: ShareSnapshotMediaItem[];
}

export interface ProductSnapshot {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  sku?: string;
  gtin?: string | null;
  mpn?: string | null;
  category?: string;
  brand?: string;
  kind?: "physical" | "digital" | "service";
  compositionType?: "simple" | "combo";
  condition?: "new" | "refurbished" | "used";
  availability?: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  wholesaleCostCents?: number | null;
  suggestedPriceCents?: number | null;
  minResalePriceCents?: number | null;
  referenceStock?: number | null;
  botMasterPrompt?: string;
  mediaIds?: string[];
  media?: ShareSnapshotMediaItem[];
  attributes?: Record<string, unknown> | ProductDynamicAttribute[];
  comboComponents?: ShareSnapshotBundleComponent[];
}

export interface PublishShareFromProductInput {
  organizationId: string;
  sharerClientId: string;
  createdByUserId: string;
  sourceProductId: string;
  wholesaleCostCents?: number | null;
  suggestedPriceCents?: number | null;
  minResalePriceCents?: number | null;
  includeReferenceStock?: boolean;
  changelog?: string | null;
}

export interface PublishNewVersionFromProductInput {
  shareId: string;
  sharerClientId: string;
  actorUserId: string;
  wholesaleCostCents?: number | null;
  suggestedPriceCents?: number | null;
  minResalePriceCents?: number | null;
  includeReferenceStock?: boolean;
  changelog?: string | null;
}

export interface AdoptShareInput {
  shareId: string;
  adopterClientId: string;
  createdByUserId: string;
  customSalePriceCents?: number | null;
  customCostPriceCents?: number | null;
  initialStock?: number | null;
  initialStatus?: "active" | "draft";
  includeMediaMode?: IncludeMediaMode;
  retainLink?: boolean;
  autoSyncAttributes?: string[];
}

export interface SyncAdoptionSelectiveInput {
  adoptionId: string;
  clientId: string;
  actorUserId: string;
  attributes: string[];
  applySuggestedPrice?: boolean;
  applyWholesaleCost?: boolean;
  syncMedia?: boolean;
}

export interface LeaderCandidateProductDto {
  productId: string;
  name: string;
  sku: string | null;
  kind: "physical" | "digital" | "service";
  compositionType: "simple" | "combo";
  status: string;
  priceCents: number;
  costPriceCents: number;
  currency: string;
  stockQuantity: number | null;
  category: string | null;
  brand: string | null;
  coverImageUrl: string | null;
  mediaCounts: { image: number; video: number; audio: number; pdf: number };
  comboComponentsCount: number;
  isClonedFromCommunity: boolean;
  share: {
    shareId: string;
    status: ShareStatus;
    moderationStatus: ShareModerationStatus;
    rejectionReason: string | null;
    currentVersion: number;
    wholesaleCostCents: number | null;
    suggestedPriceCents: number | null;
    minResalePriceCents: number | null;
    adoptionsCount: number;
    hasPendingChanges: boolean;
    pendingChangedAttributes: string[];
    updatedAt: string;
  } | null;
}

export interface CommunityFeedItemDto {
  shareId: string;
  organizationId: string;
  organizationName: string;
  sharerClientId: string;
  sharerDisplayName: string;
  sourceProductId: string;
  currentVersion: number;
  latestChangelog: string | null;
  status: ShareStatus;
  moderationStatus: ShareModerationStatus;
  rejectionReason: string | null;
  name: string;
  description: string;
  sku: string | null;
  kind: "physical" | "digital" | "service";
  compositionType: "simple" | "combo";
  category: string | null;
  brand: string | null;
  currency: string;
  wholesaleCostCents: number | null;
  suggestedPriceCents: number;
  minResalePriceCents: number | null;
  suggestedMarginPercent: number | null;
  referenceStock: number | null;
  coverImageUrl: string | null;
  mediaPreviewUrls: string[];
  mediaCounts: { image: number; video: number; audio: number; pdf: number };
  attributesCount: number;
  comboComponents: Array<{ name: string; quantity: number; kind: string }>;
  botMasterPromptPreview: string;
  adoptionsCount: number;
  isOwnShare: boolean;
  alreadyAdopted: boolean;
  adoptionId: string | null;
  adoptedVersion: number | null;
  hasUpdateAvailable: boolean;
  publishedAt: string;
  updatedAt: string;
}

export interface CommunityFeedCatalogPage {
  items: CommunityFeedItemDto[];
  pendingModerationItems: CommunityFeedItemDto[];
  categories: string[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdoptionDiffField {
  attribute: string;
  kind: "safe" | "reference";
  hasChangedInVersion: boolean;
  differsFromCurrentClone: boolean;
  currentValue: unknown;
  incomingValue: unknown;
}

export interface AdoptionDiffResultDto {
  adoptionId: string;
  shareId: string;
  organizationName: string;
  sharerDisplayName: string;
  cloneProductId: string;
  cloneName: string;
  adoptedVersion: number;
  latestVersion: number;
  hasUpdateAvailable: boolean;
  latestChangelog: string | null;
  changedAttributesInVersions: string[];
  protectedSnapshot: {
    memberPriceCents: number;
    memberCostPriceCents: number;
    memberStockQuantity: number | null;
    incomingWholesaleCostCents: number | null;
    incomingSuggestedPriceCents: number;
    minResalePriceCents: number | null;
  };
  fields: AdoptionDiffField[];
}

export interface MyAdoptionItemDto {
  adoptionId: string;
  shareId: string;
  organizationId: string;
  organizationName: string;
  sharerDisplayName: string;
  cloneProductId: string;
  cloneName: string;
  cloneSku: string | null;
  cloneStatus: string;
  clonePriceCents: number;
  cloneCostPriceCents: number;
  cloneStockQuantity: number | null;
  cloneCoverImageUrl: string | null;
  compositionType: "simple" | "combo";
  currency: string;
  adoptedVersion: number;
  latestVersion: number;
  hasUpdateAvailable: boolean;
  latestChangelog: string | null;
  linkActive: boolean;
  shareStatus: ShareStatus;
  autoSyncAttributes: string[];
  recentSyncRuns: Array<{
    id: string;
    version: number;
    mode: string;
    attributes: string[];
    status: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SkippedMediaReport {
  filename: string;
  mediaKind: string;
  reason: string;
}

export interface AdoptShareResultDto {
  adoptionId: string | null;
  cloneProductId: string;
  cloneCellId: string;
  createdProductsCount: number;
  copiedMediaCount: number;
  skippedMedia: SkippedMediaReport[];
  version: number;
}

/**
 * Normaliza un valor arbitrario a representación JSON determinista para comparar snapshots sin falsos positivos.
 */
export function canonicalizeForDiff(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalizeForDiff(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeForDiff(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Normaliza arreglo de medios de un snapshot para comparación estable entre versiones.
 */
function normalizeMediaForDiff(media?: ShareSnapshotMediaItem[]): Array<Record<string, unknown>> {
  if (!media || media.length === 0) return [];
  return [...media]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.contentHash.localeCompare(b.contentHash))
    .map((m) => ({
      contentHash: m.contentHash,
      mediaKind: m.mediaKind,
      isCover: m.isCover,
      altText: m.altText ?? null,
      sortOrder: m.sortOrder,
    }));
}

/**
 * Calcula los atributos modificados entre dos snapshots de producto compartido (`SPEC-15-D07`).
 */
export function computeProductSnapshotDiff(
  previous: ProductSnapshot | null | undefined,
  next: ProductSnapshot,
): string[] {
  if (!previous) {
    return ["name", "description"];
  }

  const changed: string[] = [];

  const scalarFields: Array<keyof ProductSnapshot> = [
    "name",
    "description",
    "sku",
    "category",
    "brand",
    "botMasterPrompt",
    "wholesaleCostCents",
    "suggestedPriceCents",
    "minResalePriceCents",
    "referenceStock",
  ];

  for (const field of scalarFields) {
    const prevVal = previous[field] ?? null;
    const nextVal = next[field] ?? null;
    if (canonicalizeForDiff(prevVal) !== canonicalizeForDiff(nextVal)) {
      changed.push(field);
    }
  }

  if (canonicalizeForDiff(previous.attributes ?? []) !== canonicalizeForDiff(next.attributes ?? [])) {
    changed.push("attributes");
  }

  if (
    canonicalizeForDiff(normalizeMediaForDiff(previous.media)) !==
    canonicalizeForDiff(normalizeMediaForDiff(next.media))
  ) {
    changed.push("media");
  }

  if (
    canonicalizeForDiff(previous.comboComponents ?? []) !==
    canonicalizeForDiff(next.comboComponents ?? [])
  ) {
    changed.push("comboComponents");
  }

  return changed;
}

/**
 * Contrato de persistencia completo para SPEC-15 (multi-comunidad, combos, S3 aislado, cuotas y diff).
 */
export interface ISpec15ProductCloningStore {
  getOrganizationAndMembership(
    orgId: string,
    clientId: string,
  ): Promise<{
    org: {
      id: string;
      name: string;
      slug: string;
      status: string;
      sharePolicy: "leaders_only" | "collaborative";
      requireShareApproval: boolean;
    };
    membership: { role: string; status: string } | null;
  } | null>;
  getActiveMembershipsForClient(clientId: string): Promise<
    Array<{
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
      role: string;
      sharePolicy: "leaders_only" | "collaborative";
      requireShareApproval: boolean;
    }>
  >;
  listClientLiveProductsWithShareState(
    clientId: string,
    organizationId: string,
  ): Promise<{
    products: Array<{
      product: CellProduct;
      snapshot: ProductSnapshot;
      coverImageUrl: string | null;
      mediaCounts: { image: number; video: number; audio: number; pdf: number };
      comboComponentsCount: number;
    }>;
    sharesByProductId: Map<
      string,
      {
        share: ProductShare;
        latestVersion: ProductShareVersion | null;
        adoptionsCount: number;
      }
    >;
  }>;
  buildLiveSnapshotForProduct(
    clientId: string,
    productId: string,
    commercialOverrides?: {
      wholesaleCostCents?: number | null;
      suggestedPriceCents?: number | null;
      minResalePriceCents?: number | null;
      includeReferenceStock?: boolean;
    },
  ): Promise<{
    product: CellProduct;
    cellId: string;
    snapshot: ProductSnapshot;
  } | null>;
  findShareByOrgAndProduct(
    organizationId: string,
    sourceProductId: string,
  ): Promise<ProductShare | null>;
  createSpec15Share(input: {
    organizationId: string;
    sharerClientId: string;
    createdByUserId: string;
    sourceProductId: string;
    sourceCellId: string;
    moderationStatus: ShareModerationStatus;
    changelog: string | null;
    snapshot: ProductSnapshot;
  }): Promise<{ share: ProductShare; version: ProductShareVersion }>;
  findShareWithLatestVersion(shareId: string): Promise<{
    share: ProductShare;
    latestVersion: ProductShareVersion | null;
    organizationName: string;
    sharerDisplayName: string;
  } | null>;
  createSpec15ShareVersion(input: {
    shareId: string;
    version: number;
    changedAttributes: string[];
    changelog: string | null;
    snapshot: ProductSnapshot;
  }): Promise<ProductShareVersion>;
  updateShareModeration(input: {
    shareId: string;
    moderationStatus: ShareModerationStatus;
    moderatedByUserId: string;
    rejectionReason: string | null;
  }): Promise<ProductShare | null>;
  updateShareStatus(shareId: string, status: ShareStatus): Promise<ProductShare | null>;
  listSharesForOrganizations(organizationIds: string[]): Promise<
    Array<{
      share: ProductShare;
      latestVersion: ProductShareVersion | null;
      organizationName: string;
      sharerDisplayName: string;
      adoptionsCount: number;
    }>
  >;
  listAdoptionsForClient(clientId: string): Promise<ProductAdoption[]>;
  findAdoptionsForShare(shareId: string): Promise<ProductAdoption[]>;
  findAdoptionWithContext(adoptionId: string): Promise<{
    adoption: ProductAdoption;
    share: ProductShare;
    latestVersion: ProductShareVersion | null;
    versionsSinceAdopted: ProductShareVersion[];
    organizationName: string;
    sharerDisplayName: string;
    policies: CloneSyncPolicy[];
  } | null>;
  getLiveProductForDiff(
    clientId: string,
    productId: string,
  ): Promise<{
    product: CellProduct;
    coverImageUrl: string | null;
    mediaHashes: string[];
  } | null>;
  evaluateAdoptionPlanEligibility?(input: {
    adopterClientId: string;
    snapshot: ProductSnapshot;
    includeMediaMode: IncludeMediaMode;
  }): Promise<AdoptionPlanEligibilityDto>;
  adoptSnapshotToTenantCell(input: {
    adopterClientId: string;
    createdByUserId: string;
    shareId: string;
    shareVersion: number;
    snapshot: ProductSnapshot;
    customSalePriceCents: number;
    customCostPriceCents: number;
    initialStock: number | null;
    initialStatus: "active" | "draft";
    includeMediaMode: IncludeMediaMode;
    retainLink: boolean;
    autoSyncAttributes: SafeAutoSyncAttribute[];
  }): Promise<AdoptShareResultDto>;
  syncAdoptionInTenantCell(input: {
    adoption: ProductAdoption;
    targetVersion: number;
    snapshot: ProductSnapshot;
    attributesToUpdate: string[];
    applySuggestedPrice?: boolean;
    applyWholesaleCost?: boolean;
    syncMedia?: boolean;
    mode: "manual" | "auto";
    advanceAdoptedVersion: boolean;
    actorUserId?: string;
  }): Promise<{ syncedAttributes: string[] }>;
  updateCloneSyncPolicies(
    adoptionId: string,
    autoSyncAttributes: SafeAutoSyncAttribute[],
    actorUserId?: string,
  ): Promise<CloneSyncPolicy[]>;
  unlinkAdoption(adoptionId: string): Promise<void>;
  listSyncRunsForAdoptions(adoptionIds: string[]): Promise<SyncRun[]>;
  getSyncPoliciesForAdoption(adoptionId: string): Promise<CloneSyncPolicy[]>;
}

/**
 * Implementación Drizzle multi-celda + SeaweedFS S3 aislada del almacén SPEC-15.
 */
export class DrizzleSpec15ProductCloningStore implements ISpec15ProductCloningStore {
  private readonly s3: S3StorageService;
  private readonly capabilityGate: TenantCapabilityGateService;

  constructor(
    s3Service?: S3StorageService,
    capabilityGate?: TenantCapabilityGateService,
  ) {
    this.s3 = s3Service ?? new S3StorageService();
    this.capabilityGate =
      capabilityGate ??
      new TenantCapabilityGateService(new DrizzleTenantCapabilityGateRepository());
  }

  async getOrganizationAndMembership(orgId: string, clientId: string) {
    const db = getDb();
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        sharePolicy: organizations.sharePolicy,
        requireShareApproval: organizations.requireShareApproval,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) return null;

    const [membership] = await db
      .select({
        role: organizationMembers.role,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.clientId, clientId),
        ),
      )
      .limit(1);

    return {
      org: {
        ...org,
        sharePolicy: org.sharePolicy as "leaders_only" | "collaborative",
      },
      membership: membership ?? null,
    };
  }

  async getActiveMembershipsForClient(clientId: string) {
    const db = getDb();
    const rows = await db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMembers.role,
        sharePolicy: organizations.sharePolicy,
        requireShareApproval: organizations.requireShareApproval,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizationMembers.clientId, clientId),
          eq(organizationMembers.status, "active"),
          eq(organizations.status, "active"),
        ),
      );

    return rows.map((row) => ({
      ...row,
      sharePolicy: row.sharePolicy as "leaders_only" | "collaborative",
    }));
  }

  private async hydrateMediaSnapshotForProducts(
    clientId: string,
    productIds: string[],
  ): Promise<Map<string, ShareSnapshotMediaItem[]>> {
    const map = new Map<string, ShareSnapshotMediaItem[]>();
    if (productIds.length === 0) return map;

    const pmRows = await withTenantCellTransaction(clientId, async (tx) =>
      tx
        .select()
        .from(cellProductMedia)
        .where(
          and(
            eq(cellProductMedia.clientId, clientId),
            inArray(cellProductMedia.productId, productIds),
          ),
        ),
    );

    if (pmRows.length === 0) return map;

    const mediaIds = Array.from(new Set(pmRows.map((pm) => pm.mediaId)));
    const db = getDb();
    const catalogRows = await db
      .select()
      .from(mediaCatalog)
      .where(inArray(mediaCatalog.id, mediaIds));
    const catalogMap = new Map(catalogRows.map((c) => [c.id, c]));

    for (const pm of pmRows) {
      const mc = catalogMap.get(pm.mediaId);
      if (!mc) continue;
      const list = map.get(pm.productId) ?? [];
      list.push({
        mediaId: mc.id,
        storageKey: mc.storageKey,
        contentHash: mc.contentHash,
        mediaKind: pm.mediaKind as "image" | "video" | "audio" | "pdf",
        mimeType: mc.mimeType,
        sourceFormat: mc.sourceFormat,
        originalFilename: mc.originalFilename,
        sizeBytes: Number(mc.sizeBytes ?? 0),
        width: mc.width ?? null,
        height: mc.height ?? null,
        durationMs: mc.durationMs ?? null,
        storageType: mc.storageType as "internal" | "external",
        sourceUrl: mc.sourceUrl ?? null,
        provider: mc.provider ?? null,
        isCover: pm.isCover,
        altText: pm.altText ?? null,
        sortOrder: pm.sortOrder,
      });
      map.set(pm.productId, list);
    }

    for (const [key, list] of map.entries()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      map.set(key, list);
    }

    return map;
  }

  private buildSnapshotFromProduct(
    product: CellProduct,
    media: ShareSnapshotMediaItem[],
    comboComponents: ShareSnapshotBundleComponent[],
    commercialOverrides?: {
      wholesaleCostCents?: number | null;
      suggestedPriceCents?: number | null;
      minResalePriceCents?: number | null;
      includeReferenceStock?: boolean;
    },
  ): ProductSnapshot {
    const wholesaleCostCents =
      commercialOverrides?.wholesaleCostCents !== undefined
        ? commercialOverrides.wholesaleCostCents
        : product.costPriceCents ?? 0;

    const suggestedPriceCents =
      commercialOverrides?.suggestedPriceCents !== undefined &&
      commercialOverrides.suggestedPriceCents !== null
        ? commercialOverrides.suggestedPriceCents
        : product.priceCents;

    const minResalePriceCents =
      commercialOverrides?.minResalePriceCents !== undefined
        ? commercialOverrides.minResalePriceCents
        : null;

    const includeReferenceStock = commercialOverrides?.includeReferenceStock ?? false;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: suggestedPriceCents,
      currency: product.currency || "COP",
      sku: product.sku ?? undefined,
      gtin: product.gtin ?? null,
      mpn: product.mpn ?? null,
      category: product.category ?? undefined,
      brand: product.brand ?? undefined,
      kind: (product.kind || "physical") as "physical" | "digital" | "service",
      compositionType: (product.compositionType || "simple") as "simple" | "combo",
      condition: (product.condition || "new") as "new" | "refurbished" | "used",
      availability: (product.availability || "in_stock") as
        | "in_stock"
        | "out_of_stock"
        | "preorder"
        | "backorder",
      wholesaleCostCents,
      suggestedPriceCents,
      minResalePriceCents,
      referenceStock: includeReferenceStock ? (product.stockQuantity ?? null) : null,
      botMasterPrompt: product.botMasterPrompt || "",
      mediaIds: media.map((m) => m.mediaId),
      media,
      attributes: Array.isArray(product.attributes) ? product.attributes : [],
      comboComponents: comboComponents.length > 0 ? comboComponents : undefined,
    };
  }

  async buildLiveSnapshotForProduct(
    clientId: string,
    productId: string,
    commercialOverrides?: {
      wholesaleCostCents?: number | null;
      suggestedPriceCents?: number | null;
      minResalePriceCents?: number | null;
      includeReferenceStock?: boolean;
    },
  ) {
    const cellId = await cellDatabasePoolManager.resolveCellIdForClient(clientId);
    const cellData = await withTenantCellTransaction(clientId, async (tx) => {
      const [product] = await tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            eq(cellProducts.id, productId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .limit(1);

      if (!product) return null;

      const bundleRows =
        product.compositionType === "combo"
          ? await tx
              .select()
              .from(cellProductBundleItems)
              .where(
                and(
                  eq(cellProductBundleItems.clientId, clientId),
                  eq(cellProductBundleItems.bundleProductId, product.id),
                ),
              )
          : [];

      const compIds = bundleRows.map((b) => b.componentProductId);
      const componentProducts =
        compIds.length > 0
          ? await tx
              .select()
              .from(cellProducts)
              .where(
                and(
                  eq(cellProducts.clientId, clientId),
                  inArray(cellProducts.id, compIds),
                  isNull(cellProducts.deletedAt),
                ),
              )
          : [];

      return { product, bundleRows, componentProducts };
    });

    if (!cellData) return null;

    const allProductIds = [
      cellData.product.id,
      ...cellData.componentProducts.map((c) => c.id),
    ];
    const mediaMap = await this.hydrateMediaSnapshotForProducts(clientId, allProductIds);
    const compMap = new Map(cellData.componentProducts.map((c) => [c.id, c]));

    const comboComponents: ShareSnapshotBundleComponent[] = [];
    for (const b of [...cellData.bundleRows].sort((a, c) => a.sortOrder - c.sortOrder)) {
      const comp = compMap.get(b.componentProductId);
      if (!comp) continue;
      comboComponents.push({
        sourceComponentProductId: comp.id,
        name: comp.name,
        description: comp.description,
        sku: comp.sku ?? null,
        gtin: comp.gtin ?? null,
        mpn: comp.mpn ?? null,
        kind: (comp.kind || "physical") as "physical" | "digital" | "service",
        condition: (comp.condition || "new") as "new" | "refurbished" | "used",
        availability: (comp.availability || "in_stock") as
          | "in_stock"
          | "out_of_stock"
          | "preorder"
          | "backorder",
        brand: comp.brand ?? null,
        category: comp.category ?? null,
        priceCents: comp.priceCents,
        costPriceCents: comp.costPriceCents ?? 0,
        currency: comp.currency || "COP",
        botMasterPrompt: comp.botMasterPrompt || "",
        attributes: Array.isArray(comp.attributes) ? comp.attributes : [],
        quantity: b.quantity,
        sortOrder: b.sortOrder,
        media: mediaMap.get(comp.id) ?? [],
      });
    }

    const snapshot = this.buildSnapshotFromProduct(
      cellData.product,
      mediaMap.get(cellData.product.id) ?? [],
      comboComponents,
      commercialOverrides,
    );

    return {
      product: cellData.product,
      cellId,
      snapshot,
    };
  }

  async listClientLiveProductsWithShareState(clientId: string, organizationId: string) {
    const db = getDb();
    const cellData = await withTenantCellTransaction(clientId, async (tx) => {
      const products = await tx
        .select()
        .from(cellProducts)
        .where(and(eq(cellProducts.clientId, clientId), isNull(cellProducts.deletedAt)))
        .orderBy(desc(cellProducts.updatedAt));

      const comboIds = products.filter((p) => p.compositionType === "combo").map((p) => p.id);
      const bundleRows =
        comboIds.length > 0
          ? await tx
              .select()
              .from(cellProductBundleItems)
              .where(
                and(
                  eq(cellProductBundleItems.clientId, clientId),
                  inArray(cellProductBundleItems.bundleProductId, comboIds),
                ),
              )
          : [];

      return { products, bundleRows };
    });

    const allProductIds = cellData.products.map((p) => p.id);
    const mediaMap = await this.hydrateMediaSnapshotForProducts(clientId, allProductIds);
    const productMap = new Map(cellData.products.map((p) => [p.id, p]));

    const bundlesByParent = new Map<string, typeof cellData.bundleRows>();
    for (const row of cellData.bundleRows) {
      const list = bundlesByParent.get(row.bundleProductId) ?? [];
      list.push(row);
      bundlesByParent.set(row.bundleProductId, list);
    }

    const shareRows = await db
      .select()
      .from(productShares)
      .where(
        and(
          eq(productShares.organizationId, organizationId),
          eq(productShares.sharerClientId, clientId),
        ),
      );

    const shareIds = shareRows.map((s) => s.id);
    const [versionRows, adoptionRows] = await Promise.all([
      shareIds.length > 0
        ? db
            .select()
            .from(productShareVersions)
            .where(inArray(productShareVersions.shareId, shareIds))
        : Promise.resolve([]),
      shareIds.length > 0
        ? db
            .select({ shareId: productAdoptions.shareId })
            .from(productAdoptions)
            .where(
              and(
                inArray(productAdoptions.shareId, shareIds),
                eq(productAdoptions.linkActive, true),
              ),
            )
        : Promise.resolve([]),
    ]);

    const adoptionCounts = new Map<string, number>();
    for (const a of adoptionRows) {
      adoptionCounts.set(a.shareId, (adoptionCounts.get(a.shareId) ?? 0) + 1);
    }

    const sharesByProductId = new Map<
      string,
      {
        share: ProductShare;
        latestVersion: ProductShareVersion | null;
        adoptionsCount: number;
      }
    >();
    for (const share of shareRows) {
      const latestVersion =
        versionRows.find(
          (v) => v.shareId === share.id && v.version === share.currentVersion,
        ) ?? null;
      sharesByProductId.set(share.sourceProductId, {
        share,
        latestVersion,
        adoptionsCount: adoptionCounts.get(share.id) ?? 0,
      });
    }

    const products = cellData.products.map((product) => {
      const pMedia = mediaMap.get(product.id) ?? [];
      const bRows = (bundlesByParent.get(product.id) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );

      const comboComponents: ShareSnapshotBundleComponent[] = [];
      for (const b of bRows) {
        const comp = productMap.get(b.componentProductId);
        if (!comp) continue;
        comboComponents.push({
          sourceComponentProductId: comp.id,
          name: comp.name,
          description: comp.description,
          sku: comp.sku ?? null,
          gtin: comp.gtin ?? null,
          mpn: comp.mpn ?? null,
          kind: (comp.kind || "physical") as "physical" | "digital" | "service",
          condition: (comp.condition || "new") as "new" | "refurbished" | "used",
          availability: (comp.availability || "in_stock") as
            | "in_stock"
            | "out_of_stock"
            | "preorder"
            | "backorder",
          brand: comp.brand ?? null,
          category: comp.category ?? null,
          priceCents: comp.priceCents,
          costPriceCents: comp.costPriceCents ?? 0,
          currency: comp.currency || "COP",
          botMasterPrompt: comp.botMasterPrompt || "",
          attributes: Array.isArray(comp.attributes) ? comp.attributes : [],
          quantity: b.quantity,
          sortOrder: b.sortOrder,
          media: mediaMap.get(comp.id) ?? [],
        });
      }

      const existingShareInfo = sharesByProductId.get(product.id);
      const existingSnap = existingShareInfo?.latestVersion?.snapshot as
        | ProductSnapshot
        | undefined;

      // Mantener precio/costo comercial del share si ya estaba compartido al comparar diffs del catálogo
      const snapshot = this.buildSnapshotFromProduct(product, pMedia, comboComponents, {
        wholesaleCostCents: existingSnap?.wholesaleCostCents,
        suggestedPriceCents: existingSnap?.suggestedPriceCents,
        minResalePriceCents: existingSnap?.minResalePriceCents,
        includeReferenceStock:
          existingSnap?.referenceStock !== null && existingSnap?.referenceStock !== undefined,
      });

      const coverItem =
        pMedia.find((m) => m.mediaKind === "image" && m.isCover) ??
        pMedia.find((m) => m.mediaKind === "image") ??
        null;

      const coverImageUrl = coverItem
        ? resolveProductMediaUrls({
            mediaId: coverItem.mediaId,
            mediaKind: "image",
            storageKey: coverItem.storageKey,
          }).thumbUrl
        : null;

      const mediaCounts = { image: 0, video: 0, audio: 0, pdf: 0 };
      for (const m of pMedia) {
        if (m.mediaKind in mediaCounts) {
          mediaCounts[m.mediaKind] += 1;
        }
      }

      return {
        product,
        snapshot,
        coverImageUrl,
        mediaCounts,
        comboComponentsCount: bRows.length,
      };
    });

    return { products, sharesByProductId };
  }

  async findShareByOrgAndProduct(organizationId: string, sourceProductId: string) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(productShares)
      .where(
        and(
          eq(productShares.organizationId, organizationId),
          eq(productShares.sourceProductId, sourceProductId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createSpec15Share(input: {
    organizationId: string;
    sharerClientId: string;
    createdByUserId: string;
    sourceProductId: string;
    sourceCellId: string;
    moderationStatus: ShareModerationStatus;
    changelog: string | null;
    snapshot: ProductSnapshot;
  }) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [share] = await tx
        .insert(productShares)
        .values({
          organizationId: input.organizationId,
          sharerClientId: input.sharerClientId,
          createdByUserId: input.createdByUserId,
          sourceProductId: input.sourceProductId,
          sourceCellId: input.sourceCellId,
          currentVersion: 1,
          status: "active",
          moderationStatus: input.moderationStatus,
          createdBy: input.createdByUserId,
          updatedBy: input.createdByUserId,
        })
        .returning();

      const [version] = await tx
        .insert(productShareVersions)
        .values({
          shareId: share.id,
          version: 1,
          changedAttributes: ["initial"],
          changelog: input.changelog,
          snapshot: input.snapshot as unknown as Record<string, unknown>,
        })
        .returning();

      return { share, version };
    });
  }

  async findShareWithLatestVersion(shareId: string) {
    const db = getDb();
    const [row] = await db
      .select({
        share: productShares,
        organizationName: organizations.name,
        sharerDisplayName: clients.displayName,
      })
      .from(productShares)
      .innerJoin(organizations, eq(organizations.id, productShares.organizationId))
      .innerJoin(clients, eq(clients.id, productShares.sharerClientId))
      .where(eq(productShares.id, shareId))
      .limit(1);

    if (!row) return null;

    const [latestVersion] = await db
      .select()
      .from(productShareVersions)
      .where(
        and(
          eq(productShareVersions.shareId, shareId),
          eq(productShareVersions.version, row.share.currentVersion),
        ),
      )
      .limit(1);

    return {
      share: row.share,
      latestVersion: latestVersion ?? null,
      organizationName: row.organizationName,
      sharerDisplayName: row.sharerDisplayName,
    };
  }

  async createSpec15ShareVersion(input: {
    shareId: string;
    version: number;
    changedAttributes: string[];
    changelog: string | null;
    snapshot: ProductSnapshot;
  }) {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [versionRow] = await tx
        .insert(productShareVersions)
        .values({
          shareId: input.shareId,
          version: input.version,
          changedAttributes: input.changedAttributes,
          changelog: input.changelog,
          snapshot: input.snapshot as unknown as Record<string, unknown>,
        })
        .returning();

      await tx
        .update(productShares)
        .set({
          currentVersion: input.version,
          updatedAt: new Date(),
        })
        .where(eq(productShares.id, input.shareId));

      return versionRow;
    });
  }

  async updateShareModeration(input: {
    shareId: string;
    moderationStatus: ShareModerationStatus;
    moderatedByUserId: string;
    rejectionReason: string | null;
  }) {
    const db = getDb();
    const [updated] = await db
      .update(productShares)
      .set({
        moderationStatus: input.moderationStatus,
        moderatedByUserId: input.moderatedByUserId,
        moderatedAt: new Date(),
        rejectionReason: input.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(productShares.id, input.shareId))
      .returning();

    return updated ?? null;
  }

  async updateShareStatus(shareId: string, status: ShareStatus) {
    const db = getDb();
    const [updated] = await db
      .update(productShares)
      .set({ status, updatedAt: new Date() })
      .where(eq(productShares.id, shareId))
      .returning();
    return updated ?? null;
  }

  async listSharesForOrganizations(organizationIds: string[]) {
    if (organizationIds.length === 0) return [];
    const db = getDb();

    const rows = await db
      .select({
        share: productShares,
        organizationName: organizations.name,
        sharerDisplayName: clients.displayName,
      })
      .from(productShares)
      .innerJoin(organizations, eq(organizations.id, productShares.organizationId))
      .innerJoin(clients, eq(clients.id, productShares.sharerClientId))
      .where(inArray(productShares.organizationId, organizationIds))
      .orderBy(desc(productShares.updatedAt));

    if (rows.length === 0) return [];

    const shareIds = rows.map((r) => r.share.id);
    const [versionRows, adoptionRows] = await Promise.all([
      db
        .select()
        .from(productShareVersions)
        .where(inArray(productShareVersions.shareId, shareIds)),
      db
        .select({ shareId: productAdoptions.shareId })
        .from(productAdoptions)
        .where(
          and(
            inArray(productAdoptions.shareId, shareIds),
            eq(productAdoptions.linkActive, true),
          ),
        ),
    ]);

    const adoptionCounts = new Map<string, number>();
    for (const a of adoptionRows) {
      adoptionCounts.set(a.shareId, (adoptionCounts.get(a.shareId) ?? 0) + 1);
    }

    return rows.map((row) => {
      const latestVersion =
        versionRows.find(
          (v) => v.shareId === row.share.id && v.version === row.share.currentVersion,
        ) ?? null;
      return {
        share: row.share,
        latestVersion,
        organizationName: row.organizationName,
        sharerDisplayName: row.sharerDisplayName,
        adoptionsCount: adoptionCounts.get(row.share.id) ?? 0,
      };
    });
  }

  async listAdoptionsForClient(clientId: string) {
    const db = getDb();
    return db
      .select()
      .from(productAdoptions)
      .where(eq(productAdoptions.adopterClientId, clientId))
      .orderBy(desc(productAdoptions.updatedAt));
  }

  async findAdoptionsForShare(shareId: string) {
    const db = getDb();
    return db
      .select()
      .from(productAdoptions)
      .where(eq(productAdoptions.shareId, shareId));
  }

  async findAdoptionWithContext(adoptionId: string) {
    const db = getDb();
    const [row] = await db
      .select({
        adoption: productAdoptions,
        share: productShares,
        organizationName: organizations.name,
        sharerDisplayName: clients.displayName,
      })
      .from(productAdoptions)
      .innerJoin(productShares, eq(productShares.id, productAdoptions.shareId))
      .innerJoin(organizations, eq(organizations.id, productShares.organizationId))
      .innerJoin(clients, eq(clients.id, productShares.sharerClientId))
      .where(eq(productAdoptions.id, adoptionId))
      .limit(1);

    if (!row) return null;

    const [versions, policies] = await Promise.all([
      db
        .select()
        .from(productShareVersions)
        .where(eq(productShareVersions.shareId, row.share.id))
        .orderBy(productShareVersions.version),
      db
        .select()
        .from(cloneSyncPolicies)
        .where(eq(cloneSyncPolicies.adoptionId, adoptionId)),
    ]);

    const latestVersion =
      versions.find((v) => v.version === row.share.currentVersion) ??
      versions[versions.length - 1] ??
      null;
    const versionsSinceAdopted = versions.filter(
      (v) => v.version > row.adoption.adoptedVersion,
    );

    return {
      adoption: row.adoption,
      share: row.share,
      latestVersion,
      versionsSinceAdopted,
      organizationName: row.organizationName,
      sharerDisplayName: row.sharerDisplayName,
      policies,
    };
  }

  async getLiveProductForDiff(clientId: string, productId: string) {
    const product = await withTenantCellTransaction(clientId, async (tx) => {
      const [row] = await tx
        .select()
        .from(cellProducts)
        .where(
          and(
            eq(cellProducts.clientId, clientId),
            eq(cellProducts.id, productId),
            isNull(cellProducts.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    });

    if (!product) return null;
    const mediaMap = await this.hydrateMediaSnapshotForProducts(clientId, [product.id]);
    const mediaList = mediaMap.get(product.id) ?? [];
    const cover =
      mediaList.find((m) => m.mediaKind === "image" && m.isCover) ??
      mediaList.find((m) => m.mediaKind === "image") ??
      null;
    const coverImageUrl = cover
      ? resolveProductMediaUrls({
          mediaId: cover.mediaId,
          mediaKind: "image",
          storageKey: cover.storageKey,
        }).thumbUrl
      : null;

    return {
      product,
      coverImageUrl,
      mediaHashes: mediaList.map((m) => m.contentHash),
    };
  }

  /**
   * Copia físicamente los archivos multimedia del snapshot hacia `tenants/{adopterClientId}/products/{productId}/...`
   * en S3 y registra filas independientes en `admin.media_catalog` bajo el pool `tenant:{adopterClientId}` (`SPEC-15-D10`).
   */
  private async copyMediaListToAdopterProduct(params: {
    adopterClientId: string;
    actorUserId: string;
    targetProductId: string;
    mediaList: ShareSnapshotMediaItem[];
    includeMediaMode: IncludeMediaMode;
    limits: {
      images_per_product: number | null;
      videos_per_product: number | null;
      audios_per_product: number | null;
      pdfs_per_product: number | null;
      storage_bytes: number | null;
    };
    currentStorageUsedBytes: number;
    existingHashesOnProduct?: Set<string>;
  }): Promise<{
    copiedCount: number;
    addedStorageBytes: number;
    skipped: SkippedMediaReport[];
  }> {
    if (params.includeMediaMode === "none" || params.mediaList.length === 0) {
      return { copiedCount: 0, addedStorageBytes: 0, skipped: [] };
    }

    const candidates = selectMediaCandidatesForMode(params.mediaList, params.includeMediaMode);

    const db = getDb();
    const poolId = `tenant:${params.adopterClientId}`;
    const kindCounter: Record<"image" | "video" | "audio" | "pdf", number> = {
      image: 0,
      video: 0,
      audio: 0,
      pdf: 0,
    };
    const maxByKind: Record<"image" | "video" | "audio" | "pdf", number | null> = {
      image: params.limits.images_per_product,
      video: params.limits.videos_per_product,
      audio: params.limits.audios_per_product,
      pdf: params.limits.pdfs_per_product,
    };

    const skipped: SkippedMediaReport[] = [];
    const attachments: Array<{
      mediaId: string;
      mediaKind: "image" | "video" | "audio" | "pdf";
      sizeBytes: number;
      isCover: boolean;
      altText: string | null;
      sortOrder: number;
    }> = [];

    let runningStorageBytes = params.currentStorageUsedBytes;
    let addedStorageBytes = 0;

    for (const item of candidates) {
      if (params.existingHashesOnProduct?.has(item.contentHash)) {
        kindCounter[item.mediaKind] += 1;
        continue;
      }

      const kindMax = maxByKind[item.mediaKind];
      if (kindMax !== null && kindCounter[item.mediaKind] >= kindMax) {
        skipped.push({
          filename: item.originalFilename,
          mediaKind: item.mediaKind,
          reason: `QUOTA_${item.mediaKind.toUpperCase()}_PER_PRODUCT`,
        });
        continue;
      }

      if (
        item.storageType === "internal" &&
        params.limits.storage_bytes !== null &&
        runningStorageBytes + item.sizeBytes > params.limits.storage_bytes
      ) {
        skipped.push({
          filename: item.originalFilename,
          mediaKind: item.mediaKind,
          reason: "QUOTA_STORAGE_BYTES",
        });
        continue;
      }

      const safeFilename = item.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_") || "media";
      let targetStorageKey = item.storageKey;

      if (item.storageType === "internal") {
        targetStorageKey = `tenants/${params.adopterClientId}/products/${params.targetProductId}/${randomUUID()}-${safeFilename}`;
        const copyRes = await this.s3.copyObject(item.storageKey, targetStorageKey, item.mimeType);
        if (!copyRes.ok) {
          skipped.push({
            filename: item.originalFilename,
            mediaKind: item.mediaKind,
            reason: "MEDIA_COPY_FAILED",
          });
          continue;
        }
      }

      const [catalogEntry] = await db
        .insert(mediaCatalog)
        .values({
          contentHash: item.contentHash,
          storagePoolId: poolId,
          storageKey: targetStorageKey,
          sizeBytes: item.sizeBytes,
          mediaKind: item.mediaKind,
          mimeType: item.mimeType,
          sourceFormat: item.sourceFormat,
          originalFilename: item.originalFilename,
          width: item.width,
          height: item.height,
          durationMs: item.durationMs,
          processingStatus: item.storageType === "external" ? "external" : "ready",
          storageType: item.storageType,
          sourceUrl: item.sourceUrl,
          provider: item.provider,
          createdBy: params.actorUserId,
          updatedBy: params.actorUserId,
        })
        .onConflictDoUpdate({
          target: [mediaCatalog.contentHash, mediaCatalog.storagePoolId],
          set: {
            updatedAt: new Date(),
            updatedBy: params.actorUserId,
          },
        })
        .returning({ id: mediaCatalog.id });

      attachments.push({
        mediaId: catalogEntry.id,
        mediaKind: item.mediaKind,
        sizeBytes: item.sizeBytes,
        isCover: item.isCover && item.mediaKind === "image",
        altText: item.altText ?? null,
        sortOrder: item.sortOrder,
      });

      kindCounter[item.mediaKind] += 1;
      if (item.storageType === "internal") {
        runningStorageBytes += item.sizeBytes;
        addedStorageBytes += item.sizeBytes;
      }
    }

    if (attachments.length > 0) {
      await withTenantCellTransaction(params.adopterClientId, async (tx) => {
        for (const att of attachments) {
          await tx
            .insert(cellClientMedia)
            .values({
              clientId: params.adopterClientId,
              mediaId: att.mediaId,
              sizeBytes: att.sizeBytes,
              createdBy: params.actorUserId,
              updatedBy: params.actorUserId,
            })
            .onConflictDoNothing();

          await tx
            .insert(cellProductMedia)
            .values({
              clientId: params.adopterClientId,
              productId: params.targetProductId,
              mediaId: att.mediaId,
              mediaKind: att.mediaKind,
              isCover: att.isCover,
              altText: att.altText,
              sortOrder: att.sortOrder,
              createdBy: params.actorUserId,
              updatedBy: params.actorUserId,
            })
            .onConflictDoNothing();
        }

        if (addedStorageBytes > 0) {
          await tx
            .insert(cellClientUsage)
            .values({
              clientId: params.adopterClientId,
              dimension: "storage_bytes",
              usedValue: addedStorageBytes,
              createdBy: params.actorUserId,
              updatedBy: params.actorUserId,
            })
            .onConflictDoUpdate({
              target: [cellClientUsage.clientId, cellClientUsage.dimension],
              set: {
                usedValue: sql`${cellClientUsage.usedValue} + ${addedStorageBytes}`,
                updatedAt: new Date(),
                updatedBy: params.actorUserId,
              },
            });
        }
      });
    }

    return {
      copiedCount: attachments.length,
      addedStorageBytes,
      skipped,
    };
  }

  /**
   * Evalúa TODAS las capacidades del plan del inquilino adoptante antes de clonar un producto (`RN-SPEC-15-04`).
   */
  async evaluateAdoptionPlanEligibility(input: {
    adopterClientId: string;
    snapshot: ProductSnapshot;
    includeMediaMode: IncludeMediaMode;
  }): Promise<AdoptionPlanEligibilityDto> {
    const resolvedLimits = await this.capabilityGate.getResolvedLimits(input.adopterClientId);

    const isCombo =
      input.snapshot.compositionType === "combo" &&
      Array.isArray(input.snapshot.comboComponents) &&
      input.snapshot.comboComponents.length > 0;
    const components = isCombo ? (input.snapshot.comboComponents ?? []) : [];
    const productsNeeded = 1 + components.length;

    const { currentProductsCount, currentStorageUsedBytes } = await withTenantCellTransaction(
      input.adopterClientId,
      async (tx) => {
        const [prodAgg] = await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(cellProducts)
          .where(
            and(
              eq(cellProducts.clientId, input.adopterClientId),
              isNull(cellProducts.deletedAt),
            ),
          );
        const [storageRow] = await tx
          .select({ usedValue: cellClientUsage.usedValue })
          .from(cellClientUsage)
          .where(
            and(
              eq(cellClientUsage.clientId, input.adopterClientId),
              eq(cellClientUsage.dimension, "storage_bytes"),
            ),
          )
          .limit(1);
        return {
          currentProductsCount: Number(prodAgg?.cnt ?? 0),
          currentStorageUsedBytes: Number(storageRow?.usedValue ?? 0),
        };
      },
    );

    const violations: PlanQuotaViolationDto[] = [];

    const productsLimit =
      resolvedLimits.products.mode === "LIMITED" ? resolvedLimits.products.value : null;
    if (productsLimit !== null && currentProductsCount + productsNeeded > productsLimit) {
      violations.push({
        dimension: "products",
        currentUsed: currentProductsCount,
        requiredDelta: productsNeeded,
        projectedTotal: currentProductsCount + productsNeeded,
        limitValue: productsLimit,
      });
    }

    const mediaBuckets = [
      selectMediaCandidatesForMode(input.snapshot.media ?? [], input.includeMediaMode),
      ...components.map((c) =>
        selectMediaCandidatesForMode(c.media ?? [], input.includeMediaMode),
      ),
    ];

    let maxImages = 0;
    let maxVideos = 0;
    let maxAudios = 0;
    let maxPdfs = 0;
    let storageNeededBytes = 0;

    for (const bucket of mediaBuckets) {
      let imgs = 0;
      let vids = 0;
      let auds = 0;
      let pdfs = 0;
      for (const m of bucket) {
        if (m.mediaKind === "image") imgs += 1;
        else if (m.mediaKind === "video") vids += 1;
        else if (m.mediaKind === "audio") auds += 1;
        else if (m.mediaKind === "pdf") pdfs += 1;
        if (m.storageType === "internal") {
          storageNeededBytes += Math.max(0, Number(m.sizeBytes ?? 0));
        }
      }
      if (imgs > maxImages) maxImages = imgs;
      if (vids > maxVideos) maxVideos = vids;
      if (auds > maxAudios) maxAudios = auds;
      if (pdfs > maxPdfs) maxPdfs = pdfs;
    }

    const perProductChecks: Array<{
      dimension: "images_per_product" | "videos_per_product" | "audios_per_product" | "pdfs_per_product";
      required: number;
      limit: { mode: "LIMITED" | "UNLIMITED"; value: number | null };
    }> = [
      { dimension: "images_per_product", required: maxImages, limit: resolvedLimits.images_per_product },
      { dimension: "videos_per_product", required: maxVideos, limit: resolvedLimits.videos_per_product },
      { dimension: "audios_per_product", required: maxAudios, limit: resolvedLimits.audios_per_product },
      { dimension: "pdfs_per_product", required: maxPdfs, limit: resolvedLimits.pdfs_per_product },
    ];

    for (const chk of perProductChecks) {
      if (
        chk.required > 0 &&
        chk.limit.mode === "LIMITED" &&
        chk.limit.value !== null &&
        chk.required > chk.limit.value
      ) {
        violations.push({
          dimension: chk.dimension,
          currentUsed: 0,
          requiredDelta: chk.required,
          projectedTotal: chk.required,
          limitValue: chk.limit.value,
        });
      }
    }

    const storageLimitBytes =
      resolvedLimits.storage_bytes.mode === "LIMITED" ? resolvedLimits.storage_bytes.value : null;
    if (
      storageNeededBytes > 0 &&
      storageLimitBytes !== null &&
      currentStorageUsedBytes + storageNeededBytes > storageLimitBytes
    ) {
      violations.push({
        dimension: "storage_bytes",
        currentUsed: currentStorageUsedBytes,
        requiredDelta: storageNeededBytes,
        projectedTotal: currentStorageUsedBytes + storageNeededBytes,
        limitValue: storageLimitBytes,
      });
    }

    return {
      allowed: violations.length === 0,
      includeMediaMode: input.includeMediaMode,
      violations,
      summary: {
        productsUsed: currentProductsCount,
        productsNeeded,
        productsLimit,
        storageUsedBytes: currentStorageUsedBytes,
        storageNeededBytes,
        storageLimitBytes,
      },
    };
  }

  async adoptSnapshotToTenantCell(input: {
    adopterClientId: string;
    createdByUserId: string;
    shareId: string;
    shareVersion: number;
    snapshot: ProductSnapshot;
    customSalePriceCents: number;
    customCostPriceCents: number;
    initialStock: number | null;
    initialStatus: "active" | "draft";
    includeMediaMode: IncludeMediaMode;
    retainLink: boolean;
    autoSyncAttributes: SafeAutoSyncAttribute[];
  }): Promise<AdoptShareResultDto> {
    const resolvedLimits = await this.capabilityGate.getResolvedLimits(input.adopterClientId);
    const cellId = await cellDatabasePoolManager.resolveCellIdForClient(input.adopterClientId);

    const eligibility = await this.evaluateAdoptionPlanEligibility({
      adopterClientId: input.adopterClientId,
      snapshot: input.snapshot,
      includeMediaMode: input.includeMediaMode,
    });

    if (!eligibility.allowed) {
      const productViolation = eligibility.violations.find((v) => v.dimension === "products");
      if (productViolation && eligibility.violations.length === 1) {
        throw new Error(
          `PRODUCT_QUOTA_EXCEEDED:${productViolation.currentUsed}:${productViolation.requiredDelta}:${productViolation.limitValue}`,
        );
      }
      throw new Error(`PLAN_QUOTA_EXCEEDED:${JSON.stringify(eligibility.violations)}`);
    }

    const isCombo =
      input.snapshot.compositionType === "combo" &&
      Array.isArray(input.snapshot.comboComponents) &&
      input.snapshot.comboComponents.length > 0;
    const neededProducts = eligibility.summary.productsNeeded;
    const currentProductsCount = eligibility.summary.productsUsed;
    const currentStorageUsedBytes = eligibility.summary.storageUsedBytes;

    const parentProductId = randomUUID();
    const createdComponentIds: Array<{
      componentProductId: string;
      component: ShareSnapshotBundleComponent;
    }> = [];

    const normalizedAttrs = Array.isArray(input.snapshot.attributes)
      ? (input.snapshot.attributes as ProductDynamicAttribute[])
      : [];

    await withTenantCellTransaction(input.adopterClientId, async (tx) => {
      // Crear primero componentes simples si el compartido es combo
      if (isCombo && input.snapshot.comboComponents) {
        for (const comp of input.snapshot.comboComponents) {
          const compId = randomUUID();
          createdComponentIds.push({ componentProductId: compId, component: comp });

          await tx.insert(cellProducts).values({
            id: compId,
            clientId: input.adopterClientId,
            sku: comp.sku,
            gtin: comp.gtin,
            mpn: comp.mpn,
            sourceSystem: "manual",
            name: comp.name,
            description: comp.description,
            brand: comp.brand,
            kind: comp.kind,
            compositionType: "simple",
            condition: comp.condition,
            availability: comp.availability,
            status: input.initialStatus,
            costPriceCents: comp.costPriceCents,
            priceCents: comp.priceCents,
            currency: comp.currency,
            category: comp.category,
            attributes: comp.attributes,
            botMasterPrompt: comp.botMasterPrompt,
            stockQuantity: comp.kind === "physical" ? (input.initialStock ?? 0) : null,
            sourceShareId: input.shareId,
            sourceVersion: input.shareVersion,
            createdBy: input.createdByUserId,
            updatedBy: input.createdByUserId,
          });
        }
      }

      const mainKind = input.snapshot.kind ?? "physical";
      await tx.insert(cellProducts).values({
        id: parentProductId,
        clientId: input.adopterClientId,
        sku: input.snapshot.sku ?? null,
        gtin: input.snapshot.gtin ?? null,
        mpn: input.snapshot.mpn ?? null,
        sourceSystem: "manual",
        name: input.snapshot.name,
        description: input.snapshot.description,
        brand: input.snapshot.brand ?? null,
        kind: mainKind,
        compositionType: isCombo ? "combo" : "simple",
        condition: input.snapshot.condition ?? "new",
        availability: input.snapshot.availability ?? "in_stock",
        status: input.initialStatus,
        costPriceCents: input.customCostPriceCents,
        priceCents: input.customSalePriceCents,
        currency: input.snapshot.currency || "COP",
        category: input.snapshot.category ?? null,
        attributes: normalizedAttrs,
        botMasterPrompt: input.snapshot.botMasterPrompt ?? "",
        stockQuantity:
          mainKind === "physical" && !isCombo ? (input.initialStock ?? 0) : null,
        sourceShareId: input.shareId,
        sourceVersion: input.shareVersion,
        createdBy: input.createdByUserId,
        updatedBy: input.createdByUserId,
      });

      for (const created of createdComponentIds) {
        await tx.insert(cellProductBundleItems).values({
          clientId: input.adopterClientId,
          bundleProductId: parentProductId,
          componentProductId: created.componentProductId,
          quantity: created.component.quantity,
          sortOrder: created.component.sortOrder,
          createdBy: input.createdByUserId,
          updatedBy: input.createdByUserId,
        });
      }

      await tx
        .insert(cellClientUsage)
        .values({
          clientId: input.adopterClientId,
          dimension: "products",
          usedValue: currentProductsCount + neededProducts,
          createdBy: input.createdByUserId,
          updatedBy: input.createdByUserId,
        })
        .onConflictDoUpdate({
          target: [cellClientUsage.clientId, cellClientUsage.dimension],
          set: {
            usedValue: currentProductsCount + neededProducts,
            updatedAt: new Date(),
            updatedBy: input.createdByUserId,
          },
        });
    });

    // Copiar multimedia independiente al bucket del adoptante respetando límites del plan
    const mediaLimits = {
      images_per_product:
        resolvedLimits.images_per_product.mode === "LIMITED"
          ? resolvedLimits.images_per_product.value
          : null,
      videos_per_product:
        resolvedLimits.videos_per_product.mode === "LIMITED"
          ? resolvedLimits.videos_per_product.value
          : null,
      audios_per_product:
        resolvedLimits.audios_per_product.mode === "LIMITED"
          ? resolvedLimits.audios_per_product.value
          : null,
      pdfs_per_product:
        resolvedLimits.pdfs_per_product.mode === "LIMITED"
          ? resolvedLimits.pdfs_per_product.value
          : null,
      storage_bytes:
        resolvedLimits.storage_bytes.mode === "LIMITED"
          ? resolvedLimits.storage_bytes.value
          : null,
    };

    let runningStorage = currentStorageUsedBytes;
    let totalCopiedMedia = 0;
    const allSkipped: SkippedMediaReport[] = [];

    const parentMediaRes = await this.copyMediaListToAdopterProduct({
      adopterClientId: input.adopterClientId,
      actorUserId: input.createdByUserId,
      targetProductId: parentProductId,
      mediaList: input.snapshot.media ?? [],
      includeMediaMode: input.includeMediaMode,
      limits: mediaLimits,
      currentStorageUsedBytes: runningStorage,
    });
    runningStorage += parentMediaRes.addedStorageBytes;
    totalCopiedMedia += parentMediaRes.copiedCount;
    allSkipped.push(...parentMediaRes.skipped);

    for (const created of createdComponentIds) {
      if (created.component.media.length === 0) continue;
      const compMediaRes = await this.copyMediaListToAdopterProduct({
        adopterClientId: input.adopterClientId,
        actorUserId: input.createdByUserId,
        targetProductId: created.componentProductId,
        mediaList: created.component.media,
        includeMediaMode: input.includeMediaMode,
        limits: mediaLimits,
        currentStorageUsedBytes: runningStorage,
      });
      runningStorage += compMediaRes.addedStorageBytes;
      totalCopiedMedia += compMediaRes.copiedCount;
      allSkipped.push(...compMediaRes.skipped);
    }

    let adoptionId: string | null = null;
    if (input.retainLink) {
      const db = getDb();
      const [adoption] = await db
        .insert(productAdoptions)
        .values({
          shareId: input.shareId,
          adopterClientId: input.adopterClientId,
          createdByUserId: input.createdByUserId,
          cloneProductId: parentProductId,
          cloneCellId: cellId,
          adoptedVersion: input.shareVersion,
          linkActive: true,
          createdBy: input.createdByUserId,
          updatedBy: input.createdByUserId,
        })
        .returning();

      adoptionId = adoption.id;

      const enabledSet = new Set(input.autoSyncAttributes);
      await db.insert(cloneSyncPolicies).values(
        SAFE_AUTO_SYNC_ATTRIBUTES.map((attr) => ({
          adoptionId: adoption.id,
          attributeKey: attr,
          autoSync: enabledSet.has(attr),
          createdBy: input.createdByUserId,
          updatedBy: input.createdByUserId,
        })),
      );
    }

    return {
      adoptionId,
      cloneProductId: parentProductId,
      cloneCellId: cellId,
      createdProductsCount: neededProducts,
      copiedMediaCount: totalCopiedMedia,
      skippedMedia: allSkipped,
      version: input.shareVersion,
    };
  }

  async syncAdoptionInTenantCell(input: {
    adoption: ProductAdoption;
    targetVersion: number;
    snapshot: ProductSnapshot;
    attributesToUpdate: string[];
    applySuggestedPrice?: boolean;
    applyWholesaleCost?: boolean;
    syncMedia?: boolean;
    mode: "manual" | "auto";
    advanceAdoptedVersion: boolean;
    actorUserId?: string;
  }) {
    const safeSelected = input.attributesToUpdate.filter((a): a is SafeAutoSyncAttribute =>
      (SAFE_AUTO_SYNC_ATTRIBUTES as readonly string[]).includes(a),
    );
    const shouldSyncMedia = safeSelected.includes("media") || Boolean(input.syncMedia);

    const updateFields: Partial<typeof cellProducts.$inferInsert> = {
      updatedAt: new Date(),
    };

    const syncedAttributes: string[] = [];

    if (safeSelected.includes("name")) {
      updateFields.name = input.snapshot.name;
      syncedAttributes.push("name");
    }
    if (safeSelected.includes("description")) {
      updateFields.description = input.snapshot.description;
      syncedAttributes.push("description");
    }
    if (safeSelected.includes("category")) {
      updateFields.category = input.snapshot.category ?? null;
      syncedAttributes.push("category");
    }
    if (safeSelected.includes("brand")) {
      updateFields.brand = input.snapshot.brand ?? null;
      syncedAttributes.push("brand");
    }
    if (safeSelected.includes("botMasterPrompt")) {
      updateFields.botMasterPrompt = input.snapshot.botMasterPrompt ?? "";
      syncedAttributes.push("botMasterPrompt");
    }
    if (safeSelected.includes("attributes") && Array.isArray(input.snapshot.attributes)) {
      updateFields.attributes = input.snapshot.attributes as ProductDynamicAttribute[];
      syncedAttributes.push("attributes");
    }

    // Nunca sobreescribir precios ni stock automáticamente; solo por solicitud manual explícita
    if (input.mode === "manual" && input.applySuggestedPrice) {
      updateFields.priceCents =
        input.snapshot.suggestedPriceCents ?? input.snapshot.priceCents;
      syncedAttributes.push("suggestedPriceCents");
    }
    if (
      input.mode === "manual" &&
      input.applyWholesaleCost &&
      input.snapshot.wholesaleCostCents !== undefined &&
      input.snapshot.wholesaleCostCents !== null
    ) {
      updateFields.costPriceCents = input.snapshot.wholesaleCostCents;
      syncedAttributes.push("wholesaleCostCents");
    }

    if (input.advanceAdoptedVersion) {
      updateFields.sourceVersion = input.targetVersion;
    }

    await withTenantCellTransaction(input.adoption.adopterClientId, async (tx) => {
      await tx
        .update(cellProducts)
        .set(updateFields)
        .where(
          and(
            eq(cellProducts.clientId, input.adoption.adopterClientId),
            eq(cellProducts.id, input.adoption.cloneProductId),
            isNull(cellProducts.deletedAt),
          ),
        );
    });

    if (shouldSyncMedia && input.snapshot.media && input.snapshot.media.length > 0) {
      const liveInfo = await this.getLiveProductForDiff(
        input.adoption.adopterClientId,
        input.adoption.cloneProductId,
      );
      const resolvedLimits = await this.capabilityGate.getResolvedLimits(
        input.adoption.adopterClientId,
      );
      const storageRow = await withTenantCellTransaction(
        input.adoption.adopterClientId,
        async (tx) => {
          const [row] = await tx
            .select({ usedValue: cellClientUsage.usedValue })
            .from(cellClientUsage)
            .where(
              and(
                eq(cellClientUsage.clientId, input.adoption.adopterClientId),
                eq(cellClientUsage.dimension, "storage_bytes"),
              ),
            )
            .limit(1);
          return row;
        },
      );

      await this.copyMediaListToAdopterProduct({
        adopterClientId: input.adoption.adopterClientId,
        actorUserId: input.actorUserId ?? input.adoption.createdByUserId,
        targetProductId: input.adoption.cloneProductId,
        mediaList: input.snapshot.media,
        includeMediaMode: "all_compatible",
        limits: {
          images_per_product:
            resolvedLimits.images_per_product.mode === "LIMITED"
              ? resolvedLimits.images_per_product.value
              : null,
          videos_per_product:
            resolvedLimits.videos_per_product.mode === "LIMITED"
              ? resolvedLimits.videos_per_product.value
              : null,
          audios_per_product:
            resolvedLimits.audios_per_product.mode === "LIMITED"
              ? resolvedLimits.audios_per_product.value
              : null,
          pdfs_per_product:
            resolvedLimits.pdfs_per_product.mode === "LIMITED"
              ? resolvedLimits.pdfs_per_product.value
              : null,
          storage_bytes:
            resolvedLimits.storage_bytes.mode === "LIMITED"
              ? resolvedLimits.storage_bytes.value
              : null,
        },
        currentStorageUsedBytes: Number(storageRow?.usedValue ?? 0),
        existingHashesOnProduct: new Set(liveInfo?.mediaHashes ?? []),
      });
      if (!syncedAttributes.includes("media")) {
        syncedAttributes.push("media");
      }
    }

    const db = getDb();
    await db.insert(syncRuns).values({
      adoptionId: input.adoption.id,
      version: input.targetVersion,
      mode: input.mode,
      attributes: syncedAttributes,
      status: "success",
    });

    if (input.advanceAdoptedVersion) {
      await db
        .update(productAdoptions)
        .set({ adoptedVersion: input.targetVersion, updatedAt: new Date() })
        .where(eq(productAdoptions.id, input.adoption.id));
    }

    return { syncedAttributes };
  }

  async updateCloneSyncPolicies(
    adoptionId: string,
    autoSyncAttributes: SafeAutoSyncAttribute[],
    actorUserId = "system",
  ) {
    const db = getDb();
    const enabled = new Set(autoSyncAttributes);

    for (const attr of SAFE_AUTO_SYNC_ATTRIBUTES) {
      await db
        .insert(cloneSyncPolicies)
        .values({
          adoptionId,
          attributeKey: attr,
          autoSync: enabled.has(attr),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        })
        .onConflictDoUpdate({
          target: [cloneSyncPolicies.adoptionId, cloneSyncPolicies.attributeKey],
          set: {
            autoSync: enabled.has(attr),
            updatedAt: new Date(),
            updatedBy: actorUserId,
          },
        });
    }

    return db
      .select()
      .from(cloneSyncPolicies)
      .where(eq(cloneSyncPolicies.adoptionId, adoptionId));
  }

  async unlinkAdoption(adoptionId: string) {
    const db = getDb();
    await db
      .update(productAdoptions)
      .set({ linkActive: false, updatedAt: new Date() })
      .where(eq(productAdoptions.id, adoptionId));
  }

  async listSyncRunsForAdoptions(adoptionIds: string[]) {
    if (adoptionIds.length === 0) return [];
    const db = getDb();
    return db
      .select()
      .from(syncRuns)
      .where(inArray(syncRuns.adoptionId, adoptionIds))
      .orderBy(desc(syncRuns.createdAt));
  }

  async getSyncPoliciesForAdoption(adoptionId: string) {
    const db = getDb();
    return db
      .select()
      .from(cloneSyncPolicies)
      .where(eq(cloneSyncPolicies.adoptionId, adoptionId));
  }
}
