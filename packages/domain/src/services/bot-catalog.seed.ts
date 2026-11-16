import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { aiModels, botPresets, botTones } from "../db/schemas/admin/bot-catalog";
import type {
  BotDefaultMessageKey,
  TenantBotDefaultMessages,
  TenantBusinessHours,
} from "../db/schemas/admin/bot-tenancy";
import { getCountryAddressProfile } from "../geo/index";
import { appLogger } from "../utils/logger";

type DrizzleClient = ReturnType<typeof getDb>;

export const INITIAL_AI_PROVIDERS = [
  {
    code: "openai",
    name: "OpenAI",
    apiDialect: "openai_compatible" as const,
    baseUrl: "https://api.openai.com/v1",
    verifyPath: "/models",
    isActive: true,
    docsUrl: "https://platform.openai.com/docs",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 1,
  },
  {
    code: "anthropic",
    name: "Anthropic",
    apiDialect: "anthropic" as const,
    baseUrl: "https://api.anthropic.com/v1",
    verifyPath: "/models",
    isActive: true,
    docsUrl: "https://docs.anthropic.com",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 2,
  },
  {
    code: "google",
    name: "Google AI",
    apiDialect: "google_gemini" as const,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    verifyPath: "/models",
    isActive: true,
    docsUrl: "https://ai.google.dev/docs",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 3,
  },
  {
    code: "deepseek",
    name: "DeepSeek",
    apiDialect: "openai_compatible" as const,
    baseUrl: "https://api.deepseek.com/v1",
    verifyPath: "/models",
    isActive: true,
    docsUrl: "https://platform.deepseek.com",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 4,
  },
  {
    code: "openrouter",
    name: "OpenRouter",
    apiDialect: "openai_compatible" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    verifyPath: "/auth/key",
    isActive: true,
    docsUrl: "https://openrouter.ai/docs",
    supportedModes: { byok: true, mocter: false },
    sortOrder: 5,
  },
  {
    code: "together_ai",
    name: "Together AI",
    apiDialect: "openai_compatible" as const,
    baseUrl: "https://api.together.xyz/v1",
    verifyPath: "/models",
    isActive: true,
    docsUrl: "https://docs.together.ai",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 6,
  },
] as const;

export const INITIAL_CHATWOOT_CHANNEL_TYPES = [
  {
    code: "website",
    labels: { es: "Widget Web (Livechat)", en: "Website Livechat" },
    provisioning: "api",
    notes: {
      es: "Aprovisionamiento nativo inmediato mediante API de mensajería.",
      en: "Direct provisioning via messaging API.",
    },
    isAdmissible: true,
    sortOrder: 1,
  },
  {
    code: "whatsapp_cloud",
    labels: { es: "WhatsApp Cloud API", en: "WhatsApp Cloud API" },
    provisioning: "oauth",
    notes: {
      es: "Conexión mediada por flujo Meta Business.",
      en: "Meta Business OAuth flow.",
    },
    isAdmissible: true,
    sortOrder: 2,
  },
  {
    code: "whatsapp_twilio",
    labels: { es: "WhatsApp vía Twilio", en: "WhatsApp via Twilio" },
    provisioning: "oauth",
    notes: {
      es: "Configuración de credenciales Twilio.",
      en: "Twilio credentials configuration.",
    },
    isAdmissible: true,
    sortOrder: 3,
  },
  {
    code: "instagram",
    labels: { es: "Instagram Direct", en: "Instagram Direct" },
    provisioning: "oauth",
    notes: {
      es: "Vinculación OAuth con página de Facebook asociada a Instagram.",
      en: "OAuth linking via Facebook Page associated with Instagram.",
    },
    isAdmissible: true,
    sortOrder: 4,
  },
  {
    code: "facebook",
    labels: { es: "Facebook Messenger", en: "Facebook Messenger" },
    provisioning: "oauth",
    notes: {
      es: "Vinculación OAuth con página de Facebook.",
      en: "OAuth linking via Facebook Page.",
    },
    isAdmissible: true,
    sortOrder: 5,
  },
  {
    code: "telegram",
    labels: { es: "Telegram Bot", en: "Telegram Bot" },
    provisioning: "oauth",
    notes: {
      es: "Aprovisionamiento mediante token de BotFather.",
      en: "Provisioning using BotFather bot token.",
    },
    isAdmissible: true,
    sortOrder: 6,
  },
  {
    code: "email",
    labels: { es: "Bandeja de Correo Electrónico", en: "Email Inbox" },
    provisioning: "api",
    notes: {
      es: "Canal de soporte por correo vía reenvío o IMAP/SMTP.",
      en: "Email support channel via forwarding or IMAP/SMTP.",
    },
    isAdmissible: true,
    sortOrder: 7,
  },
  {
    code: "api",
    labels: { es: "Canal API Personalizado", en: "Custom API Channel" },
    provisioning: "api",
    notes: {
      es: "Integración programática mediante Webhooks.",
      en: "Programmatic integration via webhooks.",
    },
    isAdmissible: true,
    sortOrder: 8,
  },
] as const;

