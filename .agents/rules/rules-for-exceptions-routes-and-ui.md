---
description: "Parte 2/2: Reglas de Route Handlers, límites de error (UI), Client Components y verificación de excepciones en Next.js 16 + TypeScript."
globs:
  - "app/**/*.{ts,tsx}"
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "proxy.ts"
alwaysApply: true
---

# Regla: Manejo de Excepciones — Parte 2: Rutas, UI y Verificación

> **Estado:** Permanente y no negociable para desarrolladores y agentes de IA.  
> **Vinculación:** Parte 2 de 2. Complementaria y vinculante con [rules-for-exceptions-core-and-server.md](rules-for-exceptions-core-and-server.md).  
> **Alcance:** Todo el monorepo (`apps/web`, `apps/admin`).  
> **Propósito:** Normar el manejo de excepciones en Server Components, el envoltorio canónico RFC 9457 `handle()` en Route Handlers, la recuperación en Error Boundaries (`retry`), el consumo en Client Components y la lista de prohibiciones.

---

## 1. Server Components (Páginas, Layouts, `generateMetadata`)

- Recurso inexistente → `notFound()` con `not-found.tsx` en el segmento.
- Sin sesión o sin permiso → alternativa estable: `redirect('/login')` para sesión y `notFound()` para ocultar recursos sin permiso. _(Nota: `unauthorized()` y `forbidden()` requieren `experimental.authInterrupts: true`; no habilitar sin autorización explícita)._
- Fallo de datos **no crítico** para la página → renderizar estado degradado (mensaje o sección vacía) en lugar de lanzar.
- Fallo **crítico** → lanzar y dejar que lo capture `error.tsx`.
- Aislar secciones independientes con `<Suspense>` + `catchError` para que un fallo local no interrumpa la página completa.
- Las interrupciones lanzadas después de enviar cabeceras (streaming) responden con estado 200; las comprobaciones de acceso se hacen **antes** de cualquier `<Suspense>`.

---

## 2. Route Handlers (`app/**/route.ts`)

- Único punto de traducción a HTTP: el envoltorio `handle()` convierte excepciones en respuestas con formato **RFC 9457 (Problem Details)**.
- Nunca devolver `stack`, `cause`, SQL, rutas internas ni mensajes de librerías.

```ts
// lib/errors/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { isAppError } from "./app-error";
import { HTTP_STATUS } from "./http-status";
import { logger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      return await fn(req, ctx);
    } catch (e: unknown) {
      unstable_rethrow(e);
      const known = isAppError(e);
      const code = known ? e.code : "INTERNAL";
      const status = HTTP_STATUS[code];

      if (status >= 500) {
        logger.error({
          event: "route.unhandled_error",
          requestId,
          path: req.nextUrl.pathname,
          err: serializeError(e),
        });
      }

      return NextResponse.json(
        {
          type: "about:blank",
          title: code,
          status,
          detail:
            known && e.expose
              ? e.message
              : "No fue posible procesar la solicitud.",
          instance: req.nextUrl.pathname,
          reference: requestId,
        },
        {
          status,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": requestId,
          },
        },
      );
    }
  };
}
```

- Errores 4xx se registran como `warn` solo si aportan valor de auditoría; los 5xx siempre como `error` (una única vez, aquí).

---

## 3. `proxy.ts`

- No lanza errores para controlar acceso: responde explícitamente (`NextResponse.redirect`, `NextResponse.json(problem, { status })`).
- Errores inesperados dentro de `proxy` llegan a `onRequestError` con `routeType: 'proxy'`; no envolverlos para silenciarlos.
- El proxy es una comprobación optimista en el borde; la autorización definitiva se valida en Server Functions, Route Handlers y el dominio.

---

## 4. Límites de Error (UI)

| Archivo / API               | Uso                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `app/**/error.tsx`          | Fallo inesperado del segmento. Client Component. Props `error: unknown` y `retry`. |
| `app/global-error.tsx`      | Fallo en el layout raíz. Debe incluir etiquetas `<html>` y `<body>`.               |
| `app/**/not-found.tsx`      | Renderizado tras invocar `notFound()`.                                             |
| `catchError` (`next/error`) | Límite a nivel de componente; no atrapa `redirect()` ni `notFound()`.              |

