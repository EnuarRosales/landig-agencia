import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type {
  ProductShare,
  ProductShareVersion,
  ProductAdoption,
  CloneSyncPolicy,
  SyncRun,
} from "../db/schemas/admin/communities-and-cloning";

export interface ProductSnapshot {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  sku?: string;
  category?: string;
  brand?: string;
  mediaIds?: string[];
  attributes?: Record<string, unknown>;
}

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
  constructor(private readonly repo: IProductCloningRepository) {}

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
}

