# Technical Analysis & Implementation Blueprint · Milestone 2 (Features 12 & 13)
**Navigation Guards, Session Perimeter Defense, and Post-Authentication Redirect Alignment**

> **Author:** Explorer 3 (`explorer_m2_3`)  
> **Applicable Specifications:** TNT-001 (R2), ADM-001 (D-30, D-31, D-35), AUTH-001 (AUTH-D-09), AGENTS.md (§4.12, §4.13, §4.14, §4.16, §4.18)  
> **Status:** COMPLETED & READY FOR WORKER IMPLEMENTATION  

---

## 1. Executive Summary

Milestone 2 establishes strict multi-tenant boundary separation across `apps/admin` (mocter-admin) and `apps/web`. While Features 9, 10, and 11 focus on session context resolution and shell rendering, **Features 12 & 13** govern the **dynamic perimeter and routing guards**:
1. **Feature 12 (Server-side Navigation Guards):** Guarantees that no unauthenticated, forged, or cross-scope access is permitted on any route. Malformed/revoked sessions redirect immediately to login (`HTTP 307`) with ZERO shell HTML rendered. Non-platform users accessing `/admin/*` or `/` are intercepted and redirected to `/workspace` (if `activo`) or `/onboarding` (if `alta`). Platform operators accessing `/workspace/*` without tenant context are intercepted and redirected to `/admin`.
2. **Feature 13 (Post-Authentication Redirect Alignment in `apps/web`):** Aligns the post-authentication redirect logic across `login-form.tsx`, OAuth callbacks (`google` & `facebook`), and `apps/web/proxy.ts` so that:
   - Platform users deterministically land on `NEXT_PUBLIC_ADMIN_URL/admin`.
   - Active tenant users (`lifecycle_status === 'activo'`) land on `NEXT_PUBLIC_ADMIN_URL/workspace`.
   - Onboarding prospect users (`lifecycle_status === 'alta'` or `clientId === null`) land on `NEXT_PUBLIC_ADMIN_URL/onboarding`.

---

## 2. Direct Observations & Technical Diagnostics

### Observation 1: Forged / Revoked Cookie Shell Leakage (`apps/admin/proxy.ts` & `layout.tsx`)
- **Location:** `apps/admin/proxy.ts:27-31` and `apps/admin/app/layout.tsx:40-42, 86`
- **Verbatim Code (`apps/admin/proxy.ts:27-31`):**
  ```typescript
  const sid =
    request.cookies.get(sidCookieName)?.value ||
    request.cookies.get("mocter_sid")?.value;

  if (!sid) {
    // redirects to login
  }
  return NextResponse.next();
  ```
- **Verbatim Code (`apps/admin/app/layout.tsx:86`):**
  ```tsx
  <AdminShell currentUser={currentUser}>{children}</AdminShell>
  ```
- **Live HTTP Probe Result:**
  Executing:
  ```bash
  node -e "fetch('http://localhost:3003/admin/cells', { headers: { Cookie: 'mocter_sid=invalid_forged_session_token_12345' }, redirect: 'manual' }).then(r => console.log('STATUS:', r.status))"
  ```
  Returns:
  ```
  STATUS: 200 LOCATION: null
  ```
- **Diagnosis:** `proxy.ts` only checks if `!sid`. When a forged, invalid, or expired cookie is supplied, `proxy.ts` permits the request. Next.js executes `apps/admin/app/layout.tsx`, where `authService.validateSession(sid)` returns `{ ok: false }`, leaving `currentUser = undefined`. However, line 86 still mounts `<AdminShell currentUser={undefined}>{children}</AdminShell>`, rendering the entire SaaS platform administration interface and leaking navigation controls to unauthenticated clients (Defect escalated in `TEST_READY.md §5.1`).

### Observation 2: Path Stripping & Missing Route Handling in `apps/web/proxy.ts`
- **Location:** `apps/web/proxy.ts:28-79`
- **Verbatim Code:**
  ```typescript
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/es/admin") || pathname.startsWith("/en/admin")) {
    ...
    const subPath = pathname.replace(/^(\/(es|en))?\/admin/, "") || "/";
    const targetUrl = new URL(subPath, adminBase);
    return NextResponse.redirect(targetUrl, 307);
  }
  ```
