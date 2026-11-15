import { describe, expect, it, vi } from "vitest";
import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
import {
  InMemoryTenantProductsRepository,
  TenantProductsAndMediaService,
} from "./tenant-products-and-media.service";
import { MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS } from "./tenant-products-catalog.helpers";
import type { S3StorageService } from "./s3-storage.service";
import type { TransactionalNotificationsAndLeadsService } from "./notifications-and-leads.service";

function padBytes(prefix: number[] | string, totalLength = 24): Buffer {
  const head =
    typeof prefix === "string" ? Buffer.from(prefix, "utf8") : Buffer.from(prefix);
  if (head.byteLength >= totalLength) return head;
  return Buffer.concat([head, Buffer.alloc(totalLength - head.byteLength, 0)]);
}

function createFtypBuffer(brand: string): Buffer {
  const buf = Buffer.alloc(24, 0);
  buf.writeUInt32BE(24, 0);
  buf.write("ftyp", 4, "ascii");
  buf.write(brand.padEnd(4, " ").slice(0, 4), 8, "ascii");
  return buf;
}

function createRiffBuffer(subtype: string): Buffer {
  const buf = Buffer.alloc(24, 0);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(16, 4);
  buf.write(subtype.slice(0, 4), 8, "ascii");
  return buf;
}

function createTestHarness() {
  const repo = new InMemoryTenantProductsRepository();
  const s3Mock = {
    putObject: vi.fn(async () => ({ ok: true as const })),
    deleteObject: vi.fn(async () => ({ ok: true as const })),
  } as unknown as S3StorageService;

  const enqueueEmail = vi.fn(() => ({
    ok: true as const,
    data: { id: "email-log-1" },
  }));
  const notificationsMock = {
    enqueueEmail,
  } as unknown as TransactionalNotificationsAndLeadsService;

  const service = new TenantProductsAndMediaService(repo, s3Mock, notificationsMock);
  return { repo, s3Mock, enqueueEmail, service };
}

