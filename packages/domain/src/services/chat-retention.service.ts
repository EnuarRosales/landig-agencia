import crypto from "node:crypto";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

export interface TenantRetentionProfile {
  clientId: string;
  chatwootAccountId: number;
  planCode: string;
  planRetentionDays: number;
  overrideRetentionDays?: number;
  legalFloorDays: number;
  hasLegalArchiveFeature: boolean;
}

export interface ExpiredConversationSummary {
  id: number;
  createdAt: Date;
  lastActivityAt: Date;
  attachmentBlobKeys?: string[];
}

export interface ConversationDetailPayload {
  id: number;
  createdAt: string;
  messages: Array<{
    id: number;
    content: string;
    sender: string;
    createdAt: string;
    attachments?: Array<{ id: number; fileUrl: string; blobKey: string }>;
  }>;
}

export interface IChatwootRetentionClient {
  listExpiredConversations(chatwootAccountId: number, cutoffDate: Date): Promise<ExpiredConversationSummary[]>;
  getConversationPayload(chatwootAccountId: number, conversationId: number): Promise<ConversationDetailPayload>;
  deleteConversation(chatwootAccountId: number, conversationId: number): Promise<boolean>;
}

export interface IActiveStoragePurgeClient {
  purgeBlobs(blobKeys: string[]): Promise<{ purgedCount: number }>;
}

export interface ILegalArchiveStorageProvider {
  storeEncryptedArchive(
    clientId: string,
    conversationId: number,
    encryptedPayload: Buffer,
    iv: Buffer,
    authTag: Buffer,
  ): Promise<{ archiveKey: string }>;
  getEncryptedArchive(archiveKey: string): Promise<{
    encryptedPayload: Buffer;
    iv: Buffer;
    authTag: Buffer;
  } | null>;
}

