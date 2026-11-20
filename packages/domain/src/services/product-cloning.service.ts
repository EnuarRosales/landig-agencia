import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  ProductShare,
  ProductShareVersion,
  ProductAdoption,
  CloneSyncPolicy,
  SyncRun,
} from "../db/schemas/admin/communities-and-cloning";
import { calculateProductProfitability } from "../utils/pricing-margin";
import { resolveProductMediaUrls } from "./tenant-products-catalog.helpers";
import {
  buildAdminPortalUrl,
  getNotificationDispatcherService,
} from "./notification-dispatcher.service";
import {
  canonicalizeForDiff,
  computeProductSnapshotDiff,
  DrizzleSpec15ProductCloningStore,
  formatPlanQuotaViolationsMessage,
  PROTECTED_ADOPTER_ATTRIBUTES,
  SAFE_AUTO_SYNC_ATTRIBUTES,
  type AdoptionDiffField,
  type AdoptionDiffResultDto,
  type AdoptionPlanEligibilityDto,
  type AdoptShareInput,
  type AdoptShareResultDto,
  type CommunityFeedCatalogPage,
  type CommunityFeedItemDto,
  type IncludeMediaMode,
  type ISpec15ProductCloningStore,
  type LeaderCandidateProductDto,
  type MyAdoptionItemDto,
  type PlanQuotaDimension,
  type PlanQuotaViolationDto,
  type ProductSnapshot,
  type PublishNewVersionFromProductInput,
  type PublishShareFromProductInput,
  type SafeAutoSyncAttribute,
  type ShareModerationStatus,
  type ShareSnapshotBundleComponent,
  type ShareSnapshotMediaItem,
  type ShareStatus,
  type SkippedMediaReport,
  type SyncAdoptionSelectiveInput,
} from "./product-cloning-store";

export {
  computeProductSnapshotDiff,
  DrizzleSpec15ProductCloningStore,
  formatPlanQuotaViolationsMessage,
  PROTECTED_ADOPTER_ATTRIBUTES,
  SAFE_AUTO_SYNC_ATTRIBUTES,
  type AdoptionDiffField,
  type AdoptionDiffResultDto,
  type AdoptionPlanEligibilityDto,
  type AdoptShareInput,
  type AdoptShareResultDto,
  type CommunityFeedCatalogPage,
  type CommunityFeedItemDto,
  type IncludeMediaMode,
  type ISpec15ProductCloningStore,
  type LeaderCandidateProductDto,
  type MyAdoptionItemDto,
  type PlanQuotaDimension,
  type PlanQuotaViolationDto,
  type ProductSnapshot,
  type PublishNewVersionFromProductInput,
  type PublishShareFromProductInput,
  type SafeAutoSyncAttribute,
  type ShareModerationStatus,
  type ShareSnapshotBundleComponent,
  type ShareSnapshotMediaItem,
  type ShareStatus,
  type SkippedMediaReport,
  type SyncAdoptionSelectiveInput,
};

export interface PublishShareParams {
  organizationId: string;
  sharerClientId: string;
  createdByUserId: string;
  sourceProductId: string;
  sourceCellId: string;
  productSnapshot: ProductSnapshot;
}

export interface AdoptProductParams {
  shareId: string;
  adopterClientId: string;
  createdByUserId: string;
  targetCellId: string;
  includeMedia: boolean;
  retainLink: boolean;
  autoSyncAttributes?: string[]; // e.g. ['price', 'description']
}

export interface SyncProductParams {
  adoptionId: string;
  mode: "manual" | "auto";
  targetAttributes?: string[];
}

export interface IProductCloningRepository {
  findOrganizationMembership(
    orgId: string,
    clientId: string,
  ): Promise<{ role: string; status: string } | null>;
  createProductShare(data: {
    organizationId: string;
    sharerClientId: string;
    createdByUserId: string;
    sourceProductId: string;
    sourceCellId: string;
    snapshot: ProductSnapshot;
  }): Promise<{ share: ProductShare; version: ProductShareVersion }>;
  findShareById(shareId: string): Promise<ProductShare | null>;
  findLatestShareVersion(shareId: string): Promise<ProductShareVersion | null>;
  createShareVersion(
    shareId: string,
    version: number,
    changedAttributes: string[],
    snapshot: ProductSnapshot,
  ): Promise<ProductShareVersion>;
  findAdoptionsByShareId(shareId: string): Promise<ProductAdoption[]>;
  findAdoptionById(adoptionId: string): Promise<ProductAdoption | null>;
  createAdoption(data: {
    shareId: string;
    adopterClientId: string;
    createdByUserId: string;
    cloneProductId: string;
    cloneCellId: string;
    adoptedVersion: number;
    linkActive: boolean;
    autoSyncAttributes?: string[];
  }): Promise<{ adoption: ProductAdoption; policies: CloneSyncPolicy[] }>;
  cloneProductInCell(
    targetCellId: string,
    targetClientId: string,
    snapshot: ProductSnapshot,
    includeMedia: boolean,
  ): Promise<{ cloneProductId: string }>;
  updateProductInCell(
    targetCellId: string,
    targetClientId: string,
    cloneProductId: string,
    attributesToUpdate: Partial<ProductSnapshot>,
  ): Promise<boolean>;
  getSyncPolicies(adoptionId: string): Promise<CloneSyncPolicy[]>;
  createSyncRun(data: {
    adoptionId: string;
    version: number;
    mode: "manual" | "auto";
    attributes: string[];
    status: "success" | "failed";
    error?: string;
  }): Promise<SyncRun>;
  updateAdoptionVersion(adoptionId: string, version: number): Promise<void>;
}

/**
 * Servicio de catálogo compartido, propuestas de producto, adopciones y clonación (ADM-001 T-16, T-17, T-18).
 *
 * Principios:
 * - Cualquier inquilino miembro puede compartir productos con su comunidad (RF-08.11, RF-08.14).
 * - El clon es un producto nuevo con ID propio en la celda del adoptante (RF-06.1).
 * - La baja del producto origen no afecta a los clones existentes (RF-06.7).
 * - Sincronización voluntaria por atributo (RF-08.16).
 */
export class ProductCloningAndCommunitiesService {
  private readonly spec15StoreOverride?: ISpec15ProductCloningStore;
  private cachedStore?: ISpec15ProductCloningStore;

  constructor(
    private readonly repo: IProductCloningRepository,
    spec15Store?: ISpec15ProductCloningStore,
  ) {
    this.spec15StoreOverride = spec15Store;
  }

  private get spec15Store(): ISpec15ProductCloningStore {
    if (this.spec15StoreOverride) return this.spec15StoreOverride;
    if (!this.cachedStore) {
      this.cachedStore = new DrizzleSpec15ProductCloningStore();
    }
    return this.cachedStore;
  }

