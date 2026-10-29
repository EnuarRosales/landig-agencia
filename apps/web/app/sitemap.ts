import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

const SITE_URL = siteConfig.url;
const LOCALES = ["es", "en"] as const;

const ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/privacidad", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/terminos", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/cookies", priority: 0.4, changeFrequency: "monthly" as const },
];

/** All localized routes, cross-linked as alternate-language URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const route of ROUTES) {
    for (const locale of LOCALES) {
      entries.push({
        url: `${SITE_URL}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: {
            es: `${SITE_URL}/es${route.path}`,
            en: `${SITE_URL}/en${route.path}`,
          },
        },
      });
    }
  }

  return entries;
}
