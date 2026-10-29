---
description: "Parte 1/2: Reglas fundamentales de clasificación de errores, tipos Result/AppError y Server Functions en Next.js 16 + TypeScript."
globs:
  - "app/**/*.{ts,tsx}"
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "instrumentation.ts"
alwaysApply: true
---

# Regla: Manejo de Excepciones — Parte 1: Clasificación, Tipos y Servidor

> **Estado:** Permanente y no negociable para desarrolladores y agentes de IA.  
> **Vinculación:** Parte 1 de 2. Complementaria y vinculante con [rules-for-exceptions-routes-and-ui.md](rules-for-exceptions-routes-and-ui.md).  
> **Alcance:** Todo el monorepo (`apps/web`, `apps/admin`, `packages/domain`).  
> **Propósito:** Definir el modelo de clasificación de errores, los contratos de retorno tipados (`Result`, `AppError`), y las pautas para capas internas y Server Functions (`'use server'`). Complementa las reglas de logging (`rules-for-logging-core-and-server.md`).

---

## 1. Alcance y Relación con Otras Reglas
- Objetivo: **Next.js ≥ 16.3**, App Router, **TypeScript `strict: true`**.
- Esta regla define **cómo se clasifican, propagan, transforman y presentan** los errores. El **registro** de errores se rige por las reglas de logging (logger, `serializeError`, `onRequestError`, `requestId`, `digest`).
- En 16.0–16.2, `retry` y `catchError` existen como `unstable_retry` / `unstable_catchError`; verificar la versión instalada antes de generar código.

---

## 2. Modelo de Clasificación (Obligatorio)
Todo error pertenece a **una sola** de estas tres categorías. Se debe clasificar el error antes de escribir su manejo:

| Categoría | Ejemplos | Mecanismo | ¿Se lanza? |
|---|---|---|---|
| **Esperado de negocio** | Validación, regla de negocio incumplida, conflicto de unicidad, estado no permitido | Valor de retorno tipado (`Result`) | ❌ No |
| **Interrupción de control** | Recurso inexistente, sin sesión, sin permiso, redirección | `notFound()`, `unauthorized()`, `forbidden()`, `redirect()`, `permanentRedirect()` | ✅ Lo lanza el framework |
| **Inesperado** | Fallo de BD, servicio externo caído, bug, invariante violada | `throw` → `error.tsx` / `global-error.tsx` / `catchError` + `onRequestError` | ✅ Sí |

### Reglas Derivadas:
1. **Los errores esperados no se lanzan**: se modelan como valores de retorno (directriz oficial para Server Functions con `useActionState`).
2. **Los errores inesperados no se capturan para ocultarlos**: se dejan llegar al límite de error más cercano.
3. **Las interrupciones de control nunca se atrapan** dentro de `try/catch` sin relanzarlas inmediatamente con `unstable_rethrow(e)`.

---

## 3. Tipos Base del Sistema de Errores

```ts
// lib/errors/result.ts
export type ErrorCode =
  | 'VALIDATION'
  | 'BUSINESS_RULE'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL';

export interface AppFailure {
  readonly ok: false;
  readonly code: ErrorCode;
  /** Mensaje seguro para el usuario final. Nunca contiene detalles técnicos. */
  readonly message: string;
  /** Errores por campo, claves = nombre del campo del formulario. */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  /** Identificador para soporte; coincide con el requestId del log. */
  readonly reference?: string;
}

export type Result<T = void> = { readonly ok: true; readonly data: T } | AppFailure;

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = (
  code: ErrorCode,
  message: string,
  extra: Omit<AppFailure, 'ok' | 'code' | 'message'> = {},
): AppFailure => ({ ok: false, code, message, ...extra });
```

```ts
// lib/errors/app-error.ts
import type { ErrorCode } from './result';

/** Error de dominio lanzado en capas internas (servicios, repositorios). */
export class AppError extends Error {
  override readonly name = 'AppError';
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly expose: boolean = false, // true solo si el mensaje es apto para el usuario
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
```

```ts
// lib/errors/http-status.ts
import type { ErrorCode } from './result';

export const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  BUSINESS_RULE: 422,
  CONFLICT: 409,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};
```

- Prohibido `throw` de valores que no sean instancias de `Error` (strings, objetos literales).
- Al envolver un error, **preservar la causa** con `{ cause }`.
- Todo bloque `catch (e)` trata `e` como `unknown` (`useUnknownInCatchVariables` activo por `strict`).

---

## 4. Capas Internas (Servicios, Repositorios, Integraciones)
- Lanzan `AppError` con `code` cuando la condición es de dominio; dejan propagar errores técnicos o los envuelven en `AppError('UNAVAILABLE' | 'INTERNAL', ..., false, { cause })`.
- No conocen HTTP, `Response`, `redirect` ni UI.
- Validación de entradas en el **borde** (Server Function / Route Handler) con esquema (Zod `safeParse`), nunca con excepciones para flujo normal.

---

## 5. Server Functions (`'use server'`)
- Firma compatible con `useActionState`: `(prevState: Result<T>, formData: FormData) => Promise<Result<T>>`.
- Validación → `fail('VALIDATION', ..., { fieldErrors })`.
- `AppError` con `expose = true` → se traduce a `fail(code, message)`.
- Error inesperado → **se relanza** (llega a `onRequestError` y al error boundary). No se convierte en `fail('INTERNAL')` salvo que la UI requiera conservar el formulario; en ese caso se registra con el logger y se devuelve mensaje genérico con `reference = requestId`.
- `redirect()` se invoca **fuera** de `try/catch`; si es inevitable atrapar, relanzar interrupciones con `unstable_rethrow(e)` como primera instrucción del `catch`.
- **Toda Server Function revalida autenticación y autorización**: son endpoints públicos aunque no estén enlazados en la UI.

```ts
// app/(modulo)/actions.ts
'use server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { fail, ok, type Result } from '@/lib/errors/result';
import { isAppError } from '@/lib/errors/app-error';

const schema = z.object({ nombre: z.string().trim().min(1).max(200) });

export async function crearRegistro(
  _prev: Result<{ id: string }>,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const parsed = schema.safeParse({ nombre: formData.get('nombre') });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message);
    return fail('VALIDATION', 'Revise los campos del formulario.', {
      fieldErrors: { nombre: issues },
    });
  }

  let id: string;
  try {
    id = await servicioRegistro.crear(parsed.data);
  } catch (e: unknown) {
    unstable_rethrow(e);
    if (isAppError(e) && e.expose) return fail(e.code, e.message);
    throw e; // inesperado → onRequestError + error boundary
  }

  redirect(`/registros/${id}`); // fuera del try/catch
}

declare const servicioRegistro: { crear(d: { nombre: string }): Promise<string> };
```
