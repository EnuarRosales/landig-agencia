# Technical Analysis & Implementation Blueprint · Milestone 2 (Features 9 & 10)

> **Document:** `analysis.md`  
> **Author:** Explorer 1 (`explorer_m2_1`)  
> **Milestone:** M2 — Authoritative Session Dispatch & Shell Bifurcation  
> **Features Covered:**  
> - Feature 9: Elimination of Insecure Role Fallback in `apps/admin/app/layout.tsx`  
> - Feature 10: Server-side Authoritative Session Resolution (`resolveAuthenticatedPortalContext`)  
> **Applicable Specs & Directives:** TNT-001 (R2, Acceptance Criteria), ADM-001 (D-15, D-31, D-35), AUTH-001 (§3.2, §5.6, T-28), TEST_READY.md (§5.1 Defect Escalation), AGENTS.md (§4.13, §4.14, §4.18)

---

## 1. Executive Summary & Problem Diagnosis

### 1.1 The Vulnerability: Insecure Role Fallback (Feature 9)
In `apps/admin/app/layout.tsx` (lines 44–54), when a user session is validated, the application queries active platform roles via `fetchUserActivePlatformRoles(user.id)`. When an authenticated non-platform user (such as a tenant owner, tenant agent, or prospect) logs in, they possess zero records in `admin.platform_user_roles`. Because `roles.length === 0`, the initial assignment `let role = "platform_owner"` remains untouched:

```typescript
// apps/admin/app/layout.tsx:44-54 (VULNERABLE PATTERN)
const { user, session } = validation.data;
let role = "platform_owner";
try {
  const roles = await fetchUserActivePlatformRoles(user.id);
  if (roles.length > 0) {
    role = roles.includes("platform_owner") ? "platform_owner" : (roles[0] || "platform_owner");
  }
} catch {
  // Fallback seguro a platform_owner
}
```

This represents a critical privilege escalation defect:
1. Every non-platform operator is falsely branded as a SaaS `platform_owner`.
2. Line 86 unconditionally mounts `<AdminShell currentUser={currentUser}>{children}</AdminShell>`, rendering the entire SaaS platform control plane (including links to cells, plans, billing, and platform audits) to tenant users and prospects.

### 1.2 Unauthenticated Session Leakage & Defect Escalation (TEST_READY.md §5.1)
As escalated during opaque-box test harness validation in `TEST_READY.md §5.1`:
- In `apps/admin/proxy.ts:31-38`, the edge proxy only checks `if (!sid)`. When an unauthenticated client supplies a forged, revoked, or whitespace session token (e.g., `mocter_sid=invalid_forged_session_token_12345`), `proxy.ts` passes the request through.
- In `apps/admin/app/layout.tsx`, `authService.validateSession(sid)` returns `{ ok: false }`, causing `getCurrentUser()` to return `undefined`.
- However, line 86 still renders `<AdminShell currentUser={undefined}>{children}</AdminShell>`, returning HTTP 200 with client component shell instead of intercepting the invalid session and redirecting to login with HTTP 307.

### 1.3 Solution Mandate (Feature 10)
Implement an authoritative, server-side session resolution function `resolveAuthenticatedPortalContext(sessionId: string): Promise<PortalContext | null>` residing in a dedicated module `packages/domain/src/services/session-context.service.ts` (as specified in `PROJECT.md:85`). This function strictly partitions user sessions into three mutually exclusive scopes:
1. **`scope: 'platform'`**: User has active records in `admin.platform_user_roles`. Role is derived from platform roles (`platform_owner`, `platform_admin`, `platform_sales`).
2. **`scope: 'onboarding_prospect'`**: User has no platform roles, and either has no assigned client or the client's `lifecycle_status === 'alta'`. Role is `'onboarding_prospect'` or `'tenant_owner'`.
3. **`scope: 'tenant'`**: User has no platform roles, possesses an active client whose `lifecycle_status === 'activo'`, and links to an active cell data plane via `admin.client_routing`. Role is `'tenant_owner'` (if owner) or `'tenant_agent'`.
4. **Invalid / Expired / Revoked Session**: Returns `null`. `apps/admin/app/layout.tsx` detects `null` and issues an immediate server-side redirect to the universal login portal (`/es/login?return_to=...`), completely aborting shell rendering.

