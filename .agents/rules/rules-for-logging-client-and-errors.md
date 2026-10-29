---
description: "Parte 2/2: Reglas de cliente, Server Functions, boundaries, ingesta y verificación para logging en Next.js 16 + TypeScript."
globs:
  - "app/**/*.{ts,tsx}"
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "instrumentation-client.ts"
  - "next.config.ts"
alwaysApply: true
---

# Regla: Gestión de Logs — Parte 2: Cliente, Operaciones y Manejo de Errores

> **Estado:** Permanente y no negociable.  
> **Vinculación:** Parte 2 de 2. Complementaria y vinculante con [rules-for-logging-core-and-server.md](rules-for-logging-core-and-server.md).  
> **Alcance:** Monorepo Mocter (Next.js ≥ 16.3, App Router, TypeScript `strict: true`).  
> **Propósito:** Normar el uso no bloqueante de `after()`, la ingesta de telemetría de cliente, los Error Boundaries con `digest`/`retry`, la configuración de terminal y la lista de prohibiciones.

---

## 1. Server Functions, Route Handlers y Server Components
- Obtener el logger con `await getRequestLogger({ action: 'nombreAccion' })`.
- Inicio de operación: solo `debug`. Resultado: `info` con `durationMs`.
- **Errores esperados** (validación, permisos, conflicto): emitir `warn` y retornar resultado tipado (`{ ok: false, code }`); no lanzar excepciones.
- **Errores inesperados**: no capturarlos solo para loguear; dejar que lleguen a `onRequestError`. Si se capturan para transformar la respuesta, registrar `error` con `serializeError` y responder un mensaje genérico.
- **Auditoría no bloqueante con `after()`**: auditoría y métricas post-respuesta van dentro de `after()`.
  - En Route Handlers y Server Functions se permite `headers()` / `cookies()` dentro del callback de `after()`.
  - En Server Components **no se permite** (leer antes y pasar por clausura).
  - `after()` se ejecuta aunque la respuesta falle o se invoque `notFound` / `redirect`: envolver su contenido en `try/catch` propio.
- Server Components no registran en cada render; solo errores o eventos relevantes de acceso a datos.

```ts
// app/(modulo)/actions.ts
'use server';
import { after } from 'next/server';
import { getRequestLogger } from '@/lib/logger';

type Result = { ok: true; id: string } | { ok: false; code: 'VALIDATION' | 'FORBIDDEN' };

export async function crearRegistro(input: FormData): Promise<Result> {
  const log = await getRequestLogger({ action: 'crearRegistro' });
  const start = performance.now();

  const nombre = input.get('nombre');
  if (typeof nombre !== 'string' || nombre.trim() === '') {
    log.warn({ event: 'registro.validation_failed', field: 'nombre' });
    return { ok: false, code: 'VALIDATION' };
  }

  const id = await guardar(nombre); // errores inesperados → onRequestError

  after(() => {
    try {
      log.info({ event: 'registro.created', id, durationMs: Math.round(performance.now() - start) });
    } catch {
      /* el fallo de logging nunca debe propagarse */
    }
  });
  return { ok: true, id };
}

declare function guardar(nombre: string): Promise<string>;
```

## 2. Telemetría de Cliente (`lib/logger/client.ts`)
```ts
// lib/logger/client.ts
import 'client-only';
import type { LogEventName, SerializedError } from './types';

type ClientLevel = 'warn' | 'error';

export function clientLog(
  level: ClientLevel,
  event: LogEventName,
  data: { err?: SerializedError } & Record<string, unknown> = {},
): void {
  const body = JSON.stringify({ level, event, path: location.pathname, ...data });
  if (!navigator.sendBeacon?.('/api/logs', body)) {
    void fetch('/api/logs', { method: 'POST', body, keepalive: true }).catch(() => undefined);
  }
}
```
- En producción el cliente solo envía `warn` y `error`.
- `instrumentation-client.ts` registra `error` y `unhandledrejection` dentro de `try/catch`. Puede exportar `onRouterTransitionStart` para trazas de navegación.

## 3. Error Boundaries con `digest` y `retry()`
- `app/error.tsx` y `app/global-error.tsx`:
  - Son Client Components (`'use client'`); estrechan `error: unknown` antes de leerlo.
  - Reportan con `clientLog('error', 'ui.boundary_error', { err })` incluyendo **`digest`** para correlacionar con el log de servidor.
  - En producción, los errores de Server Components llegan con mensaje genérico: **nunca** mostrar `message` ni `stack` en la UI.
  - Usan **`retry()`** (prop preferida en Next.js 16 sobre `reset()`).
  - Recuperación por componente fuera de ruta: usar `catchError`.

