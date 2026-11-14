# SPEC-02 · Plan de Implementación (`tasks.md`)

> **Orden estricto:** Ejecutar en secuencia respetando las reglas de `.agents/AGENTS.md` (R-01..R-10, TSDoc, i18n, `@t3-oss/env-nextjs`, RFC 9457, Pino JSON y protocolo §4.18).

## Tareas de Implementación

- [ ] **T-01 · Variables de entorno y esquema Drizzle AI/BYOK**
  - **Archivos:** `packages/domain/src/config/env.ts` (o archivo `env.ts` de `@mocter/admin` y `@mocter/domain`), `.env.example`, `packages/domain/src/db/schemas/admin/bot-tenancy.ts`.
  - **Detalle:** Registrar `AI_ENCRYPTION_KEY`, `AI_ENCRYPTION_KEY_ID`, `AI_HTTP_TIMEOUT_MS` en Zod env + `.env.example`. Añadir `lastVerifiedAt`, `lastVerificationError` en `tenantAiProviders` y `fieldKey`, `requestId` en `aiUsageEvents` con comentarios SQL. Generar migración con `pnpm --filter @mocter/domain db:generate`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` sin advertencias ni errores.

- [ ] **T-02 · Servicio criptográfico AES-256-GCM y pruebas unitarias**
  - **Archivos:** `packages/domain/src/services/secret-crypto.service.ts` [Nuevo], `packages/domain/src/services/secret-crypto.service.test.ts` [Nuevo].
  - **Detalle:** Implementar `encryptSecret` / `decryptSecret` usando `AI_ENCRYPTION_KEY`, IV aleatorio por operación y validación de autenticación tag. Garantizar TSDoc en español.
  - **Verificación:** `pnpm --filter @mocter/domain test secret-crypto`.

- [ ] **T-03 · Resolvedor de credenciales BYOK vs Excepción Trial/Onboarding**
  - **Archivos:** `packages/domain/src/services/ai-credential-resolver.service.ts` [Nuevo], `packages/domain/src/services/ai-credential-resolver.service.test.ts` [Nuevo].
  - **Detalle:** Implementar precedencia estricta: (1) BYOK activo del inquilino (`mode = 'byok'`), (2) `trialing` vigente o `onboarding` inconcluso usando `ai_platform_keys` (`mode = 'mocter'`), (3) error de negocio `AI_BYOK_REQUIRED`.
  - **Verificación:** Pruebas unitarias cubriendo los 4 casos (BYOK activo, Trial sin BYOK, Trial vencido sin BYOK, Onboarding sin BYOK).

- [ ] **T-04 · Adaptador HTTP multi-proveedor real (`LlmHttpProviderClient`)**
  - **Archivos:** `packages/domain/src/services/llm-http-provider.client.ts` [Nuevo], `packages/domain/src/services/llm-http-provider.client.test.ts` [Nuevo].
  - **Detalle:** Implementar `generateSuggestion` y `verifyApiKey` para OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter y Together AI usando `fetch` nativo con `AbortSignal.timeout`, sin SDKs pesados innecesarios y con mapeo de errores a `Result`.
  - **Verificación:** Pruebas unitarias con `fetch` mockeado validando headers, parseo de tokens y mapeo de códigos 401/429/5xx.

- [ ] **T-05 · Semilla de prompts maestros y actualización de `AiAssistService`**
  - **Archivos:** `packages/domain/src/services/ai-assist.service.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, `packages/domain/src/services/ai-assist.service.test.ts`.
  - **Detalle:** Eliminar la dependencia errónea a `walletBalanceCents` cuando el resolvedor autorice `platform_trial`; incorporar `fieldKey` y `requestId` en trazas `aiUsageEvents`; completar semilla idempotente de los prompts maestros requeridos.
  - **Verificación:** `pnpm --filter @mocter/domain test ai-assist`.

- [ ] **T-06 · Remediación de `POST /api/ai/enhance` y creación de endpoints `/api/tenant/ai/settings*`**
  - **Archivos:** `apps/admin/app/api/ai/enhance/route.ts`, `apps/admin/app/api/ai/enhance/route.test.ts`, `apps/admin/app/api/tenant/ai/settings/route.ts` [Nuevo], `apps/admin/app/api/tenant/ai/settings/verify/route.ts` [Nuevo].
  - **Detalle:** Reemplazar `{} as any` en `/api/ai/enhance` por composición real envuelta en `handle()` con `after()` para auditoría Pino JSON + BD. Implementar `GET`/`PUT`/`DELETE` y `POST /verify` restringidos a `tenancy_owner` (`403` para `tenant_agent`) sin retornar nunca claves descifradas.
  - **Verificación:** Pruebas de integración de rutas (`route.test.ts`) probando `200`, `400`, `403`, `422 AI_BYOK_REQUIRED`, `429`.

- [ ] **T-07 · Eliminación de mocks en UI y pantalla de configuración BYOK del inquilino**
  - **Archivos:** `apps/admin/components/ai-enhance-textarea.tsx` (o componente existente), `apps/admin/app/workspace/products/products-view.tsx`, `apps/admin/app/workspace/ai/page.tsx` [Nuevo], `apps/admin/app/workspace/ai/ai-settings-view.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Conectar `<AiEnhanceTextarea />` al endpoint real con estado de carga, vista previa editable y acciones explícitas («Aplicar Sugerencia», «Descartar»); eliminar `setTimeout(..., 600)` de `products-view.tsx`. Crear vista Mobile First de gestión BYOK con modales `--dsn-*` (sin `window.confirm`) y labels en Title Case.
  - **Verificación:** Pruebas de componente (`vitest` / RTL) + revisión de diccionarios `es`/`en`.

- [ ] **T-08 · Verificación de administración de llave de prueba SaaS en `/admin/ai`**
  - **Archivos:** `apps/admin/app/admin/ai/ai-governance-view.tsx`, `apps/admin/app/api/admin/ai/route.ts`.
  - **Detalle:** Confirmar/completar formulario seguro para registrar o rotar la API Key de plataforma usada en periodos de prueba y comprobar visibilidad de todos los prompts maestros en la pestaña correspondiente.
  - **Verificación:** `apps/admin/app/admin/ai/page.test.tsx` y `apps/admin/app/api/admin/ai/route.test.ts`.

- [ ] **T-09 · Compilación, reinicio de servicios y verificación integral (`AGENTS.md §4.18`)**
  - **Comandos:**
    - `pnpm lint`
    - `pnpm test`
    - `pnpm --filter @mocter/domain exec drizzle-kit check`
    - Recompilación de contenedores afectados, reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 y logs Pino sin errores no controlados ni filtración de claves.

- [ ] **T-10 [HUMANO] · Configurar `AI_ENCRYPTION_KEY` y cargar llave inicial de prueba en `/admin/ai`**
  - **Detalle:** El operador de plataforma define `AI_ENCRYPTION_KEY` segura de 32 bytes en el entorno del servidor y carga al menos una API Key de plataforma activa en `/admin/ai` → «Proveedores y Modelos LLM» para habilitar el flujo real durante onboardings y trials.