---

## 2. Codebase Architecture & Evidence Chain

### 2.1 File Evidence & Code Locations

| File Path | Relevant Lines | Verbatim Finding |
|-----------|----------------|------------------|
| `apps/admin/app/layout.tsx` | Lines 45–53 | Hardcoded fallback `let role = "platform_owner"`. Tenant users with empty platform roles stay `platform_owner`. |
| `apps/admin/app/layout.tsx` | Line 86 | `<AdminShell currentUser={currentUser}>{children}</AdminShell>` mounts unconditionally even when `currentUser === undefined`. |
| `apps/admin/proxy.ts` | Lines 27–31 | `const sid = request.cookies.get(sidCookieName)?.value ...; if (!sid)`. Whitespace `sid = "   "` passes through without redirect. |
| `packages/domain/src/services/cell-authorization.service.ts` | Lines 44–62 | `fetchUserActivePlatformRoles(userId)` queries `admin.platform_user_roles` with `where(and(eq(userId), isNull(revokedAt)))`. Returns `string[]`. |
| `packages/domain/src/db/schemas/admin/users.ts` | Lines 47–52 | `activeClientId: uuid("active_client_id").references(() => clients.id)`. Puntero de membresía única. Nullable for prospects. |
| `packages/domain/src/db/schemas/admin/clients.ts` | Lines 30–45 | `ownerUserId`, `slug`, `displayName`, `lifecycleStatus` (`default: 'alta'`), `planId`. |
| `packages/domain/src/db/schemas/admin/client-routing.ts` | Lines 12–26 | `clientId` (unique), `cellId`, `routingStatus`. Resolves active cell for tenant. |
| `packages/domain/src/services/auth.service.ts` | Lines 2372–2435 | `validateSession(sid)` checks Redis cache and `admin.sessions`, enforces sliding window expiration, account active check, and returns `{ ok: true, data: { session, user } }`. |
| `tests/e2e/scenarios/scenario-b-bifurcated-session-dispatch.test.mjs` | Lines 44–163 | Tests B-T1.1 through B-T4.1 asserting exact scope strings (`platform`, `tenant`, `onboarding_prospect`), 307 redirects, and 401 API responses. |

### 2.2 Live Database State Verification (`db-portal`)
Direct query verification against PostgreSQL container `mocter-core-db-portal-1` confirms:
1. **Platform Users:**
   - `soporte@mocter.co` (`01a19874-1077-744c-8514-d4c990cd7259`): Role `platform_owner` in `admin.platform_user_roles`, `active_client_id: NULL`.
   - `admin@mocter.co` (`01a198b3-8b56-71d9-80af-118da05835c5`): Role `platform_admin` in `admin.platform_user_roles`, `active_client_id: NULL`.
   - `ventas@mocter.co` (`01a198b3-8b66-7b2d-9f2c-fcdca0feb88e`): Role `platform_sales` in `admin.platform_user_roles`, `active_client_id: NULL`.
2. **Tenant User (`Synergia Market`):**
   - User `synergiamarket25@gmail.com` (`01a1bc84-cbec-7a2c-9efe-3a3f55284113`): `active_client_id: '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `identity_location: '6ae5619b-7ca3-4764-baae-1b8950a8e534'`.
   - Has **0 rows** in `admin.platform_user_roles`.
   - Client `01a1bc84-cc30-73b6-bc84-1f0cda5a9661`: `lifecycle_status = 'alta'`, `owner_user_id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`.
   - Client routing maps `client_id` -> `cell_id: '6ae5619b-7ca3-4764-baae-1b8950a8e534'` (`cell-01`).

---

## 3. Technical Implementation Strategy & Blueprints

### Blueprint 1: `packages/domain/src/services/session-context.service.ts`

**Location:** `packages/domain/src/services/session-context.service.ts` (New File)  
**Export:** Added to `packages/domain/src/index.ts`  

```typescript
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, clients, clientRouting } from "../db/schemas";
import { authService } from "./auth.service";
import { fetchUserActivePlatformRoles } from "./cell-authorization.service";
import { appLogger } from "../utils/logger";

