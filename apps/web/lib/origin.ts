import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { env } from "@/env";

/**
 * Valida el encabezado Origin contra el host y los orígenes permitidos (AUTH-001 §5.6, Regla 4.12).
 *
 * Utiliza la allowlist canónica de {@link siteConfig} y orígenes adicionales de entorno (`ALLOWED_ORIGINS`)
 * evitando comprobaciones cableadas o URLs duplicadas en cada endpoint.
 *
 * @param req - Solicitud HTTP entrante.
 * @returns `true` si el origen es legítimo; `false` si es sospechoso o malicioso.
 */
export function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  const host = req.headers.get("host");
  try {
    const originUrl = new URL(origin);

    // Mismo host que la solicitud entrante
    if (host && originUrl.host === host) {
      return true;
    }

    // Allowlist canónica de siteConfig
    const isAllowedBySiteConfig = siteConfig.allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return allowedUrl.origin === originUrl.origin;
      } catch {
        return false;
      }
    });

    if (isAllowedBySiteConfig) {
      return true;
    }

    // Dominios oficiales de Mocter
    if (
      originUrl.hostname === "mocter.co" ||
      originUrl.hostname.endsWith(".mocter.co")
    ) {
      return true;
    }

    // Orígenes dinámicos provistos en variable de entorno
    if (env.ALLOWED_ORIGINS) {
      const dynamicOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
      if (
        dynamicOrigins.includes(originUrl.origin) ||
        dynamicOrigins.includes(originUrl.host)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
