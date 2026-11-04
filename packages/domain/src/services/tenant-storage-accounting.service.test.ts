import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantStorageAccountingService,
  InMemoryTenantStorageAccountingRepository,
} from "./tenant-storage-accounting.service";

describe("TenantStorageAccountingService", () => {
  let repo: InMemoryTenantStorageAccountingRepository;
  let service: TenantStorageAccountingService;
  const clientId = "tenant-storage-1";
  const chatwootAccountId = 101;

  beforeEach(() => {
    repo = new InMemoryTenantStorageAccountingRepository();
    repo.chatwootAccountToClient.set(chatwootAccountId, clientId);
    service = new TenantStorageAccountingService(repo);
  });

  describe("Ingesta y cuota de almacenamiento 'storage_bytes'", () => {
    it("permite cargar archivos cuando la cuota es UNLIMITED", async () => {
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "UNLIMITED", value: null });

      const buffer = Buffer.from("imagen de prueba en alta definicion");
      const res = await service.ingestMedia(clientId, {
        buffer,
        originalFilename: "foto.png",
        mimeType: "image/png",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.sizeBytes).toBe(buffer.length);
        expect(res.data.addedBytes).toBe(buffer.length);
        expect(res.data.deduplicatedForTenant).toBe(false);
        expect(res.data.currentTotalStorageBytes).toBe(buffer.length);
      }
      expect(await repo.getTenantStorageBytes(clientId)).toBe(buffer.length);
    });

    it("rechaza la carga cuando la cuota es 0 (CA-004, RN-003, RN-004)", async () => {
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "LIMITED", value: 0 });

      const buffer = Buffer.from("archivo pequeño");
      const res = await service.ingestMedia(clientId, {
        buffer,
        originalFilename: "doc.pdf",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("No hay almacenamiento disponible para completar la carga.");
        expect(res.code).toBe("STORAGE_QUOTA_EXCEEDED");
      }
      expect(await repo.getTenantStorageBytes(clientId)).toBe(0);
    });

    it("rechaza la carga cuando los bytes superan el límite disponible (S10)", async () => {
      // 100 bytes permitidos
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "LIMITED", value: 100 });

      // Cargar 80 bytes permitidos
      const b1 = Buffer.alloc(80, "A");
      const r1 = await service.ingestMedia(clientId, { buffer: b1, originalFilename: "a.jpg" });
      expect(r1.ok).toBe(true);

      // Intentar cargar 30 bytes adicionales (80 + 30 = 110 > 100)
      const b2 = Buffer.alloc(30, "B");
      const r2 = await service.ingestMedia(clientId, { buffer: b2, originalFilename: "b.jpg" });
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.error).toBe("No hay almacenamiento disponible para completar la carga.");
        expect(r2.code).toBe("STORAGE_QUOTA_EXCEEDED");
      }
    });

    it("deduplica físicamente por SHA-256 para el mismo inquilino sin consumir bytes adicionales (S3)", async () => {
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "LIMITED", value: 100 });

      const fileData = Buffer.from("contenido identico compartido entre catalogo y chatwoot");

      // Carga 1: en catálogo de producto
      const c1 = await service.ingestMedia(clientId, {
        buffer: fileData,
        originalFilename: "producto.png",
        origin: "catalog",
      });
      expect(c1.ok).toBe(true);
      if (c1.ok) {
        expect(c1.data.deduplicatedForTenant).toBe(false);
        expect(c1.data.addedBytes).toBe(fileData.length);
      }

      // Carga 2: mismo archivo enviado en Chatwoot
      const c2 = await service.ingestChatwootAttachment(chatwootAccountId, {
        buffer: fileData,
        filename: "adjunto.png",
      });
      expect(c2.ok).toBe(true);
      if (c2.ok) {
        expect(c2.data.deduplicatedForTenant).toBe(true);
        expect(c2.data.addedBytes).toBe(0); // 0 bytes adicionales facturados
      }

      // El total consumido por el inquilino debe ser únicamente el peso de un archivo
      expect(await repo.getTenantStorageBytes(clientId)).toBe(fileData.length);
    });

    it("deduplica globalmente entre inquilinos pero imputa la cuota a cada inquilino de forma independiente (RN-011)", async () => {
      const clientA = "tenant-a";
      const clientB = "tenant-b";

      repo.quotas.set(`${clientA}:storage_bytes`, { mode: "LIMITED", value: 1000 });
      repo.quotas.set(`${clientB}:storage_bytes`, { mode: "LIMITED", value: 1000 });

      const sharedFile = Buffer.from("manual de usuario universal");

      // Inquilino A sube el archivo
      const resA = await service.ingestMedia(clientA, { buffer: sharedFile, originalFilename: "manual.pdf" });
      expect(resA.ok).toBe(true);
      if (resA.ok) {
        expect(resA.data.deduplicatedGlobally).toBe(false);
      }

      // Inquilino B sube el mismo archivo
      const resB = await service.ingestMedia(clientB, { buffer: sharedFile, originalFilename: "guia.pdf" });
      expect(resB.ok).toBe(true);
      if (resB.ok) {
        expect(resB.data.deduplicatedGlobally).toBe(true); // Ya existe en mediaCatalog
        expect(resB.data.deduplicatedForTenant).toBe(false); // Para el inquilino B es su primer uso
        expect(resB.data.addedBytes).toBe(sharedFile.length);
      }

      expect(await repo.getTenantStorageBytes(clientA)).toBe(sharedFile.length);
      expect(await repo.getTenantStorageBytes(clientB)).toBe(sharedFile.length);
    });

    it("rechaza la ingesta de adjuntos si la cuenta de Chatwoot no está asignada", async () => {
      const res = await service.ingestChatwootAttachment(9999, {
        buffer: Buffer.from("algo"),
        filename: "foto.png",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TENANT_NOT_FOUND");
      }
    });

    it("desvincular un archivo libera cuota de almacenamiento cuando ya no hay referencias (S3)", async () => {
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "LIMITED", value: 100 });

      const file = Buffer.alloc(60, "X");
      const uploaded = await service.ingestMedia(clientId, { buffer: file, originalFilename: "temp.bin" });
      expect(uploaded.ok).toBe(true);
      const mediaId = (uploaded as any).data.mediaId;

      expect(await repo.getTenantStorageBytes(clientId)).toBe(60);

      // Desvincular
      const unlinked = await service.releaseMediaReference(clientId, mediaId);
      expect(unlinked.ok).toBe(true);
      if (unlinked.ok) {
        expect(unlinked.data.unlinked).toBe(true);
        expect(unlinked.data.freedBytes).toBe(60);
      }

      expect(await repo.getTenantStorageBytes(clientId)).toBe(0);
    });

    it("garantiza concurrencia atómica cuando queda poco espacio de almacenamiento (CA-011)", async () => {
      // 100 bytes de límite, 2 cargas de 60 bytes en paralelo
      repo.quotas.set(`${clientId}:storage_bytes`, { mode: "LIMITED", value: 100 });

      const b1 = Buffer.alloc(60, "1");
      const b2 = Buffer.alloc(60, "2");

      const p1 = service.ingestMedia(clientId, { buffer: b1, originalFilename: "f1.bin" });
      const p2 = service.ingestMedia(clientId, { buffer: b2, originalFilename: "f2.bin" });

      const [r1, r2] = await Promise.all([p1, p2]);

      const successCount = (r1.ok ? 1 : 0) + (r2.ok ? 1 : 0);
      const failedCount = (!r1.ok ? 1 : 0) + (!r2.ok ? 1 : 0);

      expect(successCount).toBe(1);
      expect(failedCount).toBe(1);
    });
  });
});
