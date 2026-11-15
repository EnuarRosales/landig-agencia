import type { AdminLocale } from "@/lib/i18n";

export const CRM_SOURCES = [
  "manual",
  "whatsapp",
  "instagram",
  "facebook",
  "web",
  "telegram",
  "email",
  "sms",
  "referral",
  "import",
  "api",
  "other",
] as const;

export const CRM_STAGES = [
  "new",
  "in_conversation",
  "qualified",
  "customer",
  "discarded",
] as const;

export const CRM_DOCUMENT_TYPES = ["CC", "NIT", "CE", "PASSPORT", "other"] as const;

export const CRM_CHANNELS = [
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

export const CRM_CONSENT_PURPOSES = ["data_treatment", "commercial_comms"] as const;

export const CRM_CONSENT_CHANNELS = ["manual", "whatsapp_buttons", "web_form", "import"] as const;

export interface WhatsappWindowView {
  status: "active" | "expired" | "none";
  expiresAt: string | null;
  remainingSeconds: number;
}

export interface ContactAddressView {
  id: string;
  label: string;
  country: string;
  state: string | null;
  city: string;
  addressLine: string;
  neighborhood: string | null;
  postalCode: string | null;
  referenceNotes: string | null;
  isDefault: boolean;
}

export interface ContactRatingView {
  id: string;
  stars: number;
  comment: string | null;
  ratedByName: string;
  createdAt: string | Date;
}

export interface ContactConsentView {
  id: string;
  purpose: string;
  policyVersion: string;
  status: string;
  grantedAt: string | Date | null;
  revokedAt: string | Date | null;
  channel: string;
  evidenceRef: string | null;
}

export interface ContactRecentOrderView {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string | Date;
}

export interface CrmContactListItemView {
  id: string;
  fullName: string;
  companyName?: string | null;
  documentType?: string | null;
  documentNumber: string | null;
  email: string | null;
  phoneMobile: string | null;
  phoneSecondary?: string | null;
  phoneLandline?: string | null;
  birthDate?: string | null;
  source: string;
  channel?: string | null;
  preferredChannel?: string | null;
  lastChannel?: string | null;
  chatwootContactId?: number | null;
  stage: string;
  tags?: string[];
  language?: string;
  notes?: string | null;
  currentRatingStars?: number | null;
  currentRatingComment?: string | null;
  firstContactedAt?: string | null;
  lastSeenAt: string | null;
  lastInboundMessageAt?: string | null;
  lastWhatsappInboundAt?: string | null;
  convertedToCustomerAt?: string | null;
  createdAt?: string;
  whatsappWindow?: WhatsappWindowView;
  defaultAddressSummary?: {
    id: string;
    label: string;
    city: string;
    state: string | null;
    country: string;
    addressLine: string;
  } | null;
}

export interface CrmContactDetailView extends CrmContactListItemView {
  addresses: ContactAddressView[];
  ratingsHistory: ContactRatingView[];
  consents: ContactConsentView[];
  recentOrders: ContactRecentOrderView[];
}

export interface CrmContactListResultView {
  items: CrmContactListItemView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  quota: {
    used: number;
    limit: number | null;
    mode: "LIMITED" | "UNLIMITED";
  };
}

/**
 * Calcula en vivo el estado de la ventana de 24 horas de WhatsApp en UI cliente.
 */
export function computeClientWhatsappWindow(
  lastWhatsappInboundAt: string | null | undefined,
  nowMs: number = Date.now(),
): WhatsappWindowView {
  if (!lastWhatsappInboundAt) {
    return { status: "none", expiresAt: null, remainingSeconds: 0 };
  }
  const inboundMs = new Date(lastWhatsappInboundAt).getTime();
  if (Number.isNaN(inboundMs)) {
    return { status: "none", expiresAt: null, remainingSeconds: 0 };
  }
  const expiresMs = inboundMs + 24 * 60 * 60 * 1000;
  const remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  return {
    status: remainingSeconds > 0 ? "active" : "expired",
    expiresAt: new Date(expiresMs).toISOString(),
    remainingSeconds,
  };
}

/**
 * Formatea los segundos restantes de atención gratuita en WhatsApp como `HHh MMm`.
 */
export function formatClientWhatsappRemaining(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return "0m";
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

/**
 * Normaliza la entrada inicial SSR para soportar tanto el listado paginado como props legadas.
 */
export function resolveInitialContactList(
  initialList?: CrmContactListResultView | null,
  initialContacts?: CrmContactListItemView[],
): CrmContactListResultView {
  if (initialList) {
    return initialList;
  }
  const items = initialContacts ?? [];
  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: 1,
    },
    quota: {
      used: items.length,
      limit: null,
      mode: "UNLIMITED",
    },
  };
}

