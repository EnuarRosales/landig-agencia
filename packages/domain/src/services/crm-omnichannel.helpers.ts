/**
 * Constantes, tipos y helpers puros de omnicanalidad y ventana WhatsApp 24h para CRM (`SPEC-09`).
 *
 * Módulos sin efectos secundarios ni acceso a BD; reutilizables en dominio, rutas API y UI cliente.
 */

export const CONTACT_SOURCES = [
  "whatsapp",
  "instagram",
  "facebook",
  "web",
  "telegram",
  "email",
  "sms",
  "manual",
  "referral",
  "import",
  "api",
  "other",
] as const;

export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const CONTACT_STAGES = [
  "new",
  "in_conversation",
  "qualified",
  "customer",
  "discarded",
] as const;

export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CONTACT_DOCUMENT_TYPES = [
  "CC",
  "NIT",
  "CE",
  "PASSPORT",
  "other",
] as const;

export type ContactDocumentType = (typeof CONTACT_DOCUMENT_TYPES)[number];

export const CONTACT_CHANNELS = [
  "whatsapp_cloud",
  "whatsapp_twilio",
  "whatsapp",
  "instagram",
  "facebook",
  "website",
  "telegram",
  "email",
  "sms",
  "api",
  "line",
  "manual",
  "other",
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONSENT_PURPOSES = ["data_treatment", "commercial_comms"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_CHANNELS = [
  "whatsapp_buttons",
  "web_form",
  "manual",
  "import",
] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const WHATSAPP_WINDOW_SECONDS = 24 * 60 * 60;
const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WhatsappWindowStatus = "active" | "expired" | "none";

/**
 * Estado calculado en tiempo real de la ventana gratuita de atención de 24h de WhatsApp Cloud API.
 */
export interface WhatsappWindowInfo {
  status: WhatsappWindowStatus;
  expiresAt: string | null;
  remainingSeconds: number;
}

/**
 * Resultado normalizado de mapeo de un canal Chatwoot a origen (`source`) y canal omnicanal (`channel`).
 */
export interface NormalizedChatwootChannel {
  source: ContactSource;
  channel: string;
  isWhatsapp: boolean;
}

/**
 * Calcula de forma determinista el estado de la ventana de 24 horas de WhatsApp
 * exclusivamente a partir del último mensaje entrante por WhatsApp (`RN-SPEC-09-01`).
 */
export function computeWhatsappWindow(
  lastWhatsappInboundAt: Date | string | null | undefined,
  now: Date = new Date(),
): WhatsappWindowInfo {
  if (!lastWhatsappInboundAt) {
    return {
      status: "none",
      expiresAt: null,
      remainingSeconds: 0,
    };
  }

  const inboundDate =
    lastWhatsappInboundAt instanceof Date
      ? lastWhatsappInboundAt
      : new Date(lastWhatsappInboundAt);

  if (Number.isNaN(inboundDate.getTime())) {
    return {
      status: "none",
      expiresAt: null,
      remainingSeconds: 0,
    };
  }

  const expiresMs = inboundDate.getTime() + WHATSAPP_WINDOW_SECONDS * 1000;
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresMs - now.getTime()) / 1000),
  );

  return {
    status: remainingSeconds > 0 ? "active" : "expired",
    expiresAt: new Date(expiresMs).toISOString(),
    remainingSeconds,
  };
}

/**
 * Determina si un código de canal corresponde al ecosistema WhatsApp.
 */
export function isWhatsappChannel(channel?: string | null): boolean {
  if (!channel) return false;
  const normalized = channel.trim().toLowerCase();
  return (
    normalized === "whatsapp" ||
    normalized === "whatsapp_cloud" ||
    normalized === "whatsapp_twilio" ||
    normalized === "channel::whatsapp" ||
    normalized.includes("whatsapp")
  );
}

/**
 * Normaliza `channel_type` de Chatwoot (`Channel::Whatsapp`, `Channel::Instagram`, etc.)
 * hacia el par canónico `{ source, channel, isWhatsapp }` para almacenamiento omnicanal.
 */