describe("SPEC-08 · Catálogo de Productos Multimodal, Combos, Stock y Alertas", () => {
  describe("D-04 · Validación estricta de Magic Bytes multimodal", () => {
    it("acepta JPEG, PNG, WEBP, AVIF, MP4, WebM, MOV, MP3, OGG, WAV, M4A y PDF", () => {
      expect(validateMediaMagicBytes(padBytes([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({
        valid: true,
        mediaKind: "image",
        detectedMime: "image/jpeg",
      });
      expect(
        validateMediaMagicBytes(padBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      ).toMatchObject({
        valid: true,
        mediaKind: "image",
        detectedMime: "image/png",
      });
      expect(validateMediaMagicBytes(createRiffBuffer("WEBP"))).toMatchObject({
        valid: true,
        mediaKind: "image",
        detectedMime: "image/webp",
      });
      expect(validateMediaMagicBytes(createFtypBuffer("avif"))).toMatchObject({
        valid: true,
        mediaKind: "image",
        detectedMime: "image/avif",
      });

      expect(validateMediaMagicBytes(createFtypBuffer("isom"))).toMatchObject({
        valid: true,
        mediaKind: "video",
        detectedMime: "video/mp4",
      });
      expect(validateMediaMagicBytes(createFtypBuffer("qt  "))).toMatchObject({
        valid: true,
        mediaKind: "video",
        detectedMime: "video/quicktime",
      });
      expect(
        validateMediaMagicBytes(padBytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f])),
      ).toMatchObject({
        valid: true,
        mediaKind: "video",
        detectedMime: "video/webm",
      });

      expect(validateMediaMagicBytes(padBytes("ID3\x03\x00\x00"))).toMatchObject({
        valid: true,
        mediaKind: "audio",
        detectedMime: "audio/mpeg",
      });
      expect(validateMediaMagicBytes(padBytes([0xff, 0xfb, 0x90, 0x64]))).toMatchObject({
        valid: true,
        mediaKind: "audio",
        detectedMime: "audio/mpeg",
      });
      expect(validateMediaMagicBytes(padBytes("OggS\x00\x02"))).toMatchObject({
        valid: true,
        mediaKind: "audio",
        detectedMime: "audio/ogg",
      });
      expect(validateMediaMagicBytes(createRiffBuffer("WAVE"))).toMatchObject({
        valid: true,
        mediaKind: "audio",
        detectedMime: "audio/wav",
      });
      expect(validateMediaMagicBytes(createFtypBuffer("M4A "))).toMatchObject({
        valid: true,
        mediaKind: "audio",
        detectedMime: "audio/mp4",
      });

      expect(validateMediaMagicBytes(padBytes("%PDF-1.7\n"))).toMatchObject({
        valid: true,
        mediaKind: "pdf",
        detectedMime: "application/pdf",
      });
    });

    it("rechaza GIF, SVG y ejecutables binarios", () => {
      expect(validateMediaMagicBytes(padBytes("GIF89a\x01\x00"))).toMatchObject({
        valid: false,
      });
      expect(
        validateMediaMagicBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
      ).toMatchObject({
        valid: false,
      });
      expect(validateMediaMagicBytes(padBytes([0x4d, 0x5a, 0x90, 0x00]))).toMatchObject({
        valid: false,
      });
      expect(validateMediaMagicBytes(padBytes([0x7f, 0x45, 0x4c, 0x46]))).toMatchObject({
        valid: false,
      });
    });
  });

  describe("CRUD, estados canónicos, atributos dinámicos y Prompt Maestro", () => {
    it("normaliza aliases heredados de estado, calcula margen y valida prompt hasta 32,000 caracteres", async () => {
      const { service } = createTestHarness();
      const clientId = "client-crud";

      const tooLongPrompt = "a".repeat(MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS + 1);
      const overflowRes = await service.createProduct(
        clientId,
        {
          name: "Exceso",
          description: "Desc",
          priceCents: 10000,
          botMasterPrompt: tooLongPrompt,
        },
        "owner-1",
      );
      expect(overflowRes.ok).toBe(false);

      const dupAttrRes = await service.createProduct(
        clientId,
        {
          name: "Atributos Duplicados",
          description: "Desc",
          priceCents: 10000,
          attributes: [
            { name: "Color", values: ["Rojo"] },
            { name: " color ", values: ["Azul"] },
          ],
        },
        "owner-1",
      );
      expect(dupAttrRes.ok).toBe(false);

      const createdRes = await service.createProduct(
        clientId,
        {
          name: "Camiseta Premium",
          description: "Algodón peruano",
          costPriceCents: 35000,
          priceCents: 70000,
          salePriceCents: 60000,
          status: "published",
          stockQuantity: 18,
          minStockThreshold: 5,
          attributes: [{ name: "Talla", values: ["S", "M", "L"] }],
          botMasterPrompt: "a".repeat(MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS),
        },
        "owner-1",
      );

      expect(createdRes.ok).toBe(true);
      if (!createdRes.ok) return;
      expect(createdRes.data.status).toBe("active");

      const detailRes = await service.getProductDetail(clientId, createdRes.data.id);
      expect(detailRes.ok).toBe(true);
      if (!detailRes.ok) return;

      expect(detailRes.data.profitability.profitCents).toBe(25000);
      expect(detailRes.data.effectiveStock).toBe(18);
      expect(detailRes.data.attributes).toEqual([{ name: "Talla", values: ["S", "M", "L"] }]);

      const statusRes = await service.updateProductStatus(
        clientId,
        createdRes.data.id,
        "archived",
        "agent-1",
      );
      expect(statusRes.ok).toBe(true);
      if (!statusRes.ok) return;
      expect(statusRes.data.status).toBe("inactive");
    });

    it("lista catálogo paginado, filtrable y con resumen operativo", async () => {
      const { service } = createTestHarness();
      const clientId = "client-list";

      await service.createProduct(
        clientId,
        {
          name: "Producto Alpha",
          description: "Físico activo",
          kind: "physical",
          status: "active",
          priceCents: 50000,
          costPriceCents: 20000,
          stockQuantity: 2,
          minStockThreshold: 5,
        },
        "owner-1",
      );
      await service.createProduct(
        clientId,
        {
          name: "Curso Beta",
          description: "Digital borrador",
          kind: "digital",
          status: "draft",
          priceCents: 90000,
          costPriceCents: 0,
        },
        "owner-1",
      );

      const pageRes = await service.listCatalog(clientId, {
        q: "Alpha",
        lowStock: true,
        page: 1,
        limit: 10,
      });
      expect(pageRes.ok).toBe(true);
      if (!pageRes.ok) return;

      expect(pageRes.data.items).toHaveLength(1);
      expect(pageRes.data.items[0]?.name).toBe("Producto Alpha");
      expect(pageRes.data.items[0]?.isLowStock).toBe(true);
      expect(pageRes.data.summary).toMatchObject({
        totalActive: 1,
        lowStockCount: 1,
        comboCount: 0,
      });
    });
  });

  describe("D-03 · Combos / Bundles, stock dinámico y protección de borrado", () => {
    it("calcula stock dinámico mínimo, sugiere costo, bloquea anidación y protege componentes en combos", async () => {
      const { service } = createTestHarness();
      const clientId = "client-combo";

      const compA = await service.createProduct(
        clientId,
        {
          name: "Proteína Whey",
          description: "Tarro 2lb",
          kind: "physical",
          status: "active",
          costPriceCents: 40000,
          priceCents: 100000,
          stockQuantity: 11,
          minStockThreshold: 2,
        },
        "owner-1",
      );
      const compB = await service.createProduct(
        clientId,
        {
          name: "Shaker Mezclador",
          description: "Vaso 700ml",
          kind: "physical",
          status: "active",
          costPriceCents: 10000,
          priceCents: 25000,
          stockQuantity: 9,
          minStockThreshold: 2,
        },
        "owner-1",
      );
      const compService = await service.createProduct(
        clientId,
        {
          name: "Asesoría Nutricional",
          description: "Sesión 30 min",
          kind: "service",
          status: "active",
          costPriceCents: 5000,
          priceCents: 30000,
        },
        "owner-1",
      );

      expect(compA.ok && compB.ok && compService.ok).toBe(true);
      if (!compA.ok || !compB.ok || !compService.ok) return;

      const comboRes = await service.createProduct(
        clientId,
        {
          name: "Kit Fitness Total",
          description: "Combo de inicio",
          compositionType: "combo",
          kind: "physical",
          status: "active",
          priceCents: 180000,
          costPriceCents: 65000,
          comboItems: [
            { componentProductId: compA.data.id, quantity: 2 }, // floor(11 / 2) = 5
            { componentProductId: compB.data.id, quantity: 3 }, // floor(9 / 3) = 3
            { componentProductId: compService.data.id, quantity: 1 }, // servicio no limita físico
          ],
        },
        "owner-1",
      );
      expect(comboRes.ok).toBe(true);
      if (!comboRes.ok) return;

      const comboDetail = await service.getProductDetail(clientId, comboRes.data.id);
      expect(comboDetail.ok).toBe(true);
      if (!comboDetail.ok) return;

      expect(comboDetail.data.effectiveStock).toBe(3);
      expect(comboDetail.data.suggestedComboCostCents).toBe(2 * 40000 + 3 * 10000 + 1 * 5000);
      expect(comboDetail.data.hasInactiveComboComponent).toBe(false);

      // No se permite anidar un combo dentro de otro combo
      const nestedAttempt = await service.createProduct(
        clientId,
        {
          name: "Combo Anidado Inválido",
          description: "No debe permitirse",
          compositionType: "combo",
          priceCents: 200000,
          comboItems: [{ componentProductId: comboRes.data.id, quantity: 1 }],
        },
        "owner-1",
      );
      expect(nestedAttempt.ok).toBe(false);

      // No se puede eliminar un componente simple referenciado en un combo activo
      const deleteBlocked = await service.deleteProduct(clientId, compA.data.id, "owner-1");
      expect(deleteBlocked.ok).toBe(false);
      if (!deleteBlocked.ok) {
        expect(deleteBlocked.code).toBe("PRODUCT_USED_IN_COMBO");
      }

      // Al inactivar un componente físico, el stock efectivo del combo cae a 0 con advertencia
      await service.updateProductStatus(clientId, compB.data.id, "inactive", "owner-1");
      const comboAfterInactive = await service.getProductDetail(clientId, comboRes.data.id);
      expect(comboAfterInactive.ok).toBe(true);
      if (!comboAfterInactive.ok) return;
      expect(comboAfterInactive.data.effectiveStock).toBe(0);
      expect(comboAfterInactive.data.hasInactiveComboComponent).toBe(true);
    });
  });

  describe("D-04 · Portada is_cover, promoción automática y tipos multimedia", () => {
    it("asigna la primera imagen como portada, rechaza portada en PDF y promueve otra imagen al borrar portada", async () => {
      const { service } = createTestHarness();
      const clientId = "client-media";

      const pRes = await service.createProduct(
        clientId,
        {
          name: "Producto Galería",
          description: "Multimedia completa",
          priceCents: 50000,
        },
        "owner-1",
      );
      expect(pRes.ok).toBe(true);
      if (!pRes.ok) return;
      const productId = pRes.data.id;

      const img1 = await service.uploadAndAttachProductMedia(
        clientId,
        productId,
        { buffer: padBytes([0xff, 0xd8, 0xff, 0xe0]), originalFilename: "foto1.jpg" },
        "owner-1",
      );
      const img2 = await service.uploadAndAttachProductMedia(
        clientId,
        productId,
        { buffer: padBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), originalFilename: "foto2.png" },
        "owner-1",
      );
      const pdf1 = await service.uploadAndAttachProductMedia(
        clientId,
        productId,
        { buffer: padBytes("%PDF-1.7\nficha"), originalFilename: "ficha.pdf" },
        "owner-1",
      );

      expect(img1.ok && img2.ok && pdf1.ok).toBe(true);
      if (!img1.ok || !img2.ok || !pdf1.ok) return;

      expect(img1.data.isCover).toBe(true);
      expect(img2.data.isCover).toBe(false);
      expect(pdf1.data.isCover).toBe(false);
      expect(pdf1.data.url).toBe(`/api/tenant/media/${pdf1.data.mediaId}`);

      // Rechaza usar PDF como portada
      const invalidCover = await service.setProductMediaCover(
        clientId,
        productId,
        pdf1.data.mediaId,
        "owner-1",
      );
      expect(invalidCover.ok).toBe(false);

      // Cambia portada explícitamente a img2 y luego la borra -> debe promover img1
      const setCover2 = await service.setProductMediaCover(
        clientId,
        productId,
        img2.data.mediaId,
        "owner-1",
      );
      expect(setCover2.ok).toBe(true);

      const delCover = await service.deleteProductMedia(
        clientId,
        productId,
        img2.data.mediaId,
        "owner-1",
      );
      expect(delCover.ok).toBe(true);
      if (!delCover.ok) return;
      expect(delCover.data.promotedCoverMediaId).toBe(img1.data.mediaId);
    });
  });

  describe("D-05 · Alerta de stock mínimo sin repetición hasta reposición", () => {
    it("envía notificación una sola vez al cruzar el umbral y se rearma tras reponer por encima", async () => {
      const { repo, service, enqueueEmail } = createTestHarness();
      const clientId = "client-stock";
      repo.tenantNotifications.set(clientId, {
        businessName: "Tienda Andina",
        recipientEmail: "compras@tiendaandina.co",
        locale: "es",
      });

      const created = await service.createProduct(
        clientId,
        {
          name: "Café Origen 500g",
          description: "Tostión media",
          sku: "CAF-500",
          kind: "physical",
          status: "active",
          priceCents: 42000,
          stockQuantity: 10,
          minStockThreshold: 3,
        },
        "owner-1",
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Bajar stock por encima del umbral -> no dispara
      await service.updateProduct(clientId, created.data.id, { stockQuantity: 4 }, "owner-1");
      const aboveEval = await service.evaluateLowStockAfterStockMutation(
        clientId,
        created.data.id,
        "owner-1",
      );
      expect(aboveEval.ok && !aboveEval.data.triggered).toBe(true);
      expect(enqueueEmail).not.toHaveBeenCalled();

      // Cruzar umbral (stock = 2 <= 3) -> dispara una vez
      await service.updateProduct(clientId, created.data.id, { stockQuantity: 2 }, "owner-1");
      const firstLowEval = await service.evaluateLowStockAfterStockMutation(
        clientId,
        created.data.id,
        "owner-1",
      );
      expect(firstLowEval.ok && firstLowEval.data.triggered).toBe(true);
      if (firstLowEval.ok && firstLowEval.data.dispatch) {
        await firstLowEval.data.dispatch();
      }
      expect(enqueueEmail).toHaveBeenCalledTimes(1);
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "tenant.inventory.low_stock",
          recipient: "compras@tiendaandina.co",
          locale: "es",
          variables: expect.objectContaining({
            business_name: "Tienda Andina",
            product_name: "Café Origen 500g",
            sku: "CAF-500",
            current_stock: "2",
            min_threshold: "3",
          }),
        }),
      );

      // Otra mutación aún debajo del umbral -> no reenvía correo
      await service.updateProduct(clientId, created.data.id, { stockQuantity: 1 }, "owner-1");
      const secondLowEval = await service.evaluateLowStockAfterStockMutation(
        clientId,
        created.data.id,
        "owner-1",
      );
      expect(secondLowEval.ok && !secondLowEval.data.triggered).toBe(true);
      expect(enqueueEmail).toHaveBeenCalledTimes(1);

      // Reponer stock por encima (stock = 12 > 3) -> rearma bandera
      await service.updateProduct(clientId, created.data.id, { stockQuantity: 12 }, "owner-1");
      const restockEval = await service.evaluateLowStockAfterStockMutation(
        clientId,
        created.data.id,
        "owner-1",
      );
      expect(restockEval.ok && restockEval.data.reset).toBe(true);

      // Nuevo quiebre de stock (stock = 3 <= 3) -> vuelve a disparar
      await service.updateProduct(clientId, created.data.id, { stockQuantity: 3 }, "owner-1");
      const retriggerEval = await service.evaluateLowStockAfterStockMutation(
        clientId,
        created.data.id,
        "owner-1",
      );
      expect(retriggerEval.ok && retriggerEval.data.triggered).toBe(true);
      if (retriggerEval.ok && retriggerEval.data.dispatch) {
        await retriggerEval.data.dispatch();
      }
      expect(enqueueEmail).toHaveBeenCalledTimes(2);
    });
  });
});
