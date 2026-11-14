# SPEC-14 · Diseño Técnico: Notificaciones del Inquilino y Plantillas Administrativas

## 1. Arquitectura de Despacho Unificado

```mermaid
flowchart LR
    Triggers["Disparadores:<br/>Stock Mínimo (SPEC-08)<br/>Bre-B & D-5/D-0 (SPEC-04)<br/>Invitación Equipo (SPEC-12)"] -->|after()| Dispatcher["NotificationDispatcherService"]
    Dispatcher --> EventsDB[("admin.email_events<br/>is_active, tenant_configurable")]
    EventsDB -->|is_active = false| LogSkip["Log Pino + Omitir SMTP"]
    EventsDB -->|is_active = true| Prefs[("admin.tenant_notification_preferences")]
    Prefs -->|In-App Enabled| Inbox[("admin.tenant_in_app_notifications")]
    Prefs -->|Email Enabled| Sanitizer["Escape HTML + Render Plantilla (es/en)"]
    Sanitizer --> SMTP["Outbox / SMTP admin.email_deliveries"]
    Inbox --> WorkspaceUI["/workspace/notifications + Badge Header"]
```

---

## 2. Esquema y Semillas (`packages/domain`)

1. **`packages/domain/src/db/schemas/admin/notifications.ts`:**
   - En `emailEvents`: verificar/agregar `isActive` (`boolean`, default `true`), `tenantConfigurable` (`boolean`, default `true`), `allowedVariables` (`jsonb`).
   - Nuevas tablas `tenantNotificationPreferences` y `tenantInAppNotifications` con índices compuestos por `(clientId, eventKey)` y `(clientId, readAt, createdAt)` + comentarios `.comment(...)`.
2. **Semillas idempotentes en `notifications-and-leads.service.ts` o módulo de seed:**
   - Insertar los 7 eventos nuevos y sus plantillas profesionales iniciales en `es` y `en` sin sobreescribir plantillas ya editadas manualmente por el administrador SaaS (`ON CONFLICT DO NOTHING`).

---

## 3. Servicios y Endpoints (`packages/domain` & `apps/admin`)

- **`NotificationDispatcherService` [Nuevo / extensión de `notifications-and-leads.service.ts`]:**
  - Método único `dispatchTenantNotification({ clientId, eventKey, locale, variables, inAppPayload })`.
  - Verifica `isActive`, aplica preferencias del comercio, escapa variables HTML mediante helper puro `escapeHtml()` antes de interpolar `{{variable}}`, crea registro in-app y encola envío en `email_deliveries`.
- **Backoffice SaaS (`/admin/settings/notifications`):**
  - `apps/admin/app/api/admin/notifications/route.ts`: Añadir handler `action === 'toggle_event'`.
  - `apps/admin/app/admin/settings/notifications/notifications-view.tsx`: En pestaña «Plantillas Y Eventos», mostrar listado completo de eventos agrupados por categoría con toggle «Activa / Inactiva», variables disponibles copiables y modal de edición.
- **Backoffice Inquilino (`/workspace/notifications`):**
  - `apps/admin/app/api/tenant/notifications/route.ts` [Nuevo]
  - `apps/admin/app/api/tenant/notifications/preferences/route.ts` [Nuevo]
  - `apps/admin/app/api/tenant/notifications/[id]/read/route.ts` [Nuevo] & `read-all/route.ts` [Nuevo]
  - `apps/admin/app/workspace/notifications/page.tsx` [Nuevo] + `notifications-view.tsx` [Nuevo] + badge contador en `tenant-workspace-shell.tsx`.

