import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3StorageService, generateSigV4Headers } from "./s3-storage.service";

describe("CEL-RF-016 · S3StorageService (SeaweedFS S3 Gateway Adapter)", () => {
  const dummyConfig = {
    endpoint: "http://seaweedfs:8333",
    region: "us-east-1",
    bucket: "media",
    accessKeyId: "admin-access-key",
    secretAccessKey: "admin-secret-key-1234567890",
  };

  beforeEach(() => {
    S3StorageService.clearBucketCache();
  });

  it("genera encabezados SigV4 válidos con formato canónico AWS", () => {
    const fixedDate = new Date("2026-11-08T12:00:00.000Z");
    const payloadSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty hash

    const headers = generateSigV4Headers({
      method: "PUT",
      endpoint: "http://seaweedfs:8333",
      path: "/media/products/2026/img-test.webp",
      headers: { "content-type": "image/webp" },
      payloadSha256,
      region: "us-east-1",
      accessKeyId: "admin-access-key",
      secretAccessKey: "admin-secret-key-1234567890",
      timestamp: fixedDate,
    });

    expect(headers).toHaveProperty("Authorization");
    expect(headers["Authorization"]).toContain("AWS4-HMAC-SHA256 Credential=admin-access-key/20261108/us-east-1/s3/aws4_request");
    expect(headers["Authorization"]).toContain("SignedHeaders=");
    expect(headers["Authorization"]).toContain("Signature=");
    expect(headers["x-amz-date"]).toBe("20261108T120000Z");
    expect(headers["x-amz-content-sha256"]).toBe(payloadSha256);
  });

  it("verifica el bucket con HEAD antes de subir el objeto y cachea el resultado en llamadas subsecuentes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("fake-image-bytes");

    const res1 = await s3.putObject("products/2026/item-01.jpg", buffer, "image/jpeg");
    expect(res1.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://seaweedfs:8333/media",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://seaweedfs:8333/media/products/2026/item-01.jpg",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "content-type": "image/jpeg",
          "content-length": String(buffer.byteLength),
        }),
      }),
    );

    const res2 = await s3.putObject("products/2026/item-02.jpg", buffer, "image/jpeg");
    expect(res2.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "http://seaweedfs:8333/media/products/2026/item-02.jpg",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("crea automáticamente el bucket vía PUT cuando HEAD retorna 404 y luego sube el objeto", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" }) // HEAD /media -> 404
      .mockResolvedValueOnce({ ok: true, status: 200 }) // PUT /media -> 200
      .mockResolvedValueOnce({ ok: true, status: 200 }); // PUT /media/key -> 200

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("auto-bucket-image");

    const res = await s3.putObject("products/2026/auto.png", buffer, "image/png");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://seaweedfs:8333/media",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://seaweedfs:8333/media",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "http://seaweedfs:8333/media/products/2026/auto.png",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("acepta 409 BucketAlreadyOwnedByYou en creación concurrente de bucket", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const res = await s3.putObject("products/2026/concurrent.png", Buffer.from("data"), "image/png");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("reintenta con backoff exponencial cuando falla y retorna ok: true si tiene éxito en el segundo intento", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // HEAD /media
      .mockRejectedValueOnce(new Error("Network glitch")) // PUT object intento 1
      .mockResolvedValueOnce({ ok: true, status: 200 }); // PUT object intento 2

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("image-retry-test");

    const res = await s3.putObject("products/2026/retry.webp", buffer, "image/webp", 3);

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retorna ok: false con error descriptivo si se agotan todos los reintentos", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "SeaweedFS master timeout",
    });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("image-fail-test");

    const res = await s3.putObject("products/2026/failed.webp", buffer, "image/webp", 2);

    expect(res.ok).toBe(false);
    expect(res.error).toContain("503");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("elimina un objeto correctamente", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const res = await s3.deleteObject("products/2026/to-delete.webp");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://seaweedfs:8333/media/products/2026/to-delete.webp",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("descarga un objeto privado autenticado con SigV4 GET y retorna 404 cuando no existe", async () => {
    const sampleBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer;
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        arrayBuffer: async () => sampleBytes,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "NoSuchKey",
      });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const okRes = await s3.getObject("billing-vouchers/c1/voucher.png");
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.contentType).toBe("image/png");
      expect(okRes.buffer).toEqual(Buffer.from(sampleBytes));
    }

    const notFoundRes = await s3.getObject("billing-vouchers/c1/missing.png");
    expect(notFoundRes.ok).toBe(false);
    if (!notFoundRes.ok) {
      expect(notFoundRes.status).toBe(404);
    }
  });
});

