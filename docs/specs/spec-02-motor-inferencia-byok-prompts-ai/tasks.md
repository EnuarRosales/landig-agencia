# SPEC-02 · Plan de Implementación (`tasks.md`)

> **Orden estricto:** Ejecutar en secuencia respetando las reglas de `.agents/AGENTS.md` (R-01..R-10, TSDoc, i18n, `@t3-oss/env-nextjs`, RFC 9457, Pino JSON y protocolo §4.18).

## Tareas de Implementación

- [x] **T-01 · Variables de entorno y esquema Drizzle AI/BYOK**
  - **Archivos:** `packages/domain/src/config/env.ts` (o archivo `env.ts` de `@mocter/admin` y `@mocter/domain`), `.env.example`, `packages/domain/src/db/schemas/admin/bot-tenancy.ts`.
  - **Detalle:** Registrar `AI_ENCRYPTION_KEY`, `AI_ENCRYPTION_KEY_ID`, `AI_HTTP_TIMEOUT_MS` en Zod env + `.env.example`. Añadir `lastVerifiedAt`, `lastVerificationError` en `tenantAiProviders` y `fieldKey`, `requestId` en `aiUsageEvents` con comentarios SQL. Generar migración con `pnpm --filter @mocter/domain db:generate`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` sin advertencias ni errores.

- [x] **T-02 · Servicio criptográfico AES-256-GCM y pruebas unitarias**
  - **Archivos:** `packages/domain/src/services/secret-crypto.service.ts` [Nuevo], `packages/domain/src/services/secret-crypto.service.test.ts` [Nuevo].
  - **Detalle:** Implementar `encryptSecret` / `decryptSecret` usando `AI_ENCRYPTION_KEY`, IV aleatorio por operación y validación de autenticación tag. Garantizar TSDoc en español.
  - **Verificación:** `pnpm --filter @mocter/domain test secret-crypto`.

- [x] **T-03 · Resolvedor de credenciales BYOK vs Excepción Trial/Onboarding**
  - **Archivos:** `packages/domain/src/services/ai-credential-resolver.service.ts` [Nuevo], `packages/domain/src/services/ai-credential-resolver.service.test.ts` [Nuevo].
  - **Detalle:** Implementar precedencia estricta: (1) BYOK activo del inquilino (`mode = 'byok'`), (2) `trialing` vigente o `onboarding` inconcluso usando `ai_platform_keys` (`mode = 'mocter'`), (3) error de negocio `AI_BYOK_REQUIRED`.
  - **Verificación:** Pruebas unitarias cubriendo los 4 casos (BYOK activo, Trial sin BYOK, Trial vencido sin BYOK, Onboarding sin BYOK).

- [x] **T-04 · Adaptador HTTP multi-proveedor real (`LlmHttpProviderClient`)**
  - **Archivos:** `packages/domain/src/services/llm-http-provider.client.ts` [Nuevo], `packages/domain/src/services/llm-http-provider.client.test.ts` [Nuevo].
  - **Detalle:** Implementar `generateSuggestion` y `verifyApiKey` para OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter y Together AI usando `fetch` nativo con `AbortSignal.timeout`, sin SDKs pesados innecesarios y con mapeo de errores a `Result`.
  - **Verificación:** Pruebas unitarias con `fetch` mockeado validando headers, parseo de tokens y mapeo de códigos 401/429/5xx.

- [x] **T-05 · Semilla de prompts maestros y actualización de `AiAssistService`**
  - **Archivos:** `packages/domain/src/services/ai-assist.service.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, `packages/domain/src/services/ai-assist.service.test.ts`.
  - **Detalle:** Eliminar la dependencia errónea a `walletBalanceCents` cuando el resolvedor autorice `platform_trial`; incorporar `fieldKey` y `requestId` en trazas `aiUsageEvents`; completar semilla idempotente de los prompts maestros requeridos.
  - **Verificación:** `pnpm --filter @mocter/domain test ai-assist`.

