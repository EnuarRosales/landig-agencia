import { describe, it, expect, vi } from "vitest";
import { S3StorageService, generateSigV4Headers } from "./s3-storage.service";

describe("CEL-RF-016 · S3StorageService (SeaweedFS S3 Gateway Adapter)", () => {
  const dummyConfig = {
    endpoint: "http://localhost:8333",
    region: "us-east-1",
    bucket: "media",
    accessKeyId: "admin-access-key",
    secretAccessKey: "admin-secret-key-1234567890",
  };

  it("genera encabezados SigV4 válidos con formato canónico AWS", () => {
    const fixedDate = new Date("2026-11-08T12:00:00.000Z");
    const payloadSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty hash

    const headers = generateSigV4Headers({
      method: "PUT",
      endpoint: "http://localhost:8333",
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

  it("sube exitosamente un archivo a SeaweedFS con ruta path-style y reintentos", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("fake-image-bytes");

    const res = await s3.putObject("products/2026/item-01.jpg", buffer, "image/jpeg");

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8333/media/products/2026/item-01.jpg",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "content-type": "image/jpeg",
          "content-length": String(buffer.byteLength),
        }),
      }),
    );
  });

  it("reintenta con backoff exponencial cuando falla y retorna ok: true si tiene éxito en el segundo intento", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network glitch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const s3 = new S3StorageService(dummyConfig, mockFetch as any);
    const buffer = Buffer.from("image-retry-test");

    const res = await s3.putObject("products/2026/retry.webp", buffer, "image/webp", 3);

    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
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
      "http://localhost:8333/media/products/2026/to-delete.webp",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