const SOURCE_LABELS: Record<string, { es: string; en: string }> = {
  whatsapp: { es: "WhatsApp", en: "WhatsApp" },
  instagram: { es: "Instagram", en: "Instagram" },
  facebook: { es: "Facebook", en: "Facebook" },
  web: { es: "Sitio Web", en: "Website" },
  telegram: { es: "Telegram", en: "Telegram" },
  email: { es: "Correo", en: "Email" },
  sms: { es: "SMS", en: "SMS" },
  manual: { es: "Registro Manual", en: "Manual Entry" },
  referral: { es: "Referido", en: "Referral" },
  import: { es: "Importado", en: "Imported" },
  api: { es: "Integración API", en: "API Integration" },
  other: { es: "Otro", en: "Other" },
};

const CHANNEL_LABELS: Record<string, { es: string; en: string }> = {
  whatsapp_cloud: { es: "WhatsApp Oficial", en: "WhatsApp Cloud" },
  whatsapp_twilio: { es: "WhatsApp Twilio", en: "WhatsApp Twilio" },
  whatsapp: { es: "WhatsApp", en: "WhatsApp" },
  instagram: { es: "Instagram DM", en: "Instagram DM" },
  facebook: { es: "Facebook Messenger", en: "Facebook Messenger" },
  website: { es: "Widget Web", en: "Web Widget" },
  telegram: { es: "Telegram", en: "Telegram" },
  email: { es: "Correo Electrónico", en: "Email" },
  sms: { es: "SMS", en: "SMS" },
  api: { es: "API", en: "API" },
  line: { es: "Line", en: "Line" },
  manual: { es: "Atención Manual", en: "Manual Support" },
  other: { es: "Otro Canal", en: "Other Channel" },
};

const STAGE_LABELS: Record<string, { es: string; en: string }> = {
  new: { es: "Nuevo", en: "New" },
  in_conversation: { es: "En Conversación", en: "In Conversation" },
  qualified: { es: "Calificado", en: "Qualified" },
  customer: { es: "Cliente", en: "Customer" },
  discarded: { es: "Descartado", en: "Discarded" },
};

export function formatSourceLabel(source: string | null | undefined, locale: AdminLocale): string {
  const key = source ?? "other";
  const match = SOURCE_LABELS[key];
  if (!match) return key;
  return locale === "en" ? match.en : match.es;
}

export function formatChannelLabel(channel: string | null | undefined, locale: AdminLocale): string {
  if (!channel) return "—";
  const match = CHANNEL_LABELS[channel];
  if (!match) return channel;
  return locale === "en" ? match.en : match.es;
}

export function formatStageLabel(stage: string | null | undefined, locale: AdminLocale): string {
  const key = stage ?? "new";
  const match = STAGE_LABELS[key];
  if (!match) return key;
  return locale === "en" ? match.en : match.es;
}

export function formatShortDateTime(
  value: string | Date | null | undefined,
  locale: AdminLocale,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCurrencyCents(cents: number, currency: string, locale: AdminLocale): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency || "COP"}`;
  }
}
