import { NextRequest, NextResponse } from "next/server";
import { handle, HttpError } from "@/lib/errors/route";
import { env } from "@/env";
import {
  resolveAuthenticatedPortalContext,
  ChatwootHttpPlatformGateway,
  tenantChatwootEmbedService,
  appLogger,
} from "@mocter/domain";

/**
 * Construye el valor de `Content-Security-Policy` (`frame-ancestors`) para el iframe del workspace
 * derivando dinámicamente el origen público del portal desde `env.NEXT_PUBLIC_ADMIN_URL` (`AGENTS.md §4.16`).
 */
function buildWorkspaceFrameAncestorsCsp(): string {
  try {
    const adminOrigin = new URL(env.NEXT_PUBLIC_ADMIN_URL).origin;
    return `frame-ancestors 'self' ${adminOrigin}`;
  } catch {
    return "frame-ancestors 'self'";
  }
}

/**
 * Route Handler para emisión y redirección SSO hacia Chatwoot (CHW-002 T-06, RF-04.1, RF-05.2, SPEC-13).
 *
 * Soporta dos ámbitos de seguridad aislados:
 * - scope=workspace: Para tenant_owner y tenant_agent hacia su bandeja celular /app/accounts/:id/dashboard.
 * - scope=admin: Para platform_owner y platform_admin hacia la consola global /super_admin de Chatwoot.
 */
export const GET = handle(async (req: NextRequest): Promise<Response> => {
  const rawScope = req.nextUrl.searchParams.get("scope");
  const normalizedScope = rawScope === null ? "workspace" : rawScope.trim().toLowerCase();
  if (normalizedScope !== "workspace" && normalizedScope !== "admin") {
    throw new HttpError(400, "Parámetro 'scope' inválido. Valores permitidos: 'workspace' o 'admin'.");
  }
  const scope = normalizedScope;
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

  const publicBaseUrl = env.NEXT_PUBLIC_CHATWOOT_URL.replace(/\/+$/, "");

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
  // MODO WORKSPACE (Operación Celular del Inquilino · SPEC-13)
  // -------------------------------------------------------------
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestedAccountId = req.nextUrl.searchParams.get("accountId");

  const result = await tenantChatwootEmbedService.resolveWorkspaceEmbedRedirect({
    clientId: context.activeClient?.id,
    user: {
      id: context.user.id,
      email: context.user.email,
      displayName: context.user.displayName,
    },
    role: context.role,
    effectiveRoles: context.effectiveRoles,
    hasCapability: Boolean(context.capabilities?.chatwoot_inboxes),
    publicBaseUrl,
    requestedAccountId,
    requestId,
  });

  if (!result.ok) {
    const title =
      result.status === 403
        ? "FORBIDDEN"
        : result.status === 404
          ? "NOT_FOUND"
          : "BAD_GATEWAY";

    return NextResponse.json(
      {
        type: "about:blank",
        title,
        status: result.status,
        code: result.code,
        detail: result.error,
        instance: req.nextUrl.pathname,
        reference: requestId,
      },
      {
        status: result.status,
        headers: {
          "content-type": "application/problem+json",
          "x-request-id": requestId,
        },
      },
    );
  }

  const res = NextResponse.redirect(result.data.redirectUrl, 307);
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Content-Security-Policy", buildWorkspaceFrameAncestorsCsp());
  res.headers.set("x-request-id", requestId);
  return res;
});
