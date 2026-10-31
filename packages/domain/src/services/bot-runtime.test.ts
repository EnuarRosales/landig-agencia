import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConversationStateService } from "./conversation-state.service";
import { PromptCache, PromptEngine, type PromptCacheKeyParts } from "./prompt-engine";
import { BotOrderCaptureService, type RegistrarPedidoToolInput } from "./bot-order-capture.service";
import { INITIAL_PROMPT_BLOCKS } from "./prompt-blocks.seed";
import { composePrompt, type ComposePromptInput } from "./prompt-composer";
import type { IConversationStateRepository } from "../repositories/conversation-state.repository.interface";
import type { CellConversationState } from "../db/schemas/tenant/conversation-state";
import type { OrdersService } from "./orders.service";
import { ok, err } from "../types/result";

const CLIENT = "0192e100-0000-7000-8000-000000000001";

function makeState(over: Partial<CellConversationState> = {}): CellConversationState {
  return {
    id: "0192e900-0000-7000-8000-000000000001",
    clientId: CLIENT,
    chatwootConversationId: 7,
    prospectId: null,
    productId: "prod-a",
    quantity: 2,
    city: "Bogotá",
    customerName: "Ana",
    shippingMethod: null,
    stage: "offer",
    lastLabel: null,
    lastTurnAt: new Date(),
    configVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "bot",
    updatedBy: "bot",
    ...over,
  };
}

