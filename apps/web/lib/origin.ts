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
export function isValidOrigin(
  req: NextRequest,
  options?: { requireOrigin?: boolean },
): boolean {
  // Si no se incluyó el encabezado Origin en la petición
  if (!req.headers.has("origin")) {
    if (options?.requireOrigin) {
      return false;
    }
    return true;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    return false;
  }

  // Rechazo explícito de origen nulo, comodín o cadenas vacías (AUTH-001 design §5.6)
  const trimmed = origin.trim();
  if (!trimmed || trimmed === "null" || trimmed === "*") {
    return false;
  }

  const host = req.headers.get("host");
  try {
    const originUrl = new URL(trimmed);

    // Mismo host y puerto que la solicitud entrante
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

/**
 * Valida que el origen de la petición sea exactamente el subdominio admin autorizado.
 *
 * Usa `NEXT_PUBLIC_ADMIN_URL` como único origen permitido para operaciones de
 * aprovisionamiento de celdas (DAT-001 T1, ADM-001 RF-10.17).
 */
export function isAdminOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const trimmed = origin.trim();
  if (!trimmed || trimmed === "null" || trimmed === "*") return false;

  try {
    const originUrl = new URL(trimmed);
    const adminUrl = new URL(env.NEXT_PUBLIC_ADMIN_URL);
    if (originUrl.origin === adminUrl.origin) {
      return true;
    }

    // En desarrollo local o LAN, permitir conexiones al panel administrativo en puerto 3003
    if (env.NODE_ENV !== "production") {
      if (
        (originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1" ||
          originUrl.hostname.startsWith("192.168.") ||
          originUrl.hostname.startsWith("10.") ||
          originUrl.hostname.startsWith("172.")) &&
        (originUrl.port === "3003" || originUrl.port === "3000")
      ) {
        return true;
      }
    }

    // En producción, autorizar subdominios canónicos de admin
    if (
      originUrl.hostname === "admin.mocter.co" ||
      originUrl.hostname.endsWith(".admin.mocter.co")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
