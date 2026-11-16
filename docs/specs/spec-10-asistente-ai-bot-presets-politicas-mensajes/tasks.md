# SPEC-10 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender `admin.tenant_bots` (`default_messages`, `business_hours`, `classifier_prompt`), `cell_tenant_labels` (`SPEC-19`) y semillas unificadas (`SPEC-10` + `SPEC-20`)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/bot-tenancy.ts`, `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`, `packages/domain/src/services/bot-catalog.seed.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, migraciones unificadas con `SPEC-20` en `packages/domain/drizzle/*` y `packages/domain/drizzle-cell/*`.
  - **Detalle:** Agregar JSONBs tipados para los 6 mensajes clave y horarios (derivando `timezone` de `clients.timezone`/`country_code`), `classifier_prompt` y metadatos de etiquetas `SPEC-19` (`category`, `activation_rule`, `side_effects`); mantener `shipping_policy` como JSONB extendido (`{ freeShipping, defaultCostCents, policyText, deliveryRules }`); asegurar presets, tonos, objetivos y prompts maestros de cada mensaje y política en `es`/`en`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y `drizzle-kit check --config=drizzle.cell.config.ts`.

- [x] **T-02 · Implementar `BotConfigUnifiedService`, serialización `PromptComposer` (`SPEC-20`) y `ensureDefaultChatwootLabels`**
  - **Archivos:** `packages/domain/src/services/bot.service.ts`, `packages/domain/src/services/bot.service.test.ts`, `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/services/prompt-composer.ts`.
  - **Detalle:** Unificar lectura/escritura entre `admin.tenant_bots` (`SPEC-10` + `SPEC-19`), `cell_client_business_info` (incluyendo `shippingPolicy` JSONB extendido) y `cell_tenant_labels` (6 operacionales `SPEC-10` + 5 funcionales `SPEC-19` + personalizadas); hidratación segura desde datos heredados, serialización hacia `PromptComposer`, y sincronización en `after()` hacia Chatwoot.
  - **Verificación:** `pnpm --filter @mocter/domain test`.

- [x] **T-03 · Actualizar API `/api/tenant/bot` con Zod ampliado, RBAC y `handle()` RFC 9457**
  - **Archivos:** `apps/admin/app/api/tenant/bot/route.ts`, tests en `apps/admin/app/api/tenant/tenant-routes.test.ts`.
  - **Detalle:** Eliminar `detail: msg`, restringir `PUT` a `tenancy_owner` (`403` para agentes), validar objetivo/preset/tono/políticas (`shippingPolicy` JSONB)/FAQs/6 mensajes clave/`instructions`/`classifierPrompt`/etiquetas `SPEC-19`.
  - **Verificación:** Tests de integración HTTP (`200`, `400`, `403`).

- [x] **T-04 · Refactorizar `/workspace/bot` y `bot-ui-helpers.ts` integrando `SPEC-10` + `SPEC-19` + `SPEC-20`**
  - **Archivos:** `apps/admin/app/workspace/bot/bot-view.tsx`, `apps/admin/app/workspace/bot/bot-ui-helpers.ts`, subcomponentes (`bot-identity-tab.tsx`, `bot-policies-tab.tsx`, `bot-messages-tab.tsx` [Nuevos]), diccionarios i18n `es`/`en`.
  - **Detalle:** Cargar presets y tonos reales desde BD; pasar `countryCode` + `shippingPolicy` a `ClientGeneralPromptContext`; incluir Política De Envíos (`policyText` AI + toggles/reglas) y los 6 mensajes con chips de variables internacionales + `<AiEnhanceTextarea />`; persistir `SPEC-19` (`clientGeneralPrompt`, `classifierPrompt`, etiquetas); modal `--dsn-*` para restaurar mensajes base o borrar FAQs; labels Title Case y Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [x] **T-05 · Verificación final coordinada con `SPEC-20` y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP 200 en `/workspace/bot`.

