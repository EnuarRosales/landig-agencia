import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { AdminShell } from "@/components/admin-shell";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";
import type { CurrentUserDto } from "@/components/user-profile-modal";

/**
 * Propiedades del enrutador autoritativo de cascarones visuales.
 */
export interface PortalShellRouterProps {
  children: ReactNode;
}

/**
 * Resuelve la URL canónica de login unificado para redirecciones server-side (AUTH-D-09, Regla 4.16).
 *
 * @param pathname - Ruta solicitada para preservar el retorno tras autenticación exitosa.
 * @param host - Encabezado Host entrante para resolución dinámica de entornos locales o staging.
 * @param proto - Protocolo HTTP resuelto (http o https).
 */
function getLoginRedirectUrl(pathname?: string, host?: string, proto?: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  let loginBase =
    process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");

  const isPrivateIp =
    Boolean(
      host &&
        (host.startsWith("192.168.") ||
          host.startsWith("10.") ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host)),
    );

  if (!isProduction && isPrivateIp && host) {
    const hostWithoutPort = host.split(":")[0];
    loginBase = `${proto || "http"}://${hostWithoutPort}:3001`;
  }

  const returnTo = pathname ? `?return_to=${encodeURIComponent(pathname)}` : "";
  return `${loginBase.replace(/\/$/, "")}/es/login${returnTo}`;
}

/**
 * Enrutador autoritativo de cascarones visuales a nivel de servidor (ADM-001 D-35, TNT-001 R2, Feature 11).
 *
 * Responsabilidades:
 * 1. Resuelve el contexto autoritativo de sesión (resolveAuthenticatedPortalContext) en servidor.
 * 2. Bloquea de raíz sesiones anónimas, expiradas o con tokens falsificados (TEST_READY.md §5.1),
 *    redirigiendo inmediatamente a /es/login (HTTP 307) antes de montar cualquier componente.
 * 3. Evalúa la ruta activa (x-pathname propagado por proxy.ts) y bifurca los árboles .tsx:
 *    - scope === 'onboarding_prospect' o lifecycleStatus === 'alta' -> layout limpio en /onboarding.
 *    - scope === 'platform' -> <AdminShell> en /admin/* y /.
 *    - scope === 'tenant' -> <TenantWorkspaceShell> en /workspace/*.
 * 4. Intercepta y redirige cualquier intento de navegación cruzada entre planos.
 */
export async function PortalShellRouter({ children }: PortalShellRouterProps) {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || headerList.get("x-mocter-pathname") || "";
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3003";
  const proto = headerList.get("x-forwarded-proto") || (isProduction ? "https" : "http");

  // 1. Redirección inmediata si no hay cookie de sesión activa o es solo espacios
  if (!sid) {
    redirect(getLoginRedirectUrl(pathname, host, proto));
  }

  // 2. Validación autoritativa en base de datos de control
  const portalContext = await resolveAuthenticatedPortalContext(sid);
  if (!portalContext || !portalContext.user) {
    // Sesión revocada, inexistente o falsificada -> 307 a login (previene fuga de AdminShell)
    redirect(getLoginRedirectUrl(pathname, host, proto));
  }

  const {
    scope,
    lifecycleStatus,
    user,
    role,
    activeClient,
    activeCellCode,
    planName,
    capabilities,
  } = portalContext;

  const currentUserDto: CurrentUserDto = {
    id: user.id,
    email: user.email,
    displayName: user.displayName || null,
    role: role || (scope === "platform" ? "platform_owner" : "tenant_owner"),
    status: user.status || "active",
    emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toISOString() : null,
  };

  // 3. CASO A: Prospecto o inquilino en estado 'alta' (onboarding obligatorio)
  if (scope === "onboarding_prospect" || lifecycleStatus === "alta") {
    if (pathname && !pathname.startsWith("/onboarding")) {
      redirect("/onboarding");
    }
    // En /onboarding: renderizar layout limpio sin barras laterales corporativas ni de comercio
    return (
      <main className="min-h-dvh w-full bg-[var(--dsn-background)] text-[var(--dsn-text)]">
        {children}
      </main>
    );
  }

  // 4. CASO B: Operador corporativo SaaS (scope === 'platform')
  if (scope === "platform") {
    // Intercepción de fuga hacia /workspace
    if (pathname && pathname.startsWith("/workspace")) {
      redirect("/admin");
    }
    // Si visita /onboarding en modo supervisión
    if (pathname && pathname.startsWith("/onboarding")) {
      return (
        <main className="min-h-dvh w-full bg-[var(--dsn-background)] text-[var(--dsn-text)]">
          {children}
        </main>
      );
    }
    return (
      <AdminShell currentUser={currentUserDto} tenantCapabilities={capabilities}>
        {children}
      </AdminShell>
    );
  }

  // 5. CASO C: Inquilino activo (scope === 'tenant' con lifecycleStatus === 'activo')
  if (scope === "tenant") {
    // Intercepción de fuga hacia /admin/* o /
    if (pathname && (pathname.startsWith("/admin") || pathname === "/")) {
      redirect("/workspace");
    }
    // Si visita /onboarding y ya está activo, enviar a /workspace
    if (pathname && pathname.startsWith("/onboarding")) {
      redirect("/workspace");
    }
    return (
      <TenantWorkspaceShell
        currentUser={currentUserDto}
        tenant={{
          id: activeClient?.id || "",
          name: activeClient?.displayName || activeClient?.name || "Mi Comercio",
          slug: activeClient?.slug || "comercio",
          cellCode: activeCellCode || "pg-cell-01",
          planName: planName || "Plan Pro",
        }}
        capabilities={capabilities}
      >
        {children}
      </TenantWorkspaceShell>
    );
  }

  // 6. CASO D: Scope anómalo o desconocido -> Redirección defensiva a login
  redirect(getLoginRedirectUrl(pathname, host, proto));
}
