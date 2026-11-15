import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { aiModels, botPresets, botTones } from "../db/schemas/admin/bot-catalog";
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
