# SPEC-14 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender `notifications.ts` (`isActive`, `tenantConfigurable`, preferencias e inbox) + migración y semillas**
  - **Archivos:** `packages/domain/src/db/schemas/admin/notifications.ts`, archivo de seed de eventos/plantillas, `packages/domain/drizzle/*` [Nueva migración].
  - **Detalle:** Agregar campos de control a `email_events`, nuevas tablas `tenant_notification_preferences` y `tenant_in_app_notifications`, e inicializar plantillas `es`/`en` para stock mínimo, `D-5`/`D-0`, Bre-B e invitaciones.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar `NotificationDispatcherService` con sanitización anti-XSS y preferencias**
  - **Archivos:** `packages/domain/src/services/notifications-and-leads.service.ts` (o `notification-dispatcher.service.ts` [Nuevo]), pruebas unitarias correspondientes.
  - **Detalle:** Implementar chequeo `is_active` administrativo, resolución de destinatario y preferencias, escape HTML estricto en variables, escritura in-app y envío outbox SMTP en `after()`.
  - **Verificación:** `pnpm --filter @mocter/domain test notifications`.

- [ ] **T-03 · Ampliar `/admin/settings/notifications` para activar/desactivar eventos y gestionar nuevas plantillas**
  - **Archivos:** `apps/admin/app/api/admin/notifications/route.ts`, `apps/admin/app/admin/settings/notifications/notifications-view.tsx`, `page.test.tsx`.
  - **Detalle:** Añadir interruptor por evento (`toggle_event`), mostrar chips de variables disponibles al editar plantillas (incluyendo `tenant.inventory.low_stock`), modal `--dsn-*` y labels Title Case.
  - **Verificación:** `apps/admin/app/admin/settings/notifications/page.test.tsx`.

- [ ] **T-04 · Crear APIs y vista `/workspace/notifications` + badge en `TenantWorkspaceShell`**
  - **Archivos:** `apps/admin/app/api/tenant/notifications/*` [Nuevos], `apps/admin/app/workspace/notifications/page.tsx` [Nuevo], `notifications-view.tsx` [Nuevo], `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Inbox paginado, «Marcar Todo Como Leído», preferencias por evento y correo personalizado (`tenancy_owner`), badge contador en header Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/admin/settings/notifications` y `/workspace/notifications`.