- **Diagnosis:**
  1. `pathname.replace(/^(\/(es|en))?\/admin/, "")` strips `/admin`. As a result, requesting `http://localhost:3001/es/admin/cells` redirects to `http://localhost:3003/cells` (HTTP 404), completely breaking deep linking!
  2. `apps/web/proxy.ts` has no matcher or handling for `/workspace` or `/onboarding`. Any attempt to hit `http://localhost:3001/workspace` or `http://localhost:3001/onboarding` falls through to `next-intl` and returns HTTP 404.

### Observation 3: Incoherent Post-Login Targets in `apps/web/components/auth/login-form.tsx`
- **Location:** `apps/web/components/auth/login-form.tsx:84-104`
- **Verbatim Code:**
  ```typescript
  if (userRole.startsWith("platform_")) {
    target = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co";
  } else if (!clientId) {
    target = `/${locale}/onboarding`;
  } else {
    target = `/${locale}/admin`;
  }
  ```
- **Diagnosis:**
  1. Platform users are redirected to `NEXT_PUBLIC_ADMIN_URL` root (`/`), rather than `/admin`.
  2. Prospect users (`!clientId`) are redirected to `/${locale}/onboarding` on `apps/web` (port 3001), where no onboarding wizard exists (HTTP 404).
  3. Active tenant users (`clientId !== null`) are redirected to `/${locale}/admin` on port 3001, which proxies to port 3003 root (`/`), dropping tenants into the SaaS platform control plane (`AdminHomePage`).
  4. There is no evaluation of `lifecycle_status === 'alta'`. A tenant with an assigned client in `alta` state is incorrectly treated as active and redirected to `/admin` instead of `/onboarding`.

### Observation 4: Unconditional Root Redirects in OAuth Callbacks
- **Location:** `apps/web/app/api/auth/google/callback/route.ts:235` and `facebook/callback/route.ts:230`
- **Verbatim Code:**
  ```typescript
  : NextResponse.redirect(new URL(process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003"), {
      status: 303,
    });
  ```
- **Diagnosis:** OAuth callbacks unconditionally redirect all authenticating users to the root `/` of `mocter-admin`, with zero inspection of platform roles, client membership, or lifecycle status.

### Observation 5: Missing Route `/admin` in `apps/admin`
- **Location:** `apps/admin/app/admin/`
- **Observation:** `apps/admin/app/admin/page.tsx` does NOT exist (`Test-Path` returned `False`). The control plane dashboard currently exists only at `apps/admin/app/page.tsx` (`/`). If platform users are redirected to `/admin`, Next.js will return HTTP 404 unless `apps/admin/app/admin/page.tsx` is created.

---

## 3. Architecture & Design Blueprint

### 3.1 Defense-in-Depth Navigation Guard Architecture (Feature 12)

We establish a **3-Tier Defense System** governing server-side navigation:

```
[ Incoming HTTP Request ]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│  Tier 1: apps/admin/proxy.ts (Edge Perimeter)         │
│  - Inspects mocter_sid cookie presence & whitespace.   │
│  - If empty/missing:                                   │
│    * /api/* -> HTTP 401 JSON UNAUTHORIZED              │
│    * Page routes -> HTTP 307 Redirect to /es/login     │
│  - Injects `x-pathname` & `x-request-id` into headers. │
└─────────────────────────┬──────────────────────────────┘
                          │ (cookie present)
                          ▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: apps/admin/app/layout.tsx (Root Layout Guard) │
│  - Resolves authoritative session via                  │
│    `resolveAuthenticatedPortalContext(sid)`.           │
│  - If invalid/revoked/forged session:                  │
│    -> Calls redirect(loginUrl) [HTTP 307].             │
│    -> ZERO SHELL HTML LEAKED.                          │
│  - Global Cross-Scope Interception:                    │
│    * Path `/`:                                         │
│      - platform -> redirect(/admin)                    │
│      - tenant (activo) -> redirect(/workspace)        │
│      - prospect / alta -> redirect(/onboarding)        │
│    * Path `/admin/*` & scope !== 'platform':           │
│      - tenant (activo) -> redirect(/workspace)        │
│      - prospect / alta -> redirect(/onboarding)        │
│    * Path `/workspace/*`:                              │
│      - scope === 'platform' (no tenant) -> /admin      │
│      - lifecycle_status === 'alta' -> /onboarding      │
│    * Path `/onboarding`:                               │
│      - scope === 'platform' -> redirect(/admin)        │
│      - tenant (activo) -> redirect(/workspace)         │
└─────────────────────────┬──────────────────────────────┘
                          │ (authorized scope)
                          ▼
┌────────────────────────────────────────────────────────┐
│  Tier 3: Subtree Layout Guards (Defense-in-Depth)      │
│  - `app/admin/layout.tsx`     -> asserts scope==='platform'
│  - `app/workspace/layout.tsx` -> asserts scope==='tenant' && activo
│  - `app/onboarding/layout.tsx`-> asserts prospect || alta
└────────────────────────────────────────────────────────┘
```

### 3.2 Canonical Post-Authentication Routing Contract (Feature 13)

The following contract must be enforced identically across:
1. `apps/web/components/auth/login-form.tsx`
2. `apps/web/app/api/auth/login/route.ts`
3. `apps/web/app/api/auth/google/callback/route.ts`
4. `apps/web/app/api/auth/facebook/callback/route.ts`
5. `apps/web/proxy.ts`

| User Scope / Condition | Canonical Target Destination | Status Code |
|---|---|---|
| **Platform Operator** (`scope === 'platform'` or `role.startsWith("platform_")`) | `${NEXT_PUBLIC_ADMIN_URL}/admin` | 303 (OAuth) / 307 (Proxy) |
| **Active Tenant** (`scope === 'tenant'` & `lifecycle_status === 'activo'`) | `${NEXT_PUBLIC_ADMIN_URL}/workspace` | 303 (OAuth) / 307 (Proxy) |
| **Onboarding Prospect** (`scope === 'onboarding_prospect'`, `lifecycle_status === 'alta'`, or `clientId === null`) | `${NEXT_PUBLIC_ADMIN_URL}/onboarding` | 303 (OAuth) / 307 (Proxy) |
| **Unauthenticated / Expired** | `${NEXT_PUBLIC_APP_URL}/es/login?return_to=...` | 307 (Temporary Redirect) |

---

## 4. Concrete Implementation Blueprint for the Worker

### Component 1: `apps/admin/proxy.ts` (Perimeter Guard & Header Injection)

Update `apps/admin/proxy.ts` to:
1. Catch empty or whitespace-only cookies (`!sid || !sid.trim()`).
2. Propagate `x-pathname` so server components know the active path.
3. Propagate `x-request-id` for structured logging.

```typescript
// Blueprint for apps/admin/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Exempt routes
  if (
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
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

  // Inject x-pathname and x-request-id for Server Component Guards
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  if (!requestHeaders.has("x-request-id")) {
    requestHeaders.set("x-request-id", crypto.randomUUID());
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!api/health|api/webhooks|_next|.*\\..*).*)"],
};
```

---

### Component 2: `apps/admin/app/layout.tsx` (Authoritative Server-side Guard)

Replace insecure role fallback with `resolveAuthenticatedPortalContext(sid)` and route guard intercepts:

```typescript
// Blueprint for apps/admin/app/layout.tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { ThemeProvider } from "@/components/theme-provider";
import { AdminShell } from "@/components/admin-shell";
import { TenantWorkspaceShell } from "@/components/tenant-workspace-shell";
import "./globals.css";

function buildLoginRedirectUrl(pathname: string, host: string, proto: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  let loginBase = process.env.NEXT_PUBLIC_APP_URL || (isProduction ? "https://mocter.co" : "http://localhost:3001");
  if (
    !isProduction &&
    !host.startsWith("localhost") &&
    !host.startsWith("127.0.0.1") &&
    !host.endsWith(".mocter.co") &&
    host !== "mocter.co"
  ) {
    const hostWithoutPort = host.split(":")[0];
    loginBase = `${proto}://${hostWithoutPort}:3001`;
  }
  const returnUrl = encodeURIComponent(`${proto}://${host}${pathname}`);
  return `${loginBase}/es/login?return_to=${returnUrl}`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "/";
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3003";
  const proto = headerList.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");

  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  // 1. Guard against unauthenticated / missing / whitespace cookie
  if (!sid) {
    redirect(buildLoginRedirectUrl(pathname, host, proto));
  }

  // 2. Authoritative context resolution
  const portalContext = await resolveAuthenticatedPortalContext(sid);

  // 3. Guard against forged, invalid, or expired session (Defect TEST_READY.md §5.1)
  if (!portalContext || !portalContext.user) {
    redirect(buildLoginRedirectUrl(pathname, host, proto));
  }

  const { scope, lifecycleStatus } = portalContext;

  // 4. Server-side Cross-Scope Navigation Guards (Feature 12)
  if (pathname === "/") {
    if (scope === "platform") {
      redirect("/admin");
    } else if (scope === "tenant" && lifecycleStatus === "activo") {
      redirect("/workspace");
    } else {
      redirect("/onboarding");
    }
  }

  // Non-platform user attempting to access /admin/*
  if (pathname.startsWith("/admin") && scope !== "platform") {
    if (scope === "tenant" && lifecycleStatus === "activo") {
      redirect("/workspace");
    } else {
      redirect("/onboarding");
    }
  }

  // Platform operator or un-onboarded tenant attempting to access /workspace/*
  if (pathname.startsWith("/workspace")) {
    if (scope === "platform") {
      redirect("/admin");
    } else if (scope === "onboarding_prospect" || lifecycleStatus === "alta") {
      redirect("/onboarding");
    }
  }

  // User accessing /onboarding
  if (pathname.startsWith("/onboarding")) {
    if (scope === "platform") {
      redirect("/admin");
    } else if (scope === "tenant" && lifecycleStatus === "activo") {
      redirect("/workspace");
    }
  }

  // 5. Mutually Exclusive Shell Bifurcation (Feature 11)
  let shellContent: ReactNode;
  if (pathname.startsWith("/admin")) {
    shellContent = <AdminShell currentUser={portalContext.user}>{children}</AdminShell>;
  } else if (pathname.startsWith("/workspace")) {
    shellContent = <TenantWorkspaceShell portalContext={portalContext}>{children}</TenantWorkspaceShell>;
  } else {
    // /onboarding or un-shelled views
    shellContent = children;
  }

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-[var(--dsn-background)] text-[var(--dsn-text)] antialiased transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {shellContent}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

### Component 3: `apps/admin/app/admin/page.tsx` (Admin Dashboard Home)

Create `apps/admin/app/admin/page.tsx` so `/admin` renders the SaaS Control Plane Dashboard:

```typescript
// Blueprint for apps/admin/app/admin/page.tsx
export { default } from "../page";
```

*(Alternatively, move the contents of `app/page.tsx` to `app/admin/page.tsx`, and make `app/page.tsx` issue the canonical redirect).*

---

### Component 4: Subtree Layout Guards (Defense-in-Depth)

1. **`apps/admin/app/admin/layout.tsx`**:
   ```typescript
   import { cookies } from "next/headers";
   import { redirect } from "next/navigation";
   import { resolveAuthenticatedPortalContext } from "@mocter/domain";

   export default async function AdminSubtreeLayout({ children }: { children: React.ReactNode }) {
     const cookieStore = await cookies();
     const isProduction = process.env.NODE_ENV === "production";
     const sid = cookieStore.get(isProduction ? "__Host-mocter_sid" : "mocter_sid")?.value?.trim();
     const context = await resolveAuthenticatedPortalContext(sid || "");
     if (!context || context.scope !== "platform") {
       if (context?.scope === "tenant" && context.lifecycleStatus === "activo") {
         redirect("/workspace");
       } else {
         redirect("/onboarding");
       }
     }
     return <>{children}</>;
   }
   ```

2. **`apps/admin/app/workspace/layout.tsx`**:
   ```typescript
   import { cookies } from "next/headers";
   import { redirect } from "next/navigation";
   import { resolveAuthenticatedPortalContext } from "@mocter/domain";

   export default async function WorkspaceSubtreeLayout({ children }: { children: React.ReactNode }) {
     const cookieStore = await cookies();
     const isProduction = process.env.NODE_ENV === "production";
     const sid = cookieStore.get(isProduction ? "__Host-mocter_sid" : "mocter_sid")?.value?.trim();
     const context = await resolveAuthenticatedPortalContext(sid || "");
     if (!context || context.scope !== "tenant" || context.lifecycleStatus !== "activo") {
       if (context?.scope === "platform") {
         redirect("/admin");
       } else {
         redirect("/onboarding");
       }
     }
     return <>{children}</>;
   }
   ```

---

### Component 5: `apps/web/components/auth/login-form.tsx` (Post-Auth Redirects)

Update `apps/web/components/auth/login-form.tsx:84-104` to eliminate port 3001 self-redirects and enforce deterministic cross-origin navigation:

```typescript
// Blueprint for apps/web/components/auth/login-form.tsx:78-107
      // Redirección inteligente post-login según AUTH-D-09 y TNT-001 M2
      let target = returnTo;
      if (!target) {
        const userRole = data.data?.user?.role || "";
        const clientId = data.data?.clientId;
        const lifecycleStatus = data.data?.lifecycleStatus;

        let adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.mocter.co";
        if (typeof window !== "undefined") {
          const hostname = window.location.hostname;
          if (
            hostname !== "localhost" &&
            hostname !== "127.0.0.1" &&
            !hostname.endsWith(".mocter.co") &&
            hostname !== "mocter.co"
          ) {
            adminBase = `${window.location.protocol}//${hostname}:3003`;
          } else if (hostname === "localhost" || hostname === "127.0.0.1") {
            adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3003";
          }
        }

        if (userRole.startsWith("platform_") || data.data?.scope === "platform") {
          // (1) Operador de plataforma -> Backoffice corporativo /admin
          target = `${adminBase}/admin`;
        } else if (!clientId || lifecycleStatus === "alta" || data.data?.scope === "onboarding_prospect") {
          // (3) Prospecto o inquilino en alta -> Asistente guiado de onboarding
          target = `${adminBase}/onboarding`;
        } else {
          // (2) Inquilino activo -> Aplicación celular del inquilino /workspace
          target = `${adminBase}/workspace`;
        }
      }

      window.location.href = target;
```

---

### Component 6: `apps/web/app/api/auth/login/route.ts` (Lifecycle Status Payload)

In `apps/web/app/api/auth/login/route.ts`, when preparing the success payload, query `clients.lifecycleStatus` so `login-form.tsx` receives authoritative data:

```typescript
    // In apps/web/app/api/auth/login/route.ts (around line 285)
    let lifecycleStatus: string | null = null;
    if (result.data.clientId) {
      const clientRow = await db.query.clients.findFirst({
        where: eq(clients.id, result.data.clientId),
        columns: { lifecycleStatus: true },
      });
      lifecycleStatus = clientRow?.lifecycleStatus ?? null;
    }

    const response = NextResponse.json(
      {
        ok: true,
        data: {
          user: result.data.user,
          emailVerified: result.data.emailVerified,
          clientId: result.data.clientId,
          lifecycleStatus,
          expiresAt: result.data.expiresAt,
        },
      },
      { status: 200 },
    );
```

---

### Component 7: `apps/web/app/api/auth/google/callback/route.ts` & `facebook/callback/route.ts`

Update OAuth callbacks to redirect deterministically according to the routing contract:

```typescript
// Blueprint for OAuth callbacks (google and facebook callback routes)
    const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || (isProduction ? "https://admin.mocter.co" : "http://localhost:3003");
    let targetPath = "/onboarding";

    if (result.data.user.role?.startsWith("platform_")) {
      targetPath = "/admin";
    } else if (result.data.clientId) {
      const clientRow = await db.query.clients.findFirst({
        where: eq(clients.id, result.data.clientId),
        columns: { lifecycleStatus: true },
      });
      targetPath = clientRow?.lifecycleStatus === "activo" ? "/workspace" : "/onboarding";
    }

    const targetUrl = new URL(targetPath, adminBase);

    const response = acceptsJson
      ? NextResponse.json(
          {
            ok: true,
            data: {
              user: result.data.user,
              emailVerified: result.data.emailVerified,
              clientId: result.data.clientId,
              targetUrl: targetUrl.toString(),
              expiresAt: result.data.expiresAt,
            },
          },
          { status: 200 },
        )
      : NextResponse.redirect(targetUrl, { status: 303 });
```

---

### Component 8: `apps/web/proxy.ts` (Admin & Backoffice Reverse Routing)

Update `apps/web/proxy.ts` lines 27-79 to handle `/admin`, `/workspace`, and `/onboarding` without stripping valid subpaths:

```typescript
// Blueprint for apps/web/proxy.ts:27-79
  const pathname = request.nextUrl.pathname;
  const isBackofficeRoute =
    pathname === "/admin" || pathname.startsWith("/es/admin") || pathname.startsWith("/en/admin") ||
    pathname === "/workspace" || pathname.startsWith("/es/workspace") || pathname.startsWith("/en/workspace") ||
    pathname === "/onboarding" || pathname.startsWith("/es/onboarding") || pathname.startsWith("/en/onboarding");

  if (isBackofficeRoute) {
    const isProduction = process.env.NODE_ENV === "production";
    const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
    const sid = request.cookies.get(sidCookieName)?.value || request.cookies.get("mocter_sid")?.value;

    if (!sid) {
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
      const returnUrl = encodeURIComponent(request.nextUrl.href);
      const targetLogin = new URL(`/es/login?return_to=${returnUrl}`, loginBase);

      logger.warn({
        event: "proxy.backoffice_unauthorized_redirect",
        requestId,
        from: pathname,
        to: targetLogin.toString(),
      });

      return NextResponse.redirect(targetLogin, 307);
    }

    let adminBase = process.env.NEXT_PUBLIC_ADMIN_URL || (isProduction ? "https://admin.mocter.co" : "http://localhost:3003");
    if (
      !isProduction &&
      request.nextUrl.hostname !== "localhost" &&
      request.nextUrl.hostname !== "127.0.0.1" &&
      !request.nextUrl.hostname.endsWith(".mocter.co") &&
      request.nextUrl.hostname !== "mocter.co"
    ) {
      adminBase = `${request.nextUrl.protocol}//${request.nextUrl.hostname}:3003`;
    }

    // Strip locale prefix (/es or /en) while preserving /admin, /workspace, or /onboarding!
    const canonicalPath = pathname.replace(/^\/(es|en)/, "") || "/";
    const targetUrl = new URL(canonicalPath + request.nextUrl.search, adminBase);

    logger.info({
      event: "proxy.backoffice_redirect",
      requestId,
      from: pathname,
      to: targetUrl.toString(),
    });

    return NextResponse.redirect(targetUrl, 307);
  }
```

---

## 5. Summary of Affected Files

| File | Change Type | Purpose |
|---|---|---|
| `apps/admin/proxy.ts` | Edit | Whitespace cookie rejection, `x-pathname` header injection |
| `apps/admin/app/layout.tsx` | Edit | Session resolution, invalid cookie 307 redirect, cross-scope navigation guards |
| `apps/admin/app/admin/page.tsx` | Create | Route `/admin` rendering SaaS Control Plane dashboard |
| `apps/admin/app/admin/layout.tsx` | Create | Subtree layout guard for `/admin/*` |
| `apps/admin/app/workspace/layout.tsx` | Create | Subtree layout guard for `/workspace/*` |
| `apps/admin/app/onboarding/layout.tsx` | Create | Subtree layout guard for `/onboarding/*` |
| `apps/web/components/auth/login-form.tsx` | Edit | Align post-auth redirects to `/admin`, `/workspace`, `/onboarding` |
| `apps/web/app/api/auth/login/route.ts` | Edit | Query & return `lifecycleStatus` |
| `apps/web/app/api/auth/google/callback/route.ts` | Edit | Deterministic post-OAuth redirect |
| `apps/web/app/api/auth/facebook/callback/route.ts` | Edit | Deterministic post-OAuth redirect |
| `apps/web/proxy.ts` | Edit | Reverse routing for `/admin`, `/workspace`, `/onboarding` preserving full path |
