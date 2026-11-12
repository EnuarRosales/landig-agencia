import { NextRequest, NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/errors/route";
import { env } from "@/env";
import {
  resolveAuthenticatedPortalContext,
  getDb,
  chatwootAccounts,
  ChatwootHttpPlatformGateway,
  appLogger,
  eq,
} from "@mocter/domain";

/**
 * Route Handler para emisión y redirección SSO hacia Chatwoot (CHW-002 T-06, RF-04.1, RF-05.2).
 *
 * Soporta dos ámbitos de seguridad aislados:
 * - scope=workspace: Para tenant_owner y tenant_agent hacia su bandeja celular /app/accounts/:id/dashboard.
 * - scope=admin: Para platform_owner y platform_admin hacia la consola global /super_admin de Chatwoot.
 */
export const GET = handle(async (req: NextRequest): Promise<Response> => {
  const scope = (req.nextUrl.searchParams.get("scope") || "workspace").toLowerCase();
  const targetPath = req.nextUrl.searchParams.get("targetPath") || "/super_admin";

  // 1. Resolver sesión activa
  const isProduction = env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (req.cookies.get(sidCookieName)?.value || req.cookies.get("mocter_sid")?.value)?.trim();

  if (!sid) {
    throw new HttpError(401, "No se encontró una sesión activa.");
  }

  const context = await resolveAuthenticatedPortalContext(sid);
  if (!context || !context.user) {
    throw new HttpError(401, "Sesión no válida o expirada.");
  }

  const publicBaseUrl = (env.NEXT_PUBLIC_CHATWOOT_URL || "http://localhost:3001").replace(/\/+$/, "");

  // -------------------------------------------------------------
  // MODO ADMIN (Backoffice SaaS Super Admin)
  // -------------------------------------------------------------
  if (scope === "admin") {
    const userRoles: string[] = Array.isArray(context.effectiveRoles) ? context.effectiveRoles : [];
    const isPlatformUser =
      userRoles.includes("platform_owner") ||
      userRoles.includes("platform_admin") ||
      context.role === "platform_owner" ||
      context.role === "platform_admin";

    if (!isPlatformUser) {
      throw new HttpError(403, "Acceso denegado: se requieren privilegios de administración de plataforma.");
    }

    // Validar que el targetPath esté confinado exclusivamente a /super_admin (CHW-002 T-06)
    const isSafeSuperAdminPath =
      (targetPath === "/super_admin" || targetPath.startsWith("/super_admin/")) &&
      !targetPath.includes("://");
    const safeTargetPath = isSafeSuperAdminPath ? targetPath : "/super_admin";

    const superAdminUserId = Number(env.CHATWOOT_SUPER_ADMIN_USER_ID || 1);
    const gateway = new ChatwootHttpPlatformGateway();

    appLogger.info("[ChatwootEmbed] Generando handoff SSO Super Admin", {
      userId: context.user.id,
      superAdminUserId,
      targetPath: safeTargetPath,
    });

    const ssoRes = await gateway.getUserSsoLoginUrl({ userId: superAdminUserId });
    const ssoUrl = new URL(ssoRes.url);

    // Extraer parámetros de SSO emitidos por la Platform API
    const email = ssoUrl.searchParams.get("email") || context.user.email || "soporte@mocter.co";
    const ssoAuthToken = ssoUrl.searchParams.get("sso_auth_token") || "";

    // Para Super Admin, redirigir directamente a la ruta Administrate en Rails (/super_admin/*)
    // evitando la SPA de Vue (/app/login) que forzaría el dashboard celular del inquilino
    const adminTargetUrl = new URL(safeTargetPath, publicBaseUrl);
    adminTargetUrl.searchParams.set("email", email);
    if (ssoAuthToken) {
      adminTargetUrl.searchParams.set("sso_auth_token", ssoAuthToken);
    }

    const res = NextResponse.redirect(adminTargetUrl.toString(), 307);
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
    res.headers.set("Content-Security-Policy", "frame-ancestors 'self' http://localhost:3003 https://admin.mocter.co");
    return res;
  }

  // -------------------------------------------------------------
  // MODO WORKSPACE (Operación Celular del Inquilino)
  // -------------------------------------------------------------
  if (!context.activeClient) {
    throw new HttpError(403, "No hay un comercio activo asignado a la sesión actual.");
  }

  const clientId = context.activeClient.id;

  // Verificar capacidad chatwoot_inboxes en el plan o overrides
  const hasInboxesCapability = Boolean(context.capabilities?.chatwoot_inboxes);
  if (!hasInboxesCapability) {
    throw new HttpError(403, "Tu plan comercial no incluye buzones de atención omnicanal.");
  }

  // Consultar estado de la cuenta en admin.chatwoot_accounts
  const db = getDb();
  const [cwAccount] = await db
    .select({
      state: chatwootAccounts.state,
      chatwootAccountId: chatwootAccounts.chatwootAccountId,
    })
    .from(chatwootAccounts)
    .where(eq(chatwootAccounts.clientId, clientId))
    .limit(1);

  if (!cwAccount || cwAccount.state !== "active" || cwAccount.chatwootAccountId === null) {
    throw new HttpError(
      404,
      "La bandeja de atención de este comercio no se encuentra activa o está en proceso de aprovisionamiento.",
    );
  }

  // Determinar rol en Chatwoot acorde al rol en Mocter
  const userRoles: string[] = Array.isArray(context.effectiveRoles) ? context.effectiveRoles : [];
  const isOwner = userRoles.includes("tenant_owner") || context.role === "tenant_owner";
  const mappedRole: "administrator" | "agent" = isOwner ? "administrator" : "agent";

  const gateway = new ChatwootHttpPlatformGateway();

  // Asegurar que el miembro exista y tenga su membresía en Chatwoot
  const memberUser = await gateway.ensureMemberUserInAccount({
    accountId: cwAccount.chatwootAccountId,
    email: context.user.email,
    name: context.user.displayName || "Operador",
    role: mappedRole,
  });

  appLogger.info("[ChatwootEmbed] Generando handoff SSO Workspace", {
    userId: context.user.id,
    chatwootUserId: memberUser.userId,
    accountId: cwAccount.chatwootAccountId,
    role: mappedRole,
  });

  const ssoRes = await gateway.getUserSsoLoginUrl({ userId: memberUser.userId });
  const ssoUrl = new URL(ssoRes.url);

  // Reescribir origen hacia NEXT_PUBLIC_CHATWOOT_URL apuntando a su dashboard celular
  const destination = `/app/accounts/${cwAccount.chatwootAccountId}/dashboard`;
  ssoUrl.searchParams.set("redirect_to", destination);
  ssoUrl.searchParams.set("sso_account_id", String(cwAccount.chatwootAccountId));
  const rewrittenUrl = `${publicBaseUrl}${ssoUrl.pathname}${ssoUrl.search}`;

  const res = NextResponse.redirect(rewrittenUrl, 307);
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'self' http://localhost:3003 https://admin.mocter.co");
  return res;
});
