import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { resolveTenantSessionMock, uploadAndAttachProductMediaMock } = vi.hoisted(() => ({
  resolveTenantSessionMock: vi.fn(),
  uploadAndAttachProductMediaMock: vi.fn(),
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: resolveTenantSessionMock,
}));

vi.mock("@mocter/domain", () => ({
  MAX_PRODUCT_ATTRIBUTE_VALUES: 50,
  MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS: 32000,
  MAX_PRODUCT_DYNAMIC_ATTRIBUTES: 20,
  getTenantProductsAndMediaService: vi.fn(() => ({
    uploadAndAttachProductMedia: uploadAndAttachProductMediaMock,
  })),
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
      context: { user: { email: "owner@demo.co" }, role: "tenant_owner" },
    });
  });

  function buildUploadRequest(extras?: { setAsCover?: string; altText?: string }): NextRequest {
    const formData = new FormData();
    const blob = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.jpg", {
      type: "image/jpeg",
    });
    formData.append("file", blob);
    formData.append("productId", "prod-001");
    if (extras?.setAsCover) formData.append("setAsCover", extras.setAsCover);
    if (extras?.altText) formData.append("altText", extras.altText);

    return {
      headers: new Headers({ "x-request-id": "req-test-001" }),
      nextUrl: new URL("http://localhost:3003/api/tenant/media/upload"),
      formData: async () => formData,
    } as unknown as NextRequest;
  }

  it("retorna 503 con detalle amigable sin filtrar detalles internos cuando falla S3", async () => {
    uploadAndAttachProductMediaMock.mockResolvedValueOnce({
      ok: false,
      error: "Error al almacenar el archivo multimedia en S3: Failed to fetch http://seaweedfs:8333/media",
      code: "STORAGE_UNAVAILABLE",
    });

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toBe(
      "No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos.",
    );
    expect(JSON.stringify(body)).not.toContain("seaweedfs");
    expect(JSON.stringify(body)).not.toContain("8333");
  });

  it("retorna 400 cuando falla validación de magic bytes (ejecutables, ELF, SVG, GIF o vacíos)", async () => {
    uploadAndAttachProductMediaMock.mockResolvedValueOnce({
      ok: false,
      error: "Archivos ejecutables binarios no están permitidos.",
      code: "VALIDATION",
    });

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toContain("ejecutables");
  });

  it("retorna 422 cuando el comercio excede la cuota de almacenamiento o cantidad por tipo", async () => {
    uploadAndAttachProductMediaMock.mockResolvedValueOnce({
      ok: false,
      error: "Has alcanzado el límite de almacenamiento de 100 MB de tu plan.",
      code: "STORAGE_QUOTA_EXCEEDED",
    });

    const res = await POST(buildUploadRequest());
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(body.detail).toContain("límite");
  });

  it("retorna 201 cuando la subida multimodal y asignación de portada tienen éxito", async () => {
    uploadAndAttachProductMediaMock.mockResolvedValueOnce({
      ok: true,
      data: {
        id: "pm-1",
        mediaId: "media-1",
        mediaKind: "image",
        mimeType: "image/jpeg",
        originalFilename: "foto.jpg",
        sizeBytes: 4,
        isCover: true,
        altText: "Portada principal",
        sortOrder: 0,
        url: "https://media.mocter.co/sig/resize:fit:1200:1200:0/plain/s3://media/abc.jpg@webp",
        thumbUrl: "https://media.mocter.co/sig/resize:fill:240:240:0/plain/s3://media/abc.jpg@webp",
        createdAt: new Date().toISOString(),
      },
    });

    const res = await POST(buildUploadRequest({ setAsCover: "true", altText: "Portada principal" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.mediaId).toBe("media-1");
    expect(body.data.isCover).toBe(true);
    expect(uploadAndAttachProductMediaMock).toHaveBeenCalledWith(
      "client-123",
      "prod-001",
      expect.objectContaining({ originalFilename: "foto.jpg" }),
      "owner@demo.co",
      { altText: "Portada principal", setAsCover: true },
    );
  });
});