/**
 * Scopes autoritativos mutuamente excluyentes para el portal Mocter (TNT-RF-02, ADM-D-35).
 */
export type PortalScope = "platform" | "tenant" | "onboarding_prospect";

/**
 * Entidad de usuario tipada en el contexto de portal.
 */
export interface PortalContextUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailVerifiedAt: Date | null;
}

/**
 * Metadatos de sesión activa.
 */
export interface PortalContextSession {
  id: string;
  createdAt?: Date;
  expiresAt?: Date;
}

/**
 * Resumen del inquilino activo asociado al usuario en sesión.
 */
export interface PortalContextClient {
  id: string;
  slug: string;
  displayName: string;
  lifecycleStatus: string;
  planId: string;
}

/**
 * Contexto autoritativo de sesión resuelto en el servidor para layout y shells.
 */
export interface PortalContext {
  user: PortalContextUser;
  session: PortalContextSession;
  scope: PortalScope;
  role: string;
  effectiveRoles: string[];
  activeClientId: string | null;
  activeClient: PortalContextClient | null;
  activeCellId: string | null;
  lifecycleStatus: string | null;
}

/**
 * Resuelve de manera autoritativa el contexto y alcance de un usuario a partir de su sesión HTTP (AUTH-001, TNT-001).
 *
 * Reglas de negocio:
 * 1. Valida criptográfica y temporalmente la cookie `sid` contra Redis y `admin.sessions`.
 *    Si no es válida, está expirada o revocada, retorna `null` (Fail-Closed).
 * 2. Si el usuario posee roles activos en `admin.platform_user_roles`, resuelve `scope = 'platform'`.
 *    El rol asignado corresponde al rol de plataforma de mayor jerarquía (`platform_owner` > `platform_admin` > `platform_sales`).
 * 3. Si el usuario NO posee roles de plataforma:
 *    - NUNCA asigna `platform_owner` por omisión (eliminación de vulnerabilidad Feature 9).
 *    - Si no posee inquilino asignado o su estado es `alta`, resuelve `scope = 'onboarding_prospect'`.
 *    - Si posee inquilino asignado y su estado es `activo`, resuelve `scope = 'tenant'`.
 *    - Resuelve `activeCellId` desde `admin.client_routing` para habilitar el pool celular PgBouncer.
 *    - Resuelve el rol de inquilino (`tenant_owner` si es el propietario registrado, `tenant_agent` si es miembro).
 *
 * @param sessionId - Token opaco de sesión obtenido de la cookie `mocter_sid` o `__Host-mocter_sid`.
 * @returns Contexto autoritativo de portal, o `null` si la sesión no es válida.
 */