export function normalizeChatwootChannel(
  rawChannel?: string | null,
): NormalizedChatwootChannel {
  const raw = (rawChannel ?? "").trim().toLowerCase();

  if (!raw || raw === "whatsapp" || raw === "whatsapp_cloud" || raw === "channel::whatsapp") {
    return { source: "whatsapp", channel: "whatsapp_cloud", isWhatsapp: true };
  }
  if (raw === "whatsapp_twilio" || raw === "channel::twilio_whatsapp") {
    return { source: "whatsapp", channel: "whatsapp_twilio", isWhatsapp: true };
  }
  if (raw === "instagram" || raw === "channel::instagram") {
    return { source: "instagram", channel: "instagram", isWhatsapp: false };
  }
  if (raw === "facebook" || raw === "channel::facebookpage" || raw === "channel::facebook_page") {
    return { source: "facebook", channel: "facebook", isWhatsapp: false };
  }
  if (raw === "website" || raw === "web" || raw === "channel::webwidget" || raw === "channel::web_widget") {
    return { source: "web", channel: "website", isWhatsapp: false };
  }
  if (raw === "telegram" || raw === "channel::telegram") {
    return { source: "telegram", channel: "telegram", isWhatsapp: false };
  }
  if (raw === "email" || raw === "channel::email") {
    return { source: "email", channel: "email", isWhatsapp: false };
  }
  if (raw === "sms" || raw === "channel::sms" || raw === "channel::twiliosms") {
    return { source: "sms", channel: "sms", isWhatsapp: false };
  }
  if (raw === "api" || raw === "channel::api") {
    return { source: "api", channel: "api", isWhatsapp: false };
  }
  if (raw === "line" || raw === "channel::line") {
    return { source: "other", channel: "line", isWhatsapp: false };
  }
  if (raw.includes("whatsapp")) {
    return { source: "whatsapp", channel: "whatsapp_cloud", isWhatsapp: true };
  }
  if (raw.includes("instagram")) {
    return { source: "instagram", channel: "instagram", isWhatsapp: false };
  }
  if (raw.includes("facebook")) {
    return { source: "facebook", channel: "facebook", isWhatsapp: false };
  }
  if (raw.includes("web")) {
    return { source: "web", channel: "website", isWhatsapp: false };
  }
  if (raw.includes("telegram")) {
    return { source: "telegram", channel: "telegram", isWhatsapp: false };
  }
  if (raw.includes("email")) {
    return { source: "email", channel: "email", isWhatsapp: false };
  }
  if (raw.includes("sms")) {
    return { source: "sms", channel: "sms", isWhatsapp: false };
  }

  return { source: "other", channel: raw, isWhatsapp: false };
}

/**
 * Resuelve el canal preferido por defecto priorizando WhatsApp cuando existe teléfono móvil
 * o el contacto proviene del canal WhatsApp (`RN-SPEC-09-04`).
 */
export function resolveDefaultPreferredChannel(input: {
  preferredChannel?: string | null;
  phoneMobile?: string | null;
  source?: string | null;
  lastChannel?: string | null;
}): string | null {
  const explicit = input.preferredChannel?.trim();
  if (explicit) {
    return explicit;
  }
  if (
    (input.phoneMobile && input.phoneMobile.trim().length > 0) ||
    input.source === "whatsapp" ||
    isWhatsappChannel(input.lastChannel)
  ) {
    return "whatsapp";
  }
  if (input.lastChannel?.trim()) {
    return input.lastChannel.trim();
  }
  if (input.source?.trim()) {
    return input.source.trim();
  }
  return null;
}

/**
 * Limpia espacios o guiones comunes preservando un teléfono E.164 si comienza por `+`.
 */
export function normalizeE164Phone(phone?: string | null): string | null {
  if (!phone) return null;
  const compact = phone.trim().replace(/[\s\-().]/g, "");
  return compact.length > 0 ? compact : null;
}

/**
 * Valida formato internacional estricto E.164 (`+[código país][número]`).
 */
export function isValidE164Phone(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}

/**
 * Valida estructura básica de correo electrónico.
 */
export function isValidEmailAddress(email: string): boolean {
  return EMAIL_REGEX.test(email.trim().toLowerCase());
}

/**
 * Verifica si una fecha YYYY-MM-DD es posterior a la fecha UTC actual (para rechazar nacimientos futuros).
 */
export function isFutureDateOnly(dateStr: string, now: Date = new Date()): boolean {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return parsed.getTime() > todayUtc.getTime();
}

/**
 * Formatea segundos restantes de ventana WhatsApp 24h en etiqueta compacta (ej. `18h 20m`).
 */
export function formatRemainingWhatsappTime(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return "0m";
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  if (hours <= 0) {
    return `${Math.max(1, minutes)}m`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
