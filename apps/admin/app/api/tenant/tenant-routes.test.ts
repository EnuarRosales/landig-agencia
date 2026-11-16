import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import { GET as getDashboard } from "./dashboard/route";
import { POST as createProduct } from "./products/route";
import { GET as getBilling } from "./billing/route";
import { GET as getBot, PUT as putBot } from "./bot/route";
import { POST as createOrder } from "./orders/route";

const { mockProductsService } = vi.hoisted(() => ({
  mockProductsService: {
    listCatalog: vi.fn(),
    createProduct: vi.fn(),
    getProductDetail: vi.fn(),
    updateProduct: vi.fn(),
    updateProductStatus: vi.fn(),
    deleteProduct: vi.fn(),
    uploadAndAttachProductMedia: vi.fn(),
    setProductMediaCover: vi.fn(),
    deleteProductMedia: vi.fn(),
    resolveTenantMediaStreamSource: vi.fn(),
    evaluateLowStockAfterStockMutation: vi.fn(async () => ({
      ok: true as const,
      data: { triggered: false },
    })),
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((fn: () => void) => fn()),
  };
});

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: vi.fn(),
    getTenantProductsAndMediaService: vi.fn(() => mockProductsService),
    syncPendingLabelsToChatwootNonBlocking: vi.fn(async () => undefined),
    botConfigUnifiedService: {
      getUnifiedConfig: vi.fn(),
      updateUnifiedConfig: vi.fn(),
    },
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
        logoUrl: null,
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

    vi.mocked(mockProductsService.createProduct).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "prod-1",
        name: "Café Especial Huila",
        description: "Café de origen tostado medio.",
        priceCents: 35000,
        currency: "COP",
        status: "active",
        availability: "in_stock",
      },
    } as any);

    vi.mocked(mockProductsService.getProductDetail).mockResolvedValueOnce({
      ok: true,
      data: {
        id: "prod-1",
        name: "Café Especial Huila",
        description: "Café de origen tostado medio.",
        priceCents: 35000,
        currency: "COP",
        status: "active",
        availability: "in_stock",
        mediaUrls: [],
        createdAt: new Date().toISOString(),
      },
    } as any);

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

  it("should return 200 with unified billing entitlements from GET /api/tenant/billing (SPEC-03 T-04)", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: {
        id: "user-1",
        email: "owner@shop.co",
        displayName: "Owner",
        status: "active",
        emailVerifiedAt: null,
      },
      session: { id: "sid-1" },
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
      lifecycleStatus: "activo",
      activeClientId: "client-1",
      activeClient: { id: "client-1", name: "Shop", slug: "shop" },
      activeCellId: null,
      activeCellCode: null,
      planName: "Plan Pro",
      capabilities: {},
    } as Awaited<ReturnType<typeof domain.resolveAuthenticatedPortalContext>>);

    vi.mocked(domain.tenantWorkspaceService.getBillingDetails).mockResolvedValueOnce({
      plan: {
        id: "plan-pro",
        code: "pro",
        name: "Plan Pro",
        description: "Operación completa",
        priceMonthlyCents: 99000,
        priceAnnualCents: 990000,
        currency: "COP",
        trialDays: 14,
        lifecycleStatus: "activo",
      },
      quotas: [
        {
          dimension: "products",
          label: "Productos Del Catálogo",
          used: 5,
          limit: 100,
          unit: "productos",
          mode: "LIMITED",
          source: "plan",
        },
      ],
      mediaLimits: {
        imagesPerProduct: { dimension: "images_per_product", label: "Imágenes Por Producto", mode: "LIMITED", value: 10, source: "plan" },
        videosPerProduct: { dimension: "videos_per_product", label: "Videos Por Producto", mode: "LIMITED", value: 0, source: "plan" },
        audiosPerProduct: { dimension: "audios_per_product", label: "Pistas De Audio Por Producto", mode: "LIMITED", value: 2, source: "plan" },
        pdfsPerProduct: { dimension: "pdfs_per_product", label: "Archivos PDF Por Producto", mode: "LIMITED", value: 2, source: "plan" },
      },
      retentionDays: { dimension: "chat_retention_days", label: "Retención De Conversaciones", mode: "LIMITED", value: 60, source: "plan" },
      capabilities: { channel_whatsapp: true },
      capabilityDetails: [
        { code: "channel_whatsapp", label: "WhatsApp Business", description: "Canal oficial", category: "channels", enabled: true },
      ],
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/billing", {
      method: "GET",
      headers: { cookie: "mocter_sid=test-sid" },
    });

    const res = await getBilling(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.mediaLimits.audiosPerProduct.value).toBe(2);
    expect(json.data.capabilities.channel_whatsapp).toBe(true);
  });

  it("should allow GET /api/tenant/bot via unified service and block non-owner PUT with 403", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "u-agent", email: "agent@shop.co", displayName: "Agent", status: "active", emailVerifiedAt: null },
      session: { id: "sid-1" },
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
      lifecycleStatus: "activo",
      activeClientId: "client-1",
      activeClient: { id: "client-1", name: "Shop", slug: "shop" },
      activeCellId: null,
      activeCellCode: null,
      planName: "Plan Pro",
      capabilities: {},
    } as any);

    vi.mocked(domain.botConfigUnifiedService.getUnifiedConfig).mockResolvedValueOnce({
      ok: true,
      data: { bot: { name: "Asistente" } } as any,
    });

    const getRes = await getBot(
      new NextRequest("http://localhost:3003/api/tenant/bot", {
        method: "GET",
        headers: { cookie: "mocter_sid=test-sid" },
      }),
    );
    expect(getRes.status).toBe(200);

    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "u-agent", email: "agent@shop.co", displayName: "Agent", status: "active", emailVerifiedAt: null },
      session: { id: "sid-1" },
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
      lifecycleStatus: "activo",
      activeClientId: "client-1",
      activeClient: { id: "client-1", name: "Shop", slug: "shop" },
      activeCellId: null,
      activeCellCode: null,
      planName: "Plan Pro",
      capabilities: {},
    } as any);

    const putForbidden = await putBot(
      new NextRequest("http://localhost:3003/api/tenant/bot", {
        method: "PUT",
        headers: { cookie: "mocter_sid=test-sid", "content-type": "application/json" },
        body: JSON.stringify({ name: "Hacker" }),
      }),
    );
    expect(putForbidden.status).toBe(403);
    expect(putForbidden.headers.get("content-type")).toContain("application/problem+json");
  });

  it("should enforce strict E.164 on POST /api/tenant/orders", async () => {
    vi.mocked(domain.resolveAuthenticatedPortalContext).mockResolvedValueOnce({
      scope: "tenant",
      user: { id: "u-owner", email: "owner@shop.co", displayName: "Owner", status: "active", emailVerifiedAt: null },
      session: { id: "sid-1" },
      role: "tenant_owner",
      effectiveRoles: ["tenant_owner"],
      lifecycleStatus: "activo",
      activeClientId: "client-1",
      activeClient: { id: "client-1", name: "Shop", slug: "shop" },
      activeCellId: null,
      activeCellCode: null,
      planName: "Plan Pro",
      capabilities: {},
    } as any);

    const badOrder = await createOrder(
      new NextRequest("http://localhost:3003/api/tenant/orders", {
        method: "POST",
        headers: { cookie: "mocter_sid=test-sid", "content-type": "application/json" },
        body: JSON.stringify({
          customerName: "Pedro",
          customerPhone: "3001234567",
          totalCents: 5000000,
        }),
      }),
    );
    expect(badOrder.status).toBe(400);
    expect(domain.tenantWorkspaceService.createOrder).not.toHaveBeenCalled();
  });
});