- [x] **T-06 · Remediación de `POST /api/ai/enhance` y creación de endpoints `/api/tenant/ai/settings*`**
  - **Archivos:** `apps/admin/app/api/ai/enhance/route.ts`, `apps/admin/app/api/ai/enhance/route.test.ts`, `apps/admin/app/api/tenant/ai/settings/route.ts` [Nuevo], `apps/admin/app/api/tenant/ai/settings/verify/route.ts` [Nuevo].
  - **Detalle:** Reemplazar `{} as any` en `/api/ai/enhance` por composición real envuelta en `handle()` con `after()` para auditoría Pino JSON + BD. Implementar `GET`/`PUT`/`DELETE` y `POST /verify` restringidos a `tenancy_owner` (`403` para `tenant_agent`) sin retornar nunca claves descifradas.
  - **Verificación:** Pruebas de integración de rutas (`route.test.ts`) probando `200`, `400`, `403`, `422 AI_BYOK_REQUIRED`, `429`.

- [x] **T-07 · Eliminación de mocks en UI y pantalla de configuración BYOK del inquilino**
  - **Archivos:** `apps/admin/components/ai-enhance-textarea.tsx` (o componente existente), `apps/admin/app/workspace/products/products-view.tsx`, `apps/admin/app/workspace/ai/page.tsx` [Nuevo], `apps/admin/app/workspace/ai/ai-settings-view.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Conectar `<AiEnhanceTextarea />` al endpoint real con estado de carga, vista previa editable y acciones explícitas («Aplicar Sugerencia», «Descartar»); eliminar `setTimeout(..., 600)` de `products-view.tsx`. Crear vista Mobile First de gestión BYOK con modales `--dsn-*` (sin `window.confirm`) y labels en Title Case.
  - **Verificación:** Pruebas de componente (`vitest` / RTL) + revisión de diccionarios `es`/`en`.

- [x] **T-08 · Verificación de administración de llave de prueba SaaS en `/admin/ai`**
  - **Archivos:** `apps/admin/app/admin/ai/ai-governance-view.tsx`, `apps/admin/app/api/admin/ai/route.ts`.
  - **Detalle:** Confirmar/completar formulario seguro para registrar o rotar la API Key de plataforma usada en periodos de prueba y comprobar visibilidad de todos los prompts maestros en la pestaña correspondiente.
  - **Verificación:** `apps/admin/app/admin/ai/page.test.tsx` y `apps/admin/app/api/admin/ai/route.test.ts`.

- [x] **T-09 · Compilación, reinicio de servicios y verificación integral (`AGENTS.md §4.18`)**
  - **Comandos:**
    - `pnpm lint`
    - `pnpm test`
    - `pnpm --filter @mocter/domain exec drizzle-kit check`
    - Recompilación de contenedores afectados, reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 y logs Pino sin errores no controlados ni filtración de claves.

## Fase 2 · Catálogo Dinámico De Proveedores Con Logo, CRUD De Modelos Por Defecto Y Failover Primario/Secundario

- [x] **T-11 · Migración Drizzle para proveedores dinámicos, logos, `is_default` en modelos y `priority_role` (Primario/Secundario)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/bot-catalog.ts`, `packages/domain/src/db/schemas/admin/bot-tenancy.ts`, nueva migración SQL en `packages/domain/drizzle/`.
  - **Detalle:** Reemplazar `ai_providers_code_check` cerrado por regex de slug e índice único parcial `WHERE deleted_at IS NULL`; añadir `api_dialect`, `base_url`, `verify_path`, `logo_storage_key`, `deleted_at`, `deleted_by` en `aiProviders`; añadir `is_default` (con índice único parcial por proveedor), `deleted_at`, `deleted_by` en `aiModels`; añadir `priority_role` (`'primary' | 'secondary' | 'standby'`) e índices únicos parciales en `aiPlatformKeys` y `tenantAiProviders`, además de `temperature` (`'0.7'`) y `max_tokens` (`1000`, `CHECK 64..8192`) en `aiPlatformKeys`, con backfill idempotente de los 6 proveedores iniciales.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` sin advertencias ni errores.

- [x] **T-12 · Desacoplamiento de `LlmHttpProviderClient` por dialecto/URL y motor de Failover Primario → Secundario**
  - **Archivos:** `packages/domain/src/services/llm-http-provider.client.ts`, `packages/domain/src/services/ai-credential-resolver.service.ts`, `packages/domain/src/services/ai-assist.service.ts`, pruebas `.test.ts` asociadas.
  - **Detalle:** Eliminar la lista cerrada de `SupportedLlmProviderCode` en inferencia ejecutando mediante `(apiDialect, baseUrl, verifyPath)` desde BD; resolver candidatos ordenados `[primary, secondary]` tanto para BYOK como para plataforma en trial/onboarding leyendo `temperature` y `max_tokens` configurados en `ai_platform_keys` (con fallback al modelo por defecto); implementar conmutación automática al secundario ante `timeout`, error de red, HTTP `429` o `5xx` del primario y auditar el failover en `ai_usage_events` y Pino.
  - **Verificación:** Pruebas unitarias cubriendo proveedor personalizado `openai_compatible`, precedencia `primary` → `secondary` y failover ante timeout/`429`/`5xx`.

- [x] **T-13 · Servicios de dominio para CRUD de Proveedores (con logo en SeaweedFS + `imgproxy`), CRUD de Modelos (`is_default`) y eliminación híbrida segura**
  - **Archivos:** `packages/domain/src/services/admin-dashboard.service.ts`, `packages/domain/src/services/bot-catalog.seed.ts`, `packages/domain/src/services/tenant-ai-settings.service.ts`, pruebas `.test.ts` asociadas.
  - **Detalle:** Implementar `createAdminAiProvider`, `updateAdminAiProvider`, `deleteAdminAiProvider`, `createAdminAiModel`, `updateAdminAiModel`, `deleteAdminAiModel`, soporte de subida/firma HMAC de logo en SeaweedFS + `imgproxy`, unicidad transaccional de `is_default` por proveedor, soporte de `priorityRole` (`primary` / `secondary`), `temperature` (`0.0..2.0`) y `maxTokens` (`64..8192`) en llaves de plataforma y BYOK, y eliminación híbrida (`409` en uso activo / soft-delete con historial / hard-delete sin referencias). Completar `CANONICAL_INITIAL_MODELS` para `openrouter` y `together_ai`.
  - **Verificación:** `pnpm --filter @mocter/domain test`.

- [x] **T-14 · Endpoints `/api/admin/ai*` y `/api/tenant/ai/settings` para catálogo dinámico, logos y prioridad Primaria/Secundaria**
  - **Archivos:** `apps/admin/app/api/admin/ai/route.ts`, `apps/admin/app/api/admin/ai/providers/logo/route.ts` [Nuevo], `apps/admin/app/api/tenant/ai/settings/route.ts`, `apps/admin/app/api/tenant/ai/settings/verify/route.ts` y pruebas `route.test.ts`.
  - **Detalle:** Exponer acciones de CRUD completo de proveedores/modelos (incluyendo `defaultTemperature` y `defaultMaxTokens`), prioridad de llaves de plataforma y validación de `temperature` (`0.0..2.0`) / `maxTokens` (`64..8192`) en `save_platform_key` / edición de llave activa dentro de `/api/admin/ai`, endpoint multipart de logo validando magic bytes (≤ 2 MB, `PNG`/`JPEG`/`WebP`/`AVIF`) con respuestas RFC 9457 (`400`, `409`, `422`), y soportar `priorityRole` + múltiples llaves activas en `/api/tenant/ai/settings`.
  - **Verificación:** `route.test.ts` cubriendo `200`, `400`, `403`, `409 AI_RESOURCE_IN_ACTIVE_USE` y validación de magic bytes.

- [x] **T-15 · UI de `/admin/ai` y `/workspace/ai`: gestión de proveedores con logo, CRUD de modelos con «Modelo Por Defecto» y configuración Primaria/Secundaria**
  - **Archivos:** `apps/admin/app/admin/ai/ai-governance-view.tsx`, `apps/admin/app/workspace/ai/ai-settings-view.tsx`, `apps/admin/lib/i18n.ts`, pruebas `.test.tsx` asociadas.
  - **Detalle:** En `/admin/ai`, añadir formulario/modal para Crear/Editar/Eliminar proveedores con cargue de logo y vista previa, formulario/modal completo para Crear/Editar/Inactivar/Eliminar modelos con indicador «Por Defecto» y campos «Temperatura De Respuesta (0.0 – 2.0)» y «Límite Máximo De Tokens», e incluir ambos campos (auto-sincronizados con los defaults del modelo elegido) junto al selector de rol Primario/Secundario en Llaves De Prueba De Plataforma. En `/workspace/ai`, mostrar logos firmados, preseleccionar el modelo `isDefault` al elegir proveedor y permitir designar clave BYOK Primaria y Secundaria. Cumplir Title Case, Mobile First, i18n `es`/`en` y `ConfirmationModal --dsn-*`.
  - **Verificación:** Pruebas de componente (`page.test.tsx`), `terminology-hygiene.test.ts` y `eslint` en verde.

- [x] **T-16 · Verificación integral de Fase 2 (`AGENTS.md §4.18`)**
  - **Comandos:** `pnpm --filter @mocter/domain exec drizzle-kit check`, `pnpm lint`, `pnpm test`, compilación de `@mocter/domain`, reinicio de portales Docker y verificación HTTP 200 en `/api/health`.

- [x] **T-17 · Paginación, filtros, ordenamiento y diseño Mobile First en «Catálogo De Modelos LLM y Spread Comercial» (`/admin/ai`)**
  - **Archivos:** `apps/admin/app/admin/ai/models-catalog-section.tsx` [Nuevo], `apps/admin/app/admin/ai/ai-governance-view.tsx`, `apps/admin/app/admin/ai/page.test.tsx`.
  - **Detalle:** Implementar barra de búsqueda por nombre/ID técnico, selector por Proveedor LLM, selector de Estado (`Todos`/`Activos`/`Inactivos`), toggle «Solo Por Defecto» y botón «Limpiar Filtros»; ordenamiento clicable por columnas clave (`Modelo`, `Proveedor`, `Ventana Contexto`, `Spread Comercial`, `Precio Al Inquilino`, `Estado`, con orden inicial Proveedor → Modelo Por Defecto); paginación client-side con `10` filas por defecto (selector `5 / 10 / 25 / 50`), contador «Mostrando X–Y de Z modelos», botones Anterior/Siguiente y clamp de página al filtrar o eliminar; y presentación Mobile First (`< md` tarjetas apiladas, `md+` tabla completa) en un único árbol DOM accesible con etiquetas en Title Case sin `uppercase`.
  - **Verificación:** Pruebas unitarias/RTL en `apps/admin/app/admin/ai/page.test.tsx`, ESLint, `vitest` y verificación en contenedor.

- [x] **T-10 [HUMANO] · Configurar `AI_ENCRYPTION_KEY` y cargar llave inicial de prueba en `/admin/ai`**
  - **Detalle:** El operador de plataforma define `AI_ENCRYPTION_KEY` segura de 32 bytes en el entorno del servidor y carga al menos una API Key de plataforma activa en `/admin/ai` → «Proveedores y Modelos LLM» para habilitar el flujo real durante onboardings y trials.
