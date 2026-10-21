# CORE-002 · Tareas · Optimización Arquitectónica del Cascarón

| Atributo | Valor |
|---|---|
| ID | CORE-002 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-19 |
| Documentos | [`requirements.md`](requirements.md) · [`design.md`](design.md) · `tasks.md` (este) |

> **Instrucciones:** Ejecutar en estricto orden secuencial. Marcar `[x]` únicamente cuando la verificación de cada tarea sea exitosa.

---

## Fase 1 · Observabilidad y Saneamiento en `@mocter/domain`

- [x] **T-01 · Logger estructurado con redacción de secretos**
  - **Archivos:** `packages/domain/src/utils/logger.ts`, `packages/domain/src/utils/logger.test.ts`
  - **Acción:** Implementar logger ligero con soporte de niveles (`debug`, `info`, `warn`, `error`) que censure automáticamente contraseñas, URLs de BD y tokens.
  - **Verificación:** `npx pnpm --filter @mocter/domain test`

- [x] **T-02 · Saneamiento de `src/db/index.ts` y modularización de cliente y health**
  - **Archivos:** `packages/domain/src/db/client.ts`, `packages/domain/src/db/health.ts`, `packages/domain/src/db/index.ts`
  - **Acción:** Eliminar `console.log([Database URL] ${url})`. Separar la gestión del pool (`client.ts`), la verificación de conectividad (`health.ts`) y reexportar de manera retrocompatible.
  - **Verificación:** `npx pnpm --filter @mocter/domain test`

---

## Fase 2 · Clean Architecture en `@mocter/domain` (Repository & Service)

- [x] **T-03 · Contratos de dominio: Result Pattern e interfaz `ILeadRepository`**
  - **Archivos:** `packages/domain/src/types/result.ts`, `packages/domain/src/repositories/lead.repository.interface.ts`
  - **Acción:** Definir tipos universales de retorno (`Result<T, E>`) e interfaz desacoplada para la persistencia de prospectos.
  - **Verificación:** `npx pnpm --filter @mocter/domain build`

- [x] **T-04 · Implementación Drizzle de `ILeadRepository`**
  - **Archivos:** `packages/domain/src/repositories/drizzle-lead.repository.ts`
  - **Acción:** Implementar métodos de persistencia usando Drizzle ORM sobre la tabla `leads`.
  - **Verificación:** `npx pnpm --filter @mocter/domain test`

- [x] **T-05 · Implementación de `LeadService` con validación y orquestación**
  - **Archivos:** `packages/domain/src/services/lead.service.ts`, `packages/domain/src/services/lead.service.test.ts`
  - **Acción:** Orquestar la validación Zod (`leadSchema`), el registro vía repositorio y el retorno tipado con `Result Pattern`.
  - **Verificación:** `npx pnpm --filter @mocter/domain test`

- [x] **T-06 · Exposición del módulo en `packages/domain/src/index.ts`**
  - **Archivos:** `packages/domain/src/index.ts`
  - **Acción:** Exportar `leadService`, `LeadService`, repositorios, tipos `Result` y utilidades para que `apps/web` pueda consumirlos.
  - **Verificación:** `npx pnpm --filter @mocter/domain build`

---

## Fase 3 · Seguridad Perimetral, Healthcheck y API REST en `apps/web`

- [x] **T-07 · Cabeceras de seguridad HTTP en `next.config.ts`**
  - **Archivos:** `apps/web/next.config.ts`
  - **Acción:** Configurar headers OWASP (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
  - **Verificación:** `npx pnpm --filter @mocter/web build`

- [x] **T-08 · Limitador de tasa (Rate Limiting) en memoria**
  - **Archivos:** `apps/web/lib/rate-limit.ts`, `apps/web/lib/rate-limit.test.ts`
  - **Acción:** Crear utilidad en memoria de ventana deslizante por IP para proteger endpoints públicos contra abusos.
  - **Verificación:** `npx pnpm --filter @mocter/web test`

- [x] **T-09 · Route Handler de salud `/api/health`**
  - **Archivos:** `apps/web/app/api/health/route.ts`, `apps/web/app/api/health/route.test.ts`
  - **Acción:** Implementar endpoint que consulte `checkDatabaseConnection()` y retorne 200 (OK) o 503 (Error) con JSON informativo.
  - **Verificación:** `npx pnpm --filter @mocter/web test`

- [x] **T-10 · Route Handler REST para Prospectos `/api/leads`**
  - **Archivos:** `apps/web/app/api/leads/route.ts`, `apps/web/app/api/leads/route.test.ts`
  - **Acción:** Exponer endpoint `POST /api/leads` protegido por rate limit y procesado por `leadService`.
  - **Verificación:** `npx pnpm --filter @mocter/web test`

- [x] **T-11 · Refactorización de Server Action `submitDemoRequest`**
  - **Archivos:** `apps/web/app/actions/demo-request.ts`, `apps/web/app/actions/demo-request.test.ts`
  - **Acción:** Adaptar la Server Action para consumir el nuevo `leadService` y aplicar rate limiting, manteniendo compatibilidad con la UI.
  - **Verificación:** `npx pnpm --filter @mocter/web test`

---

## Fase 4 · Infraestructura y Verificación Global

- [x] **T-12 · Actualización de Healthcheck en Dockerfile y Compose**
  - **Archivos:** `Dockerfile`, `docker-compose.prod.yml`, `docker-compose.test.yml`
  - **Acción:** Modificar el comando del healthcheck para consultar `http://127.0.0.1:3000/api/health`.
  - **Verificación:** `TAG=test docker compose -f docker-compose.prod.yml config -q`

- [x] **T-13 · Verificación global y reporte de auditoría**
  - **Acción:** Ejecutar `pnpm lint`, `pnpm test`, `drizzle-kit check` y compilar el reporte final según la sección 5 de `AGENTS.md`.
  - **Verificación:** Todas las pruebas pasan sin advertencias.
