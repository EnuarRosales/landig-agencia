import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Locale negotiation + rewrite of `/` to `/es` (localePrefix "always").
 * Skips Next internals and static files (anything containing a dot), so
 * `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `sw.js` and `llms.txt`
 * are served as-is.
 */
export default createMiddleware(routing);

export const config = {
  // Skip `_next`, hot-reload, API and static assets (files with an extension).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
