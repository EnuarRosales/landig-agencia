import { getRequestConfig } from "next-intl/server";
import { defaultLocale, routing } from "./routing";

/**
 * Configuración dinámica del proveedor de mensajes i18n por petición de Next.js.
 *
 * Resuelve el idioma de la solicitud a partir del segmento `[locale]` de la URL y carga
 * de forma asíncrona el archivo de mensajes JSON correspondiente (`messages/es.json` o `messages/en.json`).
 * Ante idiomas desconocidos o no admitidos, degrada elegantemente al idioma predeterminado (Español).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && routing.locales.includes(requested as (typeof routing.locales)[number])
      ? requested
      : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
