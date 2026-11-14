# SPEC-12 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Actualizar esquema `tenant_invitations` y `cell_tenant_users` + migraciones**
  - **Archivos:** `packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`, `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`, migraciones control y celda.
  - **Detalle:** Añadir `displayName` e índice parcial `pending` en `tenant_invitations`, más `chatwootAgentId` en `cell_tenant_users`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar lógica completa de equipo e invitaciones en `TenantContactsAndUsersService`**
  - **Archivos:** `packages/domain/src/services/tenant-contacts-and-users.service.ts`, `packages/domain/src/services/tenant-contacts-and-users.service.test.ts`, `packages/domain/src/services/session-context.service.ts`.
  - **Detalle:** Validación cuota combinada (`SPEC-03`), protección único owner activo, hash SHA-256 tokens, aceptación, reenvío, revocación y chequeo de usuario activo en `resolveAuthenticatedPortalContext`.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-contacts-and-users`.

- [ ] **T-03 · Crear endpoints `/api/tenant/team/*` y pantalla pública `/invite/[token]`**
  - **Archivos:** `apps/admin/app/api/tenant/team/route.ts`, `invite/route.ts` [Nuevo], `invitations/[id]/route.ts` [Nuevo], `invitations/[id]/resend/route.ts` [Nuevo], `[id]/route.ts` [Nuevo], `[id]/status/route.ts` [Nuevo], `accept-invite/route.ts` [Nuevo], `apps/admin/app/invite/[token]/page.tsx` [Nuevo].
  - **Detalle:** Zod + `handle()` RFC 9457 (eliminar `detail: msg`), RBAC estricto (`tenancy_owner` en mutaciones) y auditoría Pino con `after()`.
  - **Verificación:** Tests de rutas en `tenant-routes.test.ts`.

- [ ] **T-04 · Rediseñar UI `/workspace/team` (`team-view.tsx`)**
  - **Archivos:** `apps/admin/app/workspace/team/team-view.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Barra de cuota del plan, pestañas Miembros / Invitaciones, modal invitar/editar, modales de confirmación `--dsn-*` para suspender/retirar/revocar, Title Case y Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/team`.

