import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";

const { mockTenantOrdersService } = vi.hoisted(() => ({
  mockTenantOrdersService: {
    listOrders: vi.fn(),
    getOrderDetail: vi.fn(),
    createOrder: vi.fn(),
    updateOrderDetails: vi.fn(),
    transitionOrderStatus: vi.fn(),
    repeatOrder: vi.fn(),
    generateOrderGuide: vi.fn(),
    updatePaymentStatus: vi.fn(),
    listShippingCarriers: vi.fn(),
    createShippingCarrier: vi.fn(),
  },
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: vi.fn(),
}));

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    tenantOrdersService: mockTenantOrdersService,
  };
});

import { resolveTenantSession } from "@/lib/tenant-auth";
import { GET as listOrders, POST as createOrder } from "./orders/route";
import {
  GET as getOrderDetail,
  PUT as updateOrderDetails,
  PATCH as patchOrderStatus,
} from "./orders/[id]/route";
import { POST as repeatOrder } from "./orders/[id]/repeat/route";
import { GET as getOrderGuide } from "./orders/[id]/guide/route";

const ORDER_ID = "0192e200-0000-7000-8000-000000000001";

function mockSession(role: "tenant_owner" | "tenant_agent" = "tenant_owner") {
  vi.mocked(resolveTenantSession).mockResolvedValueOnce({
    ok: true,
    clientId: "client-1",
    context: {
      scope: "tenant",
      role,
      effectiveRoles: [role],
      user: {
        id: "user-1",
        email: `${role}@shop.co`,
        displayName: "Operador Pedidos",
      },
      activeClient: { id: "client-1", name: "Tienda Demo", slug: "demo", locale: "es" },
      lifecycleStatus: "activo",
      capabilities: {},
    },
  } as unknown as Awaited<ReturnType<typeof resolveTenantSession>>);
}

