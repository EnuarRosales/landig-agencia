import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedPortalContext, type AuthenticatedPortalContext } from "@mocter/domain";

/**
 * Resuelve y valida autoritativamente que la petición cuente con una sesión activa de inquilino
 * en estado operativo (scope === 'tenant' con activeClient definido).
 * Devuelve el contexto y el clientId correspondiente o una respuesta RFC 9457 Problem Details.
 */
export async function resolveTenantSession(req: NextRequest): Promise<
  | { ok: true; context: AuthenticatedPortalContext; clientId: string }
  | { ok: false; response: NextResponse }
> {
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "https://mocter.co/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Sesión no iniciada o token inexistente.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } },
      ),
    };
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context || !context.user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "https://mocter.co/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Sesión inválida o expirada.",
        },
        { status: 401, headers: { "Content-Type": "application/problem+json" } },
      ),
    };
  }

  if (context.scope !== "tenant" || !context.activeClient?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          type: "https://mocter.co/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Acceso denegado: se requiere una sesión activa de comercio.",
        },
        { status: 403, headers: { "Content-Type": "application/problem+json" } },
      ),
    };
  }

  return { ok: true, context, clientId: context.activeClient.id };
}

