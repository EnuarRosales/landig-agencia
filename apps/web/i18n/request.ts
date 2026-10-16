import { getRequestConfig } from "next-intl/server";
import { defaultLocale, routing } from "./routing";

/**
 * Resolves the request locale from the `[locale]` segment and loads the
 * matching handwritten messages file. Invalid/unknown locales fall back to
 * the default (Spanish).
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
