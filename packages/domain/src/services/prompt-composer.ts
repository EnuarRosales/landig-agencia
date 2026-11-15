import { ok, err, type Result } from "../types/result";
import type { PromptBlockKey } from "../db/schemas/admin/bot-prompt-blocks";

/** Idioma soportado por la composición. */
export type PromptLocale = "es" | "en";

/** Bloque activo de plataforma con su versión (se registra por turno, RF-06.2). */
export interface ActivePromptBlock {
  blockKey: PromptBlockKey;
  version: number;
  content: { es: string; en: string };
}

/** Escalón de precio por cantidad del producto activo. */
export interface PromptPriceTier {
  minQty: number;
  priceCents: number;
  isRecommended?: boolean;
}

/** Regla de activación por orden para un audio asociado al producto (SPEC-19 D-02). */
export interface PromptAudioTriggerRule {
  order: number;
  label: string;
  trigger: string;
}

/** Producto en foco; solo este producto entra al prompt (BOT-002 §1.2, SPEC-19 D-02). */
export interface PromptProduct {
  id: string;
  name: string;
  benefits: string[];
  priceCents: number;
  currency: string;
  tiers: PromptPriceTier[];
  mediaTerm?: string | null;
  keywords?: string[];
  audioRules?: PromptAudioTriggerRule[];
  /**
   * Prompt Maestro de Comercialización del Producto bajo metodología IDEAL (`product.bot_master_prompt`).
   * Regula exclusivamente las condiciones explícitas de venta de este artículo.
   */
  botMasterPrompt?: string | null;
  faqs?: Array<{ question: string; answer: string }>;
}

/** Contexto comercial del negocio (client_business_info + transportadoras + reglas + Prompt General IDEAL). */
export interface PromptBusinessContext {
  paymentMethods: string[];
  returnsPolicy?: string | null;
  warrantyPolicy?: string | null;
  shippingPolicy?: string | null;
  faqs: Array<{ question: string; answer: string }>;
  carriers: string[];
  deliveryRules: Array<{ city: string | null; days: string }>;
  orderMessage?: string | null;
  closingMessage?: string | null;
  socialLinks?: string[];
  /**
   * Prompt General de Operación del Cliente (`bot.client_general_prompt`, SPEC-19 D-02).
   * Instruye al bot sobre las reglas transversales del comercio sin acoplar productos individuales.
   */
  clientGeneralPrompt?: string | null;
}

/** Memoria RAG del contacto: ficha viva más hasta 3 episodios. */
export interface PromptContactMemory {
  profile?: string | null;
  episodes: string[];
}

/** Entrada completa de composición por turno. */
export interface ComposePromptInput {
  locale: PromptLocale;
  blocks: ActivePromptBlock[];
  businessName: string;
  botName: string;
  objective: string;
  tone: string;
  persona?: string | null;
  greeting?: string | null;
  business: PromptBusinessContext;
  product?: PromptProduct | null;
  memory?: PromptContactMemory | null;
  isFirstTurn: boolean;
  /** Variables de estado compactas (ciudad, nombre, cantidad, etapa). */
  state?: Record<string, string | number | null | undefined>;
  /** Tope aproximado de tokens (O-04). */
  maxPromptTokens?: number;
}

/** Resultado de la composición. */
export interface ComposedPrompt {
  prompt: string;
  usedBlocks: Array<{ blockKey: PromptBlockKey; version: number }>;
  estimatedTokens: number;
}

/** Receta canónica de composición (D-06): el orden no lo configura el inquilino. */
const RECIPE: PromptBlockKey[] = [
  "core.identity",
  "core.personality",
  "core.greeting",
  "core.media",
  "core.splits",
  "core.order_flow",
  "core.closing",
  "core.format",
];

/** Tope por defecto de tokens del prompt compuesto. */
export const DEFAULT_MAX_PROMPT_TOKENS = 6000;

/**
 * Estima tokens con la heurística de 4 caracteres por token.
 *
 * @param text Texto a medir.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Sustituye `{{variable}}` por su valor; las faltantes se vacían. */
