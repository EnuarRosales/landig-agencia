import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  ChatRetentionService,
  type IChatRetentionRepository,
  type IChatwootRetentionClient,
  type IActiveStoragePurgeClient,
  type ILegalArchiveStorageProvider,
  type ConversationDetailPayload,
} from "./chat-retention.service";

describe("ADM-001 Fase 5 · ChatRetentionService (T-24, T-25, T-26)", () => {
  const secretKey = crypto.randomBytes(32);

  const mockRepo: IChatRetentionRepository = {
    getActiveTenantsRetentionConfig: vi.fn(),
    recordAuditLog: vi.fn(),
  };

  const mockChatwootClient: IChatwootRetentionClient = {
    listExpiredConversations: vi.fn(),
    getConversationPayload: vi.fn(),
    deleteConversation: vi.fn(),
  };

  const mockActiveStorageClient: IActiveStoragePurgeClient = {
    purgeBlobs: vi.fn(),
  };

  // Almacén en memoria simulado para R2
  const inMemoryArchive = new Map<
    string,
    { encryptedPayload: Buffer; iv: Buffer; authTag: Buffer }
  >();

  const mockArchiveStorage: ILegalArchiveStorageProvider = {
    storeEncryptedArchive: vi.fn(
      async (clientId, conversationId, encryptedPayload, iv, authTag) => {
        const key = `archives/${clientId}/${conversationId}.enc`;
        inMemoryArchive.set(key, { encryptedPayload, iv, authTag });
        return { archiveKey: key };
      },
    ),
    getEncryptedArchive: vi.fn(async (archiveKey) => {
      return inMemoryArchive.get(archiveKey) ?? null;
    }),
  };

  const createService = (key: Buffer = secretKey) =>
    new ChatRetentionService(
      mockRepo,
      mockChatwootClient,
      mockActiveStorageClient,
      mockArchiveStorage,
      key,
    );

  it("T-24 · calcula retención respetando el piso legal mínimo que un override no puede reducir (RF-04.5)", () => {
    const service = createService();

    // Caso 1: Sin override, se usa el plan (si supera el piso)
    expect(service.calculateEffectiveRetentionDays(90, undefined, 30)).toBe(90);

    // Caso 2: Plan menor al piso legal, prevalece el piso legal
    expect(service.calculateEffectiveRetentionDays(15, undefined, 30)).toBe(30);

    // Caso 3: Override superior al piso legal, se respeta el override
    expect(service.calculateEffectiveRetentionDays(90, 180, 30)).toBe(180);

    // Caso 4: Override intenta reducir por debajo del piso legal (RF-04.5), prevalece el piso legal
    expect(service.calculateEffectiveRetentionDays(90, 10, 30)).toBe(30);
  });

  it("T-24 · elimina conversaciones vencidas en Chatwoot y registra auditoría sin archivo si no tiene el plan (RF-04.6, D-27)", async () => {
    const service = createService();

    vi.mocked(mockRepo.getActiveTenantsRetentionConfig).mockResolvedValueOnce([
      {
        clientId: "client-standard",
        chatwootAccountId: 101,
        planCode: "starter",
        planRetentionDays: 60,
        legalFloorDays: 30,
        hasLegalArchiveFeature: false,
      },
    ]);

    vi.mocked(mockChatwootClient.listExpiredConversations).mockResolvedValueOnce([
      {
        id: 501,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    vi.mocked(mockChatwootClient.deleteConversation).mockResolvedValueOnce(true);

    const now = new Date("2026-06-01T00:00:00Z");
    const res = await service.runRetentionJob({ now });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.totalTenantsProcessed).toBe(1);
    expect(res.data.totalConversationsDeleted).toBe(1);
    expect(res.data.totalConversationsArchived).toBe(0); // Sin archivo por defecto

    // Verificación de llamadas
    expect(mockChatwootClient.deleteConversation).toHaveBeenCalledWith(101, 501);
    expect(mockArchiveStorage.storeEncryptedArchive).not.toHaveBeenCalled();

    // Verificación de auditoría (RF-04.6, §14.2)
    expect(mockRepo.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "chat_retention_purge",
        entityType: "chatwoot_conversation",
        entityId: "501",
        clientId: "client-standard",
      }),
    );
  });

  it("T-25 · purga los adjuntos y blobs huérfanos de ActiveStorage asociados a la conversación (RF-07.11, D-28)", async () => {
    const service = createService();

    vi.mocked(mockRepo.getActiveTenantsRetentionConfig).mockResolvedValueOnce([
      {
        clientId: "client-standard-2",
        chatwootAccountId: 102,
        planCode: "pro",
        planRetentionDays: 90,
        legalFloorDays: 30,
        hasLegalArchiveFeature: false,
      },
    ]);

    vi.mocked(mockChatwootClient.listExpiredConversations).mockResolvedValueOnce([
      {
        id: 777,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        attachmentBlobKeys: ["blob-key-1", "blob-key-2"],
      },
    ]);

    vi.mocked(mockChatwootClient.deleteConversation).mockResolvedValueOnce(true);
    vi.mocked(mockActiveStorageClient.purgeBlobs).mockResolvedValueOnce({ purgedCount: 2 });

    const now = new Date("2026-06-01T00:00:00Z");
    const res = await service.runRetentionJob({ now });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.totalAttachmentsPurged).toBe(2);
    expect(mockActiveStorageClient.purgeBlobs).toHaveBeenCalledWith(["blob-key-1", "blob-key-2"]);
  });

  it("T-26 · exporta cifrado a R2 antes de borrar cuando el plan incluye legal_archive y se restaura con éxito (D-27)", async () => {
    const service = createService();

    const samplePayload: ConversationDetailPayload = {
      id: 999,
      createdAt: "2026-01-01T10:00:00Z",
      messages: [
        {
          id: 1,
          content: "Hola, necesito soporte con mi pedido.",
          sender: "cliente",
          createdAt: "2026-01-01T10:00:00Z",
        },
        {
          id: 2,
          content: "Con gusto, ¿cuál es su número de guía?",
          sender: "agente",
          createdAt: "2026-01-01T10:01:00Z",
        },
      ],
    };

    vi.mocked(mockRepo.getActiveTenantsRetentionConfig).mockResolvedValueOnce([
      {
        clientId: "client-enterprise",
        chatwootAccountId: 200,
        planCode: "enterprise",
        planRetentionDays: 365,
        legalFloorDays: 60,
        hasLegalArchiveFeature: true,
      },
    ]);

    vi.mocked(mockChatwootClient.listExpiredConversations).mockResolvedValueOnce([
      {
        id: 999,
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastActivityAt: new Date("2025-01-02T00:00:00Z"),
      },
    ]);

    vi.mocked(mockChatwootClient.getConversationPayload).mockResolvedValueOnce(samplePayload);
    vi.mocked(mockChatwootClient.deleteConversation).mockResolvedValueOnce(true);

    const now = new Date("2026-06-01T00:00:00Z");
    const res = await service.runRetentionJob({ now });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.totalConversationsArchived).toBe(1);
    expect(res.data.totalConversationsDeleted).toBe(1);

    const archiveKey = "archives/client-enterprise/999.enc";
    expect(inMemoryArchive.has(archiveKey)).toBe(true);

    // Restauración y descifrado exitoso con la clave autorizada
    const restoreRes = await service.restoreLegalArchive(archiveKey, secretKey);
    expect(restoreRes.ok).toBe(true);
    if (!restoreRes.ok) return;

    expect(restoreRes.data.id).toBe(999);
    expect(restoreRes.data.messages).toHaveLength(2);
    expect(restoreRes.data.messages[0].content).toBe("Hola, necesito soporte con mi pedido.");

    // Fallo de descifrado ante una clave incorrecta
    const wrongKey = crypto.randomBytes(32);
    const failedRestore = await service.restoreLegalArchive(archiveKey, wrongKey);
    expect(failedRestore.ok).toBe(false);
    if (failedRestore.ok) return;
    expect(failedRestore.code).toBe("DECRYPTION_FAILED");
  });
});

