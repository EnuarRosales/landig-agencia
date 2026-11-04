import { createHash } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { err, ok, type Result } from "../types/result";
import { getDb } from "../db/client";
import { clients } from "../db/schemas/admin/clients";
import { plans } from "../db/schemas/admin/plans";
import { planLimits, clientPlanOverrides, type PlanLimitDimensionKey } from "../db/schemas/admin/plan-catalogs";
import { mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { chatwootAccounts } from "../db/schemas/admin/chatwoot-media-onboarding";
import { cellClientMedia, cellClientUsage, cellProductMedia } from "../db/schemas/tenant/tenancy-catalog";

export type MediaKind = "image" | "audio" | "video" | "pdf";

export interface IngestMediaInput {
  buffer: Buffer;
  originalFilename: string;
  mimeType?: string;
  mediaKind?: MediaKind;
  origin?: "catalog" | "chatwoot";
}

export interface IngestMediaResult {
  mediaId: string;
  contentHash: string;
  sizeBytes: number;
  deduplicatedForTenant: boolean;
  deduplicatedGlobally: boolean;
  addedBytes: number;
  currentTotalStorageBytes: number;
}

export interface StorageSummaryResult {
  usedBytes: number;
  quota: { mode: "LIMITED" | "UNLIMITED"; value: number | null };
  availableBytes: number | null;
  isUnlimited: boolean;
}

export interface ITenantStorageAccountingRepository {
  getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }>;
  getTenantStorageBytes(clientId: string): Promise<number>;
  findMediaByHash(
    contentHash: string,
  ): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string } | null>;
  hasClientMediaReference(clientId: string, mediaId: string): Promise<boolean>;
  createGlobalMediaEntry(entry: {
    contentHash: string;
    sizeBytes: number;
    mediaKind: MediaKind;
    mimeType: string;
    originalFilename: string;
  }): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string }>;
  linkClientMedia(clientId: string, mediaId: string, sizeBytes: number): Promise<void>;
  unlinkClientMedia(clientId: string, mediaId: string): Promise<{ unlinked: boolean; freedBytes: number }>;
  countClientReferencesToMedia(clientId: string, mediaId: string): Promise<number>;
  findClientIdByChatwootAccountId(accountId: number): Promise<string | null>;
  recordChatwootMediaAttachment(params: {
    clientId: string;
    chatwootAccountId: number;
    conversationId?: number;
    mediaId: string;
  }): Promise<void>;
}

/**
 * Repositorio en memoria para pruebas unitarias sin dependencias externas.
 */
