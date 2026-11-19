import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { resolveTenantSessionMock, mockPromotionsService } = vi.hoisted(() => ({
  resolveTenantSessionMock: vi.fn(),
  mockPromotionsService: {
    listPromotions: vi.fn(),
    createPromotion: vi.fn(),
    getPromotionDetail: vi.fn(),
    updatePromotion: vi.fn(),
    togglePromotionStatus: vi.fn(),
    deletePromotion: vi.fn(),
  },
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: resolveTenantSessionMock,
}));

vi.mock("@mocter/domain", () => ({
  getTenantPromotionsService: vi.fn(() => mockPromotionsService),
  appLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET as listPromotions, POST as createPromotion } from "./promotions/route";
import {
  GET as getPromotionDetail,
  PUT as updatePromotion,
  DELETE as deletePromotion,
} from "./promotions/[id]/route";
import { PATCH as patchPromotionStatus } from "./promotions/[id]/status/route";

describe("SPEC-18 T-03 · Route Handlers HTTP /api/tenant/promotions/*", () => {
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
  });

  it("GET /api/tenant/promotions retorna 200 con paginación y contadores KPI", async () => {
    mockPromotionsService.listPromotions.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [{ id: "promo-1", name: "Semana del Hogar", lifecycleStatus: "active" }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: {
          activeCount: 1,
          scheduledCount: 0,
          pausedCount: 0,
          expiredOrDepletedCount: 0,
          productsOnOfferTodayCount: 3,
        },
      },
    });

    const req = new NextRequest(
      "http://localhost:3003/api/tenant/promotions?status=active&scopeType=category&q=hogar",
    );
    const res = await listPromotions(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.summary.productsOnOfferTodayCount).toBe(3);
    expect(mockPromotionsService.listPromotions).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({ status: "active", scopeType: "category", q: "hogar" }),
    );
  });

  it("POST /api/tenant/promotions valida Zod (400 RFC 9457), errores de dominio (422) y creación (201)", async () => {
    const invalidReq = new NextRequest("http://localhost:3003/api/tenant/promotions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A", scopeType: "all_catalog", discountType: "percentage", discountValue: -5 }),
    });
    const invalidRes = await createPromotion(invalidReq);
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.headers.get("content-type")).toContain("application/problem+json");

    mockPromotionsService.createPromotion.mockResolvedValueOnce({
      ok: false,
      error: "Precio promocional fijo requiere alcance product.",
      code: "PROMOTION_FIXED_PRICE_REQUIRES_PRODUCT_SCOPE",
    });
    const domainErrReq = new NextRequest("http://localhost:3003/api/tenant/promotions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Oferta Fija",
        scopeType: "category",
        discountType: "fixed_price",
        discountValue: 50000,
        startsAt: "2026-11-19T10:00:00.000Z",
        categories: ["Calzado"],
      }),
    });
    const domainErrRes = await createPromotion(domainErrReq);
    expect(domainErrRes.status).toBe(422);

    mockPromotionsService.createPromotion.mockResolvedValueOnce({
      ok: true,
      data: { id: "promo-99", name: "Semana del Hogar", scopeType: "category", discountType: "percentage" },
    });
    const okReq = new NextRequest("http://localhost:3003/api/tenant/promotions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Semana del Hogar",
        scopeType: "category",
        discountType: "percentage",
        discountValue: 15,
        startsAt: "2026-11-19T10:00:00.000Z",
        endsAt: "2026-11-25T23:59:59.000Z",
        categories: ["Hidrolavadoras"],
      }),
    });
    const okRes = await createPromotion(okReq);
    expect(okRes.status).toBe(201);
  });

  it("GET/PUT/PATCH/DELETE /api/tenant/promotions/[id] respetan 404, 200 y RBAC 403 para tenant_agent", async () => {
    mockPromotionsService.getPromotionDetail.mockResolvedValueOnce({
      ok: false,
      error: "Promoción no encontrada.",
      code: "PROMOTION_NOT_FOUND",
    });
    const notFoundRes = await getPromotionDetail(
      new NextRequest("http://localhost:3003/api/tenant/promotions/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(notFoundRes.status).toBe(404);

    mockPromotionsService.updatePromotion.mockResolvedValueOnce({
      ok: true,
      data: { id: "promo-1", name: "Editada" },
    });
    const putRes = await updatePromotion(
      new NextRequest("http://localhost:3003/api/tenant/promotions/promo-1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Editada",
          scopeType: "all_catalog",
          discountType: "percentage",
          discountValue: 10,
          startsAt: "2026-11-19T10:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ id: "promo-1" }) },
    );
    expect(putRes.status).toBe(200);

    mockPromotionsService.togglePromotionStatus.mockResolvedValueOnce({
      ok: true,
      data: { id: "promo-1", isActive: false, lifecycleStatus: "paused" },
    });
    const patchRes = await patchPromotionStatus(
      new NextRequest("http://localhost:3003/api/tenant/promotions/promo-1/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: "promo-1" }) },
    );
    expect(patchRes.status).toBe(200);

    // RBAC: tenant_agent bloqueado en DELETE
    resolveTenantSessionMock.mockResolvedValueOnce({
      ok: true,
      clientId: "client-1",
      context: {
        user: { id: "user-2", email: "agent@tienda.co" },
        role: "tenant_agent",
        effectiveRoles: ["tenant_agent"],
      },
    });
    const forbiddenRes = await deletePromotion(
      new NextRequest("http://localhost:3003/api/tenant/promotions/promo-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "promo-1" }) },
    );
    expect(forbiddenRes.status).toBe(403);

    // tenant_owner permitido en DELETE (soft delete)
    mockPromotionsService.deletePromotion.mockResolvedValueOnce({
      ok: true,
      data: { id: "promo-1", deleted: true },
    });
    const deleteRes = await deletePromotion(
      new NextRequest("http://localhost:3003/api/tenant/promotions/promo-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "promo-1" }) },
    );
    expect(deleteRes.status).toBe(200);
  });
});
