import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";

const mockGetStorageSummary = vi.fn();
const mockIngestMedia = vi.fn();
const mockReleaseMediaReference = vi.fn();

vi.mock("@mocter/domain", () => {
  return {
    DrizzleTenantStorageAccountingRepository: class MockRepo {},
    TenantStorageAccountingService: class MockService {
      getStorageSummary = mockGetStorageSummary;
      ingestMedia = mockIngestMedia;
      releaseMediaReference = mockReleaseMediaReference;
    },
  };
});

describe("API /api/admin/tenants/[id]/storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("retorna el resumen de almacenamiento y cuota", async () => {
      mockGetStorageSummary.mockResolvedValueOnce({
        usedBytes: 5000,
        quota: { mode: "LIMITED", value: 10000 },
        availableBytes: 5000,
        isUnlimited: false,
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/storage");
      const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.usedBytes).toBe(5000);
      expect(mockGetStorageSummary).toHaveBeenCalledWith("t1");
    });
  });

  describe("POST", () => {
    it("sube e ingesta archivo exitosamente retornando 201", async () => {
      mockIngestMedia.mockResolvedValueOnce({
        ok: true,
        data: {
          mediaId: "m1",
          contentHash: "hash123",
          sizeBytes: 10,
          deduplicatedForTenant: false,
          deduplicatedGlobally: false,
          addedBytes: 10,
          currentTotalStorageBytes: 10,
        },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/storage", {
        method: "POST",
        body: JSON.stringify({
          filename: "foto.png",
          base64Content: Buffer.from("test").toString("base64"),
          mimeType: "image/png",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.mediaId).toBe("m1");
    });

    it("retorna 403 con mensaje S10 si se agota el almacenamiento", async () => {
      mockIngestMedia.mockResolvedValueOnce({
        ok: false,
        error: "No hay almacenamiento disponible para completar la carga.",
        code: "STORAGE_QUOTA_EXCEEDED",
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/storage", {
        method: "POST",
        body: JSON.stringify({
          filename: "pesado.mp4",
          base64Content: Buffer.from("super grande").toString("base64"),
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("No hay almacenamiento disponible para completar la carga.");
    });
  });

  describe("DELETE", () => {
    it("libera la referencia del archivo retornando 200", async () => {
      mockReleaseMediaReference.mockResolvedValueOnce({
        ok: true,
        data: { unlinked: true, freedBytes: 100 },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/storage?mediaId=m1", {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockReleaseMediaReference).toHaveBeenCalledWith("t1", "m1");
    });
  });
});