export class InMemoryTenantStorageAccountingRepository
  implements ITenantStorageAccountingRepository
{
  public quotas = new Map<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }>();
  public globalMedia = new Map<
    string,
    { id: string; contentHash: string; sizeBytes: number; mediaKind: string }
  >();
  public clientMedia = new Map<string, { clientId: string; mediaId: string; sizeBytes: number }>();
  public clientUsage = new Map<string, number>();
  public clientRefs = new Map<string, number>(); // `${clientId}:${mediaId}` -> count
  public chatwootAccountToClient = new Map<number, string>();
  public chatwootAttachments: Array<{ clientId: string; chatwootAccountId: number; conversationId?: number; mediaId: string }> = [];

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const key = `${clientId}:${dimension}`;
    return this.quotas.get(key) ?? { mode: "UNLIMITED", value: null };
  }

  async getTenantStorageBytes(clientId: string): Promise<number> {
    return this.clientUsage.get(clientId) ?? 0;
  }

  async findMediaByHash(
    contentHash: string,
  ): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string } | null> {
    for (const m of this.globalMedia.values()) {
      if (m.contentHash === contentHash) {
        return m;
      }
    }
    return null;
  }

  async hasClientMediaReference(clientId: string, mediaId: string): Promise<boolean> {
    const key = `${clientId}:${mediaId}`;
    return this.clientMedia.has(key);
  }

  async createGlobalMediaEntry(entry: {
    contentHash: string;
    sizeBytes: number;
    mediaKind: MediaKind;
    mimeType: string;
    originalFilename: string;
  }): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string }> {
    const id = `019b0000-0000-7000-8004-${String(this.globalMedia.size + 1).padStart(12, "0")}`;
    const record = {
      id,
      contentHash: entry.contentHash,
      sizeBytes: entry.sizeBytes,
      mediaKind: entry.mediaKind,
    };
    this.globalMedia.set(id, record);
    return record;
  }

  async linkClientMedia(clientId: string, mediaId: string, sizeBytes: number): Promise<void> {
    const key = `${clientId}:${mediaId}`;
    if (!this.clientMedia.has(key)) {
      this.clientMedia.set(key, { clientId, mediaId, sizeBytes });
      const current = this.clientUsage.get(clientId) ?? 0;
      this.clientUsage.set(clientId, current + sizeBytes);
    }
    const currentRefs = this.clientRefs.get(key) ?? 0;
    this.clientRefs.set(key, currentRefs + 1);
  }

  async unlinkClientMedia(
    clientId: string,
    mediaId: string,
  ): Promise<{ unlinked: boolean; freedBytes: number }> {
    const key = `${clientId}:${mediaId}`;
    const existing = this.clientMedia.get(key);
    if (!existing) {
      return { unlinked: false, freedBytes: 0 };
    }

    const currentRefs = this.clientRefs.get(key) ?? 1;
    if (currentRefs <= 1) {
      this.clientMedia.delete(key);
      this.clientRefs.delete(key);
      const current = this.clientUsage.get(clientId) ?? 0;
      const nextUsage = Math.max(0, current - existing.sizeBytes);
      this.clientUsage.set(clientId, nextUsage);
      return { unlinked: true, freedBytes: existing.sizeBytes };
    } else {
      this.clientRefs.set(key, currentRefs - 1);
      return { unlinked: false, freedBytes: 0 };
    }
  }

  async countClientReferencesToMedia(clientId: string, mediaId: string): Promise<number> {
    const key = `${clientId}:${mediaId}`;
    return this.clientRefs.get(key) ?? 0;
  }

  async findClientIdByChatwootAccountId(accountId: number): Promise<string | null> {
    return this.chatwootAccountToClient.get(accountId) ?? null;
  }

  async recordChatwootMediaAttachment(params: {
    clientId: string;
    chatwootAccountId: number;
    conversationId?: number;
    mediaId: string;
  }): Promise<void> {
    this.chatwootAttachments.push(params);
  }
}

/**
 * Implementación de persistencia Drizzle ORM sobre PostgreSQL.
 */
