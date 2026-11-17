# SPEC-13 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Crear `TenantChatwootEmbedService` en `@mocter/domain` y verificar entorno**
  - **Archivos:** `packages/domain/src/services/tenant-chatwoot-embed.service.ts` [Nuevo], `packages/domain/src/services/tenant-chatwoot-embed.service.test.ts` [Nuevo], `packages/domain/src/index.ts`.
  - **Detalle:** Implementar `resolveWorkspacePageState` (`ready | no_capability | access_denied | provisioning | not_provisioned | suspended | failed`) y `resolveWorkspaceEmbedRedirect` usando `NEXT_PUBLIC_CHATWOOT_URL` (sin `:3001` hardcoded), validando `clientId`, `?accountId` cruzado (`403 CHATWOOT_ACCOUNT_MISMATCH`), membresía `cell_tenant_users` (`status = 'active'` y `grantChatwootAccess`), sincronización best-effort de `chatwootAgentId`, logging Pino `tenant.chatwoot.embed_resolved` / `embed_failed` sin tokens y mapeo `502` ante caída SSO.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-chatwoot-embed`.

- [x] **T-02 · Refactorizar `scope=workspace` en `/api/auth/chatwoot/embed`, agregar `POST /api/tenant/conversations/retry` sin tocar `scope=admin`**
  - **Archivos:** `apps/admin/app/api/auth/chatwoot/embed/route.ts`, `apps/admin/app/api/auth/chatwoot/embed/route.test.ts`, `apps/admin/app/api/tenant/conversations/retry/route.ts` [Nuevo], `apps/admin/app/api/tenant/conversations/retry/route.test.ts` [Nuevo].
  - **Detalle:** Validar `scope` (`400` si inválido), eliminar `"http://localhost:3001"` usando `env.NEXT_PUBLIC_CHATWOOT_URL`, conectar `scope=workspace` a `TenantChatwootEmbedService` manteniendo HTTP 307 + CSP dinámica y dejando `scope=admin` 100% intacto; crear endpoint de reintento idempotente solo para `tenant_owner`.
  - **Verificación:** `pnpm --filter @mocter/admin test app/api/auth/chatwoot/embed/route.test.ts app/api/tenant/conversations/retry/route.test.ts app/admin/conversations/page.test.tsx`.

- [x] **T-03 · Mover «Conversaciones» a posición 2 del menú e implementar `WorkspaceConversationsView` con i18n `es`/`en`**
  - **Archivos:** `apps/admin/lib/i18n.ts`, `apps/admin/lib/i18n.test.ts`, `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/components/tenant-workspace-shell.test.tsx`, `apps/admin/app/workspace/conversations/page.tsx`, `apps/admin/app/workspace/conversations/conversations-view.tsx` [Nuevo], `apps/admin/app/workspace/workspace-views.test.tsx`.
  - **Detalle:** Agregar claves i18n `es`/`en` (`navConversations` = `Conversaciones` / `Conversations` y textos de estado); ubicar `/workspace/conversations` en índice 1 de `TenantWorkspaceShell` (debajo de «Tablero»); implementar `WorkspaceConversationsView` con cabecera discreta («Recargar Bandeja»), carga/timeout (>12s), tarjetas para todos los estados (`no_capability`, `access_denied`, `provisioning`, `not_provisioned`, `suspended`, `failed`) y botón de reintento para propietario.
  - **Verificación:** `pnpm --filter @mocter/admin test lib/i18n.test.ts components/tenant-workspace-shell.test.tsx app/workspace/workspace-views.test.tsx`.

- [x] **T-04 · Prueba integral de no-regresión SaaS + protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test` (`@mocter/domain` y `@mocter/admin`), reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP 200 y logs limpios tanto en `/admin/conversations` / `/admin/billing?tab=plans` como en `/workspace/conversations`.
