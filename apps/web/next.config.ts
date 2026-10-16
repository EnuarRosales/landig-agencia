import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
};

/** Loads `i18n/request.ts` (default path when there is no `src/` directory). */
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
