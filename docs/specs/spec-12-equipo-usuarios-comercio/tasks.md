# SPEC-12 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Actualizar esquema `tenant_invitations` y `cell_tenant_users` + migraciones**
  - **Archivos:** `packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`, `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`, migraciones control (`drizzle/`) y celda (`drizzle-cell/`).
  - **Detalle:** Añadir `displayName`, `grantChatwootAccess` e índice parcial `pending` en `tenant_invitations`, más `grantChatwootAccess` y `chatwootAgentId` en `cell_tenant_users`.
  - **Verificación:** `pnpm --filter @mocter/domain run db:check` y `pnpm --filter @mocter/domain run db:check:cell`.

- [x] **T-02 · Implementar lógica completa de equipo, invitaciones, cuotas, correo `SPEC-14` y sync Chatwoot**
  - **Archivos:** `packages/domain/src/services/tenant-contacts-and-users.service.ts`, `packages/domain/src/services/tenant-contacts-and-users.service.test.ts`, `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/services/notifications-and-leads.service.ts`, `packages/domain/src/services/chatwoot-provisioning.service.ts`, `packages/domain/src/services/tenant-workspace.service.ts`.
  - **Detalle:** Validación cuota combinada (`tenant_users` y `chatwoot_agents` de `SPEC-03`), protección propietario único, hash SHA-256 tokens (72h), expiración automática en re-invitación, reenvío de vigentes/expiradas, revocación, edición, suspensión/reactivación/retiro con revocación de sesiones, aceptación diferenciada (nuevo vs existente) con reactivación tras `left`, plantilla `team.member_invited` y remoción de agente en Chatwoot.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-contacts-and-users`.

- [x] **T-03 · Crear endpoints `/api/tenant/team/*`, exención `proxy.ts`, guarda Chatwoot embed y pantalla pública `/invite/[token]`**
  - **Archivos:** `apps/admin/proxy.ts`, `apps/admin/app/api/auth/chatwoot/embed/route.ts`, `apps/admin/app/api/tenant/team/route.ts`, `invite/route.ts` [Nuevo], `invitations/[id]/route.ts` [Nuevo], `invitations/[id]/resend/route.ts` [Nuevo], `[id]/route.ts` [Nuevo], `[id]/status/route.ts` [Nuevo], `accept-invite/route.ts` [Nuevo], `apps/admin/app/invite/[token]/page.tsx` [Nuevo] + componente cliente.
  - **Detalle:** Zod + `handle()` RFC 9457 (eliminar `detail: msg`), RBAC estricto (`tenant_owner` en mutaciones), cookies de sesión al aceptar, verificación `grantChatwootAccess` en `embed/route.ts` y auditoría Pino + envíos con `after()`.
  - **Verificación:** Tests de rutas en `apps/admin/app/api/tenant/spec12-team-routes.test.ts` y `tenant-routes.test.ts`.

- [x] **T-04 · Rediseñar UI `/workspace/team` (`team-view.tsx`)**
  - **Archivos:** `apps/admin/app/workspace/team/page.tsx`, `apps/admin/app/workspace/team/team-view.tsx`, diccionarios i18n `apps/admin/lib/i18n.ts` (`es`/`en`).
  - **Detalle:** Barra de cuota del plan (`tenant_users` y `chatwoot_agents`), pestañas Miembros / Invitaciones (oculta para `tenant_agent`), búsqueda/filtros/paginación, modal invitar/editar, modales de confirmación `--dsn-*` para suspender/reactivar/retirar/revocar, Title Case y Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/team`.