export const INITIAL_BOT_DEFAULTS = {
  defaultMaxTurns: 10,
  defaultAnswerPolicy: "solo_conocimiento",
  defaultHandoffTriggers: ["asesor", "humano", "reclamo", "queja", "agente"],
  defaultResponseLanguageBehavior: "match_contact",
  greetingMessageKey: "bot.default_greeting",
  fallbackMessageKey: "bot.default_fallback",
  defaultMaxMessagesPerContact: 50,
  version: 1,
} as const;

export interface SeedBotToneDefinition {
  code: string;
  labels: { es: string; en: string };
  description: { es: string; en: string };
  sortOrder: number;
}

export interface SeedBotPresetDefinition {
  code: string;
  labels: { es: string; en: string };
  preferredModelIds: string[];
  temperature: string;
  maxTokens: number;
  recommendedFor: { es: string; en: string };
  sortOrder: number;
}

/**
 * Catálogo inicial de tonos comunicacionales para asistentes virtuales (`SPEC-06 D-02`, `BOT-001 §4.1`).
 */
export const INITIAL_BOT_TONES: SeedBotToneDefinition[] = [
  {
    code: "friendly_close",
    labels: { es: "Cercano y Amigable", en: "Warm and Friendly" },
    description: {
      es: "Trato cálido, empático y conversacional orientado a generar confianza rápida.",
      en: "Warm, empathetic, conversational style focused on quick trust building.",
    },
    sortOrder: 1,
  },
  {
    code: "professional_clear",
    labels: { es: "Profesional y Directo", en: "Professional and Direct" },
    description: {
      es: "Respuestas claras, respetuosas y estructuradas sin rodeos innecesarios.",
      en: "Clear, respectful, and structured answers without unnecessary filler.",
    },
    sortOrder: 2,
  },
  {
    code: "consultative_expert",
    labels: { es: "Consultivo y Experto", en: "Consultative and Expert" },
    description: {
      es: "Guía al cliente con recomendaciones comparativas basadas en necesidades.",
      en: "Guides customers with tailored comparative recommendations.",
    },
    sortOrder: 3,
  },
  {
    code: "dynamic_commercial",
    labels: { es: "Dinámico y Comercial", en: "Dynamic and Persuasive" },
    description: {
      es: "Enfocado en resaltar beneficios clave y agilizar el cierre del pedido.",
      en: "Focused on highlighting key benefits and speeding up order closing.",
    },
    sortOrder: 4,
  },
];

/**
 * Presets base de asistente virtual vinculados a modelos activos de `admin.ai_models` (`SPEC-06 D-02`).
 */
