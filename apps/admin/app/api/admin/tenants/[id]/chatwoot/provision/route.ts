import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  getDb,
  clients,
  eq,
  resolveAuthenticatedPortalContext,
  provisionTenantChatwootAccount,
  getTenantChatwootAccount,
} from "@mocter/domain";
import { handle, HttpError } from "@/lib/errors/route";
import { env } from "@/env";

/**
 * Route Handler para aprovisionamiento o reintento manual de Chatwoot por inquilino (CHW-002 T-09, D-08).
 * Requiere rol platform_owner o platform_admin.
 */
export const POST = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const cookieStore = await cookies();
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    throw new HttpError(401, "No autenticado: sesión ausente.");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context) {
    throw new HttpError(401, "No autenticado: sesión inválida o expirada.");
  }

  const effectiveRoles = Array.isArray(context.effectiveRoles) ? context.effectiveRoles : [];
  const isPlatformUser =
    effectiveRoles.includes("platform_owner") ||
    effectiveRoles.includes("platform_admin") ||
    context.role === "platform_owner" ||
    context.role === "platform_admin";

  if (!isPlatformUser) {
    throw new HttpError(403, "Acceso denegado: se requieren privilegios de administración de plataforma.");
  }

  const { id: clientId } = await params;
  if (!clientId) {
    throw new HttpError(400, "Identificador de inquilino requerido.");
  }

  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    throw new HttpError(404, `Inquilino '${clientId}' no encontrado.`);
  }

  const provResult = await provisionTenantChatwootAccount({
    clientId,
    planId: client.planId,
    actor: context.user.email || "platform_admin",
    db,
  });

  const account = await getTenantChatwootAccount({ clientId, db });

  if (!provResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: provResult.error,
        code: provResult.code,
        data: account,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: account,
  });
});
