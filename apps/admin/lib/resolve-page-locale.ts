import type { PortalContext } from "@mocter/domain";
import { resolveActiveLocale, type AdminLocale } from "./i18n";

/**
 * Resuelve el idioma activo de una página SSR del portal siguiendo la cascada canónica (`SPEC-17 §7.1`):
 * `cell_users.preferred_locale -> cookie mocter_locale -> clients.locale -> Accept-Language -> 'es'`.
 */
export function resolvePortalPageLocale(params: {
  context?: PortalContext | null;
  cookieLocale?: string | null;
  tenantLocale?: string | null;
  acceptLanguage?: string | null;
}): AdminLocale {
  return resolveActiveLocale({
    userLocale: params.context?.preferredLocale ?? params.cookieLocale ?? null,
    tenantLocale: params.tenantLocale ?? params.context?.activeClient?.locale ?? null,
    browserAcceptLanguage: params.acceptLanguage ?? null,
  });
}
