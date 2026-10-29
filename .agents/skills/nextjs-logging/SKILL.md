---
name: nextjs-logging
description: >-
  Guía completa, patrones y flujos de implementación para la gestión estructurada de logs,
  trazas y errores en aplicaciones Next.js 16 (App Router) con TypeScript estricto. Incluye
  logger con Pino, correlación de x-request-id con AsyncLocalStorage, proxy.ts, onRequestError,
  after() para tareas no bloqueantes, ingesta cliente, y error boundaries con digest.
---

# Skill: Gestión de Logs, Trazas y Errores en Next.js 16 (App Router)

Esta skill proporciona las directivas prácticas, patrones de diseño y plantillas de implementación para la infraestructura de logging estructurado, observabilidad y manejo de errores en aplicaciones **Next.js 16 (App Router)** bajo **TypeScript estricto (`strict: true`)**.

---

## 1. Principios de Arquitectura

1. **Cero `console.*`**: Todo evento debe canalizarse a través de `@/lib/logger` (en servidor) o `@/lib/logger/client` (en navegador).
2. **Logs Estructurados JSON**: Un evento = un objeto JSON tipado (`LogEvent`). Prohibido interpolar cadenas manuales o emitir texto plano.
3. **Aislamiento Estricto de Runtime**:
   - `lib/logger/index.ts` debe protegerse con `import 'server-only';`.
   - `lib/logger/client.ts` debe protegerse con `import 'client-only';`.
4. **Correlación Obligatoria por Petición**: Cada petición HTTP genera o propaga un `x-request-id` a través de `proxy.ts`. El contexto se mantiene en memoria concurrente con `AsyncLocalStorage` (`node:async_hooks`).
5. **Cero Datos Sensibles (Redacción Automática)**: Contraseñas, tokens JWT, cookies de sesión, headers de autorización y datos confidenciales se redactan en la raíz mediante expresiones y rutas centralizadas (`REDACT_PATHS`).
6. **Ejecución No Bloqueante con `after()`**: La persistencia de auditoría, métricas y tareas secundarias de log nunca deben retrasar el envío del flujo HTTP al cliente.
7. **Captura Centralizada en `onRequestError`**: Todos los errores no manejados de servidor se capturan en el hook de instrumentación oficial de Next.js 16, registrándose una sola vez.

---

## 2. Mapa de Archivos del Sistema de Logging

```
├── instrumentation.ts             # register() + onRequestError (servidor)
├── instrumentation-client.ts      # Errores globales del navegador y eventos de transición
├── proxy.ts                       # Generación/propagación de x-request-id (reemplazo canónico de middleware.ts)
├── next.config.ts                 # Configuración de logging de terminal en dev y serverExternalPackages
├── lib/
│   └── logger/
│       ├── types.ts               # LogLevel, LogEventName, SerializedError, LogContext, LogEvent
│       ├── redact.ts              # Rutas de censura de datos sensibles (REDACT_PATHS)
│       ├── context.ts             # AsyncLocalStorage para propagar LogContext sin variables de módulo
│       ├── index.ts               # Instancia de Pino en servidor con pino-pretty (dev) y stdout JSON (prod)
│       ├── serialize-error.ts     # Estrechamiento y serialización segura de unknown a SerializedError
│       └── client.ts              # Emisor liviano del navegador vía navigator.sendBeacon o fetch keepalive
├── app/
│   ├── api/logs/route.ts          # Endpoint de ingesta y reemisión de logs provenientes del cliente
│   ├── error.tsx                  # Boundary de segmento con digest y retry()
│   └── global-error.tsx           # Boundary raíz con digest y retry()
```

---

## 3. Implementación Paso a Paso

### Paso 1: Instalación de Dependencias

En la aplicación Next.js (`apps/web` o `apps/admin`):
```bash
pnpm add pino
pnpm add -D pino-pretty @types/pino server-only client-only
```
*(Nota: Next.js 16 ya incluye `pino`, `pino-pretty` y `thread-stream` en sus exclusiones automáticas de empaquetado).*

---

### Paso 2: Tipos Base (`lib/logger/types.ts`)

```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Nombre de evento con semántica jerárquica: `dominio.accion` (ej. `auth.login_success`). */
export type LogEventName = `${string}.${string}`;

export interface SerializedError {
  readonly type: string;
  readonly message: string;
  readonly stack?: string;
  readonly digest?: string;
}

export interface LogContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
}

export interface LogEvent {
  readonly event: LogEventName;
  readonly durationMs?: number;
  readonly err?: SerializedError;
  readonly [key: string]: unknown;
}
```