export interface IChatRetentionRepository {
  getActiveTenantsRetentionConfig(): Promise<TenantRetentionProfile[]>;
  recordAuditLog(entry: {
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    clientId: string;
    justification?: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface RetentionJobResult {
  totalTenantsProcessed: number;
  totalConversationsDeleted: number;
  totalConversationsArchived: number;
  totalAttachmentsPurged: number;
  errorsCount: number;
}

/**
 * Servicio de retención de chats, purga de adjuntos y archivo legal opcional
 * (ADM-001 Fase 5 · T-24, T-25, T-26, RF-04.5, RF-04.6, RF-07.11, D-27, D-28).
 */
export class ChatRetentionService {
  constructor(
    private readonly repo: IChatRetentionRepository,
    private readonly chatwootClient: IChatwootRetentionClient,
    private readonly activeStorageClient: IActiveStoragePurgeClient,
    private readonly archiveStorage: ILegalArchiveStorageProvider,
    private readonly archiveSecretKey?: Buffer, // Clave de 32 bytes AES-256-GCM que vive fuera del bucket
  ) {}

  /**
   * Calcula la retención efectiva respetando el piso legal mínimo (ADM-001 RF-04.5).
   * Un override nunca puede reducir la retención por debajo del piso legal.
   */
  calculateEffectiveRetentionDays(
    planDays: number,
    overrideDays?: number,
    legalFloorDays: number = 0,
  ): number {
    const base = overrideDays !== undefined ? overrideDays : planDays;
    return Math.max(base, legalFloorDays);
  }

  /**
   * Ejecuta el job de retención programada para todos los inquilinos activos (ADM-001 T-24, T-25, T-26).
   */
  async runRetentionJob(options?: { now?: Date }): Promise<Result<RetentionJobResult>> {
    const now = options?.now ?? new Date();
    const result: RetentionJobResult = {
      totalTenantsProcessed: 0,
      totalConversationsDeleted: 0,
      totalConversationsArchived: 0,
      totalAttachmentsPurged: 0,
      errorsCount: 0,
    };

    try {
      const tenants = await this.repo.getActiveTenantsRetentionConfig();

      for (const tenant of tenants) {
        result.totalTenantsProcessed++;
        try {
          // 1. Calcular retención efectiva con piso legal (RF-04.5)
          const effectiveDays = this.calculateEffectiveRetentionDays(
            tenant.planRetentionDays,
            tenant.overrideRetentionDays,
            tenant.legalFloorDays,
          );

          // 2. Calcular fecha de corte
          const cutoffDate = new Date(now.getTime() - effectiveDays * 24 * 60 * 60 * 1000);

          // 3. Obtener conversaciones expiradas por API de Chatwoot
          const expiredConversations = await this.chatwootClient.listExpiredConversations(
            tenant.chatwootAccountId,
            cutoffDate,
          );

          for (const conv of expiredConversations) {
            let wasArchived = false;

            // 4. Si el inquilino cuenta con archivo legal, exportar cifrado a R2 (T-26, D-27)
            if (tenant.hasLegalArchiveFeature) {
              if (!this.archiveSecretKey || this.archiveSecretKey.length !== 32) {
                throw new Error("Clave de cifrado AES-256 para archivo legal no configurada o inválida.");
              }

              const payload = await this.chatwootClient.getConversationPayload(
                tenant.chatwootAccountId,
                conv.id,
              );

              await this.encryptAndArchiveConversation(
                tenant.clientId,
                conv.id,
                payload,
                this.archiveSecretKey,
              );

              wasArchived = true;
              result.totalConversationsArchived++;
            }

            // 5. Eliminar la conversación por API de Chatwoot (T-24, RF-04.6)
            await this.chatwootClient.deleteConversation(tenant.chatwootAccountId, conv.id);
            result.totalConversationsDeleted++;

            // 6. Purga de adjuntos asociados y blobs huérfanos (T-25, D-28, RF-07.11)
            let purgedCount = 0;
            if (conv.attachmentBlobKeys && conv.attachmentBlobKeys.length > 0) {
              const purgeRes = await this.activeStorageClient.purgeBlobs(conv.attachmentBlobKeys);
              purgedCount = purgeRes.purgedCount;
              result.totalAttachmentsPurged += purgedCount;
            }

            // 7. Registro de auditoría estricto (RF-04.6, ADM-001 §14.2)
            await this.repo.recordAuditLog({
              actorRole: "system_cron",
              action: "chat_retention_purge",
              entityType: "chatwoot_conversation",
              entityId: String(conv.id),
              clientId: tenant.clientId,
              justification: `Retención vencida (${effectiveDays} días, piso legal ${tenant.legalFloorDays} días)`,
              metadata: {
                chatwootAccountId: tenant.chatwootAccountId,
                conversationId: conv.id,
                cutoffDate: cutoffDate.toISOString(),
                archived: wasArchived,
                attachmentsPurgedCount: purgedCount,
              },
            });
          }
        } catch (tenantErr) {
          result.errorsCount++;
          appLogger.error("[ChatRetentionService] Error procesando retención de inquilino", tenantErr as Error);
        }
      }

      appLogger.info("[ChatRetentionService] Job de retención finalizado satisfactoriamente", result);
      return ok(result);
    } catch (jobErr) {
      appLogger.error("[ChatRetentionService] Error global en job de retención", jobErr as Error);
      return err("Error interno al ejecutar job de retención de chats.", "RETENTION_JOB_ERROR");
    }
  }

  /**
   * Cifra y almacena una conversación para el archivo legal en R2 (T-26, D-27).
   * Utiliza AES-256-GCM con IV único de 12 bytes y autenticación de integridad (authTag).
   */
  async encryptAndArchiveConversation(
    clientId: string,
    conversationId: number,
    data: ConversationDetailPayload,
    secretKey: Buffer,
  ): Promise<{ archiveKey: string }> {
    const rawBuffer = Buffer.from(JSON.stringify(data), "utf-8");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", secretKey, iv);

    const encrypted = Buffer.concat([cipher.update(rawBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return this.archiveStorage.storeEncryptedArchive(
      clientId,
      conversationId,
      encrypted,
      iv,
      authTag,
    );
  }

  /**
   * Restaura y descifra una conversación del archivo legal con la clave autorizada (T-26).
   */
  async restoreLegalArchive(
    archiveKey: string,
    secretKey: Buffer,
  ): Promise<Result<ConversationDetailPayload>> {
    try {
      const stored = await this.archiveStorage.getEncryptedArchive(archiveKey);
      if (!stored) {
        return err("Archivo legal no encontrado.", "ARCHIVE_NOT_FOUND");
      }

      const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, stored.iv);
      decipher.setAuthTag(stored.authTag);

      const decrypted = Buffer.concat([decipher.update(stored.encryptedPayload), decipher.final()]);
      const payload: ConversationDetailPayload = JSON.parse(decrypted.toString("utf-8"));

      return ok(payload);
    } catch (e) {
      appLogger.error("[ChatRetentionService] Fallo al restaurar archivo legal cifrado", e as Error);
      return err("No se pudo descifrar el archivo legal. Clave inválida o archivo corrupto.", "DECRYPTION_FAILED");
    }
  }
}

