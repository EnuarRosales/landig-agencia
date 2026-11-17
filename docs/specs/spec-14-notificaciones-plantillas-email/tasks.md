# SPEC-14 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender `notifications.ts` (`tenantConfigurable`, preferencias e inbox) + migración y semillas**
- [x] **T-02 · Implementar `NotificationDispatcherService` con sanitización anti-XSS, preferencias e integración SPEC-04/08/12**
- [x] **T-03 · Ampliar `/admin/settings/notifications` y `/api/admin/notifications` para activar/desactivar eventos y editar plantillas**
- [x] **T-04 · Crear APIs y vista `/workspace/notifications` + campana/badge en `TenantWorkspaceShell`**
- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18` (Ronda 1)**

### Ronda 2 — Alcance estricto del comercio, Editor Enriquecido, Layout Global y «Mejorar con AI» SaaS

- [x] **T-06 · Esquema `admin.email_layout_configs`, ajuste de alcance (4 eventos) y corrección terminológica («miembro»)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/notifications.ts`, `packages/domain/drizzle/0042_*`, `packages/domain/src/services/notifications-and-leads.service.ts`, `packages/domain/src/services/notification-dispatcher.service.ts`, `packages/domain/src/services/admin-dashboard.service.ts`, `packages/domain/src/services/notification-dispatcher.service.test.ts`.
  - **Detalle:** Crear tabla `email_layout_configs` (`es`/`en`), migrar, restringir `TENANT_COMPETENCE_EVENT_KEYS` a las 4 claves del comercio, reemplazar «inquilino» por «miembro»/`comercio`, agregar `saveAdminEmailLayoutConfig` y envolver automáticamente `header + body + footer` en `sendSystemNotificationEmail`.
  - **Verificación:** `drizzle-kit check` y `pnpm --filter @mocter/domain test notification`.

- [x] **T-07 · Habilitar «Mejorar con AI» a nivel plataforma SaaS (`POST /api/ai/enhance` + `ai-assist`)**
  - **Archivos:** `packages/domain/src/services/ai-credential-resolver.service.ts`, `packages/domain/src/services/ai-assist.service.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, `apps/admin/app/api/ai/enhance/route.ts`, pruebas correspondientes.
  - **Detalle:** Soportar `isPlatformScope` / `scope === "platform"` usando `ai_platform_keys` y registrar `email.template_body`, `email.layout_header` y `email.layout_footer` preservando variables `{{...}}`.
  - **Verificación:** `pnpm --filter @mocter/domain test ai-` y `pnpm --filter @mocter/admin test enhance`.

- [x] **T-08 · Crear `EmailRichTextEditor`, pestaña «Encabezado y Pie Global» y corregir Title Case gramatical**
  - **Archivos:** `apps/admin/components/email-rich-text-editor.tsx` [Nuevo], `apps/admin/app/api/admin/notifications/route.ts`, `apps/admin/app/api/admin/notifications/route.test.ts`, `apps/admin/app/admin/settings/notifications/notifications-view.tsx`, `apps/admin/app/admin/settings/notifications/page.test.tsx`, `apps/admin/app/workspace/notifications/notifications-view.tsx`, `apps/admin/app/workspace/notifications/notifications-view.test.tsx`, `apps/admin/lib/i18n.ts`.
  - **Detalle:** Editor WYSIWYG propio con toolbar, inserción de variables en cursor, vista código HTML y botón «Mejorar con AI»; pestaña global para `body.header` y `body.footer`; vista previa completa en modal; Title Case gramatical estricto (`AGENTS.md §4.8`).
  - **Verificación:** `pnpm --filter @mocter/admin test` y `eslint` focalizado.

- [x] **T-09 · Verificación integral, migración PostgreSQL y protocolo `AGENTS.md §4.18` (Ronda 2)**
  - **Comandos:** `db:migrate`, `tsc --noEmit`, `eslint` sobre archivos modificados, `vitest`, reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP 200 en vivo.

### Ronda 3 — Homogeneización por secciones, i18n sin duplicación visual y semillas EN completas (`/grill-me`)

- [x] **T-10 · Completar semillas `EN` (18/18 eventos) y crear `saveAdminEmailBilingualTemplates` en `@mocter/domain`**
  - **Archivos:** `packages/domain/src/services/admin-dashboard.service.ts`, `packages/domain/src/services/notification-dispatcher.service.test.ts` (o prueba dedicada en `@mocter/domain`).
  - **Detalle:** Completar `CANONICAL_TEMPLATES_SEED` con las 8 plantillas `EN` faltantes (`billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`, `referral.registered`, `community.role_promoted`, `community.join_accepted`, `community.digest`, `landing.lead_received`); implementar `saveAdminEmailBilingualTemplates()` en transacción validando variables por idioma, sincronizando `senderId`/`status` y tolerando que uno de los dos idiomas quede completamente vacío.
  - **Verificación:** `pnpm --filter @mocter/domain test notification`.

- [x] **T-11 · Extender `POST /api/admin/notifications` con `save_bilingual_template`**
  - **Archivos:** `apps/admin/app/api/admin/notifications/route.ts`, `apps/admin/app/api/admin/notifications/route.test.ts`.
  - **Detalle:** Agregar acción `save_bilingual_template` al esquema discriminado manteniendo restricción `auth.*` solo para `platform_owner` y compatibilidad de `save_template`.
  - **Verificación:** `pnpm --filter @mocter/admin test app/api/admin/notifications/route.test.ts`.

- [x] **T-12 · Unificar presentación homogénea por sección y modal bilingüe único en `/admin/settings/notifications`**
  - **Archivos:** `apps/admin/app/admin/settings/notifications/notifications-view.tsx`, `apps/admin/app/admin/settings/notifications/page.test.tsx`.
  - **Detalle:** Eliminar la tabla plana inferior que duplicaba filas `ES`/`EN`; mostrar de manera uniforme en las 4 secciones funcionales Remitente Vinculado, Asunto, chips `ES`/`EN` con versión/estado, switch Activa y botón «Editar Plantilla»; transformar el modal en una única vista bilingüe con cabecera compartida (`eventKey`, `senderId`, `status`) y pestañas `Español (ES)` | `Inglés (EN)` con estado independiente y vista previa completa por idioma.
  - **Verificación:** `pnpm --filter @mocter/admin test app/admin/settings/notifications/page.test.tsx` y `eslint` focalizado.

- [x] **T-13 · Verificación integral y protocolo `AGENTS.md §4.18` (Ronda 3)**
  - **Comandos:** `tsc --noEmit` (`@mocter/domain`, `@mocter/admin`, `@mocter/web`), `eslint` focalizado, suites `vitest`, reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP en vivo y comprobación en PostgreSQL de los 18 eventos `ES`/`EN`.
