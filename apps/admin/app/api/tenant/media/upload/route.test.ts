import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { resolveTenantSessionMock, uploadProductMediaMock, MockMediaUploadError } = vi.hoisted(() => {
  class MockMediaUploadError extends Error {
    constructor(
      message: string,
      public readonly code: "VALIDATION" | "QUOTA_EXCEEDED" | "NOT_FOUND" | "STORAGE_UNAVAILABLE",
      public readonly httpStatus: 400 | 404 | 422 | 503,
    ) {
      super(message);
      this.name = "MediaUploadError";
    }
  }
  return {
    resolveTenantSessionMock: vi.fn(),
    uploadProductMediaMock: vi.fn(),
    MockMediaUploadError,
  };
});

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: resolveTenantSessionMock,
}));

vi.mock("@mocter/domain", () => ({
  MediaUploadError: MockMediaUploadError,
  tenantWorkspaceService: {
    uploadProductMedia: uploadProductMediaMock,
  },
  appLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from "./route";

describe("POST /api/tenant/media/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTenantSessionMock.mockResolvedValue({
      ok: true,
      clientId: "client-123",
      context: { user: { email: "owner@demo.co" } },
    });
  });

  function buildUploadRequest(): NextRequest {
    const formData = new FormData();
    const blob = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.jpg", {
      type: "image/jpeg",
    });
    formData.append("file", blob);
    formData.append("productId", "prod-001");

    return {
      headers: new Headers({ "x-request-id": "req-test-001" }),
      formData: async () => formData,
    } as unknown as NextRequest;
  }

  it("retorna 503 con detalle amigable sin filtrar detalles internos cuando falla S3", async () => {
    uploadProductMediaMock.mockRejectedValueOnce(
      new MockMediaUploadError(
        "Error al almacenar el archivo multimedia en S3: Failed to fetch http://seaweedfs:8333/media",
        "STORAGE_UNAVAILABLE",
        503,
      ),
    );

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toBe("No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos.");
    expect(JSON.stringify(body)).not.toContain("seaweedfs");
    expect(JSON.stringify(body)).not.toContain("8333");
  });

  it("retorna 400 cuando falla validación de magic bytes (ejecutables, ELF o archivos vacíos)", async () => {
    uploadProductMediaMock.mockRejectedValueOnce(
      new MockMediaUploadError("Archivos ejecutables binarios no están permitidos.", "VALIDATION", 400),
    );

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toContain("ejecutables");
  });

  it("retorna 422 cuando el comercio excede la cuota de almacenamiento", async () => {
    uploadProductMediaMock.mockRejectedValueOnce(
      new MockMediaUploadError("Has alcanzado el límite de almacenamiento de 100 MB de tu plan.", "QUOTA_EXCEEDED", 422),
    );

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toContain("límite");
  });

  it("retorna 201 cuando la subida y firma tienen éxito", async () => {
    uploadProductMediaMock.mockResolvedValueOnce({
      id: "media-1",
      mediaId: "media-1",
      mediaKind: "image",
      storageKey: "products/client-123/abc.jpg",
      sizeBytes: 4,
      signedUrl: "https://media.mocter.co/sig/resize:fit:600:600:0/plain/s3://media/products/client-123/abc.jpg@webp",
    });

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.mediaId).toBe("media-1");
    expect(body.data.mediaKind).toBe("image");
  });
});

