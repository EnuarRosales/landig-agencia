import esDict from "./i18n/es.json";
import enDict from "./i18n/en.json";

/**
 * Idiomas soportados en el portal administrativo y backoffice del comercio (`SPEC-17`).
 */
export type AdminLocale = "es" | "en";

/**
 * Tipo completo del diccionario estructurado garantizando paridad en tiempo de compilación.
 */
export type AdminDictionary = typeof esDict;

/**
 * Diccionarios bilingües `es`/`en` externalizados en `apps/admin/lib/i18n/{es,en}.json`.
 */
export const adminDictionaries: Record<AdminLocale, AdminDictionary> = {
  es: esDict,
  en: enDict as AdminDictionary,
};

/**
 * Resuelve el idioma activo siguiendo la jerarquía obligatoria:
 * preferencia de usuario (`cell_users.preferred_locale` / cookie) → idioma del inquilino (`clients.locale`) → navegador → defecto `'es'` (`ADM-001 T-27, SPEC-17`).
 */
export function resolveActiveLocale(params: {
  userLocale?: string | null;
  tenantLocale?: string | null;
  browserAcceptLanguage?: string | null;
}): AdminLocale {
  const candidates = [
    params.userLocale,
    params.tenantLocale,
    params.browserAcceptLanguage?.split(",")[0]?.split("-")[0],
  ];
  for (const candidate of candidates) {
    const clean = candidate?.trim().toLowerCase();
    if (clean === "es" || clean === "en") {
      return clean;
    }
  }
  return "es";
}

/**
 * Retorna el diccionario completo correspondiente al idioma solicitado.
 */
export function getAdminDictionary(locale: AdminLocale = "es"): AdminDictionary {
  return adminDictionaries[locale] ?? adminDictionaries.es;
}
