/**
 * Re-exporta el manejador GET canónico para el handoff SSO de Chatwoot embebido.
 * Permite resolución directa en `/auth/chatwoot/embed` así como en `/api/auth/chatwoot/embed`.
 *
 * @see {@link GET} en `apps/web/app/api/auth/chatwoot/embed/route.ts`
 */
export { GET } from "@/app/api/auth/chatwoot/embed/route";
