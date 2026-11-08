import { describe, it, expect, vi } from "vitest";
import { CatalogAndMediaService } from "./catalog-and-media.service";
import type { S3StorageService } from "./s3-storage.service";

describe("CEL-RF-016 / CEL-RF-019 · CatalogAndMediaService S3 & imgproxy Integration", () => {
  it("sube el binario a SeaweedFS S3 si no está deduplicado y persiste solo la clave relativa", async () => {
    const mockS3: Partial<S3StorageService> = {
      putObject: vi.fn().mockResolvedValue({ ok: true }),
    };

    const svc = new CatalogAndMediaService(
      [{ keyHex: "30".repeat(32), saltHex: "31".repeat(32) }],
      "http://localhost:8081",
      mockS3 as S3StorageService,
    );

    // PNG Header: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
      0x44, 0x52,
    ]);

    const res = await svc.ingestAndUploadProductMedia({
      clientId: "client-test-1",
      productId: "prod-test-1",
      buffer: pngBuffer,
      originalFilename: "foto.png",
      altText: "Foto Del Producto",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.deduplicatedGlobal).toBe(false);
    expect(res.data.media.storageKey).toMatch(/^objects\/[a-f0-9]{2}\/[a-f0-9]+\.png$/);
    expect(mockS3.putObject).toHaveBeenCalledTimes(1);
    expect(mockS3.putObject).toHaveBeenCalledWith(
      res.data.media.storageKey,
      pngBuffer,
      "image/png",
    );

    // Segundo upload con los mismos bytes: debe deduplicar y NO re-subir a S3
    const resDedup = await svc.ingestAndUploadProductMedia({
      clientId: "client-test-2",
      productId: "prod-test-2",
      buffer: pngBuffer,
      originalFilename: "otra_foto.png",
    });

    expect(resDedup.ok).toBe(true);
    if (!resDedup.ok) return;
    expect(resDedup.data.deduplicatedGlobal).toBe(true);
    expect(mockS3.putObject).toHaveBeenCalledTimes(1); // Sigue siendo 1
  });

  it("genera URL firmada de imgproxy apuntando a IMGPROXY_PUBLIC_URL con formato plain/s3://", () => {
    const svc = new CatalogAndMediaService(
      [{ keyHex: "30".repeat(32), saltHex: "31".repeat(32) }],
      "http://localhost:8081",
    );

    const signed = svc.signImgproxyUrl({
      storageKey: "objects/ab/abcdef123456.webp",
      width: 400,
      height: 300,
      format: "webp",
      expiresUnixSec: 1800000000,
    });

    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    expect(signed.data.signedUrl).toContain("http://localhost:8081/");
    expect(signed.data.signedUrl).toContain("/plain/s3://media/objects/ab/abcdef123456.webp@webp");
    expect(signed.data.signedUrl).not.toContain("localhost:8333"); // Nunca expone S3 al cliente
  });
});