describe("BOT-002 T-06 · Estado de conversación", () => {
  let repo: IConversationStateRepository;
  let service: ConversationStateService;

  beforeEach(() => {
    repo = {
      findByConversation: vi.fn().mockResolvedValue(makeState()),
      upsert: vi.fn().mockImplementation(async (_c, _cl, s) => makeState(s as Partial<CellConversationState>)),
    };
    service = new ConversationStateService(repo);
  });

  it("cambiar de producto conserva ciudad y nombre", async () => {
    const res = await service.applyTurn({
      cellId: "cell-1",
      clientId: CLIENT,
      chatwootConversationId: 7,
      patch: { productId: "prod-b" },
    });
    expect(res.ok).toBe(true);
    expect(repo.upsert).toHaveBeenCalledWith(
      "cell-1",
      CLIENT,
      expect.objectContaining({ productId: "prod-b", city: "Bogotá", customerName: "Ana", quantity: 2 }),
    );
  });

  it("null limpia el campo y undefined lo conserva", async () => {
    await service.applyTurn({
      cellId: "cell-1",
      clientId: CLIENT,
      chatwootConversationId: 7,
      patch: { city: null },
    });
    expect(repo.upsert).toHaveBeenCalledWith(
      "cell-1",
      CLIENT,
      expect.objectContaining({ city: null, customerName: "Ana" }),
    );
  });

  it("rechaza cantidades no positivas sin persistir", async () => {
    const res = await service.applyTurn({
      cellId: "cell-1",
      clientId: CLIENT,
      chatwootConversationId: 7,
      patch: { quantity: 0 },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("STATE_INVALID_QUANTITY");
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("una conversación nueva arranca en la etapa greeting", async () => {
    vi.mocked(repo.findByConversation).mockResolvedValueOnce(null);
    await service.applyTurn({ cellId: "cell-1", clientId: CLIENT, chatwootConversationId: 9, patch: {} });
    expect(repo.upsert).toHaveBeenCalledWith("cell-1", CLIENT, expect.objectContaining({ stage: "greeting" }));
  });
});

const parts = (over: Partial<PromptCacheKeyParts> = {}): PromptCacheKeyParts => ({
  clientId: CLIENT,
  botId: "bot-1",
  configVersion: 1,
  productId: "prod-a",
  productRevision: 1,
  policiesVersion: 1,
  locale: "es",
  ...over,
});

const composeInput = (): ComposePromptInput => ({
  locale: "es",
  blocks: [...INITIAL_PROMPT_BLOCKS],
  businessName: "Tienda Luna",
  botName: "Luna",
  objective: "vender",
  tone: "cercano",
  isFirstTurn: false,
  business: { paymentMethods: [], faqs: [], carriers: [], deliveryRules: [] },
});

describe("BOT-002 T-05 / T-09 · Caché y vista previa", () => {
  it("reutiliza la entrada con la misma clave y la invalida al cambiar el producto", () => {
    const cache = new PromptCache();
    const engine = new PromptEngine(cache);
    const spyCompose = vi.fn(composePrompt);
    expect(engine.getTurnPrompt(parts(), composeInput()).ok).toBe(true);
    expect(cache.get(parts())).not.toBeNull();
    void spyCompose;

    expect(cache.invalidateProduct(CLIENT, "prod-a")).toBe(1);
    expect(cache.get(parts())).toBeNull();
  });

  it("una nueva revisión de producto usa otra clave (siguiente turno ve la versión nueva)", () => {
    const cache = new PromptCache();
    const engine = new PromptEngine(cache);
    engine.getTurnPrompt(parts({ productRevision: 1 }), composeInput());
    expect(cache.get(parts({ productRevision: 2 }))).toBeNull();
  });

  it("expira por TTL de respaldo", () => {
    let now = 0;
    const cache = new PromptCache(1000, () => now);
    const engine = new PromptEngine(cache);
    engine.getTurnPrompt(parts(), composeInput());
    now = 1001;
    expect(cache.get(parts())).toBeNull();
  });

  it("el preview coincide con el prompt que consume el motor para la misma versión", () => {
    const engine = new PromptEngine(new PromptCache());
    const turn = engine.getTurnPrompt(parts(), composeInput());
    const preview = engine.preview(composeInput());
    expect(turn.ok && preview.ok && turn.data.prompt === preview.data.prompt).toBe(true);
    if (preview.ok) expect(preview.data.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("BOT-002 T-08 · Captura de pedido y cierre", () => {
  const input: RegistrarPedidoToolInput = {
    cellId: "cell-1",
    clientId: CLIENT,
    chatwootConversationId: 55,
    paymentMethod: "contraentrega",
    customer: { name: "Ana", phone: "+573001112233" },
    shipping: { method: "home", addressLine: "Calle 1", city: "Bogotá" },
    items: [{ productName: "Serum", quantity: 2, unitPriceCents: 4500000 }],
  };
  const details = { order: { id: "o1" }, items: [], events: [], returns: [] } as never;

  it("primera ejecución: crea el pedido y exige cierre y etiqueta una sola vez", async () => {
    const orders = { registerOrderDetailed: vi.fn().mockResolvedValue(ok({ details, created: true })) } as unknown as OrdersService;
    const res = await new BotOrderCaptureService(orders).capture(input);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ created: true, closingRequired: true, label: "compra-realizada" });
  });

  it("segunda ejecución de la misma conversación: no duplica ni repite cierre", async () => {
    const orders = { registerOrderDetailed: vi.fn().mockResolvedValue(ok({ details, created: false })) } as unknown as OrdersService;
    const res = await new BotOrderCaptureService(orders).capture(input);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ created: false, closingRequired: false, label: null });
  });

  it("propaga errores de validación de ORD-001 sin cierre", async () => {
    const orders = {
      registerOrderDetailed: vi.fn().mockResolvedValue(err("sin documento", "ORDER_OFFICE_DOCUMENT_REQUIRED")),
    } as unknown as OrdersService;
    const res = await new BotOrderCaptureService(orders).capture(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ORDER_OFFICE_DOCUMENT_REQUIRED");
  });

  it("rechaza conversaciones inválidas antes de llamar a ORD-001", async () => {
    const orders = { registerOrderDetailed: vi.fn() } as unknown as OrdersService;
    const res = await new BotOrderCaptureService(orders).capture({ ...input, chatwootConversationId: 0 });
    expect(res.ok).toBe(false);
    expect(orders.registerOrderDetailed).not.toHaveBeenCalled();
  });
});