```tsx
// app/error.tsx
'use client';
import { useEffect } from 'react';
import { clientLog } from '@/lib/logger/client';
import { serializeError } from '@/lib/logger/serialize-error';

export default function ErrorBoundary({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    const serialized = serializeError(error);
    clientLog('error', 'ui.boundary_error', { err: serialized });
  }, [error]);

  return (
    <div role="alert" className="p-4">
      <h2>Ha ocurrido un error inesperado</h2>
      <button onClick={() => retry()}>Reintentar</button>
    </div>
  );
}
```

## 4. Ingesta de Logs (`app/api/logs/route.ts`)
- Valida con esquema Zod, limita tamaño del cuerpo, aplica rate limit, re-redacta y reemite con el logger de servidor.

```ts
// app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestLogger } from '@/lib/logger';

const clientLogSchema = z.object({
  level: z.enum(['warn', 'error']),
  event: z.string().regex(/^[a-z0-9_-]+\.[a-z0-9_-]+$/i),
  path: z.string().max(500),
  err: z.object({
    type: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    digest: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger({ channel: 'client_ingest' });
  try {
    const body: unknown = await req.json();
    const parsed = clientLogSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

    const { level, event, ...rest } = parsed.data;
    if (level === 'error') {
      log.error({ event: event as `${string}.${string}`, ...rest });
    } else {
      log.warn({ event: event as `${string}.${string}`, ...rest });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
```

## 5. Configuración de Terminal (`next.config.ts`)
```ts
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sonic-boom'],
  logging: {
    fetches: { fullUrl: isDev, hmrRefreshes: false },
    serverFunctions: true,
    incomingRequests: { ignore: [/\/api\/health/, /\/api\/logs/] },
    browserToTerminal: 'warn',
  },
};

export default nextConfig;
```
- La sección `logging` controla **solo la terminal de desarrollo**; no reemplaza el logger de producción.

## 6. Esquema Mínimo y Niveles
| Campo | Obligatorio | Descripción |
|---|---|---|
| `time` | Sí | ISO-8601 UTC |
| `level` | Sí | `trace` · `debug` · `info` · `warn` · `error` · `fatal` |
| `service` / `env` | Sí | Servicio y entorno |
| `event` | Sí | `dominio.accion` (`LogEventName`) |
| `requestId` | Sí (servidor) | Propagado por `proxy.ts` |
| `durationMs` | En operaciones | Entero en milisegundos |
| `err` | En errores | `SerializedError` con `digest` |

- `fatal`: el proceso no puede continuar.
- `error`: fallo inesperado que afecta la operación.
- `warn`: anomalía controlada (validación, permiso denegado).
- `info`: hitos de negocio y ciclo de vida.
- `debug` / `trace`: diagnóstico; deshabilitados en producción.

## 7. Prohibiciones Absolutas
- ❌ Crear `middleware.ts` o exportar `middleware()`.
- ❌ `console.*` fuera de `lib/logger/**` (aplicar ESLint `no-console: 'error'`).
- ❌ Importar `@/lib/logger` en archivos `'use client'`.
- ❌ Tipar errores como `any` o acceder a `err.message` sin estrechar `unknown`.
- ❌ Guardar `requestId` u otro estado de petición en variables de módulo o en `register()`.
- ❌ Registrar `request.body`, `FormData` completo, cookies o headers completos.
- ❌ Exponer `stack`, `message` interno o `digest` como texto al usuario final.
- ❌ Escribir logs a archivos locales desde la aplicación.
- ❌ `try/catch` que solo loguea y silencia el error.

## 8. Verificación Antes de Entregar Código
- [ ] `tsc --noEmit` sin errores en modo `strict`.
- [ ] Ningún `middleware.ts`; `proxy.ts` propaga `x-request-id`.
- [ ] `onRequestError` implementado, con `await` en tareas asíncronas y error estrechado.
- [ ] `error.tsx` y `global-error.tsx` usan `retry` y reportan `digest`.
- [ ] Logs no críticos dentro de `after()` con `try/catch` interno.
- [ ] Campos sensibles cubiertos por `REDACT_PATHS`.
- [ ] Sin `console.*` residual fuera de `lib/logger/**`.
