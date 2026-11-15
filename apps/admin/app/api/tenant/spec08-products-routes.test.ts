import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  resolveTenantSessionMock,
  mockProductsService,
  mockGetObjectStream,
} = vi.hoisted(() => ({
  resolveTenantSessionMock: vi.fn(),
  mockProductsService: {
    listCatalog: vi.fn(),
    createProduct: vi.fn(),
    getProductDetail: vi.fn(),
    updateProduct: vi.fn(),
    updateProductStatus: vi.fn(),
    deleteProduct: vi.fn(),
    setProductMediaCover: vi.fn(),
    deleteProductMedia: vi.fn(),
    resolveTenantMediaStreamSource: vi.fn(),
    evaluateLowStockAfterStockMutation: vi.fn(),
  },
  mockGetObjectStream: vi.fn(),
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: resolveTenantSessionMock,
}));

vi.mock("@mocter/domain", () => ({
  MAX_PRODUCT_ATTRIBUTE_VALUES: 50,
  MAX_PRODUCT_BOT_MASTER_PROMPT_CHARS: 32000,
  MAX_PRODUCT_DYNAMIC_ATTRIBUTES: 20,
  normalizeProductStatus: (s?: string | null, fallback = "active") => {
    const v = (s ?? "").trim().toLowerCase();
    if (v === "active" || v === "published") return "active";
    if (v === "inactive" || v === "archived") return "inactive";
    if (v === "draft") return "draft";
    return fallback;
  },
  getTenantProductsAndMediaService: vi.fn(() => mockProductsService),
  S3StorageService: vi.fn(() => ({
    getObjectStream: mockGetObjectStream,
  })),
  appLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET as listProducts, POST as createProduct } from "./products/route";
import {
  GET as getProductDetail,
  PUT as updateProduct,
  DELETE as deleteProduct,
} from "./products/[id]/route";
import { PATCH as patchProductStatus } from "./products/[id]/status/route";
import { POST as postProductMediaCover } from "./products/[id]/media/[mediaId]/cover/route";
import { DELETE as deleteProductMedia } from "./products/[id]/media/[mediaId]/route";
import { GET as streamTenantMedia } from "./media/[mediaId]/route";

describe("SPEC-08 · Rutas HTTP de Catálogo, Combos, Stock y Streaming Multimedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTenantSessionMock.mockResolvedValue({
      ok: true,
      clientId: "client-1",
      context: {
        user: { id: "user-1", email: "owner@tienda.co" },
        role: "tenant_owner",
        effectiveRoles: ["tenant_owner"],
      },
    });
    mockProductsService.evaluateLowStockAfterStockMutation.mockResolvedValue({
      ok: true,
      data: { triggered: false },
    });
  });

  it("GET /api/tenant/products retorna 200 con contrato paginado SPEC-17 y normaliza filtro", async () => {
    mockProductsService.listCatalog.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [{ id: "p-1", name: "Café", status: "active" }],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
        summary: { totalActive: 12, lowStockCount: 3, comboCount: 1 },
      },
    });

    const req = new NextRequest(
      "http://localhost:3003/api/tenant/products?q=caf&status=published&lowStock=true&page=2&limit=10",
    );
    const res = await listProducts(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.pagination.page).toBe(2);
    expect(json.data.summary.lowStockCount).toBe(3);
    expect(mockProductsService.listCatalog).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        q: "caf",
        status: "active",
        lowStock: true,
        page: 2,
        limit: 10,
      }),
    );
  });

  it("POST /api/tenant/products valida límite 32,000 caracteres y 422 por cuota excedida", async () => {
    const tooLongReq = new NextRequest("http://localhost:3003/api/tenant/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Producto Largo",
        description: "Descripción válida del producto",
        priceCents: 25000,
        botMasterPrompt: "x".repeat(32001),
      }),
    });
    const badRes = await createProduct(tooLongReq);
    expect(badRes.status).toBe(400);
    expect(badRes.headers.get("content-type")).toContain("application/problem+json");

    mockProductsService.createProduct.mockResolvedValueOnce({
      ok: false,
      error: "Has alcanzado el límite de productos incluido en tu plan.",
      code: "QUOTA_EXCEEDED_PRODUCTS",
    });

    const quotaReq = new NextRequest("http://localhost:3003/api/tenant/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Producto Válido",
        description: "Descripción válida del producto",
        priceCents: 25000,
        costPriceCents: 12000,
        stockQuantity: 10,
        minStockThreshold: 2,
      }),
    });
    const quotaRes = await createProduct(quotaReq);
    expect(quotaRes.status).toBe(422);
    expect(quotaRes.headers.get("content-type")).toContain("application/problem+json");
  });

  it("GET y PUT /api/tenant/products/[id] retornan 404 si no existe y disparan evaluación de stock en after()", async () => {
    mockProductsService.getProductDetail.mockResolvedValueOnce({
      ok: false,
      error: "Producto no encontrado.",
      code: "PRODUCT_NOT_FOUND",
    });

    const notFoundRes = await getProductDetail(
      new NextRequest("http://localhost:3003/api/tenant/products/p-missing"),
      { params: Promise.resolve({ id: "p-missing" }) },
    );
    expect(notFoundRes.status).toBe(404);

    const dispatchSpy = vi.fn(async () => undefined);
    mockProductsService.updateProduct.mockResolvedValueOnce({
      ok: true,
      data: { id: "p-1", name: "Café", stockQuantity: 2 },
    });
    mockProductsService.getProductDetail.mockResolvedValueOnce({
      ok: true,
      data: { id: "p-1", name: "Café", effectiveStock: 2, isLowStock: true },
    });
    mockProductsService.evaluateLowStockAfterStockMutation.mockResolvedValueOnce({
      ok: true,
      data: { triggered: true, dispatch: dispatchSpy },
    });

    const putRes = await updateProduct(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stockQuantity: 2 }),
      }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
    const putJson = await putRes.json();

    expect(putRes.status).toBe(200);
    expect(putJson.data.isLowStock).toBe(true);
    await Promise.resolve();
    expect(mockProductsService.evaluateLowStockAfterStockMutation).toHaveBeenCalledWith(
      "client-1",
      "p-1",
      "owner@tienda.co",
    );
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it("DELETE /api/tenant/products/[id] retorna 403 para tenant_agent y 409 si es componente de combo activo", async () => {
    resolveTenantSessionMock.mockResolvedValueOnce({
      ok: true,
      clientId: "client-1",
      context: {
        user: { id: "user-agent", email: "agente@tienda.co" },
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
      },
    });

    const forbiddenRes = await deleteProduct(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
    expect(forbiddenRes.status).toBe(403);
    expect(mockProductsService.deleteProduct).not.toHaveBeenCalled();

    mockProductsService.deleteProduct.mockResolvedValueOnce({
      ok: false,
      error: 'No es posible eliminar el producto porque forma parte de combo(s) activos: "Combo A".',
      code: "PRODUCT_USED_IN_COMBO",
    });

    const conflictRes = await deleteProduct(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
    expect(conflictRes.status).toBe(409);
    const conflictJson = await conflictRes.json();
    expect(conflictJson.code).toBe("PRODUCT_USED_IN_COMBO");
  });

  it("PATCH status, POST portada y DELETE media ejecutan sus transiciones con RFC 9457 ante errores", async () => {
    mockProductsService.updateProductStatus.mockResolvedValueOnce({
      ok: true,
      data: { id: "p-1", status: "inactive" },
    });
    const statusRes = await patchProductStatus(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ id: "p-1" }) },
    );
    expect(statusRes.status).toBe(200);

    mockProductsService.setProductMediaCover.mockResolvedValueOnce({
      ok: false,
      error: "Únicamente las imágenes pueden definirse como portada principal del producto.",
      code: "INVALID_COVER_MEDIA_KIND",
    });
    const badCoverRes = await postProductMediaCover(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1/media/m-pdf/cover", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "p-1", mediaId: "m-pdf" }) },
    );
    expect(badCoverRes.status).toBe(400);

    mockProductsService.deleteProductMedia.mockResolvedValueOnce({
      ok: true,
      data: { deleted: true, promotedCoverMediaId: "m-2" },
    });
    const delMediaRes = await deleteProductMedia(
      new NextRequest("http://localhost:3003/api/tenant/products/p-1/media/m-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "p-1", mediaId: "m-1" }) },
    );
    expect(delMediaRes.status).toBe(200);
    const delJson = await delMediaRes.json();
    expect(delJson.data.promotedCoverMediaId).toBe("m-2");
  });

  it("GET /api/tenant/media/[mediaId] entrega stream con 206 Partial Content, nosniff e inline sin filtrar secretos", async () => {
    mockProductsService.resolveTenantMediaStreamSource.mockResolvedValueOnce({
      ok: true,
      data: {
        mediaId: "media-vid-1",
        mediaKind: "video",
        mimeType: "video/mp4",
        originalFilename: 'demo "trailer".mp4',
        sizeBytes: 1024,
        storageKey: "tenants/client-1/products/p-1/demo.mp4",
      },
    });
    mockGetObjectStream.mockResolvedValueOnce({
      ok: true,
      status: 206,
      body: null,
      bufferFallback: Buffer.from("0123456789"),
      contentType: "video/mp4",
      contentLength: "10",
      contentRange: "bytes 0-9/1024",
      acceptRanges: "bytes",
    });

    const res = await streamTenantMedia(
      new NextRequest("http://localhost:3003/api/tenant/media/media-vid-1", {
        headers: { range: "bytes=0-9" },
      }),
      { params: Promise.resolve({ mediaId: "media-vid-1" }) },
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Content-Range")).toBe("bytes 0-9/1024");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toContain("inline;");
    expect(mockGetObjectStream).toHaveBeenCalledWith(
      "tenants/client-1/products/p-1/demo.mp4",
      "bytes=0-9",
    );
  });
});
