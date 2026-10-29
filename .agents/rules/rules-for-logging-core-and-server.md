---
description: "Parte 1/2: Reglas fundamentales de arquitectura, correlación y servidor para logging estructurado en Next.js 16 + TypeScript."
globs:
  - "app/**/*.{ts,tsx}"
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "instrumentation.ts"
  - "proxy.ts"
alwaysApply: true
---

# Regla: Gestión de Logs — Parte 1: Núcleo, Correlación y Servidor

> **Estado:** Permanente y no negociable.  
> **Vinculación:** Parte 1 de 2. Complementaria y vinculante con [rules-for-logging-client-and-errors.md](rules-for-logging-client-and-errors.md).  
> **Alcance:** Monorepo Mocter (Next.js ≥ 16.3, App Router, TypeScript `strict: true`).  
> **Propósito:** Definir los principios inmutables, la correlación concurrente por `requestId`, el logger Pino en Node.js, `proxy.ts` y la captura de errores en `instrumentation.ts`.

---

## 1. Alcance y Versión
- Objetivo: **Next.js ≥ 16.3**, App Router, **TypeScript con `strict: true`**.
- Todos los archivos se escriben en `.ts` / `.tsx`. Prohibido `.js` / `.mjs` para configuración o instrumentación (`next.config.ts`, `instrumentation.ts`, `proxy.ts`).
- Si el proyecto está en 16.0–16.2, verificar en la documentación los nombres de `retry` y `catchError` (en 16.2 existían como `unstable_retry` / `unstable_catchError`) antes de generar código.

## 2. Principios No Negociables
1. **Prohibido `console.*` en código de aplicación.** Todo log pasa por `@/lib/logger` (servidor) o `@/lib/logger/client` (navegador).
2. **Logs estructurados JSON en servidor**: un evento = un objeto tipado (`LogEvent`). Prohibido interpolar datos en strings.
3. **Separación estricta de runtime**: el logger de servidor se protege con `import 'server-only'`; el de cliente con `import 'client-only'`.
4. **Cero datos sensibles**: contraseñas, tokens JWT, cookies de sesión, headers de autorización y datos confidenciales se redactan antes de emitir.
5. **Correlación obligatoria**: todo log de servidor incluye `requestId`; si OpenTelemetry está activo, también `traceId` y `spanId`.
6. **Un error se registra una sola vez**, donde se maneja. No re-loguear al relanzar.
7. **Errores tipados como `unknown`**: siempre estrechar (`instanceof Error`, guardas de tipo) antes de leer `message`, `stack` o `digest`.

## 3. Cambios de Next.js 16 Obligatorios
| Tema | Regla |
|---|---|
| `middleware.ts` | **Obsoleto.** Usar `proxy.ts` con `export function proxy()`. Migración: `npx @next/codemod@canary middleware-to-proxy .` |
| Runtime de `proxy.ts` | Corre en **Node.js** (no Edge). Puede usar el logger de servidor. No declarar `runtime = 'edge'`. |
| `onRequestError` | El primer parámetro es `unknown`. `context.routeType` incluye `'proxy'`. Las tareas asíncronas deben tener `await`. |
| `serverExternalPackages` | `pino`, `pino-pretty`, `pino-roll` y `thread-stream` ya se excluyen por defecto; declarar solo transportes adicionales (p. ej. `sonic-boom`). |

## 4. Estructura de Archivos (Servidor y Núcleo)
```
instrumentation.ts             # register() + onRequestError
proxy.ts                       # generación/propagación de x-request-id
lib/logger/
  ├── types.ts                 # LogLevel, LogEventName, SerializedError, LogContext, LogEvent
  ├── redact.ts                # rutas de redacción centralizadas (REDACT_PATHS)
  ├── context.ts               # AsyncLocalStorage del contexto de petición
  ├── index.ts                 # logger servidor (server-only, pino)
  └── serialize-error.ts       # unknown → objeto de error seguro
```

## 5. Tipos Base y Serialización de Errores
```ts
// lib/logger/types.ts
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
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

```ts
// lib/logger/serialize-error.ts
import type { SerializedError } from './types';

export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    const digest = 'digest' in value && typeof value.digest === 'string' ? value.digest : undefined;
    return { type: value.name, message: value.message, stack: value.stack, digest };
  }
  return { type: typeof value, message: String(value) };
}
```

## 6. Contexto de Petición Concurrente (AsyncLocalStorage)
- El contexto de correlación **nunca** se guarda en variables de módulo: las instancias del servidor atienden peticiones concurrentes.
- Usar `AsyncLocalStorage` de `node:async_hooks`.

```ts
// lib/logger/context.ts
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { headers } from 'next/headers';
import type { LogContext } from './types';

export const requestContext = new AsyncLocalStorage<LogContext>();

export async function getLogContext(): Promise<LogContext> {
  const active = requestContext.getStore();
  if (active) return active;
  const requestId = (await headers()).get('x-request-id') ?? crypto.randomUUID();
  return { requestId };
}
```

## 7. Logger de Servidor y Redacción
```ts
// lib/logger/redact.ts
export const REDACT_PATHS: readonly string[] = [
  'password', '*.password', 'token', '*.token', 'accessToken', 'refreshToken',
  'authorization', 'headers.authorization', 'headers.cookie', 'cookie', '*.secret', 'secret', 'pepper',
];
```

```ts
// lib/logger/index.ts
import 'server-only';
import pino, { type Logger } from 'pino';
import { REDACT_PATHS } from './redact';
import { getLogContext } from './context';
import type { LogContext } from './types';

const isProd = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: { service: process.env.SERVICE_NAME ?? 'mocter-app', env: process.env.NODE_ENV },
  redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
});

export function withContext(ctx: LogContext & Record<string, unknown>): Logger {
  return logger.child(ctx);
}

export async function getRequestLogger(bindings: Record<string, unknown> = {}): Promise<Logger> {
  return logger.child({ ...(await getLogContext()), ...bindings });
}
```

## 8. Generación y Propagación en `proxy.ts`
- Único responsable de generar o propagar `x-request-id` hacia la aplicación y hacia la respuesta.
- No registra cuerpos, cookies ni headers completos; solo método, ruta y duración.

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export function proxy(request: NextRequest): NextResponse {
  const start = performance.now();
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const forwarded = new Headers(request.headers);
  forwarded.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: forwarded } });
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

## 9. Instrumentación y Captura Centralizada (`instrumentation.ts`)
- `register()` se ejecuta **una vez por instancia**, no por petición.
- `onRequestError` es el **punto único** de captura de errores no controlados de servidor (render, route, action, proxy).

```ts
// instrumentation.ts
import type { Instrumentation } from 'next';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel');
    registerOTel({ serviceName: process.env.SERVICE_NAME ?? 'mocter-app' });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ logger }, { serializeError }] = await Promise.all([
    import('@/lib/logger'),
    import('@/lib/logger/serialize-error'),
  ]);

  const raw = request.headers['x-request-id'];
  const requestId = Array.isArray(raw) ? raw[0] : raw;

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
