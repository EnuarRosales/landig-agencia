import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  allowedDevOrigins: ["localhost:3000", "127.0.0.1:3000", "172.18.5.*", "172.18.5.19:3000"],
};

/** Loads `i18n/request.ts` (default path when there is no `src/` directory). */
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
