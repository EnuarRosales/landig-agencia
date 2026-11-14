import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";
import { GET as getDashboard } from "./dashboard/route";
import { GET as getProducts, POST as createProduct } from "./products/route";
import { GET as getBilling } from "./billing/route";

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
});

