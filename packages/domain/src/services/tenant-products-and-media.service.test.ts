import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantProductsAndMediaService,
  InMemoryTenantProductsRepository,
} from "./tenant-products-and-media.service";

describe("T6 · Tenant Products and Media Service with Plan Quotas", () => {
  let repo: InMemoryTenantProductsRepository;
  let service: TenantProductsAndMediaService;

  beforeEach(() => {
    repo = new InMemoryTenantProductsRepository();
    service = new TenantProductsAndMediaService(repo);
  });

  describe("CA-004 · Cuota cero (RN-003, RN-004)", () => {
    it("rechaza agregar un video si el plan tiene cero videos por producto sin interpretarlo como ilimitado", async () => {
      // Configurar cuota de videos_per_product = 0 (LIMITED)
      repo.quotas.set("client-1:videos_per_product", { mode: "LIMITED", value: 0 });
      repo.quotas.set("client-1:storage_bytes", { mode: "UNLIMITED", value: null });

      const res = await service.attachMediaToProduct("client-1", {
        productId: "prod-1",
        mediaId: "media-video-1",
        mediaKind: "video",
        sizeBytes: 5_000_000,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Has alcanzado el límite de videos por producto incluido en tu plan.");
        expect(res.code).toBe("QUOTA_EXCEEDED_VIDEOS_PER_PRODUCT");
      }
    });

    it("rechaza crear productos si la cuota de productos es cero", async () => {
      repo.quotas.set("client-1:products", { mode: "LIMITED", value: 0 });

      const res = await service.createProduct("client-1", {
        name: "Producto Bloqueado",
        description: "No debe crearse",
        priceCents: 10000,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Has alcanzado el límite de productos incluido en tu plan.");
        expect(res.code).toBe("QUOTA_EXCEEDED_PRODUCTS");
      }
    });
  });

  describe("CA-005 · Cuota compartida de productos (creación manual e importación)", () => {
    it("creación e importación consumen la misma cuota y no pueden superar el límite", async () => {
      // Límite de 3 productos
      repo.quotas.set("client-1:products", { mode: "LIMITED", value: 3 });

      // 1. Crear 1 producto manual
      const p1 = await service.createProduct("client-1", {
        name: "Zapato Deportivo",
        description: "Talla 40",
        priceCents: 150000,
      });
      expect(p1.ok).toBe(true);

      // 2. Intentar importar 3 productos adicionales (1 + 3 = 4 > 3) -> debe rechazarse completo
      const importFail = await service.importProducts("client-1", [
        { name: "Camisa A", description: "Desc", priceCents: 50000 },
        { name: "Camisa B", description: "Desc", priceCents: 60000 },
        { name: "Camisa C", description: "Desc", priceCents: 70000 },
      ]);
      expect(importFail.ok).toBe(false);
      if (!importFail.ok) {
        expect(importFail.error).toBe("Has alcanzado el límite de productos incluido en tu plan.");
      }
      expect(await repo.countActiveProducts("client-1")).toBe(1);

      // 3. Importar 2 productos (1 + 2 = 3 <= 3) -> debe aceptarse
      const importOk = await service.importProducts("client-1", [
        { name: "Camisa A", description: "Desc", priceCents: 50000 },
        { name: "Camisa B", description: "Desc", priceCents: 60000 },
      ]);
      expect(importOk.ok).toBe(true);
      expect(await repo.countActiveProducts("client-1")).toBe(3);

      // 4. Intentar crear 1 más manual -> rechazado
      const pOver = await service.createProduct("client-1", {
        name: "Pantalón",
        description: "Jean",
        priceCents: 90000,
      });
      expect(pOver.ok).toBe(false);

      // 5. Actualizar un producto existente no consume cupo adicional (S3)
      if (p1.ok) {
        const updateRes = await service.updateProduct("client-1", p1.data.id, {
          name: "Zapato Deportivo Pro",
          priceCents: 160000,
        });
        expect(updateRes.ok).toBe(true);
        expect(await repo.countActiveProducts("client-1")).toBe(3);
      }

      // 6. Eliminar un producto libera cupo (S3)
      if (p1.ok) {
        const delRes = await service.deleteProduct("client-1", p1.data.id);
        expect(delRes.ok).toBe(true);
        expect(await repo.countActiveProducts("client-1")).toBe(2);

        // Ahora sí se puede crear otro
        const pAfterDel = await service.createProduct("client-1", {
          name: "Nuevo tras borrado",
          description: "Desc",
          priceCents: 80000,
        });
        expect(pAfterDel.ok).toBe(true);
        expect(await repo.countActiveProducts("client-1")).toBe(3);
      }
    });

    it("permite productos ilimitados si el plan tiene modo UNLIMITED", async () => {
      repo.quotas.set("client-1:products", { mode: "UNLIMITED", value: null });

      for (let i = 0; i < 20; i++) {
        const res = await service.createProduct("client-1", {
          name: `Producto ${i}`,
          description: `Desc ${i}`,
          priceCents: 10000 * i,
        });
        expect(res.ok).toBe(true);
      }
      expect(await repo.countActiveProducts("client-1")).toBe(20);
    });
  });

  describe("CA-006 · Validación de archivos y almacenamiento", () => {
    it("valida la cuota del tipo de archivo y el almacenamiento disponible antes de confirmar", async () => {
      // 2 imágenes por producto y 10 MB de almacenamiento
      repo.quotas.set("client-1:images_per_product", { mode: "LIMITED", value: 2 });
      repo.quotas.set("client-1:storage_bytes", { mode: "LIMITED", value: 10 * 1024 * 1024 });

      // Imagen 1: 4 MB -> pasa
      const img1 = await service.attachMediaToProduct("client-1", {
        productId: "prod-1",
        mediaId: "med-1",
        mediaKind: "image",
        sizeBytes: 4 * 1024 * 1024,
      });
      expect(img1.ok).toBe(true);

      // Imagen 2: 7 MB -> supera los 10 MB (4 + 7 = 11 > 10) -> falla por almacenamiento
      const img2StorageFail = await service.attachMediaToProduct("client-1", {
        productId: "prod-1",
        mediaId: "med-2",
        mediaKind: "image",
        sizeBytes: 7 * 1024 * 1024,
      });
      expect(img2StorageFail.ok).toBe(false);
      if (!img2StorageFail.ok) {
        expect(img2StorageFail.error).toBe("No hay almacenamiento disponible para completar la carga.");
        expect(img2StorageFail.code).toBe("STORAGE_QUOTA_EXCEEDED");
      }

      // Imagen 2: 4 MB -> pasa (4 + 4 = 8 <= 10)
      const img2 = await service.attachMediaToProduct("client-1", {
        productId: "prod-1",
        mediaId: "med-2",
        mediaKind: "image",
        sizeBytes: 4 * 1024 * 1024,
      });
      expect(img2.ok).toBe(true);

      // Imagen 3: 1 MB -> falla por cuota de imágenes por producto (2 imágenes ya asociadas)
      const img3KindFail = await service.attachMediaToProduct("client-1", {
        productId: "prod-1",
        mediaId: "med-3",
        mediaKind: "image",
        sizeBytes: 1 * 1024 * 1024,
      });
      expect(img3KindFail.ok).toBe(false);
      if (!img3KindFail.ok) {
        expect(img3KindFail.error).toBe("Has alcanzado el límite de imágenes por producto incluido en tu plan.");
      }
    });
  });

  describe("CA-011 · Concurrencia atómica (RN-006)", () => {
    it("dos operaciones concurrentes con un solo cupo disponible solo permiten confirmar una", async () => {
      // 1 solo cupo disponible
      repo.quotas.set("client-conc:products", { mode: "LIMITED", value: 1 });

      const [resA, resB] = await Promise.all([
        service.createProduct("client-conc", { name: "Prod A", description: "Desc", priceCents: 1000 }),
        service.createProduct("client-conc", { name: "Prod B", description: "Desc", priceCents: 2000 }),
      ]);

      const successes = [resA, resB].filter((r) => r.ok);
      const failures = [resA, resB].filter((r) => !r.ok);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(await repo.countActiveProducts("client-conc")).toBe(1);
    });
  });
});
