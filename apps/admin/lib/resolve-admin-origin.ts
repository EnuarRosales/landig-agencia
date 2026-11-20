import type { NextRequest } from "next/server";
import { env } from "@/env";

/**
 * Resuelve la URL base pública del portal de administración sin puertos acoplados (`AGENTS.md §4.16`).
 *
 * Prioriza cabeceras de proxy (`x-forwarded-host` / `host` + `x-forwarded-proto`) y hace
 * fallback a `env.NEXT_PUBLIC_ADMIN_URL` cuando la petición no expone cabecera de origen.
 *
 * @param req - Solicitud HTTP entrante de Next.js.
 */
export function resolveAdminPublicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.trim();
  const host = forwardedHost || req.headers.get("host")?.trim();
  const proto =
    req.headers.get("x-forwarded-proto")?.trim() ||
    (env.NODE_ENV === "production" ? "https" : req.nextUrl.protocol.replace(":", ""));

  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }
  return env.NEXT_PUBLIC_ADMIN_URL.replace(/\/+$/, "");
}