export class DrizzleTenantStorageAccountingRepository
  implements ITenantStorageAccountingRepository
{
  constructor(private readonly dbProvider: () => any = () => getDb()) {}

  async getPlanQuota(
    clientId: string,
    dimension: PlanLimitDimensionKey,
  ): Promise<{ mode: "LIMITED" | "UNLIMITED"; value: number | null }> {
    const db = this.dbProvider();
    const now = new Date();

    const [override] = await db
      .select({
        mode: clientPlanOverrides.mode,
        value: clientPlanOverrides.value,
      })
      .from(clientPlanOverrides)
      .where(
        and(
          eq(clientPlanOverrides.clientId, clientId),
          eq(clientPlanOverrides.dimension, dimension),
          sql`${clientPlanOverrides.validFrom} <= ${now}`,
          sql`(${clientPlanOverrides.validTo} IS NULL OR ${clientPlanOverrides.validTo} >= ${now})`,
        ),
      )
      .limit(1);

    if (override) {
      return {
        mode: override.mode as "LIMITED" | "UNLIMITED",
        value: override.value !== null ? Number(override.value) : null,
      };
    }

    const [planLimit] = await db
      .select({
        mode: planLimits.mode,
        value: planLimits.value,
      })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id))
      .innerJoin(
        planLimits,
        and(eq(planLimits.planId, plans.id), eq(planLimits.dimension, dimension)),
      )
      .where(eq(clients.id, clientId))
      .limit(1);

    if (planLimit) {
      return {
        mode: planLimit.mode as "LIMITED" | "UNLIMITED",
        value: planLimit.value !== null ? Number(planLimit.value) : null,
      };
    }

    return { mode: "UNLIMITED", value: null };
  }

  async getTenantStorageBytes(clientId: string): Promise<number> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ usedValue: cellClientUsage.usedValue })
      .from(cellClientUsage)
      .where(and(eq(cellClientUsage.clientId, clientId), eq(cellClientUsage.dimension, "storage_bytes")))
      .limit(1);

    return row?.usedValue !== undefined ? Number(row.usedValue) : 0;
  }

  async findMediaByHash(
    contentHash: string,
  ): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string } | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({
        id: mediaCatalog.id,
        contentHash: mediaCatalog.contentHash,
        sizeBytes: mediaCatalog.sizeBytes,
        mediaKind: mediaCatalog.mediaKind,
      })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.contentHash, contentHash))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      contentHash: row.contentHash,
      sizeBytes: Number(row.sizeBytes ?? 0),
      mediaKind: row.mediaKind,
    };
  }

  async hasClientMediaReference(clientId: string, mediaId: string): Promise<boolean> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ id: cellClientMedia.id })
      .from(cellClientMedia)
      .where(and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, mediaId)))
      .limit(1);
    return Boolean(row);
  }

  async createGlobalMediaEntry(entry: {
    contentHash: string;
    sizeBytes: number;
    mediaKind: MediaKind;
    mimeType: string;
    originalFilename: string;
  }): Promise<{ id: string; contentHash: string; sizeBytes: number; mediaKind: string }> {
    const db = this.dbProvider();
    const [inserted] = await db
      .insert(mediaCatalog)
      .values({
        contentHash: entry.contentHash,
        storagePoolId: "seaweedfs-main",
        storageKey: `media/${entry.contentHash}`,
        sizeBytes: entry.sizeBytes,
        mediaKind: entry.mediaKind,
        mimeType: entry.mimeType,
        sourceFormat: entry.originalFilename.split(".").pop()?.toLowerCase() ?? "bin",
        originalFilename: entry.originalFilename,
        processingStatus: "ready",
        storageType: "internal",
      })
      .returning({
        id: mediaCatalog.id,
        contentHash: mediaCatalog.contentHash,
        sizeBytes: mediaCatalog.sizeBytes,
        mediaKind: mediaCatalog.mediaKind,
      });

    return {
      id: inserted.id,
      contentHash: inserted.contentHash,
      sizeBytes: Number(inserted.sizeBytes ?? 0),
      mediaKind: inserted.mediaKind,
    };
  }

  async linkClientMedia(clientId: string, mediaId: string, sizeBytes: number): Promise<void> {
    const db = this.dbProvider();
    await db.transaction(async (tx: any) => {
      // 1. Insertar en cellClientMedia si no existe
      await tx
        .insert(cellClientMedia)
        .values({
          clientId,
          mediaId,
          sizeBytes,
        })
        .onConflictDoNothing();

      // 2. Incrementar o inicializar cellClientUsage
      await tx
        .insert(cellClientUsage)
        .values({
          clientId,
          dimension: "storage_bytes",
          usedValue: sizeBytes,
        })
        .onConflictDoUpdate({
          target: [cellClientUsage.clientId, cellClientUsage.dimension],
          set: {
            usedValue: sql`${cellClientUsage.usedValue} + ${sizeBytes}`,
            updatedAt: new Date(),
          },
        });
    });
  }

  async unlinkClientMedia(
    clientId: string,
    mediaId: string,
  ): Promise<{ unlinked: boolean; freedBytes: number }> {
    const db = this.dbProvider();
    return await db.transaction(async (tx: any) => {
      const [existing] = await tx
        .select({ sizeBytes: cellClientMedia.sizeBytes })
        .from(cellClientMedia)
        .where(and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, mediaId)))
        .limit(1);

      if (!existing) {
        return { unlinked: false, freedBytes: 0 };
      }

      const freedBytes = Number(existing.sizeBytes);

      // Eliminar referencia
      await tx
        .delete(cellClientMedia)
        .where(and(eq(cellClientMedia.clientId, clientId), eq(cellClientMedia.mediaId, mediaId)));

      // Decrementar usage
      await tx
        .update(cellClientUsage)
        .set({
          usedValue: sql`GREATEST(0, ${cellClientUsage.usedValue} - ${freedBytes})`,
          updatedAt: new Date(),
        })
        .where(and(eq(cellClientUsage.clientId, clientId), eq(cellClientUsage.dimension, "storage_bytes")));

      return { unlinked: true, freedBytes };
    });
  }

  async countClientReferencesToMedia(clientId: string, mediaId: string): Promise<number> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cellProductMedia)
      .where(and(eq(cellProductMedia.clientId, clientId), eq(cellProductMedia.mediaId, mediaId)));

    return row?.count ?? 0;
  }

  async findClientIdByChatwootAccountId(accountId: number): Promise<string | null> {
    const db = this.dbProvider();
    const [row] = await db
      .select({ clientId: chatwootAccounts.clientId })
      .from(chatwootAccounts)
      .where(eq(chatwootAccounts.chatwootAccountId, accountId))
      .limit(1);

    return row?.clientId ?? null;
  }

  async recordChatwootMediaAttachment(params: {
    clientId: string;
    chatwootAccountId: number;
    conversationId?: number;
    mediaId: string;
  }): Promise<void> {
    // Si se desea auditar o registrar el adjunto de conversación
    const db = this.dbProvider();
    // Vinculación registrada en client_media de forma normal
  }
}

