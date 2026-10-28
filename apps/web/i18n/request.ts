import * as rootParams from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { defaultLocale, routing } from "./routing";

/**
 * Configuración dinámica del proveedor de mensajes i18n por petición de Next.js.
 *
 * Resuelve el idioma de la solicitud utilizando `next/root-params` de forma nativa en Server Components,
 * con fallback a `requestLocale` para Route Handlers y Server Actions.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale: string | undefined = await requestLocale;

  if (!locale) {
    try {
      const paramValue = await rootParams.locale();
      if (paramValue && hasLocale(routing.locales, paramValue)) {
        locale = paramValue;
      }
    } catch {
      // Fuera del contexto de root layout degrada al default
    }
  }

  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

