import { defineRouting } from "next-intl/routing";

/**
 * Lista inmutable de códigos de idioma admitidos por la plataforma.
 */
export const locales = ["es", "en"] as const;

/**
 * Idioma principal predeterminado del sitio público (Español).
 */
export const defaultLocale: (typeof locales)[number] = "es";

/**
 * Definición centralizada de enrutamiento internacionalizado (`next-intl`).
 *
 * Configura la estrategia `localePrefix: "always"` para garantizar que todas las páginas
 * públicas expongan el prefijo del idioma en la URL (`/es`, `/en`), optimizando el SEO internacional y hreflang.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