/**
 * Servicio de negocio para la contabilización deduplicada de almacenamiento (T8, S3, S7-S8, S10-S11)
 * a través de archivos de catálogo de Mocter y adjuntos de atención de Chatwoot.
 */
export class TenantStorageAccountingService {
  private tenantLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly repository: ITenantStorageAccountingRepository) {}

  /**
   * Bloqueo atómico por inquilino para prevenir sobreconsumos concurrentes de almacenamiento (RN-006, CA-011).
   */
  private async withTenantLock<T>(clientId: string, action: () => Promise<T>): Promise<T> {
    while (this.tenantLocks.has(clientId)) {
      await this.tenantLocks.get(clientId);
    }

    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.tenantLocks.set(clientId, lockPromise);

    try {
      return await action();
    } finally {
      this.tenantLocks.delete(clientId);
      releaseLock();
    }
  }

  /**
   * Detecta el tipo de medio a partir del nombre o buffer si no se especifica.
   */
  private inferMediaKind(filename: string, mimeType?: string): MediaKind {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(ext) || mimeType?.startsWith("image/")) {
      return "image";
    }
    if (["mp4", "webm", "mov", "mkv"].includes(ext) || mimeType?.startsWith("video/")) {
      return "video";
    }
    if (["mp3", "opus", "ogg", "wav", "m4a", "aac"].includes(ext) || mimeType?.startsWith("audio/")) {
      return "audio";
    }
    return "pdf";
  }

  /**
   * Ingesta y contabiliza un archivo multimedia para el inquilino aplicando deduplicación por SHA-256 (S3).
   *
   * Si el inquilino ya referencia este archivo, no incrementa el almacenamiento facturado (addedBytes = 0).
   * Si no lo referencia, valida la cuota disponible antes de confirmar la carga (CA-006, S10).
   */
  async ingestMedia(
    clientId: string,
    input: IngestMediaInput,
  ): Promise<Result<IngestMediaResult>> {
    if (!input.buffer || input.buffer.length === 0) {
      return err("El contenido del archivo no puede estar vacío.", "INVALID_BUFFER");
    }

    const contentHash = createHash("sha256").update(input.buffer).digest("hex");
    const sizeBytes = input.buffer.length;
    const mediaKind = input.mediaKind ?? this.inferMediaKind(input.originalFilename, input.mimeType);
    const mimeType = input.mimeType ?? `application/${mediaKind}`;

    return await this.withTenantLock(clientId, async () => {
      // 1. Verificar si el archivo ya existe globalmente en el catálogo
      let globalMedia = await this.repository.findMediaByHash(contentHash);
      const deduplicatedGlobally = Boolean(globalMedia);

      if (!globalMedia) {
        globalMedia = await this.repository.createGlobalMediaEntry({
          contentHash,
          sizeBytes,
          mediaKind,
          mimeType,
          originalFilename: input.originalFilename,
        });
      }

      // 2. Verificar si el inquilino ya contabiliza este objeto físico (Deduplicación multi-producto / multi-mensaje)
      const alreadyHasRef = await this.repository.hasClientMediaReference(
        clientId,
        globalMedia.id,
      );

      const currentUsed = await this.repository.getTenantStorageBytes(clientId);

      if (alreadyHasRef) {
        // El inquilino ya tiene este archivo contabilizado en client_media
        return ok({
          mediaId: globalMedia.id,
          contentHash,
          sizeBytes,
          deduplicatedForTenant: true,
          deduplicatedGlobally,
          addedBytes: 0,
          currentTotalStorageBytes: currentUsed,
        });
      }

      // 3. Evaluar cuota comercial 'storage_bytes' para el incremento
      const quota = await this.repository.getPlanQuota(clientId, "storage_bytes");
      if (quota.mode === "LIMITED") {
        if (quota.value === null || quota.value === 0) {
          return err(
            "No hay almacenamiento disponible para completar la carga.",
            "STORAGE_QUOTA_EXCEEDED",
          );
        }

        if (currentUsed + sizeBytes > quota.value) {
          return err(
            "No hay almacenamiento disponible para completar la carga.",
            "STORAGE_QUOTA_EXCEEDED",
          );
        }
      }

      // 4. Vincular al inquilino e incrementar consumo
      await this.repository.linkClientMedia(clientId, globalMedia.id, sizeBytes);

      return ok({
        mediaId: globalMedia.id,
        contentHash,
        sizeBytes,
        deduplicatedForTenant: false,
        deduplicatedGlobally,
        addedBytes: sizeBytes,
        currentTotalStorageBytes: currentUsed + sizeBytes,
      });
    });
  }

  /**
   * Ingesta un adjunto multimedia proveniente de una conversación en Chatwoot (T8, S8).
   *
   * Resuelve el inquilino a partir del account_id de Chatwoot y aplica deduplicación por SHA-256.
   */
  async ingestChatwootAttachment(
    chatwootAccountId: number,
    input: {
      buffer: Buffer;
      filename: string;
      mimeType?: string;
      conversationId?: number;
    },
  ): Promise<Result<IngestMediaResult>> {
    const clientId = await this.repository.findClientIdByChatwootAccountId(chatwootAccountId);
    if (!clientId) {
      return err(
        `No se encontró un inquilino asociado a la cuenta de Chatwoot ${chatwootAccountId}.`,
        "TENANT_NOT_FOUND",
      );
    }

    const res = await this.ingestMedia(clientId, {
      buffer: input.buffer,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      origin: "chatwoot",
    });

    if (res.ok) {
      await this.repository.recordChatwootMediaAttachment({
        clientId,
        chatwootAccountId,
        conversationId: input.conversationId,
        mediaId: res.data.mediaId,
      });
    }

    return res;
  }

  /**
   * Libera la referencia a un archivo y descuenta el almacenamiento si ya no hay más referencias.
   */
  async releaseMediaReference(
    clientId: string,
    mediaId: string,
  ): Promise<Result<{ unlinked: boolean; freedBytes: number }>> {
    return await this.withTenantLock(clientId, async () => {
      const outcome = await this.repository.unlinkClientMedia(clientId, mediaId);
      return ok(outcome);
    });
  }

  /**
   * Obtiene el resumen de almacenamiento y cuota disponible del inquilino (S3).
   */
  async getStorageSummary(clientId: string): Promise<StorageSummaryResult> {
    const [usedBytes, quota] = await Promise.all([
      this.repository.getTenantStorageBytes(clientId),
      this.repository.getPlanQuota(clientId, "storage_bytes"),
    ]);

    const isUnlimited = quota.mode === "UNLIMITED";
    const availableBytes =
      quota.mode === "LIMITED" && quota.value !== null
        ? Math.max(0, quota.value - usedBytes)
        : null;

    return {
      usedBytes,
      quota,
      availableBytes,
      isUnlimited,
    };
  }
}
