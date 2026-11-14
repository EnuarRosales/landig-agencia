# SPEC-13 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Configurar variables Chatwoot en `env.ts` / `.env.example` y crear `TenantChatwootEmbedService`**
  - **Archivos:** `env.ts` (`@mocter/admin` / `@mocter/domain`), `.env.example`, `packages/domain/src/services/tenant-chatwoot-embed.service.ts` [Nuevo], `tenant-chatwoot-embed.service.test.ts` [Nuevo].
  - **Detalle:** Eliminar cualquier fallback `localhost:3001`; construir destino `/app/accounts/{id}/dashboard` exclusivamente desde `session.clientId` + `admin.chatwoot_accounts` y manejar estados `ready | provisioning | agent_sync_required | error`.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-chatwoot-embed`.

- [ ] **T-02 · Estabilizar rama `scope=workspace` en `/api/auth/chatwoot/embed` sin tocar rama `scope=admin`**
  - **Archivos:** `apps/admin/app/api/auth/chatwoot/embed/route.ts`, `apps/admin/app/api/auth/chatwoot/embed/route.test.ts`.
  - **Detalle:** Conectar rama `workspace` con `TenantChatwootEmbedService` y `handle()` RFC 9457; verificar con diff que `scope=admin` y `/admin/conversations` permanecen 100% intactos.
  - **Verificación:** `pnpm test apps/admin/app/api/auth/chatwoot/embed/route.test.ts` y `apps/admin/app/admin/conversations/page.test.tsx`.

- [ ] **T-03 · Mover «Conversaciones» a posición 2 del menú y mejorar vista `/workspace/conversations`**
  - **Archivos:** `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/app/workspace/conversations/page.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Posicionar «Conversaciones» debajo de «Tablero»; agregar estados visuales limpios de carga, provisión pendiente y reintento sin apertura en pestaña nueva ni jerga de infraestructura.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-04 · Prueba integral de no-regresión SaaS + protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 tanto en `/admin/conversations` (no-regresión obligatoria) como en `/workspace/conversations`.

