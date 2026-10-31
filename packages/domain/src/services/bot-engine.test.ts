import { describe, expect, it, vi } from "vitest";
import { composePrompt, type ComposePromptInput } from "./prompt-composer";
import { INITIAL_PROMPT_BLOCKS } from "./prompt-blocks.seed";
import {
  BUBBLE_MAX_PAUSE_MS,
  BUBBLE_MIN_PAUSE_MS,
  computeBubblePauseMs,
  deliverBubbles,
  splitIntoBubbles,
} from "./bubble-engine";
import { resolveLeadLabel, selectClassifierWindow } from "./lead-classifier";

const baseInput = (over: Partial<ComposePromptInput> = {}): ComposePromptInput => ({
  locale: "es",
  blocks: [...INITIAL_PROMPT_BLOCKS],
  businessName: "Tienda Luna",
  botName: "Luna",
  objective: "vender cosmética",
  tone: "cercano",
  greeting: "¡Hola!",
  isFirstTurn: true,
  business: {
    paymentMethods: ["transferencia"],
    faqs: [],
    carriers: ["Servientrega"],
    deliveryRules: [{ city: "Bogotá", days: "1-2 días" }, { city: null, days: "3-5 días" }],
    orderMessage: "Nombre, ciudad y dirección.",
    closingMessage: "¡Gracias!",
  },
  product: {
    id: "p1",
    name: "Serum A",
    benefits: ["hidrata"],
    priceCents: 5000000,
    currency: "COP",
    tiers: [{ minQty: 2, priceCents: 4500000, isRecommended: true }],
    mediaTerm: "serum-a",
  },
  ...over,
});

describe("BOT-002 T-04 · Compositor en runtime", () => {
  it("compone el prompt con el producto activo y registra versiones usadas", () => {
    const res = composePrompt(baseInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.prompt).toContain("Serum A");
    expect(res.data.prompt).toContain("Servientrega");
    expect(res.data.prompt).toContain("¡Hola!");
    expect(res.data.usedBlocks.every((b) => b.version === 1)).toBe(true);
  });

  it("no mezcla productos: solo el producto activo entra al prompt", () => {
    const res = composePrompt(baseInput());
    expect(res.ok && res.data.prompt.includes("Serum B")).toBe(false);
  });

  it("omite el saludo fuera del primer turno", () => {
    const res = composePrompt(baseInput({ isFirstTurn: false }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.usedBlocks.some((b) => b.blockKey === "core.greeting")).toBe(false);
  });

  it("falla con código explícito si falta un bloque obligatorio", () => {
    const blocks = INITIAL_PROMPT_BLOCKS.filter((b) => b.blockKey !== "core.identity");
    const res = composePrompt(baseInput({ blocks: [...blocks] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROMPT_BLOCKS_MISSING");
  });

  it("rechaza prompts que exceden el tope de tokens", () => {
    const res = composePrompt(baseInput({ maxPromptTokens: 10 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("PROMPT_TOKEN_LIMIT_EXCEEDED");
  });

  it("inyecta memoria del contacto con máximo 3 episodios", () => {
    const res = composePrompt(
      baseInput({ memory: { profile: "Prefiere envío a oficina", episodes: ["e1", "e2", "e3", "e4"] } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.prompt).toContain("Prefiere envío a oficina");
      expect(res.data.prompt).toContain("- e3");
      expect(res.data.prompt).not.toContain("- e4");
    }
  });
});

describe("BOT-002 T-04 · Motor de burbujas", () => {
  it("acota la pausa al rango 800–5000 ms y aplica presets", () => {
    expect(computeBubblePauseMs("hola")).toBe(BUBBLE_MIN_PAUSE_MS);
    expect(computeBubblePauseMs("x".repeat(1000))).toBe(BUBBLE_MAX_PAUSE_MS);
    expect(computeBubblePauseMs("x".repeat(40), "fast")).toBeLessThan(computeBubblePauseMs("x".repeat(40), "paused"));
    expect(computeBubblePauseMs("x".repeat(400), "paused")).toBe(BUBBLE_MAX_PAUSE_MS);
  });

  it("WhatsApp separa por [[SPLIT]] con máximo 4 burbujas; widget no usa splits", () => {
    const out = "a[[SPLIT]]b[[SPLIT]]c[[SPLIT]]d[[SPLIT]]e";
    const wa = splitIntoBubbles(out, "whatsapp");
    expect(wa).toHaveLength(4);
    expect(wa[3]).toContain("e");
    expect(splitIntoBubbles(out, "web_widget")).toHaveLength(1);
    expect(splitIntoBubbles(out, "email")).toHaveLength(1);
  });

  it("un fallo de burbuja no bloquea el resto del turno", async () => {
    const sent: string[] = [];
    const send = vi.fn(async (b: string, i: number) => {
      if (i === 1) throw new Error("falla canal");
      sent.push(b);
    });
    const sleep = vi.fn(async () => undefined);
    const report = await deliverBubbles({
      bubbles: ["uno", "dos", "tres"],
      channel: "whatsapp",
      send,
      sleep,
    });
    expect(report).toMatchObject({ sent: 2, failed: 1 });
    expect(sent).toEqual(["uno", "tres"]);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("el widget no aplica pausas", async () => {
    const sleep = vi.fn(async () => undefined);
    await deliverBubbles({ bubbles: ["a", "b"], channel: "web_widget", send: async () => undefined, sleep });
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("BOT-002 T-07 · Clasificador de leads", () => {
  it("acepta solo los 4 slugs y descarta salidas inválidas conservando la previa", () => {
    expect(resolveLeadLabel("lead-caliente", "lead-frio", false)).toMatchObject({ label: "lead-caliente", changed: true });
    expect(resolveLeadLabel("quizás tibio", "lead-frio", false)).toEqual({ label: "lead-frio", changed: false, discarded: true });
  });

  it("compra-realizada exige evidencia de registro", () => {
    expect(resolveLeadLabel("compra-realizada", "lead-caliente", false).discarded).toBe(true);
    expect(resolveLeadLabel("compra-realizada", "lead-caliente", true).label).toBe("compra-realizada");
  });

  it("limita la ventana a los últimos 10 turnos", () => {
    const turns = Array.from({ length: 15 }, (_, i) => ({ role: "user" as const, text: `t${i}` }));
    const win = selectClassifierWindow(turns);
    expect(win).toHaveLength(10);
    expect(win[0]!.text).toBe("t5");
  });
});

