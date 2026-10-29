import { env } from "@/env";

/**
 * Configuración centralizada del sitio Mocter (Regla 4.12 de AGENTS.md).
 *
 * Extrae y centraliza enlaces de navegación, URLs canónicas, configuraciones de temas
 * y metadatos base para evitar datos fijos (hardcoding) en los componentes JSX.
 */
export const siteConfig = {
  name: "Mocter",
  legalName: "Mocter",
  description:
    "Automatización de atención al cliente, agendamiento y ventas con IA Omnicanal",
  url: env.NEXT_PUBLIC_SITE_URL,
  appUrl: env.NEXT_PUBLIC_APP_URL,
  apiUrl: env.NEXT_PUBLIC_API_URL,
  supportEmail: "info@mocter.co",
  areaServed: "Colombia",
  defaultLocale: "es",
  locales: ["es", "en"] as const,
  theme: {
    defaultTheme: "dark",
    storageKey: "mocter-theme",
    color: "#05070f",
  },
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3003",
    "https://mocter.co",
    "https://staging.mocter.co",
  ],
  navLinks: [
    { href: "/#beneficios", labelKey: "nav.benefits" },
    { href: "/#como-funciona", labelKey: "nav.howItWorks" },
    { href: "/#planes", labelKey: "nav.pricing" },
    { href: "/#preguntas-frecuentes", labelKey: "nav.faq" },
  ],
  legalLinks: [
    { href: "/terminos", labelKey: "legal.terms" },
    { href: "/privacidad", labelKey: "legal.privacy" },
    { href: "/cookies", labelKey: "legal.cookies" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
