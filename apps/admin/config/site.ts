import { env } from "@/env";

/**
 * Configuración centralizada de marca institucional para @mocter/admin (AGENTS.md §4.12).
 *
 * Permite parametrizar el nombre corporativo y la URL del logotipo institucional de la SaaS
 * mediante variables de entorno o valores por defecto del sistema de diseño.
 */
export const siteConfig = {
  name: env.NEXT_PUBLIC_SAAS_BRAND_NAME ?? "Mocter",
  badge: "SaaS Admin",
  logoUrl: env.NEXT_PUBLIC_SAAS_LOGO_URL,
  description: "Consola de administración corporativa de la SaaS Mocter",
  adminUrl: env.NEXT_PUBLIC_ADMIN_URL,
} as const;

export type SiteConfig = typeof siteConfig;