---

### Paso 3: Serialización Segura de Errores (`lib/logger/serialize-error.ts`)

```typescript
import type { SerializedError } from './types';

/**
 * Convierte un valor de tipo `unknown` en una estructura de error serializable y segura.
 * Estrecha el tipo sin asumir `Error` ni exponer propiedades internas arbitrarias.
 */
export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    const digest =
      'digest' in value && typeof value.digest === 'string' ? value.digest : undefined;
    return {
      type: value.name,
      message: value.message,
      stack: value.stack,
      digest,
    };
  }
  return {
    type: typeof value,
    message: String(value),
  };
}
```

---

### Paso 4: Redacción de Datos Sensibles (`lib/logger/redact.ts`)

```typescript
/**
 * Rutas de objetos JSON que deben ser censuradas antes de ser emitidas a los flujos de salida.
 */
export const REDACT_PATHS: readonly string[] = [
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'cookie',
  '*.secret',
  'secret',
  'pepper',
  'creditCard',
  'cardNumber',
];
```

---

### Paso 5: Contexto de Petición Concurrente (`lib/logger/context.ts`)

```typescript
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { headers } from 'next/headers';
import type { LogContext } from './types';

export const requestContext = new AsyncLocalStorage<LogContext>();

/**
 * Obtiene el contexto de correlación actual del almacén asíncrono
 * o lo inicializa a partir del encabezado `x-request-id` de la petición.
 */
export async function getLogContext(): Promise<LogContext> {
  const active = requestContext.getStore();
  if (active) {
    return active;
  }
  const headerStore = await headers();
  const requestId = headerStore.get('x-request-id') ?? crypto.randomUUID();
  return { requestId };
}
```

---

### Paso 6: Logger de Servidor Pino (`lib/logger/index.ts`)

```typescript
import 'server-only';
import pino, { type Logger } from 'pino';
import { REDACT_PATHS } from './redact';
import { getLogContext } from './context';
import type { LogContext } from './types';

const isProd = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: {
    service: process.env.SERVICE_NAME ?? 'mocter-web',
    env: process.env.NODE_ENV ?? 'development',
  },
  redact: {
    paths: [...REDACT_PATHS],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
});

/**
 * Genera una instancia secundaria del logger con metadatos contextuales fijos.
 */
export function withContext(ctx: LogContext & Record<string, unknown>): Logger {
  return logger.child(ctx);
}

/**
 * Retorna un logger enlazado al `x-request-id` de la petición actual.
 */
export async function getRequestLogger(bindings: Record<string, unknown> = {}): Promise<Logger> {
  const ctx = await getLogContext();
  return logger.child({ ...ctx, ...bindings });
}
```

---

### Paso 7: Propagación de ID con `proxy.ts` (Next.js 16)

> **REGLA CRÍTICA:** Queda prohibido el uso de `middleware.ts`. Next.js 16 adopta `proxy.ts`, el cual corre en runtime Node.js completo.

```typescript
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export function proxy(request: NextRequest): NextResponse {
  const start = performance.now();
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: forwardedHeaders,
    },
  });
  response.headers.set('x-request-id', requestId);

  logger.debug({
    event: 'proxy.request',
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
    durationMs: Math.round(performance.now() - start),
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
```

---

### Paso 8: Instrumentación y Captura Global (`instrumentation.ts`)

```typescript
// instrumentation.ts
import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Inicialización única por instancia (OpenTelemetry, tracing)
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const [{ logger }, { serializeError }] = await Promise.all([
    import('@/lib/logger'),
    import('@/lib/logger/serialize-error'),
  ]);

  const rawRequestId = request.headers['x-request-id'];
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;

  logger.error({
    event: 'request.unhandled_error',
    requestId,
    err: serializeError(error),
    method: request.method,
    path: request.path,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    renderType: context.renderType,
    revalidateReason: context.revalidateReason,
  });
};
```

---

### Paso 9: Ingesta de Logs en Cliente (`lib/logger/client.ts` y `/api/logs`)

