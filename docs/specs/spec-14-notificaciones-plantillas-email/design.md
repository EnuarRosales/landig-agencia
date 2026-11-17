# SPEC-14 · Diseño Técnico: Notificaciones del Comercio y Plantillas Administrativas

## 1. Arquitectura de Despacho Unificado y Layout Global

```mermaid
flowchart LR
    Triggers["Disparadores:<br/>Stock Mínimo (SPEC-08)<br/>Bre-B & D-5/D-0 (SPEC-04)<br/>Invitación Equipo (SPEC-12)"] -->|after()| Dispatcher["NotificationDispatcherService (PostgreSQL)"]
    Dispatcher --> EventsDB[("admin.email_events<br/>is_enabled, is_system, tenant_configurable")]
    EventsDB -->|is_enabled = false| LogSkip["Log Pino notifications.skipped_disabled"]
    EventsDB -->|is_enabled = true| Prefs[("admin.tenant_notification_preferences")]
    Prefs -->|In-App Enabled| Inbox[("admin.tenant_in_app_notifications")]
    Prefs -->|Email Enabled o SaaS| Sanitizer["Escape HTML + Render Cuerpo"]
    Sanitizer --> LayoutDB[("admin.email_layout_configs<br/>header_html + body + footer_html")]
    LayoutDB --> SMTP["sendSystemNotificationEmail + admin.email_deliveries"]
    Inbox --> WorkspaceUI["/workspace/notifications + Badge & Campana Shell"]
```

---

## 2. Esquema y Semillas (`packages/domain`)

1. **`packages/domain/src/db/schemas/admin/notifications.ts`:**
   - Nueva tabla `emailLayoutConfigs` (`admin.email_layout_configs`) con `locale` único (`'es' | 'en'`), `headerHtml`, `footerHtml`, `isEnabled`, `auditColumns()`.
   - Migración `0042_spec14_email_layout_and_scope.sql` + `COMMENT ON TABLE / COLUMN` y actualización idempotente de `tenant_configurable` para limitar las 4 claves del comercio.
2. **Semillas (`notifications-and-leads.service.ts`, `admin-dashboard.service.ts`, `ai-assist-catalog.seed.ts`):**
   - Actualizar `CANONICAL_EMAIL_EVENTS`: `tenantConfigurable = true` exclusivamente para `community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`; corregir descripciones cambiando «inquilino» por «miembro» / «comercio».
   - Inicializar `CANONICAL_EMAIL_LAYOUTS_SEED` (`es`/`en`) en `fetchAdminEmailSettings()` (`ON CONFLICT DO NOTHING`) y componer `headerHtml + bodyHtml + footerHtml` en `sendSystemNotificationEmail()`.
   - Agregar `email.template_body`, `email.layout_header` y `email.layout_footer` en `INITIAL_AI_ASSIST_FIELDS` e `INITIAL_AI_ASSIST_PROMPTS`.

---

## 3. Servicios y Endpoints (`packages/domain` & `apps/admin`)

- **`AiCredentialResolverService` + `POST /api/ai/enhance`:**
  - `ResolveAiCredentialInput` y `EnhanceTextInput` agregan `isPlatformScope?: boolean`.
  - Cuando `isPlatformScope === true`, `resolveCredentialCandidates` resuelve directamente `findActivePlatformTrialKeys()` sin exigir `clientId` ni `onboarding` o `trialing`.
  - `POST /api/ai/enhance` acepta `scope === "platform"` cuando `role` es `platform_owner` o `platform_admin`.
  - Si `AiAssistService.enhanceText()` recibe un `fieldKey` semilla aún no insertado en BD, invoca `seedAiAssistCatalog()` de forma idempotente antes de rechazar.
- **`NotificationDispatcherService`:**
  - `TENANT_COMPETENCE_EVENT_KEYS = new Set(["community.digest", "community.join_accepted", "referral.registered", "tenant.inventory.low_stock"])`.
  - `isTenantVisibleNotificationEvent(key)` retorna `true` solo para esas 4 claves, filtrando tanto `listTenantInboxAndPreferences` como `updateTenantPreferences`.
- **Admin UI & API (`/admin/settings/notifications`):**
  - `apps/admin/app/api/admin/notifications/route.ts`: agregar `save_layout` (`saveAdminEmailLayoutConfig`) y `save_bilingual_template` (`saveAdminEmailBilingualTemplates` en `@mocter/domain`, transaccional sobre `admin.email_templates` sincronizando `senderId` y `status` entre `es`/`en` y validando variables `variables_schema` por idioma).
  - `packages/domain/src/services/admin-dashboard.service.ts`: completar `CANONICAL_TEMPLATES_SEED` con las 8 plantillas oficiales `EN` faltantes; exponer `saveAdminEmailBilingualTemplates()` con guardado tolerante si un idioma completo queda vacío (y error si un idioma tiene solo asunto o solo cuerpo, o si ambos están vacíos).
  - `apps/admin/components/email-rich-text-editor.tsx` [Nuevo]: Editor WYSIWYG React sin dependencias externas (`contentEditable` + toolbar de formato + inserción de `{{variables}}` en cursor + alternador HTML crudo + integración «Mejorar con AI» con revisión humana Aceptar/Descartar).
  - `apps/admin/app/admin/settings/notifications/notifications-view.tsx`:
    - Nueva pestaña **«Encabezado y Pie Global»** para editar `body.header` y `body.footer` en `es`/`en` usando `EmailRichTextEditor` + vista previa institucional.
    - En **«Plantillas y Eventos»**, unificar la vista dentro de las 4 tarjetas agrupadas (eliminando la tabla plana inferior duplicada): cada evento muestra una fila homogénea con Remitente Vinculado, Asunto del Correo, chips `ES`/`EN` (`vN · Publicada/Borrador` o `Pendiente`), switch «Notificación Activa» y botón único «Editar Plantilla».
    - Modal único bilingüe: atributos compartidos arriba (`eventKey`, `senderId`, `status`) + pestañas `Español (ES)` / `Inglés (EN)` con estado independiente (`subject`, `bodyHtml`, `id`, `version`), `EmailRichTextEditor` (`key={eventKey-modalLocale}`), inserción de variables en cursor y «Vista Previa Completa» por idioma heredando `body.header` + `body` + `body.footer`.
- **Comercio UI (`/workspace/notifications` y `apps/admin/lib/i18n.ts`):**
  - Title Case gramatical estricto (`AGENTS.md §4.8`) en todos los títulos, pestañas, botones y etiquetas.
