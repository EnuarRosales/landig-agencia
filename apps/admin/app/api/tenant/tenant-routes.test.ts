import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import { GET as getDashboard } from "./dashboard/route";
import { GET as getProducts, POST as createProduct } from "./products/route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    tenantWorkspaceService: {
      getDashboard: vi.fn(),
      getProducts: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      deleteProduct: vi.fn(),
      uploadProductMedia: vi.fn(),
      getContacts: vi.fn(),
      createContact: vi.fn(),
      getOrders: vi.fn(),
      createOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
      getBotConfig: vi.fn(),
      updateBotConfig: vi.fn(),
      getTeamMembers: vi.fn(),
      getBillingDetails: vi.fn(),
    },
  };
});

describe("Tenant Workspace Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when mocter_sid cookie is missing", async () => {
    const req = new NextRequest("http://localhost:3003/api/tenant/dashboard", {
      method: "GET",
    });

    const res = await getDashboard(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const json = await res.json();
    expect(json.status).toBe(401);
  });

  it("should return 403 when session scope is not 'tenant'", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "platform",
      user: { id: "user-po", email: "po@mocter.co" } as any,
      activeClient: null,
      lifecycleStatus: "activo",
      role: "platform_owner",
      capabilities: {},
    } as any);

    const req = new NextRequest("http://localhost:3003/api/tenant/dashboard", {
      method: "GET",
      headers: { cookie: "mocter_sid=test-sid" },
    });

    const res = await getDashboard(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const json = await res.json();
    expect(json.detail).toMatch(/acceso denegado/i);
  });

  it("should return 200 with dashboard data for authenticated tenant session", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "user-1", email: "owner@shop.co" } as any,
      activeClient: { id: "client-1", name: "Shop", slug: "shop" } as any,
      lifecycleStatus: "activo",
      role: "tenant_owner",
      capabilities: {},
    } as any);

    vi.mocked(domain.tenantWorkspaceService.getDashboard).mockResolvedValueOnce({
      tenant: {
        id: "client-1",
        name: "Shop",
        slug: "shop",
        planName: "Plan Pro",
        currency: "COP",
        cellCode: "cell-01",
      },
      metrics: {
        productsCount: 5,
        contactsCount: 10,
        ordersCount: 3,
        storageBytesUsed: 1024,
        storageQuotaBytes: 1048576,
      },
      bot: {
        preset: "natural_rhythm",
        remindersEnabled: false,
        faqsCount: 2,
      },
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/dashboard", {
      method: "GET",
      headers: { cookie: "mocter_sid=test-sid" },
    });

    const res = await getDashboard(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.tenant.name).toBe("Shop");
    expect(json.data.metrics.productsCount).toBe(5);
  });

  it("should reject POST /api/tenant/products with invalid payload (400 validation error)", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "user-1", email: "owner@shop.co" } as any,
      activeClient: { id: "client-1", name: "Shop", slug: "shop" } as any,
      lifecycleStatus: "activo",
      role: "tenant_owner",
      capabilities: {},
    } as any);

    const req = new NextRequest("http://localhost:3003/api/tenant/products", {
      method: "POST",
      headers: {
        cookie: "mocter_sid=test-sid",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "A", // Demasiado corto
        description: "Bad",
        priceCents: -50, // Inválido
      }),
    });

    const res = await createProduct(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.type).toContain("validation-error");
  });

  it("should create product and return 201 for valid payload", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "user-1", email: "owner@shop.co" } as any,
      activeClient: { id: "client-1", name: "Shop", slug: "shop" } as any,
      lifecycleStatus: "activo",
      role: "tenant_owner",
      capabilities: {},
    } as any);

    vi.mocked(domain.tenantWorkspaceService.createProduct).mockResolvedValueOnce({
      id: "prod-1",
      name: "Café Especial Huila",
      description: "Café de origen tostado medio.",
      priceCents: 35000,
      currency: "COP",
      status: "published",
      availability: "in_stock",
      mediaUrls: [],
      createdAt: new Date().toISOString(),
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/products", {
      method: "POST",
      headers: {
        cookie: "mocter_sid=test-sid",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Café Especial Huila",
        description: "Café de origen tostado medio.",
        priceCents: 35000,
        status: "published",
      }),
    });

    const res = await createProduct(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe("Café Especial Huila");
  });
});

