import { describe, expect, it, vi } from "vitest";
import {
  computeCandidatePromotionalPrice,
  derivePromotionLifecycleStatus,
  resolveEffectiveProductPromotion,
  simulatePromotionImpact,
  type PromotionRecordWithTargets,
} from "./promotion-resolution";
import {
  InMemoryTenantPromotionsRepository,
  TenantPromotionsService,
} from "./tenant-promotions.service";
import { composePrompt } from "./prompt-composer";
import { INITIAL_PROMPT_BLOCKS } from "./prompt-blocks.seed";
import { INITIAL_AI_ASSIST_FIELDS, INITIAL_AI_ASSIST_PROMPTS } from "./ai-assist-catalog.seed";
import { OrdersService } from "./orders.service";
import type { IOrdersRepository, OrderWithDetails } from "../repositories/orders.repository.interface";

const NOW = new Date("2026-11-19T15:00:00.000Z");
const PAST = new Date("2026-11-18T15:00:00.000Z");
const FUTURE = new Date("2026-11-25T15:00:00.000Z");
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

function makePromo(overrides: Partial<PromotionRecordWithTargets> = {}): PromotionRecordWithTargets {
  return {
    id: overrides.id ?? "promo-1",
    name: overrides.name ?? "Campaña Base",
    description: overrides.description ?? "Oferta por tiempo limitado",
    scopeType: overrides.scopeType ?? "all_catalog",
    discountType: overrides.discountType ?? "percentage",
    discountValue: overrides.discountValue ?? 10,
    startsAt: overrides.startsAt ?? PAST,
    endsAt: overrides.endsAt !== undefined ? overrides.endsAt : FUTURE,
    maxDiscountedUnits: overrides.maxDiscountedUnits !== undefined ? overrides.maxDiscountedUnits : null,
    discountedUnitsSold: overrides.discountedUnitsSold ?? 0,
    isActive: overrides.isActive ?? true,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? PAST,
    targets: overrides.targets ?? [],
  };
}