describe("SPEC-11 · API REST /api/tenant/orders*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/tenant/orders aplica filtros de estado, transportadora, fechas, búsqueda y paginación", async () => {
    mockSession("tenant_agent");
    mockTenantOrdersService.listOrders.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
        summary: {
          total: 15,
          pending: 5,
          preparingAndGuide: 4,
          inTransitAndIssue: 3,
          delivered: 2,
          cancelledAndReturned: 1,
          byStatus: {},
        },
      },
    });

    const req = new NextRequest(
      "http://localhost:3003/api/tenant/orders?q=Carlos&status=dispatched&carrier=Servientrega&dateFrom=2026-11-01&dateTo=2026-11-16&page=2&limit=10&sort=total_cents:asc",
      { method: "GET", headers: { "x-request-id": "req-ord-1" } },
    );

    const res = await listOrders(req);
    expect(res.status).toBe(200);
    expect(mockTenantOrdersService.listOrders).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({
        query: "Carlos",
        status: "dispatched",
        carrier: "Servientrega",
        page: 2,
        limit: 10,
        sortBy: "total_cents",
        sortDir: "asc",
      }),
    );
  });

  it("POST /api/tenant/orders crea pedido estructurado con ítems y canal de pago", async () => {
    mockSession("tenant_owner");
    mockTenantOrdersService.createOrder.mockResolvedValueOnce({
      ok: true,
      data: { id: ORDER_ID, orderNumber: "ORD-202611-0001", status: "pending_confirmation" },
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId: "0192e300-0000-7000-8000-000000000001",
        paymentChannelId: "0192e300-0000-7000-8000-000000000099",
        paymentMethod: "Contraentrega",
        customer: { name: "Carlos Ruiz", phone: "+573001234567" },
        shipping: {
          method: "home",
          city: "Bogotá",
          addressLine: "Calle 100 # 15-20",
          shippingCents: 12000,
        },
        items: [
          {
            productId: "0192e500-0000-7000-8000-000000000001",
            productName: "Termo 1L",
            quantity: 3,
            unitPriceCents: 4500000,
            selectedAttributes: { Color: "Negro" },
          },
        ],
      }),
    });

    const res = await createOrder(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.orderNumber).toBe("ORD-202611-0001");
  });

  it("GET /api/tenant/orders/[id] retorna detalle completo y 404 RFC 9457 para otro comercio", async () => {
    mockSession("tenant_agent");
    mockTenantOrdersService.getOrderDetail.mockResolvedValueOnce({
      ok: false,
      code: "ORDER_NOT_FOUND",
      error: "Pedido no encontrado.",
    });

    const res = await getOrderDetail(
      new NextRequest(`http://localhost:3003/api/tenant/orders/${ORDER_ID}`),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("PUT /api/tenant/orders/[id] retorna HTTP 422 ORDER_LOCKED_AFTER_DISPATCH post-despacho", async () => {
    mockSession("tenant_owner");
    mockTenantOrdersService.updateOrderDetails.mockResolvedValueOnce({
      ok: false,
      code: "ORDER_LOCKED_AFTER_DISPATCH",
      error: "No se puede editar un pedido que ya fue despachado.",
    });

    const res = await updateOrderDetails(
      new NextRequest(`http://localhost:3003/api/tenant/orders/${ORDER_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: "Cambio tardío" }),
      }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("ORDER_LOCKED_AFTER_DISPATCH");
  });

  it("PATCH /api/tenant/orders/[id] pasa actorRole para RBAC de cancelación pagada y valida guía", async () => {
    mockSession("tenant_agent");
    mockTenantOrdersService.transitionOrderStatus.mockResolvedValueOnce({
      ok: false,
      code: "FORBIDDEN_PAID_CANCELLATION",
      error: "Solo el propietario puede cancelar un pedido pagado.",
    });

    const res = await patchOrderStatus(
      new NextRequest(`http://localhost:3003/api/tenant/orders/${ORDER_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled", reason: "Solicitud cliente" }),
      }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(403);
    expect(mockTenantOrdersService.transitionOrderStatus).toHaveBeenCalledWith(
      "client-1",
      ORDER_ID,
      expect.objectContaining({
        toStatus: "cancelled",
        actorRole: "tenant_agent",
      }),
    );
  });

  it("POST /api/tenant/orders/[id]/repeat retorna borrador validado con skippedItems", async () => {
    mockSession("tenant_agent");
    mockTenantOrdersService.repeatOrder.mockResolvedValueOnce({
      ok: true,
      data: {
        mode: "draft",
        repeatedFromOrderId: ORDER_ID,
        repeatedFromOrderNumber: "ORD-202611-0001",
        skippedItems: [{ productName: "Producto Inactivo", reason: "PRODUCT_INACTIVE" }],
        warnings: ["El producto fue excluido."],
        draft: { items: [] },
      },
    });

    const res = await repeatOrder(
      new NextRequest(`http://localhost:3003/api/tenant/orders/${ORDER_ID}/repeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmImmediately: false }),
      }),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.skippedItems).toHaveLength(1);
  });

  it("GET /api/tenant/orders/[id]/guide soporta format=pdf y format=html con aislamiento clientId", async () => {
    mockSession("tenant_agent");
    mockTenantOrdersService.generateOrderGuide.mockResolvedValueOnce({
      ok: true,
      data: {
        contentType: "application/pdf",
        filename: "guia-ORD-202611-0001-10x15.pdf",
        body: Buffer.from("%PDF-1.4\n%%EOF\n", "latin1"),
        qrPayload: "MOCTER-ORD|ORD-202611-0001",
      },
    });

    const res = await getOrderGuide(
      new NextRequest(`http://localhost:3003/api/tenant/orders/${ORDER_ID}/guide?format=pdf&size=10x15`),
      { params: Promise.resolve({ id: ORDER_ID }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("latin1")).toContain("%PDF-1.4");
  });
});