function interpolate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatMoney(cents: number, currency: string, locale: PromptLocale): string {
  const amount = (cents / 100).toLocaleString(locale === "es" ? "es-CO" : "en-US", {
    maximumFractionDigits: 0,
  });
  return `${amount} ${currency}`;
}

function renderBusiness(b: PromptBusinessContext, locale: PromptLocale): string {
  const t =
    locale === "es"
      ? {
          pay: "Métodos de pago",
          ret: "Devoluciones",
          war: "Garantía",
          shp: "Política de envíos",
          car: "Transportadoras (no menciones otras)",
          del: "Tiempos de entrega",
          rest: "Resto del país",
          faq: "Preguntas frecuentes",
          gen: "Directivas Generales de Operación del Comercio (IDEAL)",
        }
      : {
          pay: "Payment methods",
          ret: "Returns",
          war: "Warranty",
          shp: "Shipping policy",
          car: "Carriers (never mention others)",
          del: "Delivery times",
          rest: "Rest of country",
          faq: "FAQs",
          gen: "General Store Operation Guidelines (IDEAL)",
        };
  const lines: string[] = [];
  if (b.paymentMethods.length) lines.push(`${t.pay}: ${b.paymentMethods.join(", ")}`);
  if (b.returnsPolicy) lines.push(`${t.ret}: ${b.returnsPolicy}`);
  if (b.warrantyPolicy) lines.push(`${t.war}: ${b.warrantyPolicy}`);
  if (b.shippingPolicy) lines.push(`${t.shp}: ${b.shippingPolicy}`);
  if (b.carriers.length) lines.push(`${t.car}: ${b.carriers.join(", ")}`);
  for (const rule of b.deliveryRules) {
    lines.push(`${t.del} ${rule.city ?? t.rest}: ${rule.days}`);
  }
  for (const faq of b.faqs) lines.push(`${t.faq} · ${faq.question} → ${faq.answer}`);
  if (b.clientGeneralPrompt && b.clientGeneralPrompt.trim().length > 0) {
    lines.push(`${t.gen}:\n${b.clientGeneralPrompt.trim()}`);
  }
  return lines.join("\n");
}

function renderProduct(p: PromptProduct, locale: PromptLocale): string {
  const es = locale === "es";
  const lines: string[] = [`${es ? "Producto activo" : "Active product"}: ${p.name}`];
  lines.push(`${es ? "Precio" : "Price"}: ${formatMoney(p.priceCents, p.currency, locale)}`);
  for (const tier of [...p.tiers].sort((a, b) => a.minQty - b.minQty)) {
    const mark = tier.isRecommended ? (es ? " (recomendado)" : " (recommended)") : "";
    lines.push(
      `${es ? "Desde" : "From"} ${tier.minQty} ${es ? "unidades" : "units"}: ${formatMoney(tier.priceCents, p.currency, locale)}${mark}`,
    );
  }
  if (p.benefits.length) {
    lines.push(`${es ? "Beneficios" : "Benefits"}: ${p.benefits.join("; ")}`);
  }
  if (p.keywords && p.keywords.length > 0) {
    lines.push(`${es ? "Palabras clave" : "Keywords"}: ${p.keywords.join(", ")}`);
  }
  if (p.mediaTerm) lines.push(`[[MEDIA:${p.mediaTerm}]]`);
  if (p.audioRules && p.audioRules.length > 0) {
    for (const ar of p.audioRules) {
      const term = p.mediaTerm ?? p.name;
      lines.push(
        `${es ? "Audio orden" : "Audio order"} ${ar.order} (${ar.label}): [[MEDIA:${term}:audio:${ar.order}]] -> ${ar.trigger}`,
      );
    }
  }
  for (const faq of p.faqs ?? []) lines.push(`FAQ · ${faq.question} → ${faq.answer}`);
  if (p.botMasterPrompt && p.botMasterPrompt.trim().length > 0) {
    lines.push(
      `${es ? "Condiciones Explícitas de Comercialización del Producto (IDEAL)" : "Explicit Product Commercialization Conditions (IDEAL)"}:\n${p.botMasterPrompt.trim()}`,
    );
  }
  return lines.join("\n");
}

