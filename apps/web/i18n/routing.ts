import { defineRouting } from "next-intl/routing";

export const locales = ["es", "en"] as const;

/** The public site is Spanish-first; English is the secondary locale. */
export const defaultLocale: (typeof locales)[number] = "es";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
