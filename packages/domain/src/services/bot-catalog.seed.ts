/**
 * Semilla canónica versionada del catálogo de gobernanza de IA y Bots (BOT-001 T-03).
 */

export const INITIAL_AI_PROVIDERS = [
  {
    code: "openai",
    name: "OpenAI",
    isActive: true,
    docsUrl: "https://platform.openai.com/docs",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 1,
  },
  {
    code: "anthropic",
    name: "Anthropic",
    isActive: true,
    docsUrl: "https://docs.anthropic.com",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 2,
  },
  {
    code: "google",
    name: "Google AI",
    isActive: true,
    docsUrl: "https://ai.google.dev/docs",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 3,
  },
  {
    code: "deepseek",
    name: "DeepSeek",
    isActive: true,
    docsUrl: "https://platform.deepseek.com",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 4,
  },
  {
    code: "openrouter",
    name: "OpenRouter",
    isActive: true,
    docsUrl: "https://openrouter.ai/docs",
    supportedModes: { byok: true, mocter: false },
    sortOrder: 5,
  },
  {
    code: "together_ai",
    name: "Together AI",
    isActive: true,
    docsUrl: "https://docs.together.ai",
    supportedModes: { byok: true, mocter: true },
    sortOrder: 6,
  },
] as const;

export const INITIAL_BOT_TONES = [
  {
    code: "cercano",
    labels: { es: "Cercano y empático", en: "Warm & empathetic" },
    description: {
      es: "Lenguaje cálido, amable y accesible para venta consultiva y fidelización.",
      en: "Friendly and approachable tone for conversational commerce.",
    },
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "formal",
    labels: { es: "Profesional y formal", en: "Professional & formal" },
    description: {
      es: "Respetuoso, corporativo y directo, ideal para servicios B2B.",
      en: "Corporate and respectful communication for B2B contexts.",
    },
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "entusiasta",
    labels: { es: "Entusiasta y enérgico", en: "Enthusiastic & vibrant" },
    description: {
      es: "Dinámico y motivador, optimizado para promociones y retail.",
      en: "Dynamic and motivating tone, ideal for consumer promotions.",
    },
    isActive: true,
    sortOrder: 3,
  },
  {
    code: "conciso",
    labels: { es: "Conciso y resolutivo", en: "Concise & direct" },
    description: {
      es: "Respuestas breves y al grano enfocadas en resolver rápido.",
      en: "Short and actionable answers focused on high resolution speed.",
    },
    isActive: true,
    sortOrder: 4,
  },
] as const;

export const INITIAL_CHATWOOT_CHANNEL_TYPES = [
  {
    code: "website",
    labels: { es: "Widget Web (Livechat)", en: "Website Livechat" },
    provisioning: "api",
    notes: {
      es: "Aprovisionamiento nativo inmediato mediante API de Chatwoot.",
      en: "Direct provisioning via Chatwoot API.",
    },
    isAdmissible: true,
    sortOrder: 1,
  },
  {
    code: "whatsapp_cloud",
    labels: { es: "WhatsApp Cloud API", en: "WhatsApp Cloud API" },
    provisioning: "oauth",
    notes: {
      es: "Conexión mediada por flujo Meta Business en Chatwoot.",
      en: "Meta Business OAuth flow mediated by Chatwoot.",
    },
    isAdmissible: true,
    sortOrder: 2,
  },
  {
    code: "whatsapp_twilio",
    labels: { es: "WhatsApp vía Twilio", en: "WhatsApp via Twilio" },
    provisioning: "oauth",
    notes: {
      es: "Configuración de credenciales Twilio en Chatwoot.",
      en: "Twilio credentials configuration in Chatwoot.",
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