function renderState(state: ComposePromptInput["state"], locale: PromptLocale): string {
  if (!state) return "";
  const entries = Object.entries(state).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return "";
  return `${locale === "es" ? "Estado de la conversación" : "Conversation state"}: ${entries.map(([k, v]) => `${k}=${v}`).join(", ")}`;
}

/**
 * Compone el prompt del turno en 3 planos desacoplados sin regenerar nada persistente (BOT-002 T-04, SPEC-19 D-02).
 *
 * Aplica la receta canónica:
 * 1. Plano 1 (Estructura técnica de plataforma): identidad → personalidad → saludo (primer turno) →
 *    multimedia/anti-caption → burbujas (`[[SPLIT]]`).
 * 2. Plano 2 (Operación General del Comercio): políticas, logística, pagos y `clientGeneralPrompt` IDEAL.
 * 3. Plano 3 (Producto en foco): precios, escalones, marcadores y `botMasterPrompt` IDEAL del artículo activo.
 * 4. Memoria contextual RAG → recopilación de pedido en un solo mensaje (Domicilio vs. Oficina) → cierre → formato.
 *
 * @returns `ok` con el prompt y las versiones usadas, o `err` si falta un bloque obligatorio
 * o se excede el tope de tokens.
 */
export function composePrompt(input: ComposePromptInput): Result<ComposedPrompt> {
  const byKey = new Map(input.blocks.map((b) => [b.blockKey, b]));
  const vars: Record<string, string> = {
    business_name: input.businessName,
    bot_name: input.botName,
    objective: input.objective,
    tone: input.tone,
    persona: input.persona ?? "",
    greeting: input.greeting ?? "",
    closing: input.business.closingMessage ?? "",
    social_links: (input.business.socialLinks ?? []).join(" "),
    order_message: input.business.orderMessage ?? "",
  };

  const required: PromptBlockKey[] = RECIPE.filter(
    (k) => k !== "core.greeting" || input.isFirstTurn,
  );
  const missing = required.filter((k) => !byKey.has(k));
  if (missing.length > 0) {
    return err(`Faltan bloques activos de plataforma: ${missing.join(", ")}.`, "PROMPT_BLOCKS_MISSING");
  }

  const used: ComposedPrompt["usedBlocks"] = [];
  const parts: string[] = [];
  const pushBlock = (key: PromptBlockKey): void => {
    const block = byKey.get(key);
    if (!block) return;
    used.push({ blockKey: key, version: block.version });
    parts.push(interpolate(block.content[input.locale], vars));
  };

  pushBlock("core.identity");
  pushBlock("core.personality");
  if (input.isFirstTurn) pushBlock("core.greeting");
  pushBlock("core.media");
  pushBlock("core.splits");

  const business = renderBusiness(input.business, input.locale);
  if (business) parts.push(business);
  if (input.product) parts.push(renderProduct(input.product, input.locale));

  const memoryBlock = byKey.get("core.contact_memory");
  if (memoryBlock && input.memory && (input.memory.profile || input.memory.episodes.length)) {
    used.push({ blockKey: "core.contact_memory", version: memoryBlock.version });
    const lines = [interpolate(memoryBlock.content[input.locale], vars)];
    if (input.memory.profile) lines.push(input.memory.profile);
    for (const ep of input.memory.episodes.slice(0, 3)) lines.push(`- ${ep}`);
    parts.push(lines.join("\n"));
  }

  pushBlock("core.order_flow");
  pushBlock("core.closing");
  pushBlock("core.format");

  const state = renderState(input.state, input.locale);
  if (state) parts.push(state);

  const prompt = parts.filter((p) => p.length > 0).join("\n\n");
  const estimatedTokens = estimateTokens(prompt);
  const limit = input.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS;
  if (estimatedTokens > limit) {
    return err(
      `El prompt compuesto (${estimatedTokens} tokens) excede el límite de ${limit}.`,
      "PROMPT_TOKEN_LIMIT_EXCEEDED",
    );
  }

  return ok({ prompt, usedBlocks: used, estimatedTokens });
}