describe("SPEC-18 T-02 · Motor PromotionResolutionEngine y TenantPromotionsService", () => {
  it("evalúa determinísticamente los 5 estados derivados (paused, depleted, scheduled, expired, active)", () => {
    expect(derivePromotionLifecycleStatus(makePromo({ isActive: false }), NOW)).toBe("paused");
    expect(
      derivePromotionLifecycleStatus(
        makePromo({ maxDiscountedUnits: 10, discountedUnitsSold: 10 }),
        NOW,
      ),
    ).toBe("depleted");
    expect(
      derivePromotionLifecycleStatus(
        makePromo({ maxDiscountedUnits: 10, discountedUnitsSold: 13 }),
        NOW,
      ),
    ).toBe("depleted");
    expect(
      derivePromotionLifecycleStatus(
        makePromo({ startsAt: FUTURE, endsAt: new Date("2026-11-30T00:00:00.000Z") }),
        NOW,
      ),
    ).toBe("scheduled");
    expect(
      derivePromotionLifecycleStatus(
        makePromo({ startsAt: new Date("2026-11-01T00:00:00.000Z"), endsAt: PAST }),
        NOW,
      ),
    ).toBe("expired");
    expect(derivePromotionLifecycleStatus(makePromo(), NOW)).toBe("active");
  });

  it("resuelve prioridad sin acumulación: Producto Exacto > Categoría > Todo el Catálogo (D-04)", () => {
    const product = { id: "prod-1", category: "Hidrolavadoras", priceCents: 100_000 };
    const catalogPromo = makePromo({
      id: "p-all",
      name: "Todo 40%",
      scopeType: "all_catalog",
      discountValue: 40,
    });
    const categoryPromo = makePromo({
      id: "p-cat",
      name: "Semana del Hogar 30%",
      scopeType: "category",
      discountValue: 30,
      targets: [{ targetType: "category", productId: null, categoryName: "  hidrolavadoras  " }],
    });
    const productPromo = makePromo({
      id: "p-prod",
      name: "Relámpago 15%",
      scopeType: "product",
      discountValue: 15,
      targets: [{ targetType: "product", productId: "prod-1", categoryName: null }],
    });

    const winner = resolveEffectiveProductPromotion(
      product,
      [catalogPromo, categoryPromo, productPromo],
      NOW,
    );
    expect(winner?.promotionId).toBe("p-prod");
    expect(winner?.effectivePriceCents).toBe(85_000);
    expect(winner?.savingsPct).toBe(15);

    const catWinner = resolveEffectiveProductPromotion(
      product,
      [catalogPromo, categoryPromo],
      NOW,
    );
    expect(catWinner?.promotionId).toBe("p-cat");
    expect(catWinner?.effectivePriceCents).toBe(70_000);
  });

  it("desempata al mismo nivel de especificidad por mayor ahorro y luego por creación más reciente", () => {
    const product = { id: "prod-1", category: "Calzado", priceCents: 100_000 };
    const olderSmaller = makePromo({
      id: "p-1",
      name: "10% OFF",
      scopeType: "category",
      discountValue: 10,
      createdAt: new Date("2026-11-10T00:00:00.000Z"),
      targets: [{ targetType: "category", productId: null, categoryName: "Calzado" }],
    });
    const olderBigger = makePromo({
      id: "p-2",
      name: "20% OFF Vieja",
      scopeType: "category",
      discountValue: 20,
      createdAt: new Date("2026-11-11T00:00:00.000Z"),
      targets: [{ targetType: "category", productId: null, categoryName: "Calzado" }],
    });
    const newerSame = makePromo({
      id: "p-3",
      name: "20% OFF Nueva",
      scopeType: "category",
      discountValue: 20,
      createdAt: new Date("2026-11-15T00:00:00.000Z"),
      targets: [{ targetType: "category", productId: null, categoryName: "Calzado" }],
    });

    const winner = resolveEffectiveProductPromotion(
      product,
      [olderSmaller, olderBigger, newerSame],
      NOW,
    );
    expect(winner?.promotionId).toBe("p-3");
    expect(winner?.effectivePriceCents).toBe(80_000);
  });

  it("excluye preventivamente productos cuando fixed_amount >= priceCents (D-06) y calcula semáforo de margen", () => {
    const excluded = computeCandidatePromotionalPrice(30_000, "fixed_amount", 50_000);
    expect(excluded.effectivePriceCents).toBeNull();
    expect(excluded.excludedReason).toBe("PRICE_NOT_GREATER_THAN_DISCOUNT");

    const exactEqual = computeCandidatePromotionalPrice(50_000, "fixed_amount", 50_000);
    expect(exactEqual.effectivePriceCents).toBeNull();

    const sim = simulatePromotionImpact(
      {
        scopeType: "all_catalog",
        discountType: "fixed_amount",
        discountValue: 40_000,
      },
      [
        { id: "p-cheap", name: "Accesorio", priceCents: 30_000, costPriceCents: 10_000, status: "active" },
        { id: "p-loss", name: "Base", priceCents: 60_000, costPriceCents: 35_000, status: "active" },
        { id: "p-tight", name: "Medio", priceCents: 100_000, costPriceCents: 52_000, status: "active" },
        { id: "p-healthy", name: "Premium", priceCents: 200_000, costPriceCents: 80_000, status: "active" },
      ],
    );

    expect(sim.matchedProductsCount).toBe(4);
    expect(sim.excludedProductsCount).toBe(1);
    expect(sim.applicableProductsCount).toBe(3);
    expect(sim.lossProductsCount).toBe(1); // 60k - 40k = 20k vs cost 35k
    expect(sim.tightMarginProductsCount).toBe(1); // 100k - 40k = 60k vs cost 52k => 13.33%
    expect(sim.healthyMarginProductsCount).toBe(1); // 200k - 40k = 160k vs cost 80k => 50%
  });

  it("ejecuta CRUD completo, validaciones RN-SPEC-18-03, RBAC y soft delete (D-08) en TenantPromotionsService", async () => {
    const repo = new InMemoryTenantPromotionsRepository();
    repo.seedCatalog(CLIENT_ID, [
      { id: "prod-1", name: "Hidrolavadora Pro", category: "Hidrolavadoras", priceCents: 500_000, costPriceCents: 250_000, status: "active" },
      { id: "prod-2", name: "Boquilla Extra", category: "Hidrolavadoras", priceCents: 40_000, costPriceCents: 15_000, status: "active" },
    ]);
    const svc = new TenantPromotionsService(repo);

    // fixed_price sobre categoría debe fallar (RN-SPEC-18-03)
    const badScope = await svc.createPromotion(
      CLIENT_ID,
      {
        name: "Precio Fijo Malo",
        scopeType: "category",
        discountType: "fixed_price",
        discountValue: 100_000,
        startsAt: PAST,
        categories: ["Hidrolavadoras"],
      },
      "owner-1",
      NOW,
    );
    expect(badScope.ok).toBe(false);
    if (!badScope.ok) expect(badScope.code).toBe("PROMOTION_FIXED_PRICE_REQUIRES_PRODUCT_SCOPE");

    // fixed_price >= precio regular debe fallar
    const badFixed = await svc.createPromotion(
      CLIENT_ID,
      {
        name: "Fijo Mayor",
        scopeType: "product",
        discountType: "fixed_price",
        discountValue: 500_000,
        startsAt: PAST,
        productIds: ["prod-1"],
      },
      "owner-1",
      NOW,
    );
    expect(badFixed.ok).toBe(false);
    if (!badFixed.ok) expect(badFixed.code).toBe("PROMOTION_FIXED_PRICE_NOT_LOWER");

    // Creación válida por categoría
    const created = await svc.createPromotion(
      CLIENT_ID,
      {
        name: "Semana del Hogar",
        description: "15% OFF en toda la línea de hidrolavadoras.",
        scopeType: "category",
        discountType: "percentage",
        discountValue: 15,
        startsAt: PAST,
        endsAt: FUTURE,
        maxDiscountedUnits: 20,
        categories: ["Hidrolavadoras"],
      },
      "owner-1",
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.lifecycleStatus).toBe("active");
    expect(created.data.applicableProductsCount).toBe(2);

    // Listado KPI refleja 2 productos en oferta hoy
    const listed = await svc.listPromotions(CLIENT_ID, {}, NOW);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data.summary.activeCount).toBe(1);
      expect(listed.data.summary.productsOnOfferTodayCount).toBe(2);
    }

    // Pausar y reactivar
    const paused = await svc.togglePromotionStatus(CLIENT_ID, created.data.id, false, "agent-1", NOW);
    expect(paused.ok && paused.data.lifecycleStatus === "paused").toBe(true);

    // RBAC: tenant_agent bloqueado para DELETE
    const denied = await svc.deletePromotion(CLIENT_ID, created.data.id, "agent-1", "tenant_agent");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("FORBIDDEN");

    // Soft delete por tenant_owner preserva fila en repo con deletedAt pero oculta del listado
    const deleted = await svc.deletePromotion(CLIENT_ID, created.data.id, "owner-1", "tenant_owner");
    expect(deleted.ok).toBe(true);
    expect(repo.promotions.get(created.data.id)?.deletedAt).not.toBeNull();
    const afterDelete = await svc.listPromotions(CLIENT_ID, {}, NOW);
    expect(afterDelete.ok && afterDelete.data.items.length === 0).toBe(true);
  });

  it("inyecta oferta vigente, urgencia y regla de no acumulación con tiers en PromptComposer (RN-SPEC-18-05, D-07)", () => {
    const blocks = INITIAL_PROMPT_BLOCKS.map((b) => ({
      blockKey: b.blockKey,
      version: 1,
      content: b.content,
    }));

    const composed = composePrompt({
      locale: "es",
      blocks,
      businessName: "HidroStore",
      botName: "Sofía",
      objective: "Asesorar y cerrar ventas",
      tone: "Cercano",
      business: {
        paymentMethods: ["Contraentrega"],
        faqs: [],
        carriers: ["Servientrega"],
        deliveryRules: [],
      },
      product: {
        id: "prod-1",
        name: "Hidrolavadora Pro",
        benefits: ["Alta presión"],
        priceCents: 100_000,
        currency: "COP",
        tiers: [{ minQty: 2, priceCents: 80_000, isRecommended: true }],
        timezone: "America/Bogota",
        activePromotion: {
          promotionId: "promo-1",
          name: "Semana del Hogar",
          description: "Ahorro directo por tiempo limitado",
          scopeType: "category",
          discountType: "percentage",
          discountValue: 15,
          originalPriceCents: 100_000,
          effectivePriceCents: 85_000,
          savingsCents: 15_000,
          savingsPct: 15,
          startsAt: PAST.toISOString(),
          endsAt: FUTURE.toISOString(),
          remainingUnits: 5,
        },
      },
      isFirstTurn: true,
    });

    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.data.prompt).toContain("Semana del Hogar");
    expect(composed.data.prompt).toContain("-15%");
    expect(composed.data.prompt).toContain("Unidades restantes en oferta: 5");
    expect(composed.data.prompt).toContain("NO se acumula con los precios escalonados por volumen");
  });

  it("propaga snapshot de promoción y acciones idempotentes de cupo (deduct/restore) en OrdersService (D-05)", async () => {
    const createOrderMock = vi.fn(async (_cellId, _clientId, params) => ({
      order: {
        id: "ord-1",
        clientId: CLIENT_ID,
        number: params.order.number,
        status: params.order.status,
        paymentStatus: params.order.paymentStatus,
        stockDeducted: params.stockAction === "deduct",
        promotionQuotaDeducted: params.promotionQuotaAction === "deduct",
        ...params.order,
      },
      items: params.items,
      events: [params.event],
      returns: [],
    })) as unknown as IOrdersRepository["createOrder"];

    const updateOrderStatusMock = vi.fn(async (_cellId, _clientId, _orderId, toStatus, event, options) => ({
      order: {
        id: "ord-1",
        clientId: CLIENT_ID,
        status: toStatus,
        stockDeducted: options?.stockAction === "deduct",
        promotionQuotaDeducted: options?.promotionQuotaAction === "deduct",
      },
      items: [],
      events: [event],
      returns: [],
    })) as unknown as IOrdersRepository["updateOrderStatus"];

    const mockRepo: Partial<IOrdersRepository> = {
      getNextOrderNumber: vi.fn(async () => "ORD-202611-0001"),
      getProductsForOrderItems: vi.fn(async () => ({
        "prod-1": {
          id: "prod-1",
          name: "Hidrolavadora Pro",
          sku: "HP-1",
          kind: "physical",
          compositionType: "simple",
          availability: "in_stock",
          status: "active",
          priceCents: 100_000,
          salePriceCents: 85_000,
          activePromotion: {
            promotionId: "promo-1",
            name: "Oferta Relámpago",
            description: null,
            scopeType: "product" as const,
            discountType: "percentage" as const,
            discountValue: 15,
            originalPriceCents: 100_000,
            effectivePriceCents: 85_000,
            savingsCents: 15_000,
            savingsPct: 15,
            startsAt: PAST.toISOString(),
            endsAt: FUTURE.toISOString(),
            remainingUnits: 2,
          },
          costPriceCents: 40_000,
          stockQuantity: 20,
          attributes: [],
          comboEffectiveStock: null,
          hasInactiveComboComponent: false,
        },
      })),
      createOrder: createOrderMock,
      findOrderById: vi.fn(async () => ({
        order: {
          id: "ord-1",
          clientId: CLIENT_ID,
          status: "confirmed",
          paymentStatus: "pending",
          stockDeducted: true,
          promotionQuotaDeducted: true,
        },
        items: [{ id: "oi-1", productId: "prod-1", promotionId: "promo-1", quantity: 5 }],
        events: [],
        returns: [],
      })) as unknown as IOrdersRepository["findOrderById"],
      updateOrderStatus: updateOrderStatusMock,
    };

    const ordersSvc = new OrdersService(mockRepo as IOrdersRepository);

    // 1. Pedido confirmado desde Bot con 5 unidades (supera cupo restante 2 => desborde acotado D-05)
    const reg = await ordersSvc.registerOrderDetailed({
      cellId: "cell-01",
      clientId: CLIENT_ID,
      source: "bot",
      initialStatus: "confirmed",
      paymentMethod: "Contraentrega",
      customer: { name: "Ana", phone: "+573001234567" },
      shipping: { method: "home", countryCode: "CO", city: "Bogotá", addressLine: "Calle 10" },
      items: [{ productId: "prod-1", productName: "Hidrolavadora Pro", quantity: 5, unitPriceCents: 100_000 }],
    });
    expect(reg.ok).toBe(true);
    const callArgs = (createOrderMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(callArgs.promotionQuotaAction).toBe("deduct");
    expect(callArgs.items[0].promotionId).toBe("promo-1");
    expect(callArgs.items[0].promotionName).toBe("Oferta Relámpago");
    expect(callArgs.items[0].unitPriceCents).toBe(85_000);
    expect(callArgs.items[0].originalUnitPriceCents).toBe(100_000);

    // 2. Cancelar pedido confirmado restituye cupo promocional
    const cancelled = await ordersSvc.transitionStatus({
      cellId: "cell-01",
      clientId: CLIENT_ID,
      orderId: "ord-1",
      toStatus: "cancelled",
      actor: "owner-1",
      reason: "Cliente desistió",
    });
    expect(cancelled.ok).toBe(true);
    const statusOpts = (updateOrderStatusMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[5];
    expect(statusOpts.promotionQuotaAction).toBe("restore");
  });

  it("incluye el campo promotion.description en el catálogo semilla AI Assist bajo metodología IDEAL (D-09)", () => {
    const field = INITIAL_AI_ASSIST_FIELDS.find((f) => f.fieldKey === "promotion.description");
    const prompt = INITIAL_AI_ASSIST_PROMPTS.find((p) => p.fieldKey === "promotion.description");
    expect(field).toBeDefined();
    expect(field?.labels.es).toBe("Argumento Comercial de la Promoción");
    expect(prompt).toBeDefined();
    expect(prompt?.masterPrompt).toContain("[I] INTENCIÓN:");
    expect(prompt?.masterPrompt).toContain("[L] LÍMITE:");
  });
});
