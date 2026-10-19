# API-001 · Tareas · Documentación OpenAPI (Swagger) de APIs en Mocter

| Atributo | Valor |
|---|---|
| ID | API-001 |
| Versión | 1.0 |
| Estado | Implementada |
| Fecha | 2026-10-19 |
| Documentos | [`requirements.md`](requirements.md) · [`design.md`](design.md) · `tasks.md` (este) |

## Tareas de Implementación

- [x] **1. Dependencias y Configuración**
  - [x] 1.1 Instalar `@asteasolutions/zod-to-openapi` y `@scalar/api-reference-react` en `apps/web`.
  - [x] 1.2 Actualizar `apps/web/middleware.ts` para excluir `api-docs` del matcher de `next-intl`.

- [x] **2. Generador y Registro OpenAPI**
  - [x] 2.1 Crear `apps/web/lib/openapi.ts` con la inicialización del registro OpenAPI (`extendZodWithOpenApi`).
  - [x] 2.2 Registrar la metadata del sistema (`info`, `servers`, `tags`).
  - [x] 2.3 Registrar la ruta `GET /api/health` con sus códigos de respuesta (200, 503).
  - [x] 2.4 Registrar la ruta `POST /api/leads` con esquemas de entrada Zod y respuestas (201, 400, 429, 500).

- [x] **3. Endpoints y Visualizador Interactivo**
  - [x] 3.1 Crear el Route Handler `apps/web/app/api/openapi.json/route.ts` que sirva la especificación JSON.
  - [x] 3.2 Crear la página `apps/web/app/api-docs/page.tsx` con el visualizador interactivo Scalar.

- [x] **4. Pruebas y Verificación**
  - [x] 4.1 Crear prueba unitaria/integración en `apps/web/lib/openapi.test.ts` que valide la generación correcta del documento OpenAPI.
  - [x] 4.2 Ejecutar suite de pruebas en `apps/web` (`pnpm test`).
  - [x] 4.3 Ejecutar verificación de tipos (`pnpm lint`).
  - [x] 4.4 Verificar endpoint `GET /api/openapi.json` y la página `/api-docs` en contenedor o servidor de desarrollo.

- [x] **5. Documentación y Cierre**
  - [x] 5.1 Actualizar `AGENTS.md` con la nueva especificación `API-001`.
  - [x] 5.2 Actualizar `README.md` y `ESTADO_TECNICO_ACTUAL.md` documentando la disponibilidad de `/api-docs` y OpenAPI.