### Reglas para Error Boundaries:

- Usar **`retry()`** (re-solicita y re-renderiza) en lugar de `reset()` salvo que explícitamente no deba reintentarse la consulta.
- Estrechar `error: unknown` antes de leer cualquier propiedad.
- En producción, los errores de Server Components llegan con mensaje genérico: **mostrar texto propio** y el `digest` como "código de referencia", nunca `error.message` ni `stack`.
- Reportar con `clientLog('error', 'ui.boundary_error', { err })` en `useEffect`.
- Prohibido escribir clases `ErrorBoundary` propias en App Router: usar `error.tsx` o `catchError`.

```tsx
// app/(modulo)/error.tsx
"use client";
import { useEffect } from "react";
import { clientLog } from "@/lib/logger/client";
import { serializeError } from "@/lib/logger/serialize-error";

export default function SegmentError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  useEffect(() => {
    clientLog("error", "ui.boundary_error", { err: serializeError(error) });
  }, [error]);

  return (
    <section role="alert" className="p-4">
      <h2 className="text-lg font-bold">No fue posible cargar esta sección.</h2>
      {digest && (
        <p className="text-sm text-muted-foreground">
          Código de referencia: {digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-2 rounded bg-primary px-3 py-1"
      >
        Reintentar
      </button>
    </section>
  );
}
```

---

## 5. Client Components

- Resultados de Server Functions se consumen con `useActionState`; se muestran `message` y `fieldErrors` con `aria-live="polite"`.
- Los manejadores de eventos (`onClick`, `onSubmit`) y `useEffect` **no** son capturados por error boundaries: envolver llamadas asíncronas en `try/catch`, notificar al usuario y reportar con `clientLog`.
- Llamadas `fetch` desde cliente: comprobar `res.ok` y leer el cuerpo Problem Details; un código 4xx no es excepción, es un resultado de operación.
- Errores de aborto intencional (`AbortError`) no se reportan como error en el logger.

---

## 6. Mensajes al Usuario

- Redactados en lenguaje de negocio claro, en el idioma de la interfaz (español por defecto), sin jerga técnica.
- Indican **qué pasó** y **qué acción correctiva** puede tomar el usuario.
- Fallos inesperados: mensaje genérico + código de referencia (`digest` o `requestId`).
- Prohibido inventar textos ad hoc dispersos para el mismo error; mantener coherencia por `ErrorCode`.

---

## 7. Prohibiciones Absolutas

- ❌ Lanzar excepciones para validaciones o reglas de negocio esperadas.
- ❌ Bloques `try/catch` vacíos, o que solo registran y continúan sin manejar la falla.
- ❌ Atrapar `redirect()`, `notFound()`, `forbidden()` o `unauthorized()` sin relanzar con `unstable_rethrow(e)`.
- ❌ `catch (e: any)` o leer `e.message` sin estrechar `unknown`.
- ❌ `throw 'texto'` o `throw { ... }`.
- ❌ Exponer `stack`, `cause`, mensajes de base de datos o de librerías en respuestas o interfaces.
- ❌ Usar `error.message` de un error de servidor como texto visible directo en la UI.
- ❌ Confiar en `proxy.ts` como única barrera de autorización.
- ❌ Habilitar `experimental.authInterrupts` sin confirmación explícita del usuario.
- ❌ Registrar el mismo error en múltiples capas redundantes.

---

## 8. Verificación Antes de Entregar Código

- [ ] Cada error manejado tiene categoría asignada (esperado / interrupción / inesperado).
- [ ] Server Functions retornan `Result<T>` y revalidan sesión y permisos.
- [ ] `redirect()` se ubica fuera de `try/catch` o protegido con `unstable_rethrow`.
- [ ] Route Handlers envueltos con `handle()` y respuestas `application/problem+json`.
- [ ] Existen `error.tsx` por segmento crítico, `global-error.tsx` y `not-found.tsx`.
- [ ] Boundaries usan `retry`, estrechan `unknown` y muestran `digest`, nunca `message`.
- [ ] Ningún detalle técnico llega al usuario final.
- [ ] `tsc --noEmit` sin errores en modo `strict`.