export const INITIAL_BOT_PRESETS: SeedBotPresetDefinition[] = [
  {
    code: "quick_sales",
    labels: { es: "Ventas Rápidas", en: "Fast Sales" },
    preferredModelIds: ["gpt-4o-mini", "gemini-1.5-flash", "openai/gpt-4o-mini"],
    temperature: "0.4",
    maxTokens: 700,
    recommendedFor: {
      es: "Catálogos ágiles que buscan responder precios, disponibilidad y cerrar pedidos en pocos turnos.",
      en: "Fast-moving catalogs focused on pricing, stock answers, and quick checkout.",
    },
    sortOrder: 1,
  },
  {
    code: "consultative_advisor",
    labels: { es: "Asesor Consultivo", en: "Consultative Advisor" },
    preferredModelIds: ["gpt-4o", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    temperature: "0.6",
    maxTokens: 1100,
    recommendedFor: {
      es: "Productos técnicos o servicios que requieren orientación comparativa antes de comprar.",
      en: "Technical products or services needing comparative guidance before purchase.",
    },
    sortOrder: 2,
  },
  {
    code: "support_booking",
    labels: { es: "Soporte y Reservas", en: "Support and Bookings" },
    preferredModelIds: ["claude-3-5-haiku-20241022", "gpt-4o-mini", "deepseek-chat"],
    temperature: "0.3",
    maxTokens: 800,
    recommendedFor: {
      es: "Atención postventa, seguimiento de pedidos y agendamiento preciso con baja variabilidad.",
      en: "Post-sale support, order tracking, and accurate scheduling with low variance.",
    },
    sortOrder: 3,
  },
];

/**
 * Objetivos comerciales predefinidos para el selector del Paso 4 de onboarding (`SPEC-06 ONB-09`).
 */
export const BOT_OBJECTIVE_OPTIONS = [
  {
    code: "close_whatsapp_sales",
    labels: {
      es: "Vender productos y cerrar pedidos por chat",
      en: "Sell products and close orders via chat",
    },
  },
  {
    code: "qualify_leads",
    labels: {
      es: "Calificar clientes potenciales y agendar contacto",
      en: "Qualify leads and schedule follow-up",
    },
  },
  {
    code: "customer_support_faq",
    labels: {
      es: "Resolver dudas frecuentes y guiar compras",
      en: "Answer FAQs and guide customer purchases",
    },
  },
] as const;

/**
 * Siembra de forma idempotente `admin.bot_tones` y `admin.bot_presets` cuando aún no existen registros activos.
 * Garantiza disponibilidad inmediata tanto en `/onboarding` como en `/admin/ai`.
 */
export async function ensureDefaultBotCatalogSeeded(dbClient?: DrizzleClient): Promise<void> {
  const db = dbClient ?? getDb();

  try {
    for (const tone of INITIAL_BOT_TONES) {
      await db
        .insert(botTones)
        .values({
          code: tone.code,
          labels: tone.labels,
          description: tone.description,
          isActive: true,
          sortOrder: tone.sortOrder,
          createdBy: "system.seed",
          updatedBy: "system.seed",
        })
        .onConflictDoNothing({ target: botTones.code });
    }

    const activeModels = await db
      .select({ id: aiModels.id, modelId: aiModels.modelId })
      .from(aiModels)
      .where(eq(aiModels.isActive, true));

    if (activeModels.length === 0) {
      return;
    }

    for (const preset of INITIAL_BOT_PRESETS) {
      let resolvedModelId: string | undefined;
      for (const candidateCode of preset.preferredModelIds) {
        const match = activeModels.find((m: { id: string; modelId: string }) => m.modelId === candidateCode);
        if (match) {
          resolvedModelId = match.id;
          break;
        }
      }
      if (!resolvedModelId) {
        resolvedModelId = activeModels[0]?.id;
      }
      if (!resolvedModelId) continue;

      await db
        .insert(botPresets)
        .values({
          code: preset.code,
          labels: preset.labels,
          modelId: resolvedModelId,
          temperature: preset.temperature,
          maxTokens: preset.maxTokens,
          recommendedFor: preset.recommendedFor,
          isActive: true,
          sortOrder: preset.sortOrder,
          createdBy: "system.seed",
          updatedBy: "system.seed",
        })
        .onConflictDoNothing({ target: botPresets.code });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.warn(`[ensureDefaultBotCatalogSeeded] No se pudo sembrar catálogo base de IA: ${msg}`);
  }
}

/**
 * Plantillas predeterminadas para los 6 mensajes clave del asistente (`SPEC-10 §7.1`, `SPEC-20`).
 */
export const DEFAULT_BOT_MESSAGES_BY_LOCALE: Record<
  "es" | "en",
  Record<BotDefaultMessageKey, string>
> = {
  es: {
    welcome:
      "¡Hola {{customer_name}}! Qué gusto saludarte en {{business_name}}. ¿En qué producto o pedido te puedo asesorar hoy?",
    order_confirmation:
      "¡Pedido {{order_number}} registrado, {{customer_name}}! Confirmamos tu contacto ({{customer_phone}}). {{payment_instructions}} {{shipping_summary}}",
    dispatch_tracking:
      "¡Buenas noticias, {{customer_name}}! Tu pedido {{order_number}} ya fue despachado con {{carrier_name}}. Número de guía: {{tracking_code}}.",
    delivery_issue:
      "Hola {{customer_name}}, detectamos una novedad en la entrega de tu pedido {{order_number}} ({{carrier_name}}). Confírmanos un punto de referencia adicional para solucionarlo hoy mismo.",
    out_of_hours:
      "¡Hola {{customer_name}}! En este momento estamos fuera de nuestro horario habitual de atención en {{business_name}}. Déjanos tu consulta y un asesor te responderá a primera hora.",
    handoff:
      "Con mucho gusto, {{customer_name}}. Estoy transfiriendo tu conversación a un asesor humano de {{business_name}} para darte atención personalizada en breve.",
  },
  en: {
    welcome:
      "Hi {{customer_name}}! Welcome to {{business_name}}. Which product or order can I help you with today?",
    order_confirmation:
      "Order {{order_number}} registered, {{customer_name}}! Confirmed contact: {{customer_phone}}. {{payment_instructions}} {{shipping_summary}}",
    dispatch_tracking:
      "Great news, {{customer_name}}! Your order {{order_number}} has shipped via {{carrier_name}}. Tracking code: {{tracking_code}}.",
    delivery_issue:
      "Hi {{customer_name}}, we noticed a delivery update on your order {{order_number}} ({{carrier_name}}). Please share an additional landmark so we can resolve it quickly.",
    out_of_hours:
      "Hi {{customer_name}}! You reached {{business_name}} outside our regular business hours. Leave your message here and an advisor will reply first thing.",
    handoff:
      "Gladly, {{customer_name}}. I am handing your conversation over to a human specialist at {{business_name}} so you receive personalized assistance shortly.",
  },
};

/**
 * Construye la estructura completa `default_messages` hidratando un mensaje heredado opcional de pedido.
 */
export function buildDefaultTenantBotMessages(
  locale: string = "es",
  legacyOrderMessage?: string | null,
): TenantBotDefaultMessages {
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "es";
  const templates = DEFAULT_BOT_MESSAGES_BY_LOCALE[lang];
  const nowIso = new Date().toISOString();
  const orderBody = legacyOrderMessage?.trim()
    ? legacyOrderMessage.trim()
    : templates.order_confirmation;

  return {
    welcome: { body: templates.welcome, enabled: true, updatedAt: nowIso },
    order_confirmation: { body: orderBody, enabled: true, updatedAt: nowIso },
    dispatch_tracking: { body: templates.dispatch_tracking, enabled: true, updatedAt: nowIso },
    delivery_issue: { body: templates.delivery_issue, enabled: true, updatedAt: nowIso },
    out_of_hours: { body: templates.out_of_hours, enabled: true, updatedAt: nowIso },
    handoff: { body: templates.handoff, enabled: true, updatedAt: nowIso },
  };
}

/**
 * Genera el horario comercial predeterminado derivando la zona horaria desde `clients.timezone` / `clients.country_code` (`SPEC-10` + `SPEC-20`).
 */
export function buildDefaultBusinessHours(params?: {
  countryCode?: string | null;
  timezone?: string | null;
}): TenantBusinessHours {
  const profile = getCountryAddressProfile(params?.countryCode);
  const timezone = params?.timezone?.trim() || profile.defaultTimezone || "UTC";

  return {
    timezone,
    enabled: false,
    schedule: {
      mon: { open: "08:00", close: "18:00", closed: false },
      tue: { open: "08:00", close: "18:00", closed: false },
      wed: { open: "08:00", close: "18:00", closed: false },
      thu: { open: "08:00", close: "18:00", closed: false },
      fri: { open: "08:00", close: "18:00", closed: false },
      sat: { open: "09:00", close: "14:00", closed: false },
      sun: { open: "09:00", close: "14:00", closed: true },
    },
  };
}

/**
 * Definición unificada de etiquetas predeterminadas (`SPEC-10` operacionales + `SPEC-19` funcionales)
 * para inicialización idempotente en `cell_tenant_labels` y Chatwoot.
 */
export interface SeedDefaultTenantLabel {
  title: string;
  description: string;
  color: string;
  showOnSidebar: boolean;
  origin: "mocter_default";
  category: "operational" | "functional";
  activationRule: string;
  sideEffects: string;
}

export const BOT_DEFAULT_LABELS_SEED: readonly SeedDefaultTenantLabel[] = [
  // Etiquetas funcionales de embudo (SPEC-19)
  {
    title: "lead-frio",
    description: "Prospecto inicial explorando información general sin intención clara.",
    color: "#64748B",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "functional",
    activationRule: "Conversación recién iniciada o preguntas genéricas sin consulta de precio o envío.",
    sideEffects: "Solo clasificación en embudo; el bot continúa atención normal.",
  },
  {
    title: "lead-tibio",
    description: "Prospecto consultando precio, disponibilidad o condiciones comerciales.",
    color: "#F59E0B",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "functional",
    activationRule: "El cliente solicita precios, variantes, tiempos de envío o beneficios de un producto.",
    sideEffects: "Priorizar respuesta persuasiva orientada a resolver objeciones.",
  },
  {
    title: "lead-caliente",
    description: "Prospecto con alta intención de compra solicitando cerrar el pedido.",
    color: "#EF4444",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "functional",
    activationRule: "El cliente confirma interés de compra o pide medios de pago/formulario de datos.",
    sideEffects: "Activar captura guiada de pedido en un único mensaje.",
  },
  {
    title: "compra-realizada",
    description: "Cliente con pedido registrado o confirmado exitosamente.",
    color: "#10B981",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "functional",
    activationRule: "Asignar únicamente cuando el pedido haya quedado registrado en sistema.",
    sideEffects: "Cerrar flujo de venta y habilitar seguimiento postventa.",
  },
  {
    title: "devolucion",
    description: "Solicitud de garantía, cambio o devolución sobre un pedido previo.",
    color: "#8B5CF6",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "functional",
    activationRule: "El cliente reporta inconformidad o solicita cambio, retracto o garantía.",
    sideEffects: "Evaluar transferencia a asesor humano si supera políticas estándar.",
  },
  // Etiquetas operativas de ciclo comercial y atención (SPEC-10 §7.3)
  {
    title: "nuevo_pedido",
    description: "Conversación asociada a un pedido recién capturado pendiente de gestión.",
    color: "#2563EB",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Pedido recién creado por bot o agente pendiente de validación comercial.",
    sideEffects: "Visible en cola operativa de pedidos nuevos.",
  },
  {
    title: "pendiente_pago",
    description: "Pedido registrado esperando comprobante o confirmación de pago.",
    color: "#D97706",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Pedido con pago pendiente por transferencia, enlace o contraentrega por confirmar.",
    sideEffects: "Habilita seguimiento de recaudo antes de despacho.",
  },
  {
    title: "pagado",
    description: "Pago verificado y aprobado listo para alistamiento y despacho.",
    color: "#16A34A",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Pago confirmado manualmente o por pasarela sin saldo pendiente.",
    sideEffects: "Autoriza preparación logística.",
  },
  {
    title: "despachado",
    description: "Pedido entregado a transportadora con número de guía asignado.",
    color: "#0EA5E9",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Orden con guía de seguimiento activa y notificación de despacho.",
    sideEffects: "Activa atención de consultas de rastreo.",
  },
  {
    title: "soporte_humano",
    description: "Conversación escalada que requiere intervención de asesor humano.",
    color: "#DC2626",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Cliente pide hablar con asesor o se dispara trigger de escalamiento.",
    sideEffects: "Pausa respuestas automáticas y notifica al equipo.",
  },
  {
    title: "cliente_recurrente",
    description: "Cliente con historial previo de compras verificadas en el comercio.",
    color: "#7C3AED",
    showOnSidebar: true,
    origin: "mocter_default",
    category: "operational",
    activationRule: "Contacto con más de un pedido confirmado en el historial CRM.",
    sideEffects: "Habilita trato preferencial y atención ágil.",
  },
] as const;