export async function resolveAuthenticatedPortalContext(
  sessionId: string,
): Promise<PortalContext | null> {
  const cleanSid = sessionId?.trim();
  if (!cleanSid) {
    return null;
  }

  try {
    // 1. Validar la sesión con el servicio central de autenticación
    const validation = await authService.validateSession(cleanSid);
    if (!validation.ok || !validation.data?.user) {
      return null;
    }

    const { user, session } = validation.data;
    if (user.status === "disabled") {
      return null;
    }

    const portalUser: PortalContextUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName || null,
      status: user.status || "active",
      emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null,
    };

    const portalSession: PortalContextSession = {
      id: session.id,
      createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : undefined,
    };

    // 2. Consultar roles de plataforma activos (admin.platform_user_roles)
    const platformRoles = await fetchUserActivePlatformRoles(user.id);
    if (platformRoles.length > 0) {
      const preferredRole = platformRoles.includes("platform_owner")
        ? "platform_owner"
        : (platformRoles[0] || "platform_admin");

      return {
        user: portalUser,
        session: portalSession,
        scope: "platform",
        role: preferredRole,
        effectiveRoles: platformRoles,
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        lifecycleStatus: null,
      };
    }

    // 3. Usuarios no plataforma: Resolver contexto de inquilino / prospecto
    const db = getDb();
    let targetClientId: string | null = user.activeClientId ?? null;

    // Si el usuario no tiene activeClientId en users, verificar si es owner de un cliente activo/alta
    if (!targetClientId) {
      const [ownedClient] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.ownerUserId, user.id),
            ne(clients.lifecycleStatus, "baja"),
          ),
        )
        .limit(1);

      if (ownedClient) {
        targetClientId = ownedClient.id;
      }
    }

    // Si no existe ningún cliente asociado -> Prospecto sin registro de empresa
    if (!targetClientId) {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        lifecycleStatus: "alta",
      };
    }

    // Consultar registro del cliente en admin.clients
    const [clientRecord] = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        ownerUserId: clients.ownerUserId,
        lifecycleStatus: clients.lifecycleStatus,
        planId: clients.planId,
      })
      .from(clients)
      .where(eq(clients.id, targetClientId))
      .limit(1);

    if (!clientRecord || clientRecord.lifecycleStatus === "baja") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        lifecycleStatus: clientRecord?.lifecycleStatus ?? "alta",
      };
    }

    // Consultar asignación celular en admin.client_routing
    const [routingRecord] = await db
      .select({
        cellId: clientRouting.cellId,
        routingStatus: clientRouting.routingStatus,
      })
      .from(clientRouting)
      .where(eq(clientRouting.clientId, clientRecord.id))
      .limit(1);

    const activeCellId = routingRecord?.cellId ?? null;
    const isOwner = clientRecord.ownerUserId === user.id;
    const resolvedRole = isOwner ? "tenant_owner" : "tenant_agent";

    const portalClient: PortalContextClient = {
      id: clientRecord.id,
      slug: clientRecord.slug,
      displayName: clientRecord.displayName,
      lifecycleStatus: clientRecord.lifecycleStatus,
      planId: clientRecord.planId,
    };

    // Caso A: Inquilino en estado 'alta' (onboarding pendiente)
    if (clientRecord.lifecycleStatus === "alta") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        lifecycleStatus: "alta",
      };
    }

    // Caso B: Inquilino en estado 'activo' (operación completa en /workspace)
    if (clientRecord.lifecycleStatus === "activo") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "tenant",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        lifecycleStatus: "activo",
      };
    }

    // Caso C: Otros estados operativos (ej. 'suspendido', 'bloqueado')
    return {
      user: portalUser,
      session: portalSession,
      scope: "tenant",
      role: resolvedRole,
      effectiveRoles: [resolvedRole],
      activeClientId: clientRecord.id,
      activeClient: portalClient,
      activeCellId,
      lifecycleStatus: clientRecord.lifecycleStatus,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[resolveAuthenticatedPortalContext Failed] ${msg}`, error);
    return null;
  }
}
```

---

### Blueprint 2: `packages/domain/src/index.ts` Export Registration

Add to `packages/domain/src/index.ts`:

```typescript
export * from "./services/session-context.service";
```

---

### Blueprint 3: `apps/admin/proxy.ts` Tightening for Edge Guards

**File:** `apps/admin/proxy.ts`  
**Purpose:** Ensure empty or whitespace-only cookies trigger immediate HTTP 307 redirection (satisfying B-T2.3) and propagate request path headers downstream for deterministic return URLs:

```typescript
// Replace lines 27-38 in apps/admin/proxy.ts with:
  const rawSid =
    request.cookies.get(sidCookieName)?.value ||
    request.cookies.get("mocter_sid")?.value;
  const sid = rawSid?.trim();

  if (!sid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Sesión no iniciada o expirada.", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const protoHeader = request.headers.get("x-forwarded-proto") || (isProduction ? "https" : request.nextUrl.protocol.replace(":", ""));

    const adminOrigin = hostHeader
      ? `${protoHeader}://${hostHeader}`
      : (process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co");

    let loginBase = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
    if (
      !isProduction &&
      request.nextUrl.hostname !== "localhost" &&
      request.nextUrl.hostname !== "127.0.0.1" &&
      !request.nextUrl.hostname.endsWith(".mocter.co") &&
      request.nextUrl.hostname !== "mocter.co"
    ) {
      loginBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3001`;
    }

    const fullRequestedUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, adminOrigin);
    const returnUrl = encodeURIComponent(fullRequestedUrl.href);
    const redirectUrl = new URL(`/es/login?return_to=${returnUrl}`, loginBase);

    return NextResponse.redirect(redirectUrl, 307);
  }

  // Propagar ruta y parámetros hacia Server Components downstream
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mocter-pathname", request.nextUrl.pathname);
  requestHeaders.set("x-mocter-search", request.nextUrl.search);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
```

---

### Blueprint 4: Complete Refactor of `apps/admin/app/layout.tsx` (Eliminating Role Fallback & Securing Shell)

**File:** `apps/admin/app/layout.tsx`  
**Purpose:**
1. Eliminate `let role = 'platform_owner'`.
2. Intercept invalid, expired, or forged sessions with an authoritative redirect to login (`HTTP 307`).
3. Guarantee that `<AdminShell>` is NEVER rendered for unauthenticated clients.
4. Pass authoritative role and user attributes into `currentUser`.

```tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { ThemeProvider } from "@/components/theme-provider";
import { AdminShell } from "@/components/admin-shell";
import type { CurrentUserDto } from "@/components/user-profile-modal";
import "./globals.css";

export const metadata: Metadata = {
  title: "mocter-admin · Plataforma SaaS",
  description: "Consola de administración corporativa de la SaaS Mocter",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * Construye la URL canónica hacia el portal universal de login (Regla 4.16, AUTH-001).
 */
function resolveLoginRedirect(reqHeaders: Headers): string {
  const isProduction = process.env.NODE_ENV === "production";
  const host = reqHeaders.get("x-forwarded-host") || reqHeaders.get("host") || "localhost:3003";
  const proto = reqHeaders.get("x-forwarded-proto") || (isProduction ? "https" : "http");
  const pathname = reqHeaders.get("x-mocter-pathname") || "/";
  const search = reqHeaders.get("x-mocter-search") || "";

  const adminOrigin = process.env.NEXT_PUBLIC_ADMIN_URL || `${proto}://${host}`;
  const loginBase = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");

  const fullRequestedUrl = new URL(pathname + search, adminOrigin);
  const returnUrl = encodeURIComponent(fullRequestedUrl.href);
  return `${loginBase.replace(/\/$/, "")}/es/login?return_to=${returnUrl}`;
}

/**
 * Layout raíz de la aplicación administrativa SaaS (ADM-001, DSN-001, TNT-001).
 *
 * Garantías de seguridad autoritativas:
 * 1. Resuelve la sesión en el servidor con `resolveAuthenticatedPortalContext(sid)`.
 * 2. Si la sesión es ausente, malformada, falsificada o revocada, ejecuta `redirect()` hacia login (HTTP 307);
 *    AdminShell NUNCA se monta para clientes no autenticados (Defecto TEST_READY.md §5.1 resuelto).
 * 3. Prohíbe de forma estricta cualquier fallback a `platform_owner` (Feature 9 resuelto).
 * 4. Hidrata `CurrentUserDto` con el rol y alcance autoritativo resuelto.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value;

  const reqHeaders = await headers();

  if (!sid || !sid.trim()) {
    redirect(resolveLoginRedirect(reqHeaders));
  }

  const portalContext = await resolveAuthenticatedPortalContext(sid);
  if (!portalContext) {
    redirect(resolveLoginRedirect(reqHeaders));
  }

  const currentUser: CurrentUserDto = {
    id: portalContext.user.id,
    email: portalContext.user.email,
    displayName: portalContext.user.displayName,
    role: portalContext.role,
    status: portalContext.user.status,
    emailVerifiedAt: portalContext.user.emailVerifiedAt ? portalContext.user.emailVerifiedAt.toISOString() : null,
    sessionCreatedAt: portalContext.session.createdAt ? portalContext.session.createdAt.toISOString() : undefined,
    sessionExpiresAt: portalContext.session.expiresAt ? portalContext.session.expiresAt.toISOString() : undefined,
  };

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AdminShell currentUser={currentUser}>{children}</AdminShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

### Blueprint 5: Unit Test Suite for Domain Service

**File:** `packages/domain/src/services/session-context.service.test.ts` (New File)  
**Execution Command:** `packages\domain\node_modules\.bin\vitest.cmd run src/services/session-context.service.test.ts`

Key test cases to implement:
1. `resolveAuthenticatedPortalContext("")` returns `null`.
2. `resolveAuthenticatedPortalContext("   ")` returns `null`.
3. `resolveAuthenticatedPortalContext("invalid_token")` where `authService.validateSession` returns `{ ok: false }` -> returns `null`.
4. User with `status: 'disabled'` -> returns `null`.
5. Platform operator with role `platform_owner` in `admin.platform_user_roles` -> returns `scope: 'platform'`, `role: 'platform_owner'`, `activeClientId: null`.
6. Non-platform user with no clients (prospect) -> returns `scope: 'onboarding_prospect'`, `role: 'onboarding_prospect'`, `lifecycleStatus: 'alta'`, `activeClientId: null`.
7. Non-platform owner with client in state `'alta'` (`Synergia Market`) -> returns `scope: 'onboarding_prospect'`, `role: 'tenant_owner'`, `lifecycleStatus: 'alta'`, `activeClientId: client.id`, `activeCellId: cell.id`.
8. Non-platform owner with client in state `'activo'` -> returns `scope: 'tenant'`, `role: 'tenant_owner'`, `lifecycleStatus: 'activo'`, `activeClientId: client.id`, `activeCellId: cell.id`.
9. Non-platform tenant agent (membership active, not client owner) -> returns `scope: 'tenant'`, `role: 'tenant_agent'`, `lifecycleStatus: 'activo'`.
10. Strict Fallback Elimination assertion: under zero conditions does any non-platform user receive `role: 'platform_owner'`.

---

## 4. Verification Matrix

| Step | Target Command | Expected Result |
|------|----------------|-----------------|
| 1 | `packages\domain\node_modules\.bin\vitest.cmd run src/services/session-context.service.test.ts` | 10 passed tests, 0 failures |
| 2 | `node tests/e2e/run.mjs --scenario=B` | 14/14 tests PASS |
| 3 | `node tests/e2e/run.mjs --tier=1` | All Tier 1 tests PASS |
| 4 | `node tests/e2e/run.mjs --tier=2` | All Tier 2 tests PASS (including B-T2.1, B-T2.2, B-T2.3, B-T2.4, B-T2.5) |
| 5 | Verify unauthenticated request with forged cookie: `curl -I -b "mocter_sid=forged_cookie_123" http://localhost:3003/admin/cells` | HTTP/1.1 307 Temporary Redirect to `/es/login` (AdminShell NOT rendered) |
| 6 | Verify Synergia Market login: resolves `scope = 'onboarding_prospect'`, `role = 'tenant_owner'`, never `'platform_owner'` | Verified by B-T2.1 and B-T2.4 |

---

## 5. Scope Handoff for Worker Implementer

The Worker implementation of Features 9 & 10 must:
1. Create `packages/domain/src/services/session-context.service.ts` per Blueprint 1.
2. Export it from `packages/domain/src/index.ts` per Blueprint 2.
3. Create `packages/domain/src/services/session-context.service.test.ts` per Blueprint 5 and run vitest to verify.
4. Update `apps/admin/proxy.ts` per Blueprint 3 to trim cookie values and forward path headers.
5. Update `apps/admin/app/layout.tsx` per Blueprint 4 to eliminate the fallback and securely enforce server-side session resolution and redirection.
6. Run `node tests/e2e/run.mjs --scenario=B` and verify 14/14 pass.
