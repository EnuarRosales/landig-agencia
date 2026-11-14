# SPEC-10 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender `admin.tenant_bots` (`default_messages`, `business_hours`) y semillas de prompts/catálogos**
  - **Archivos:** `packages/domain/src/db/schemas/admin/bot-tenancy.ts`, `packages/domain/src/services/bot-catalog.seed.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, `packages/domain/drizzle/*` [Nueva migración].
  - **Detalle:** Agregar JSONBs tipados para los 6 mensajes clave y horarios; asegurar presets, tonos, objetivos y prompts maestros de cada mensaje y política en `es`/`en`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar `BotConfigUnifiedService` y `ensureDefaultChatwootLabels`**
  - **Archivos:** `packages/domain/src/services/bot.service.ts`, `packages/domain/src/services/bot.service.test.ts`, `packages/domain/src/services/tenant-workspace.service.ts`.
  - **Detalle:** Unificar lectura/escritura entre `admin.tenant_bots`, `cell_client_business_info` (incluyendo `shippingPolicy`) y `cell_tenant_labels`; hidratación segura desde datos heredados y sincronización en `after()` hacia Chatwoot.
  - **Verificación:** `pnpm --filter @mocter/domain test bot`.

- [ ] **T-03 · Actualizar API `/api/tenant/bot` con Zod ampliado, RBAC y `handle()` RFC 9457**
  - **Archivos:** `apps/admin/app/api/tenant/bot/route.ts`, tests en `apps/admin/app/api/tenant/tenant-routes.test.ts`.
  - **Detalle:** Eliminar `detail: msg`, restringir `PUT` a `tenancy_owner` (`403` para agentes), validar objetivo/preset/tono/políticas/FAQs/6 mensajes clave.
  - **Verificación:** Tests de integración HTTP (`200`, `400`, `403`).

- [ ] **T-04 · Refactorizar `/workspace/bot` eliminando `PRESETS` hardcoded e integrando 6 mensajes + `shippingPolicy`**
  - **Archivos:** `apps/admin/app/workspace/bot/bot-view.tsx`, subcomponentes (`bot-identity-tab.tsx`, `bot-policies-tab.tsx`, `bot-messages-tab.tsx` [Nuevos]), diccionarios i18n `es`/`en`.
  - **Detalle:** Cargar presets y tonos reales desde BD; incluir Política De Envíos y los 6 mensajes con chips de variables + `<AiEnhanceTextarea />`; modal `--dsn-*` para restaurar mensajes base o borrar FAQs; labels Title Case y Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/bot`.

