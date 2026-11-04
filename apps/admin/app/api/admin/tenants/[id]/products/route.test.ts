import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockCreateProduct = vi.fn();
const mockImportProducts = vi.fn();
const mockListProducts = vi.fn();

vi.mock("@mocter/domain", () => {
  return {
    DrizzleTenantProductsRepository: class MockRepo {},
    TenantProductsAndMediaService: class MockService {
      createProduct = mockCreateProduct;
      importProducts = mockImportProducts;
      listProducts = mockListProducts;
    },
  };
});

describe("API /api/admin/tenants/[id]/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("retorna la lista de productos del inquilino", async () => {
      mockListProducts.mockResolvedValueOnce({
        ok: true,
        data: [{ id: "p1", name: "Zapatos", priceCents: 10000 }],
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products");
      const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockListProducts).toHaveBeenCalledWith("t1");
    });
  });

  describe("POST", () => {
    it("crea un producto individual exitosamente retornando 201", async () => {
      mockCreateProduct.mockResolvedValueOnce({
        ok: true,
        data: { id: "p10", name: "Bolso", priceCents: 85000 },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Bolso",
          description: "Cuero genuino",
          priceCents: 85000,
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe("p10");
    });

    it("retorna 403 con mensaje S10 cuando se agota la cuota del plan", async () => {
      mockCreateProduct.mockResolvedValueOnce({
        ok: false,
        error: "Has alcanzado el límite de productos incluido en tu plan.",
        code: "QUOTA_EXCEEDED_PRODUCTS",
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Producto Excedido",
          description: "Supera límite",
          priceCents: 12000,
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Has alcanzado el límite de productos incluido en tu plan.");
      expect(body.code).toBe("QUOTA_EXCEEDED_PRODUCTS");
    });

    it("importa productos en lote retornando 201", async () => {
      mockImportProducts.mockResolvedValueOnce({
        ok: true,
        data: {
          importedCount: 2,
          products: [{ id: "p1" }, { id: "p2" }],
        },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products", {
        method: "POST",
        body: JSON.stringify({
          products: [
            { name: "P1", description: "D1", priceCents: 1000 },
            { name: "P2", description: "D2", priceCents: 2000 },
          ],
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.importedCount).toBe(2);
    });

    it("rechaza importación por lote con 403 si el lote supera la cuota disponible", async () => {
      mockImportProducts.mockResolvedValueOnce({
        ok: false,
        error: "Has alcanzado el límite de productos incluido en tu plan.",
        code: "QUOTA_EXCEEDED_PRODUCTS",
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products", {
        method: "POST",
        body: JSON.stringify({
          products: [
            { name: "P1", description: "D1", priceCents: 1000 },
            { name: "P2", description: "D2", priceCents: 2000 },
          ],
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Has alcanzado el límite de productos incluido en tu plan.");
    });

    it("retorna 400 si faltan campos obligatorios en creación individual", async () => {
      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/products", {
        method: "POST",
        body: JSON.stringify({ name: "Solo nombre" }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Nombre, descripción y precio en centavos son obligatorios");
    });
  });
});
