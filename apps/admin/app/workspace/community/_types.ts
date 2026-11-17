import type { AdminLocale } from "@/lib/i18n";

/**
 * Atributos seguros permitidos para auto-sincronización sin afectar precios ni inventario (`SPEC-15-D08`).
 */
export const SAFE_AUTO_SYNC_ATTRIBUTES = [
  "name",
  "description",
  "category",
  "brand",
  "botMasterPrompt",
  "attributes",
  "media",
] as const;

/**
 * Formatea centavos en la moneda declarada usando `Intl.NumberFormat`.
 */
export function formatCommunityMoney(
  cents: number | null | undefined,
  currency = "COP",
  locale: AdminLocale = "es",
): string {
  const safeCents = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const amount = safeCents / 100;
  const tag = locale === "en" ? "en-US" : "es-CO";
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: currency === "COP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(tag)}`;
  }
}

/**
 * Extrae el mensaje amigable de errores JSON o RFC 9457 Problem Details sin exponer detalles técnicos.
 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string" && body.detail.trim()) return body.detail;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Formatea fecha ISO a texto legible respetando el idioma activo.
 */
export function formatCommunityDate(iso: string | Date, locale: AdminLocale = "es"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
