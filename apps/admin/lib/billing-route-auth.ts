import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAuthenticatedPortalContext,
  type AuthenticatedPortalContext,
} from "@mocter/domain";
import { HttpError } from "./errors/route";

/**
 * Extrae el token opaco de sesión desde las cookies de la petición o el contexto Next.js.
 */
export async function readSessionToken(req?: NextRequest): Promise<string | undefined> {
  if (req) {
    const reqSid =
      req.cookies.get("__Host-mocter_sid")?.value ||
      req.cookies.get("mocter_sid")?.value;
    if (reqSid) return reqSid;
  }

  try {
    const store = await cookies();
    return (
      store.get("__Host-mocter_sid")?.value ||
      store.get("mocter_sid")?.value
    );
  } catch {
    return undefined;
  }
}

/**
 * Verifica que el actor autenticado posea rol de administrador de plataforma (`platform_owner` | `platform_admin`).
 *
 * @throws {HttpError} 401 si no hay sesión válida; 403 si carece de privilegios de plataforma.
 */
export async function requirePlatformAdmin(
  req?: NextRequest,
  scopeDescription = "administrar recursos de plataforma",
): Promise<AuthenticatedPortalContext> {
  const sid = await readSessionToken(req);
  if (!sid) {
    throw new HttpError(401, `Sesión requerida para ${scopeDescription}.`);
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context) {
    throw new HttpError(401, "Sesión expirada o inválida.");
  }

  const hasPlatformRole =
    context.scope === "platform" &&
    (context.role === "platform_owner" ||
      context.role === "platform_admin" ||
      context.effectiveRoles.includes("platform_owner") ||
      context.effectiveRoles.includes("platform_admin"));

  if (!hasPlatformRole) {
    throw new HttpError(
      403,
      "Acceso restringido: requiere rol platform_owner o platform_admin.",
    );
  }

  return context;
}

/**
 * Verifica que el actor autenticado posea rol de administrador de plataforma (`platform_owner` | `platform_admin`)
 * para operaciones de facturación.
 *
 * @throws {HttpError} 401 si no hay sesión válida; 403 si carece de privilegios de plataforma.
 */
export async function requirePlatformBillingAdmin(
  req?: NextRequest,
): Promise<AuthenticatedPortalContext> {
  return requirePlatformAdmin(req, "administrar facturación de plataforma");
}

/**
 * Verifica que el actor autenticado sea el propietario del espacio inquilino (`tenant_owner` / `tenancy_owner`)
 * tanto en operación activa (`tenant`) como en alta (`onboarding_prospect`).
 *
 * @throws {HttpError} 401 si no hay sesión válida; 403 si es agente operativo u otro inquilino.
 */
export async function requireTenantBillingOwner(
  req: NextRequest,
  requestedClientId?: string,
): Promise<{ context: AuthenticatedPortalContext; clientId: string }> {
  const sid = await readSessionToken(req);
  if (!sid) {
    throw new HttpError(401, "Sesión requerida para gestionar suscripción o pagos.");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context) {
    throw new HttpError(401, "Sesión expirada o inválida.");
  }

  if (
    (context.scope !== "tenant" && context.scope !== "onboarding_prospect") ||
    !context.activeClientId
  ) {
    throw new HttpError(403, "No tienes un espacio de inquilino asociado a esta sesión.");
  }

  const isOwner =
    context.role === "tenant_owner" ||
    context.role === "tenancy_owner" ||
    context.effectiveRoles.includes("tenant_owner") ||
    context.effectiveRoles.includes("tenancy_owner");

  if (!isOwner) {
    throw new HttpError(
      403,
      "Solo el propietario del espacio puede realizar operaciones de facturación o suscripción.",
    );
  }

  if (requestedClientId && requestedClientId !== context.activeClientId) {
    throw new HttpError(
      403,
      "No estás autorizado para operar sobre la facturación de otro espacio.",
    );
  }

  return {
    context,
    clientId: context.activeClientId,
  };
}

/**
 * Construye una respuesta de error estructurada conforme a RFC 9457 Problem Details.
 */
export function problemResponse(
  status: number,
  title: string,
  detail: string,
  options?: { code?: string; errors?: unknown; typeSlug?: string },
): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${options?.typeSlug ?? "billing-error"}`,
      title,
      status,
      detail,
      ...(options?.code ? { code: options.code } : {}),
      ...(options?.errors ? { errors: options.errors } : {}),
    },
    {
      status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );
}