```typescript
// lib/logger/client.ts
import 'client-only';
import type { LogEventName, SerializedError } from './types';

type ClientLogLevel = 'warn' | 'error';

/**
 * Emite un evento de log desde el navegador hacia el servidor sin bloquear el hilo principal.
 * Utiliza navigator.sendBeacon con retroceso a fetch keepalive.
 */
export function clientLog(
  level: ClientLogLevel,
  event: LogEventName,
  data: { err?: SerializedError } & Record<string, unknown> = {},
): void {
  const payload = JSON.stringify({
    level,
    event,
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    ...data,
  });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const success = navigator.sendBeacon('/api/logs', payload);
    if (success) return;
  }

  void fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // El fallo de logging de cliente nunca debe lanzar excepciones no controladas
  });
}
```

```typescript
// app/api/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestLogger } from '@/lib/logger';

const clientLogSchema = z.object({
  level: z.enum(['warn', 'error']),
  event: z.string().regex(/^[a-z0-9_-]+\.[a-z0-9_-]+$/i),
  path: z.string().max(500),
  err: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional(),
      digest: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger({ channel: 'client_ingest' });

  try {
    const body: unknown = await req.json();
    const parsed = clientLogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

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

---

### Paso 10: Error Boundaries con `digest` y `retry` (`app/error.tsx`)

```typescript
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
    <div className="flex min-h-[400px] flex-col items-center justify-center p-4">
      <h2 className="text-xl font-semibold">Ha ocurrido un problema</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        El error ha sido notificado con identificador de seguimiento.
      </p>
      <button
        onClick={() => retry()}
        className="mt-4 rounded bg-primary px-4 py-2 text-white"
      >
        Reintentar operación
      </button>
    </div>
  );
}
```

---

## 4. Uso en Server Functions / Server Actions con `after()`

```typescript
'use server';

import { after } from 'next/server';
import { getRequestLogger } from '@/lib/logger';

export async function actualizarPerfil(formData: FormData) {
  const log = await getRequestLogger({ action: 'actualizarPerfil' });
  const start = performance.now();

  log.debug({ event: 'perfil.update_attempt' });

  const nombre = formData.get('nombre');
  if (typeof nombre !== 'string' || !nombre.trim()) {
    log.warn({ event: 'perfil.validation_failed', field: 'nombre' });
    return { ok: false, error: 'Nombre inválido' };
  }

  // Operación de negocio
  // Si ocurre un fallo inesperado, no capturar para silenciar; dejar fluir a onRequestError.

  // Auditoría no bloqueante
  after(() => {
    try {
      log.info({
        event: 'perfil.updated_successfully',
        durationMs: Math.round(performance.now() - start),
      });
    } catch {
      // Un fallo en el logging de auditoría jamás debe interrumpir la respuesta HTTP
    }
  });

  return { ok: true };
}
```

---

## 5. Antipatrones y Errores Prohibidos

| Práctica Rechazada | Razón Técnica | Práctica Correcta |
|---|---|---|
| `console.log(...)` o `console.error(...)` | No estructurado, sin requestId, rompe agregadores (Loki/FluentBit). | `logger.info({ event: '...' })` |
| `middleware.ts` | Obsoleto en Next.js 16. Puede romper compilación o correr en Edge. | `proxy.ts` |
| `log.info("Usuario " + id + " logueado")` | Rompe la indexación JSON y dificulta consultas analíticas. | `log.info({ event: 'auth.login_success', userId: id })` |
| `catch (err: any) { log.error(err.message) }` | Viola `strict: true` y causa fallos si `err` no es instancia de `Error`. | `serializeError(err)` |
| `globalState.requestId = id` | Condición de carrera severa bajo peticiones asíncronas concurrentes. | `AsyncLocalStorage` (`requestContext`) |
| `reset()` en `error.tsx` | Obsoleto en Next.js 16. | `retry()` |
| `log.info({ password, body })` | Fuga de secretos en logs de infraestructura. | Rutas de redacción `REDACT_PATHS` |

---

## 6. Verificación de Conformidad

Antes de finalizar cualquier tarea que involucre logs:
1. `corepack pnpm --filter @mocter/web lint` y `build` pasan limpios.
2. No existe ningún archivo `middleware.ts` en el proyecto.
3. Todo error capturado es estrechado desde `unknown`.
4. Los encabezados `x-request-id` están presentes en las respuestas de `proxy.ts`.
5. Ningún dato sensible aparece expuesto en las salidas de log.