  /**
   * Publica un producto para compartirlo con la comunidad (ADM-001 T-16).
   */
  async publishProductShare(params: PublishShareParams): Promise<Result<{ shareId: string; version: number }>> {
    try {
      const membership = await this.repo.findOrganizationMembership(
        params.organizationId,
        params.sharerClientId,
      );

      if (!membership || membership.status !== "active") {
        return err(
          "El inquilino no es miembro activo de la comunidad especificada.",
          "UNAUTHORIZED_COMMUNITY_MEMBER",
        );
      }

      const created = await this.repo.createProductShare({
        organizationId: params.organizationId,
        sharerClientId: params.sharerClientId,
        createdByUserId: params.createdByUserId,
        sourceProductId: params.sourceProductId,
        sourceCellId: params.sourceCellId,
        snapshot: params.productSnapshot,
      });

      appLogger.info("[ProductCloning] Propuesta de producto compartida en la comunidad", {
        shareId: created.share.id,
        organizationId: params.organizationId,
        sourceProductId: params.sourceProductId,
        version: created.version.version,
      });

      return ok({
        shareId: created.share.id,
        version: created.version.version,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al publicar propuesta de producto: ${msg}`, error);
      return err(msg, "PUBLISH_SHARE_ERROR");
    }
  }

  /**
   * Adopta y clona un producto compartido hacia la celda del inquilino (ADM-001 T-17, RF-06).
   */
  async adoptProduct(params: AdoptProductParams): Promise<Result<{ cloneProductId: string; adoptionId?: string }>> {
    try {
      const share = await this.repo.findShareById(params.shareId);
      if (!share || share.status !== "active") {
        return err("La propuesta de producto compartida no existe o no está activa.", "SHARE_NOT_FOUND");
      }

      if (share.sharerClientId === params.adopterClientId) {
        return err(
          "No puedes clonar un producto compartido desde tu propio catálogo.",
          "CANNOT_ADOPT_OWN_SHARE",
        );
      }

      // Validar membresía del adoptante en la misma comunidad
      const membership = await this.repo.findOrganizationMembership(
        share.organizationId,
        params.adopterClientId,
      );
      if (!membership || membership.status !== "active") {
        return err(
          "El inquilino adoptante debe pertenecer a la misma comunidad que la propuesta.",
          "COMMUNITY_MEMBERSHIP_REQUIRED",
        );
      }

      const latestVersion = await this.repo.findLatestShareVersion(share.id);
      if (!latestVersion) {
        return err("No se encontró una versión válida para la propuesta.", "VERSION_NOT_FOUND");
      }

      // Clonación física en la celda del inquilino adoptante
      const snapshot = latestVersion.snapshot as unknown as ProductSnapshot;
      const cloneRes = await this.repo.cloneProductInCell(
        params.targetCellId,
        params.adopterClientId,
        snapshot,
        params.includeMedia,
      );

      let adoptionId: string | undefined;

      // Si el adoptante decide conservar el vínculo para sincronizaciones futuras
      if (params.retainLink) {
        const adoption = await this.repo.createAdoption({
          shareId: share.id,
          adopterClientId: params.adopterClientId,
          createdByUserId: params.createdByUserId,
          cloneProductId: cloneRes.cloneProductId,
          cloneCellId: params.targetCellId,
          adoptedVersion: latestVersion.version,
          linkActive: true,
          autoSyncAttributes: params.autoSyncAttributes,
        });
        adoptionId = adoption.adoption.id;
      }

      appLogger.info("[ProductCloning] Producto clonado y adoptado con éxito", {
        cloneProductId: cloneRes.cloneProductId,
        shareId: share.id,
        retainLink: params.retainLink,
        adopterClientId: params.adopterClientId,
      });

      return ok({
        cloneProductId: cloneRes.cloneProductId,
        adoptionId,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al clonar y adoptar producto: ${msg}`, error);
      return err(msg, "ADOPT_PRODUCT_ERROR");
    }
  }

  /**
   * Publica una actualización de versión de un producto compartido y dispara auto-sync a adoptantes (ADM-001 T-18).
   */
  async updateShareVersion(
    shareId: string,
    newSnapshot: ProductSnapshot,
    changedAttributes: string[],
  ): Promise<Result<{ newVersion: number; autoSyncedAdoptionsCount: number }>> {
    try {
      const share = await this.repo.findShareById(shareId);
      if (!share) {
        return err("Propuesta de producto no encontrada.", "SHARE_NOT_FOUND");
      }

      const nextVersionNumber = share.currentVersion + 1;
      await this.repo.createShareVersion(
        shareId,
        nextVersionNumber,
        changedAttributes,
        newSnapshot,
      );

      // Buscar adopciones activas con linkActive = true
      const activeAdoptions = await this.repo.findAdoptionsByShareId(shareId);
      let autoSyncedCount = 0;

      for (const adoption of activeAdoptions) {
        if (!adoption.linkActive) continue;

        const policies = await this.repo.getSyncPolicies(adoption.id);
        const autoSyncKeys = policies.filter((p) => p.autoSync).map((p) => p.attributeKey);

        // Atributos modificados que coinciden con la política de sincronización automática
        const matchingAttributes = changedAttributes.filter((k) => autoSyncKeys.includes(k));

        if (matchingAttributes.length > 0) {
          const partialUpdate: Partial<ProductSnapshot> = {};
          matchingAttributes.forEach((attr) => {
            (partialUpdate as any)[attr] = (newSnapshot as any)[attr];
          });

          await this.repo.updateProductInCell(
            adoption.cloneCellId,
            adoption.adopterClientId,
            adoption.cloneProductId,
            partialUpdate,
          );

          await this.repo.createSyncRun({
            adoptionId: adoption.id,
            version: nextVersionNumber,
            mode: "auto",
            attributes: matchingAttributes,
            status: "success",
          });

          await this.repo.updateAdoptionVersion(adoption.id, nextVersionNumber);
          autoSyncedCount++;
        }
      }

      appLogger.info("[ProductCloning] Nueva versión de producto compartido publicada", {
        shareId,
        newVersion: nextVersionNumber,
        changedAttributes,
        autoSyncedCount,
      });

      return ok({
        newVersion: nextVersionNumber,
        autoSyncedAdoptionsCount: autoSyncedCount,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al actualizar versión compartida: ${msg}`, error);
      return err(msg, "UPDATE_VERSION_ERROR");
    }
  }

  /**
   * Ejecuta una sincronización manual de atributos solicitada por el adoptante (ADM-001 T-18).
   */
  async syncAdoptedProduct(params: SyncProductParams): Promise<Result<{ syncedAttributes: string[]; version: number }>> {
    try {
      const adoption = await this.repo.findAdoptionById(params.adoptionId);
      if (!adoption || !adoption.linkActive) {
        return err("La adopción no existe o el vínculo con el producto de origen está inactivo.", "ADOPTION_INACTIVE");
      }

      const latestVersion = await this.repo.findLatestShareVersion(adoption.shareId);
      if (!latestVersion) {
        return err("No se encontró versión de origen.", "VERSION_NOT_FOUND");
      }

      const snapshot = latestVersion.snapshot as unknown as ProductSnapshot;
      const targetAttributes = params.targetAttributes ?? ["priceCents", "description", "name"];

      const partialUpdate: Partial<ProductSnapshot> = {};
      targetAttributes.forEach((attr) => {
        if ((snapshot as any)[attr] !== undefined) {
          (partialUpdate as any)[attr] = (snapshot as any)[attr];
        }
      });

      await this.repo.updateProductInCell(
        adoption.cloneCellId,
        adoption.adopterClientId,
        adoption.cloneProductId,
        partialUpdate,
      );

      await this.repo.createSyncRun({
        adoptionId: adoption.id,
        version: latestVersion.version,
        mode: params.mode,
        attributes: targetAttributes,
        status: "success",
      });

      await this.repo.updateAdoptionVersion(adoption.id, latestVersion.version);

      appLogger.info("[ProductCloning] Sincronización manual ejecutada con éxito", {
        adoptionId: adoption.id,
        version: latestVersion.version,
        syncedAttributes: targetAttributes,
      });

      return ok({
        syncedAttributes: targetAttributes,
        version: latestVersion.version,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al sincronizar producto adoptado: ${msg}`, error);
      return err(msg, "SYNC_PRODUCT_ERROR");
    }
  }

  /**
   * Lista el catálogo vivo del inquilino junto con el estado de publicación y detector de cambios pendientes en una comunidad (`SPEC-15-D07`).
   */
  async listLeaderCandidateProducts(params: {
    clientId: string;
    organizationId: string;
  }): Promise<Result<LeaderCandidateProductDto[]>> {
    try {
      const context = await this.spec15Store.getOrganizationAndMembership(
        params.organizationId,
        params.clientId,
      );
      if (!context) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      if (!context.membership || context.membership.status !== "active") {
        return err(
          "No eres miembro activo de esta comunidad.",
          "UNAUTHORIZED_COMMUNITY_MEMBER",
        );
      }

      const { products, sharesByProductId } =
        await this.spec15Store.listClientLiveProductsWithShareState(
          params.clientId,
          params.organizationId,
        );

      const candidates: LeaderCandidateProductDto[] = products.map((entry) => {
        const p = entry.product;
        const shareInfo = sharesByProductId.get(p.id);
        let shareDto: LeaderCandidateProductDto["share"] = null;

        if (shareInfo) {
          const latestSnap = (shareInfo.latestVersion?.snapshot ?? null) as ProductSnapshot | null;
          const pendingChangedAttributes = computeProductSnapshotDiff(latestSnap, entry.snapshot);
          shareDto = {
            shareId: shareInfo.share.id,
            status: shareInfo.share.status as ShareStatus,
            moderationStatus: shareInfo.share.moderationStatus as ShareModerationStatus,
            rejectionReason: shareInfo.share.rejectionReason ?? null,
            currentVersion: shareInfo.share.currentVersion,
            wholesaleCostCents: latestSnap?.wholesaleCostCents ?? null,
            suggestedPriceCents: latestSnap?.suggestedPriceCents ?? latestSnap?.priceCents ?? null,
            minResalePriceCents: latestSnap?.minResalePriceCents ?? null,
            adoptionsCount: shareInfo.adoptionsCount,
            hasPendingChanges: pendingChangedAttributes.length > 0,
            pendingChangedAttributes,
            updatedAt: shareInfo.share.updatedAt.toISOString(),
          };
        }

        return {
          productId: p.id,
          name: p.name,
          sku: p.sku ?? null,
          kind: (p.kind || "physical") as "physical" | "digital" | "service",
          compositionType: (p.compositionType || "simple") as "simple" | "combo",
          status: p.status,
          priceCents: p.priceCents,
          costPriceCents: p.costPriceCents ?? 0,
          currency: p.currency || "COP",
          stockQuantity: p.stockQuantity ?? null,
          category: p.category ?? null,
          brand: p.brand ?? null,
          coverImageUrl: entry.coverImageUrl,
          mediaCounts: entry.mediaCounts,
          comboComponentsCount: entry.comboComponentsCount,
          isClonedFromCommunity: Boolean(p.sourceShareId),
          share: shareDto,
        };
      });

      return ok(candidates);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al listar productos candidatos a compartir: ${msg}`, error);
      return err(msg, "LIST_CANDIDATE_PRODUCTS_ERROR");
    }
  }

  /**
   * Comparte un producto propio en la comunidad respetando `sharePolicy`, no re-compartición y snapshot de combos (`SPEC-15-D04`, `SPEC-15-D06`).
   */
  async publishShareFromCellProduct(
    params: PublishShareFromProductInput,
  ): Promise<Result<{ shareId: string; version: number; moderationStatus: ShareModerationStatus }>> {
    try {
      const context = await this.spec15Store.getOrganizationAndMembership(
        params.organizationId,
        params.sharerClientId,
      );
      if (!context) {
        return err("Comunidad no encontrada.", "ORGANIZATION_NOT_FOUND");
      }
      if (context.org.status !== "active") {
        return err("La comunidad se encuentra suspendida.", "ORGANIZATION_SUSPENDED");
      }
      if (!context.membership || context.membership.status !== "active") {
        return err("No eres miembro activo de esta comunidad.", "UNAUTHORIZED_COMMUNITY_MEMBER");
      }

      const isLeader =
        context.membership.role === "originator" || context.membership.role === "co_leader";

      if (context.org.sharePolicy === "leaders_only" && !isLeader) {
        return err(
          "Solo el líder o los co-líderes pueden compartir productos en esta comunidad.",
          "FORBIDDEN_SHARE_POLICY_LEADERS_ONLY",
        );
      }

      const existing = await this.spec15Store.findShareByOrgAndProduct(
        params.organizationId,
        params.sourceProductId,
      );
      if (existing) {
        return err(
          "Este producto ya fue compartido previamente en esta comunidad.",
          "SHARE_ALREADY_EXISTS",
        );
      }

      const built = await this.spec15Store.buildLiveSnapshotForProduct(
        params.sharerClientId,
        params.sourceProductId,
        {
          wholesaleCostCents: params.wholesaleCostCents,
          suggestedPriceCents: params.suggestedPriceCents,
          minResalePriceCents: params.minResalePriceCents,
          includeReferenceStock: params.includeReferenceStock,
        },
      );

      if (!built) {
        return err("No se encontró el producto en tu catálogo.", "PRODUCT_NOT_FOUND");
      }

      if (built.product.sourceShareId) {
        return err(
          "Un producto importado de comunidad no puede re-compartirse hacia otra o la misma comunidad.",
          "CANNOT_RESHARE_CLONED_PRODUCT",
        );
      }

      const moderationStatus: ShareModerationStatus =
        context.org.sharePolicy === "collaborative" &&
        context.org.requireShareApproval &&
        !isLeader
          ? "pending_review"
          : "approved";

      const created = await this.spec15Store.createSpec15Share({
        organizationId: params.organizationId,
        sharerClientId: params.sharerClientId,
        createdByUserId: params.createdByUserId,
        sourceProductId: params.sourceProductId,
        sourceCellId: built.cellId,
        moderationStatus,
        changelog: params.changelog?.trim() || null,
        snapshot: built.snapshot,
      });

      appLogger.info("[ProductCloning] Producto compartido en comunidad", {
        shareId: created.share.id,
        organizationId: params.organizationId,
        moderationStatus,
      });

      return ok({
        shareId: created.share.id,
        version: created.version.version,
        moderationStatus,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al compartir producto en comunidad: ${msg}`, error);
      return err(msg, "PUBLISH_SHARE_ERROR");
    }
  }

  /**
   * Publica explícitamente una nueva versión (vN+1) con detección de diffs, auto-sync seguro y notificación a adoptantes (`SPEC-15-D07`, `SPEC-15-D08`).
   */
  async publishNewShareVersionFromCellProduct(
    params: PublishNewVersionFromProductInput,
  ): Promise<
    Result<{
      shareId: string;
      newVersion: number;
      changedAttributes: string[];
      autoSyncedAdoptionsCount: number;
    }>
  > {
    try {
      const shareContext = await this.spec15Store.findShareWithLatestVersion(params.shareId);
      if (!shareContext) {
        return err("Producto compartido no encontrado.", "SHARE_NOT_FOUND");
      }

      if (shareContext.share.sharerClientId !== params.sharerClientId) {
        return err(
          "Solo el propietario original de esta publicación puede emitir nuevas versiones.",
          "FORBIDDEN_NOT_SHARE_OWNER",
        );
      }

      const prevSnap = (shareContext.latestVersion?.snapshot ?? null) as ProductSnapshot | null;

      const built = await this.spec15Store.buildLiveSnapshotForProduct(
        params.sharerClientId,
        shareContext.share.sourceProductId,
        {
          wholesaleCostCents:
            params.wholesaleCostCents !== undefined
              ? params.wholesaleCostCents
              : prevSnap?.wholesaleCostCents,
          suggestedPriceCents:
            params.suggestedPriceCents !== undefined
              ? params.suggestedPriceCents
              : prevSnap?.suggestedPriceCents,
          minResalePriceCents:
            params.minResalePriceCents !== undefined
              ? params.minResalePriceCents
              : prevSnap?.minResalePriceCents,
          includeReferenceStock:
            params.includeReferenceStock !== undefined
              ? params.includeReferenceStock
              : prevSnap?.referenceStock !== null && prevSnap?.referenceStock !== undefined,
        },
      );

      if (!built) {
        return err(
          "El producto fuente ya no existe en tu catálogo activo.",
          "SOURCE_PRODUCT_NOT_FOUND",
        );
      }

      const changedAttributes = computeProductSnapshotDiff(prevSnap, built.snapshot);
      const cleanChangelog = params.changelog?.trim() || null;

      if (changedAttributes.length === 0 && !cleanChangelog) {
        return err(
          "No se detectaron cambios pendientes respecto a la última versión publicada.",
          "NO_PENDING_CHANGES",
        );
      }

      const nextVersionNumber = shareContext.share.currentVersion + 1;
      await this.spec15Store.createSpec15ShareVersion({
        shareId: shareContext.share.id,
        version: nextVersionNumber,
        changedAttributes,
        changelog: cleanChangelog,
        snapshot: built.snapshot,
      });

      const adoptions = await this.spec15Store.findAdoptionsForShare(shareContext.share.id);
      let autoSyncedAdoptionsCount = 0;

      for (const adoption of adoptions) {
        if (!adoption.linkActive) continue;

        const policies = await this.spec15Store.getSyncPoliciesForAdoption(adoption.id);
        const safeAutoKeys = policies
          .filter(
            (p) =>
              p.autoSync &&
              (SAFE_AUTO_SYNC_ATTRIBUTES as readonly string[]).includes(p.attributeKey),
          )
          .map((p) => p.attributeKey);

        const matchingSafeAttributes = changedAttributes.filter((attr) =>
          safeAutoKeys.includes(attr),
        );

        const allChangedWereAutoSynced =
          changedAttributes.length > 0 &&
          changedAttributes.every((attr) => matchingSafeAttributes.includes(attr));

        if (matchingSafeAttributes.length > 0) {
          await this.spec15Store.syncAdoptionInTenantCell({
            adoption,
            targetVersion: nextVersionNumber,
            snapshot: built.snapshot,
            attributesToUpdate: matchingSafeAttributes,
            mode: "auto",
            advanceAdoptedVersion: allChangedWereAutoSynced,
          });
          autoSyncedAdoptionsCount += 1;
        }

        // Notificar al adoptante de forma no bloqueante sobre la nueva versión disponible
        try {
          const dispatcher = getNotificationDispatcherService();
          await dispatcher.dispatchTenantNotification({
            clientId: adoption.adopterClientId,
            eventKey: "community.product_version_published",
            variables: {
              product_name: built.snapshot.name,
              community_name: shareContext.organizationName,
              version: String(nextVersionNumber),
              changelog: cleanChangelog ?? "Actualización de ficha técnica o medios.",
              community_url: buildAdminPortalUrl("/workspace/community"),
            },
            idempotencyKey: `share-version:${shareContext.share.id}:v${nextVersionNumber}:${adoption.adopterClientId}`,
            inAppPayload: {
              title: `Nueva versión de ${built.snapshot.name} (v${nextVersionNumber})`,
              body:
                cleanChangelog ??
                `La comunidad ${shareContext.organizationName} publicó mejoras en ${built.snapshot.name}.`,
              severity: "info",
              actionUrl: "/workspace/community",
            },
          });
        } catch {
          // Notificación best-effort sin interrumpir publicación
        }
      }

      appLogger.info("[ProductCloning] Nueva versión publicada manualmente desde catálogo vivo", {
        shareId: shareContext.share.id,
        newVersion: nextVersionNumber,
        changedAttributes,
        autoSyncedAdoptionsCount,
      });

      return ok({
        shareId: shareContext.share.id,
        newVersion: nextVersionNumber,
        changedAttributes,
        autoSyncedAdoptionsCount,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al publicar nueva versión: ${msg}`, error);
      return err(msg, "UPDATE_VERSION_ERROR");
    }
  }

  /**
   * Modera (aprueba o rechaza) un producto propuesto por un miembro en comunidad colaborativa (`SPEC-15-D04`).
   */
  async moderateShare(params: {
    shareId: string;
    actorClientId: string;
    actorUserId: string;
    decision: "approve" | "reject";
    rejectionReason?: string | null;
  }): Promise<Result<{ shareId: string; moderationStatus: ShareModerationStatus }>> {
    try {
      const shareContext = await this.spec15Store.findShareWithLatestVersion(params.shareId);
      if (!shareContext) {
        return err("Producto compartido no encontrado.", "SHARE_NOT_FOUND");
      }

      const orgCtx = await this.spec15Store.getOrganizationAndMembership(
        shareContext.share.organizationId,
        params.actorClientId,
      );
      if (
        !orgCtx?.membership ||
        orgCtx.membership.status !== "active" ||
        (orgCtx.membership.role !== "originator" && orgCtx.membership.role !== "co_leader")
      ) {
        return err(
          "Solo el líder o los co-líderes pueden moderar productos propuestos.",
          "FORBIDDEN_REQUIRES_LEADERSHIP",
        );
      }

      const nextStatus: ShareModerationStatus =
        params.decision === "approve" ? "approved" : "rejected";

      await this.spec15Store.updateShareModeration({
        shareId: params.shareId,
        moderationStatus: nextStatus,
        moderatedByUserId: params.actorUserId,
        rejectionReason: params.decision === "reject" ? (params.rejectionReason?.trim() || null) : null,
      });

      return ok({ shareId: params.shareId, moderationStatus: nextStatus });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "MODERATE_SHARE_ERROR");
    }
  }

  /**
   * Archiva o reactiva un producto compartido sin afectar los clones ya adoptados por miembros (`RN-SPEC-15`).
   */
  async archiveOrRestoreShare(params: {
    shareId: string;
    actorClientId: string;
    status: ShareStatus;
  }): Promise<Result<{ shareId: string; status: ShareStatus }>> {
    try {
      const shareContext = await this.spec15Store.findShareWithLatestVersion(params.shareId);
      if (!shareContext) {
        return err("Producto compartido no encontrado.", "SHARE_NOT_FOUND");
      }

      const orgCtx = await this.spec15Store.getOrganizationAndMembership(
        shareContext.share.organizationId,
        params.actorClientId,
      );
      const isLeader =
        orgCtx?.membership?.status === "active" &&
        (orgCtx.membership.role === "originator" || orgCtx.membership.role === "co_leader");

      if (shareContext.share.sharerClientId !== params.actorClientId && !isLeader) {
        return err(
          "No tienes permiso para archivar o restaurar este producto compartido.",
          "FORBIDDEN_SHARE_ACTION",
        );
      }

      await this.spec15Store.updateShareStatus(params.shareId, params.status);
      return ok({ shareId: params.shareId, status: params.status });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "ARCHIVE_SHARE_ERROR");
    }
  }

  /**
   * Lista el catálogo compartido disponible para las comunidades activas del inquilino con paginación y filtros (`SPEC-15`).
   */
  async listCommunityFeedCatalog(params: {
    clientId: string;
    organizationId?: string;
    q?: string;
    category?: string;
    compositionType?: "simple" | "combo" | "all";
    onlyNotAdopted?: boolean;
    page?: number;
    limit?: number;
    sortBy?: "recent" | "popular" | "name" | "suggestedPrice";
    sortDir?: "asc" | "desc";
  }): Promise<Result<CommunityFeedCatalogPage>> {
    try {
      const memberships = await this.spec15Store.getActiveMembershipsForClient(params.clientId);
      const membershipMap = new Map(memberships.map((m) => [m.organizationId, m]));

      let targetOrgIds = memberships.map((m) => m.organizationId);
      if (params.organizationId) {
        if (!membershipMap.has(params.organizationId)) {
          return err(
            "No eres miembro activo de la comunidad solicitada.",
            "UNAUTHORIZED_COMMUNITY_MEMBER",
          );
        }
        targetOrgIds = [params.organizationId];
      }

      if (targetOrgIds.length === 0) {
        return ok({
          items: [],
          pendingModerationItems: [],
          categories: [],
          total: 0,
          page: 1,
          limit: params.limit ?? 12,
          totalPages: 0,
        });
      }

      const [rawShares, myAdoptions] = await Promise.all([
        this.spec15Store.listSharesForOrganizations(targetOrgIds),
        this.spec15Store.listAdoptionsForClient(params.clientId),
      ]);

      const activeAdoptionByShareId = new Map<string, ProductAdoption>();
      for (const adoption of myAdoptions) {
        if (adoption.linkActive && !activeAdoptionByShareId.has(adoption.shareId)) {
          activeAdoptionByShareId.set(adoption.shareId, adoption);
        }
      }

      const mappedApproved: CommunityFeedItemDto[] = [];
      const pendingModerationItems: CommunityFeedItemDto[] = [];
      const categorySet = new Set<string>();

      for (const row of rawShares) {
        if (row.share.status !== "active") continue;
        const snap = (row.latestVersion?.snapshot ?? null) as ProductSnapshot | null;
        if (!snap) continue;

        const media = snap.media ?? [];
        const imageMedia = media.filter((m) => m.mediaKind === "image");
        const cover =
          imageMedia.find((m) => m.isCover) ?? imageMedia[0] ?? null;
        const coverImageUrl = cover
          ? resolveProductMediaUrls({
              mediaId: cover.mediaId,
              mediaKind: "image",
              storageKey: cover.storageKey,
            }).thumbUrl
          : null;

        const mediaPreviewUrls = imageMedia.slice(0, 5).map(
          (m) =>
            resolveProductMediaUrls({
              mediaId: m.mediaId,
              mediaKind: "image",
              storageKey: m.storageKey,
            }).url,
        );

        const mediaCounts = { image: 0, video: 0, audio: 0, pdf: 0 };
        for (const m of media) {
          if (m.mediaKind in mediaCounts) {
            mediaCounts[m.mediaKind] += 1;
          }
        }

        const suggestedPriceCents = snap.suggestedPriceCents ?? snap.priceCents;
        const wholesaleCostCents = snap.wholesaleCostCents ?? null;
        const suggestedMarginPercent =
          wholesaleCostCents !== null && wholesaleCostCents >= 0 && suggestedPriceCents > 0
            ? calculateProductProfitability(wholesaleCostCents, suggestedPriceCents).marginPct
            : null;

        const myAdoption = activeAdoptionByShareId.get(row.share.id);
        const category = snap.category ?? null;
        if (category && row.share.moderationStatus === "approved") {
          categorySet.add(category);
        }

        const dto: CommunityFeedItemDto = {
          shareId: row.share.id,
          organizationId: row.share.organizationId,
          organizationName: row.organizationName,
          sharerClientId: row.share.sharerClientId,
          sharerDisplayName: row.sharerDisplayName,
          sourceProductId: row.share.sourceProductId,
          currentVersion: row.share.currentVersion,
          latestChangelog: row.latestVersion?.changelog ?? null,
          status: row.share.status as ShareStatus,
          moderationStatus: row.share.moderationStatus as ShareModerationStatus,
          rejectionReason: row.share.rejectionReason ?? null,
          name: snap.name,
          description: snap.description,
          sku: snap.sku ?? null,
          kind: snap.kind ?? "physical",
          compositionType: snap.compositionType ?? "simple",
          category,
          brand: snap.brand ?? null,
          currency: snap.currency || "COP",
          wholesaleCostCents,
          suggestedPriceCents,
          minResalePriceCents: snap.minResalePriceCents ?? null,
          suggestedMarginPercent,
          referenceStock: snap.referenceStock ?? null,
          coverImageUrl,
          mediaPreviewUrls,
          mediaCounts,
          attributesCount: Array.isArray(snap.attributes) ? snap.attributes.length : 0,
          comboComponents: (snap.comboComponents ?? []).map((c) => ({
            name: c.name,
            quantity: c.quantity,
            kind: c.kind,
          })),
          botMasterPromptPreview: (snap.botMasterPrompt ?? "").slice(0, 280),
          adoptionsCount: row.adoptionsCount,
          isOwnShare: row.share.sharerClientId === params.clientId,
          alreadyAdopted: Boolean(myAdoption),
          adoptionId: myAdoption?.id ?? null,
          adoptedVersion: myAdoption?.adoptedVersion ?? null,
          hasUpdateAvailable: myAdoption
            ? myAdoption.adoptedVersion < row.share.currentVersion
            : false,
          publishedAt: row.share.createdAt.toISOString(),
          updatedAt: row.share.updatedAt.toISOString(),
        };

        if (row.share.moderationStatus === "approved") {
          mappedApproved.push(dto);
        } else if (row.share.moderationStatus === "pending_review") {
          const membership = membershipMap.get(row.share.organizationId);
          const isOrgLeader =
            membership?.role === "originator" || membership?.role === "co_leader";
          if (isOrgLeader || row.share.sharerClientId === params.clientId) {
            pendingModerationItems.push(dto);
          }
        }
      }

      const qLower = params.q?.trim().toLowerCase() ?? "";
      let filtered = mappedApproved.filter((item) => {
        if (qLower) {
          const hay = `${item.name} ${item.sku ?? ""} ${item.brand ?? ""} ${item.category ?? ""} ${item.sharerDisplayName}`.toLowerCase();
          if (!hay.includes(qLower)) return false;
        }
        if (params.category && params.category !== "all" && item.category !== params.category) {
          return false;
        }
        if (
          params.compositionType &&
          params.compositionType !== "all" &&
          item.compositionType !== params.compositionType
        ) {
          return false;
        }
        if (params.onlyNotAdopted && (item.alreadyAdopted || item.isOwnShare)) {
          return false;
        }
        return true;
      });

      const sortBy = params.sortBy ?? "recent";
      const sortDir = params.sortDir === "asc" ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        if (sortBy === "popular") return (a.adoptionsCount - b.adoptionsCount) * sortDir;
        if (sortBy === "name") return a.name.localeCompare(b.name) * sortDir;
        if (sortBy === "suggestedPrice") {
          return (a.suggestedPriceCents - b.suggestedPriceCents) * sortDir;
        }
        return a.updatedAt.localeCompare(b.updatedAt) * sortDir;
      });

      const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);
      const total = filtered.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
      const page = Math.min(Math.max(params.page ?? 1, 1), Math.max(totalPages, 1));
      const startIdx = (page - 1) * limit;
      const items = filtered.slice(startIdx, startIdx + limit);

      return ok({
        items,
        pendingModerationItems,
        categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b)),
        total,
        page,
        limit,
        totalPages,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al listar catálogo comunitario: ${msg}`, error);
      return err(msg, "LIST_FEED_CATALOG_ERROR");
    }
  }

  /**
   * Valida precondiciones comunes de lectura/adopción de un share (existencia, aprobación, autoría, membresía y no duplicado).
   */
  private async validateAdoptSharePreconditions(params: {
    shareId: string;
    adopterClientId: string;
  }): Promise<
    Result<{
      shareId: string;
      shareVersion: number;
      snapshot: ProductSnapshot;
    }>
  > {
    const shareContext = await this.spec15Store.findShareWithLatestVersion(params.shareId);
    if (
      !shareContext ||
      shareContext.share.status !== "active" ||
      shareContext.share.moderationStatus !== "approved"
    ) {
      return err(
        "El producto compartido no existe, no está aprobado o fue archivado.",
        "SHARE_NOT_FOUND",
      );
    }

    if (shareContext.share.sharerClientId === params.adopterClientId) {
      return err(
        "No puedes adoptar un producto compartido desde tu propio catálogo.",
        "CANNOT_ADOPT_OWN_SHARE",
      );
    }

    const orgCtx = await this.spec15Store.getOrganizationAndMembership(
      shareContext.share.organizationId,
      params.adopterClientId,
    );
    if (!orgCtx || orgCtx.org.status !== "active") {
      return err("La comunidad del producto no está activa.", "ORGANIZATION_SUSPENDED");
    }
    if (!orgCtx.membership || orgCtx.membership.status !== "active") {
      return err(
        "Debes ser miembro activo de esta comunidad para adoptar sus productos.",
        "COMMUNITY_MEMBERSHIP_REQUIRED",
      );
    }

    const myAdoptions = await this.spec15Store.listAdoptionsForClient(params.adopterClientId);
    const duplicate = myAdoptions.find(
      (a) => a.shareId === params.shareId && a.linkActive,
    );
    if (duplicate) {
      return err(
        "Ya adoptaste este producto en tu catálogo.",
        "ALREADY_ADOPTED_SHARE",
      );
    }

    if (!shareContext.latestVersion) {
      return err("La publicación no contiene una versión válida.", "VERSION_NOT_FOUND");
    }

    return ok({
      shareId: shareContext.share.id,
      shareVersion: shareContext.latestVersion.version,
      snapshot: shareContext.latestVersion.snapshot as unknown as ProductSnapshot,
    });
  }

  /**
   * Evalúa de forma previa si el plan del comercio adoptante admite clonar el producto con el modo multimedia elegido (`RN-SPEC-15-04`).
   */
  async checkAdoptionEligibility(params: {
    shareId: string;
    adopterClientId: string;
    includeMediaMode?: IncludeMediaMode;
  }): Promise<Result<AdoptionPlanEligibilityDto>> {
    try {
      const pre = await this.validateAdoptSharePreconditions(params);
      if (!pre.ok) return pre;

      const mode = params.includeMediaMode ?? "all_compatible";
      if (!this.spec15Store.evaluateAdoptionPlanEligibility) {
        return ok({
          allowed: true,
          includeMediaMode: mode,
          violations: [],
          summary: {
            productsUsed: 0,
            productsNeeded: 1,
            productsLimit: null,
            storageUsedBytes: 0,
            storageNeededBytes: 0,
            storageLimitBytes: null,
          },
        });
      }

      const eligibility = await this.spec15Store.evaluateAdoptionPlanEligibility({
        adopterClientId: params.adopterClientId,
        snapshot: pre.data.snapshot,
        includeMediaMode: mode,
      });

      return ok(eligibility);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al evaluar elegibilidad del plan: ${msg}`, error);
      return err(msg, "CHECK_ELIGIBILITY_ERROR");
    }
  }

  /**
   * Clona un producto (simple o combo) hacia la celda del adoptante con copias físicas independientes en SeaweedFS (`SPEC-15-D06`, `SPEC-15-D10`).
   */
  async adoptShareToTenant(params: AdoptShareInput): Promise<Result<AdoptShareResultDto>> {
    try {
      const pre = await this.validateAdoptSharePreconditions({
        shareId: params.shareId,
        adopterClientId: params.adopterClientId,
      });
      if (!pre.ok) return pre;

      const { shareId, shareVersion, snapshot } = pre.data;
      const customSalePriceCents =
        params.customSalePriceCents !== undefined && params.customSalePriceCents !== null
          ? Math.max(0, Math.round(params.customSalePriceCents))
          : snapshot.suggestedPriceCents ?? snapshot.priceCents;

      const customCostPriceCents =
        params.customCostPriceCents !== undefined && params.customCostPriceCents !== null
          ? Math.max(0, Math.round(params.customCostPriceCents))
          : snapshot.wholesaleCostCents ?? 0;

      const minResale = snapshot.minResalePriceCents ?? null;
      if (minResale !== null && customSalePriceCents < minResale) {
        return err(
          "El precio de venta configurado no puede ser inferior al precio mínimo de reventa sugerido.",
          "PRICE_BELOW_MIN_RESALE",
        );
      }

      const includeMediaMode = params.includeMediaMode ?? "all_compatible";
      if (this.spec15Store.evaluateAdoptionPlanEligibility) {
        const eligibility = await this.spec15Store.evaluateAdoptionPlanEligibility({
          adopterClientId: params.adopterClientId,
          snapshot,
          includeMediaMode,
        });
        if (!eligibility.allowed) {
          const hasProductsViolation = eligibility.violations.some(
            (v) => v.dimension === "products",
          );
          const code = hasProductsViolation ? "PRODUCT_QUOTA_EXCEEDED" : "PLAN_QUOTA_EXCEEDED";
          return err(
            formatPlanQuotaViolationsMessage(eligibility.violations, "es"),
            code,
            eligibility.violations,
          );
        }
      }

      const safeAutoSync = (params.autoSyncAttributes ?? []).filter(
        (attr): attr is SafeAutoSyncAttribute =>
          (SAFE_AUTO_SYNC_ATTRIBUTES as readonly string[]).includes(attr),
      );

      const adopted = await this.spec15Store.adoptSnapshotToTenantCell({
        adopterClientId: params.adopterClientId,
        createdByUserId: params.createdByUserId,
        shareId,
        shareVersion,
        snapshot,
        customSalePriceCents,
        customCostPriceCents,
        initialStock: params.initialStock ?? null,
        initialStatus: params.initialStatus ?? "active",
        includeMediaMode,
        retainLink: params.retainLink ?? true,
        autoSyncAttributes: safeAutoSync,
      });

      appLogger.info("[ProductCloning] Producto clonado de comunidad con medios aislados", {
        shareId,
        adopterClientId: params.adopterClientId,
        cloneProductId: adopted.cloneProductId,
        copiedMediaCount: adopted.copiedMediaCount,
        skippedMediaCount: adopted.skippedMedia.length,
      });

      return ok(adopted);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.startsWith("PLAN_QUOTA_EXCEEDED:")) {
        try {
          const violations = JSON.parse(
            msg.slice("PLAN_QUOTA_EXCEEDED:".length),
          ) as PlanQuotaViolationDto[];
          const hasProducts = violations.some((v) => v.dimension === "products");
          return err(
            formatPlanQuotaViolationsMessage(violations, "es"),
            hasProducts ? "PRODUCT_QUOTA_EXCEEDED" : "PLAN_QUOTA_EXCEEDED",
            violations,
          );
        } catch {
          return err(msg, "PLAN_QUOTA_EXCEEDED");
        }
      }
      if (msg.startsWith("PRODUCT_QUOTA_EXCEEDED:")) {
        const parts = msg.split(":");
        const currentUsed = Number(parts[1] ?? 0);
        const requiredDelta = Number(parts[2] ?? 1);
        const limitValue = Number(parts[3] ?? 0);
        const violations: PlanQuotaViolationDto[] = [
          {
            dimension: "products",
            currentUsed,
            requiredDelta,
            projectedTotal: currentUsed + requiredDelta,
            limitValue,
          },
        ];
        return err(
          formatPlanQuotaViolationsMessage(violations, "es"),
          "PRODUCT_QUOTA_EXCEEDED",
          violations,
        );
      }
      appLogger.error(`[ProductCloning] Error al adoptar producto compartido: ${msg}`, error);
      return err(msg, "ADOPT_PRODUCT_ERROR");
    }
  }

  /**
   * Lista todas las adopciones/clones del inquilino junto con estado en catálogo vivo y actualizaciones disponibles (`SPEC-15`).
   */
  async listMyAdoptions(params: {
    clientId: string;
    organizationId?: string;
    onlyOutdated?: boolean;
  }): Promise<Result<MyAdoptionItemDto[]>> {
    try {
      const adoptions = await this.spec15Store.listAdoptionsForClient(params.clientId);
      if (adoptions.length === 0) return ok([]);

      const syncRuns = await this.spec15Store.listSyncRunsForAdoptions(
        adoptions.map((a) => a.id),
      );
      const runsByAdoption = new Map<string, SyncRun[]>();
      for (const r of syncRuns) {
        const list = runsByAdoption.get(r.adoptionId) ?? [];
        if (list.length < 5) list.push(r);
        runsByAdoption.set(r.adoptionId, list);
      }

      const resultItems: MyAdoptionItemDto[] = [];

      for (const adoption of adoptions) {
        const ctx = await this.spec15Store.findAdoptionWithContext(adoption.id);
        if (!ctx) continue;
        if (params.organizationId && ctx.share.organizationId !== params.organizationId) {
          continue;
        }

        const live = await this.spec15Store.getLiveProductForDiff(
          params.clientId,
          adoption.cloneProductId,
        );
        if (!live) continue;

        const hasUpdateAvailable =
          adoption.linkActive && adoption.adoptedVersion < ctx.share.currentVersion;
        if (params.onlyOutdated && !hasUpdateAvailable) {
          continue;
        }

        resultItems.push({
          adoptionId: adoption.id,
          shareId: ctx.share.id,
          organizationId: ctx.share.organizationId,
          organizationName: ctx.organizationName,
          sharerDisplayName: ctx.sharerDisplayName,
          cloneProductId: adoption.cloneProductId,
          cloneName: live.product.name,
          cloneSku: live.product.sku ?? null,
          cloneStatus: live.product.status,
          clonePriceCents: live.product.priceCents,
          cloneCostPriceCents: live.product.costPriceCents ?? 0,
          cloneStockQuantity: live.product.stockQuantity ?? null,
          cloneCoverImageUrl: live.coverImageUrl,
          compositionType: (live.product.compositionType || "simple") as "simple" | "combo",
          currency: live.product.currency || "COP",
          adoptedVersion: adoption.adoptedVersion,
          latestVersion: ctx.share.currentVersion,
          hasUpdateAvailable,
          latestChangelog: ctx.latestVersion?.changelog ?? null,
          linkActive: adoption.linkActive,
          shareStatus: ctx.share.status as ShareStatus,
          autoSyncAttributes: ctx.policies.filter((p) => p.autoSync).map((p) => p.attributeKey),
          recentSyncRuns: (runsByAdoption.get(adoption.id) ?? []).map((r) => ({
            id: r.id,
            version: r.version,
            mode: r.mode,
            attributes: Array.isArray(r.attributes) ? r.attributes : [],
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          })),
          createdAt: adoption.createdAt.toISOString(),
          updatedAt: adoption.updatedAt.toISOString(),
        });
      }

      return ok(resultItems);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error al listar clones adoptados: ${msg}`, error);
      return err(msg, "LIST_ADOPTIONS_ERROR");
    }
  }

  /**
   * Calcula el diff campo a campo entre el clon vivo del adoptante y la última versión del producto fuente (`SPEC-15-D08`).
   */
  async getAdoptionDiff(params: {
    adoptionId: string;
    clientId: string;
  }): Promise<Result<AdoptionDiffResultDto>> {
    try {
      const ctx = await this.spec15Store.findAdoptionWithContext(params.adoptionId);
      if (!ctx || ctx.adoption.adopterClientId !== params.clientId) {
        return err("Adopción de producto no encontrada.", "ADOPTION_NOT_FOUND");
      }
      if (!ctx.latestVersion) {
        return err("No existe versión de referencia para comparar.", "VERSION_NOT_FOUND");
      }

      const live = await this.spec15Store.getLiveProductForDiff(
        params.clientId,
        ctx.adoption.cloneProductId,
      );
      if (!live) {
        return err("El producto clonado ya no existe en tu catálogo.", "CLONE_PRODUCT_NOT_FOUND");
      }

      const incoming = ctx.latestVersion.snapshot as unknown as ProductSnapshot;
      const changedSinceAdopted = Array.from(
        new Set(ctx.versionsSinceAdopted.flatMap((v) => v.changedAttributes ?? [])),
      );

      const safeCompareList: Array<{
        attr: SafeAutoSyncAttribute;
        currentValue: unknown;
        incomingValue: unknown;
      }> = [
        { attr: "name", currentValue: live.product.name, incomingValue: incoming.name },
        {
          attr: "description",
          currentValue: live.product.description,
          incomingValue: incoming.description,
        },
        {
          attr: "category",
          currentValue: live.product.category ?? null,
          incomingValue: incoming.category ?? null,
        },
        {
          attr: "brand",
          currentValue: live.product.brand ?? null,
          incomingValue: incoming.brand ?? null,
        },
        {
          attr: "botMasterPrompt",
          currentValue: live.product.botMasterPrompt ?? "",
          incomingValue: incoming.botMasterPrompt ?? "",
        },
        {
          attr: "attributes",
          currentValue: Array.isArray(live.product.attributes) ? live.product.attributes : [],
          incomingValue: Array.isArray(incoming.attributes) ? incoming.attributes : [],
        },
        {
          attr: "media",
          currentValue: [...live.mediaHashes].sort(),
          incomingValue: (incoming.media ?? []).map((m) => m.contentHash).sort(),
        },
      ];

      const fields: AdoptionDiffField[] = safeCompareList.map((entry) => ({
        attribute: entry.attr,
        kind: "safe",
        hasChangedInVersion: changedSinceAdopted.includes(entry.attr),
        differsFromCurrentClone:
          canonicalizeForDiff(entry.currentValue) !== canonicalizeForDiff(entry.incomingValue),
        currentValue: entry.currentValue,
        incomingValue: entry.incomingValue,
      }));

      fields.push({
        attribute: "wholesaleCostCents",
        kind: "reference",
        hasChangedInVersion: changedSinceAdopted.includes("wholesaleCostCents"),
        differsFromCurrentClone:
          (live.product.costPriceCents ?? 0) !== (incoming.wholesaleCostCents ?? 0),
        currentValue: live.product.costPriceCents ?? 0,
        incomingValue: incoming.wholesaleCostCents ?? 0,
      });

      fields.push({
        attribute: "suggestedPriceCents",
        kind: "reference",
        hasChangedInVersion: changedSinceAdopted.includes("suggestedPriceCents"),
        differsFromCurrentClone:
          live.product.priceCents !== (incoming.suggestedPriceCents ?? incoming.priceCents),
        currentValue: live.product.priceCents,
        incomingValue: incoming.suggestedPriceCents ?? incoming.priceCents,
      });

      return ok({
        adoptionId: ctx.adoption.id,
        shareId: ctx.share.id,
        organizationName: ctx.organizationName,
        sharerDisplayName: ctx.sharerDisplayName,
        cloneProductId: live.product.id,
        cloneName: live.product.name,
        adoptedVersion: ctx.adoption.adoptedVersion,
        latestVersion: ctx.share.currentVersion,
        hasUpdateAvailable: ctx.adoption.adoptedVersion < ctx.share.currentVersion,
        latestChangelog: ctx.latestVersion.changelog ?? null,
        changedAttributesInVersions: changedSinceAdopted,
        protectedSnapshot: {
          memberPriceCents: live.product.priceCents,
          memberCostPriceCents: live.product.costPriceCents ?? 0,
          memberStockQuantity: live.product.stockQuantity ?? null,
          incomingWholesaleCostCents: incoming.wholesaleCostCents ?? null,
          incomingSuggestedPriceCents: incoming.suggestedPriceCents ?? incoming.priceCents,
          minResalePriceCents: incoming.minResalePriceCents ?? null,
        },
        fields,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "GET_ADOPTION_DIFF_ERROR");
    }
  }

  /**
   * Aplica sincronización manual selectiva sobre los atributos elegidos por el miembro manteniendo su inventario protegido (`SPEC-15-D08`).
   */
  async syncAdoptionSelective(
    params: SyncAdoptionSelectiveInput,
  ): Promise<Result<{ syncedAttributes: string[]; version: number }>> {
    try {
      const ctx = await this.spec15Store.findAdoptionWithContext(params.adoptionId);
      if (!ctx || ctx.adoption.adopterClientId !== params.clientId) {
        return err("Adopción de producto no encontrada.", "ADOPTION_NOT_FOUND");
      }
      if (!ctx.adoption.linkActive) {
        return err(
          "El vínculo de actualización para este clon fue desvinculado previamente.",
          "ADOPTION_INACTIVE",
        );
      }
      if (!ctx.latestVersion) {
        return err("No existe versión de origen disponible.", "VERSION_NOT_FOUND");
      }

      const snapshot = ctx.latestVersion.snapshot as unknown as ProductSnapshot;
      const safeRequested = params.attributes.filter((attr) =>
        (SAFE_AUTO_SYNC_ATTRIBUTES as readonly string[]).includes(attr),
      );

      if (
        safeRequested.length === 0 &&
        !params.applySuggestedPrice &&
        !params.applyWholesaleCost &&
        !params.syncMedia
      ) {
        return err(
          "Selecciona al menos un campo para sincronizar.",
          "NO_SYNC_ATTRIBUTES_SELECTED",
        );
      }

      const syncRes = await this.spec15Store.syncAdoptionInTenantCell({
        adoption: ctx.adoption,
        targetVersion: ctx.latestVersion.version,
        snapshot,
        attributesToUpdate: safeRequested,
        applySuggestedPrice: params.applySuggestedPrice,
        applyWholesaleCost: params.applyWholesaleCost,
        syncMedia: params.syncMedia,
        mode: "manual",
        advanceAdoptedVersion: true,
        actorUserId: params.actorUserId,
      });

      return ok({
        syncedAttributes: syncRes.syncedAttributes,
        version: ctx.latestVersion.version,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ProductCloning] Error en sincronización selectiva: ${msg}`, error);
      return err(msg, "SYNC_PRODUCT_ERROR");
    }
  }

  /**
   * Configura las políticas de auto-sync únicamente sobre atributos seguros no comerciales (`SPEC-15-D08`).
   */
  async updateAdoptionPolicies(params: {
    adoptionId: string;
    clientId: string;
    autoSyncAttributes: string[];
  }): Promise<Result<{ autoSyncAttributes: SafeAutoSyncAttribute[] }>> {
    try {
      const ctx = await this.spec15Store.findAdoptionWithContext(params.adoptionId);
      if (!ctx || ctx.adoption.adopterClientId !== params.clientId) {
        return err("Adopción de producto no encontrada.", "ADOPTION_NOT_FOUND");
      }
      if (!ctx.adoption.linkActive) {
        return err("El clon ya fue desvinculado de la fuente.", "ADOPTION_INACTIVE");
      }

      const requestedProtected = params.autoSyncAttributes.filter((attr) =>
        (PROTECTED_ADOPTER_ATTRIBUTES as readonly string[]).includes(attr),
      );
      if (requestedProtected.length > 0) {
        return err(
          "Precio, precio promocional e inventario del adoptante están protegidos y no pueden auto-sincronizarse.",
          "FORBIDDEN_PROTECTED_ATTRIBUTE_AUTOSYNC",
        );
      }

      const safeAttrs = params.autoSyncAttributes.filter(
        (attr): attr is SafeAutoSyncAttribute =>
          (SAFE_AUTO_SYNC_ATTRIBUTES as readonly string[]).includes(attr),
      );

      await this.spec15Store.updateCloneSyncPolicies(ctx.adoption.id, safeAttrs);

      return ok({ autoSyncAttributes: safeAttrs });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UPDATE_POLICIES_ERROR");
    }
  }

  /**
   * Desvincula permanentemente un clon de futuras actualizaciones manteniendo el producto operando en el catálogo (`SPEC-15`).
   */
  async unlinkAdoption(params: {
    adoptionId: string;
    clientId: string;
  }): Promise<Result<{ adoptionId: string; linkActive: false }>> {
    try {
      const ctx = await this.spec15Store.findAdoptionWithContext(params.adoptionId);
      if (!ctx || ctx.adoption.adopterClientId !== params.clientId) {
        return err("Adopción de producto no encontrada.", "ADOPTION_NOT_FOUND");
      }

      await this.spec15Store.unlinkAdoption(ctx.adoption.id);
      return ok({ adoptionId: ctx.adoption.id, linkActive: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg, "UNLINK_ADOPTION_ERROR");
    }
  }
}

let cachedProductCloningService: ProductCloningAndCommunitiesService | null = null;

/**
 * Retorna la instancia singleton del servicio de catálogo compartido, adopciones y clonación (`SPEC-15`).
 */
export function getProductCloningService(): ProductCloningAndCommunitiesService {
  if (!cachedProductCloningService) {
    const legacyShimRepo: IProductCloningRepository = {
      async findOrganizationMembership() {
        return null;
      },
      async createProductShare() {
        throw new Error("Use publishShareFromCellProduct");
      },
      async findShareById() {
        return null;
      },
      async findLatestShareVersion() {
        return null;
      },
      async createShareVersion() {
        throw new Error("Use publishNewShareVersionFromCellProduct");
      },
      async findAdoptionsByShareId() {
        return [];
      },
      async findAdoptionById() {
        return null;
      },
      async createAdoption() {
        throw new Error("Use adoptShareToTenant");
      },
      async cloneProductInCell() {
        throw new Error("Use adoptShareToTenant");
      },
      async updateProductInCell() {
        return false;
      },
      async getSyncPolicies() {
        return [];
      },
      async createSyncRun() {
        throw new Error("Use syncAdoptionSelective");
      },
      async updateAdoptionVersion() {},
    };
    cachedProductCloningService = new ProductCloningAndCommunitiesService(
      legacyShimRepo,
      new DrizzleSpec15ProductCloningStore(),
    );
  }
  return cachedProductCloningService;
}

