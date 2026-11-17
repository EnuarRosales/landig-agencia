# SPEC-14 · Centro de Notificaciones del Comercio y Plantillas Administrativas de Email (Stock Mínimo, Vencimientos y Bre-B)

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-14` |
| **Nombre** | Centro de Notificaciones del Comercio, Preferencias Operativas y Plantillas Administrativas de Email |
| **Tipo de intervención** | Nuevo módulo en Backoffice Comercio + Extensión del gestor de plantillas SaaS (`/admin/settings/notifications`) + Despachador PostgreSQL unificado + Identidad global de correos y asistencia AI |
| **Prioridad** | P1 — Alta (habilita alertas de stock mínimo `PRD-08`, renovaciones `PLN-03`, Bre-B `ONB-12` y equipo `EQU-02`) |
| **Versión** | 1.3.0 |
| **Estado** | Actualizada tras `/grill-me` Ronda 3 — Lista para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-06` (y componente de plantillas administrativas, editor enriquecido, layout institucional global, asistencia AI y activación de notificaciones solicitado en `PRD-08` + soporte email de `PLN-03` y `ONB-12`) |
| **Specs previas relacionadas** | `NTF-001`, `ADM-001`, `BILL-001`, `AI-001`, `SPEC-01`, `SPEC-02` |
| **Specs consumidoras de eventos email** | `SPEC-04` (`billing.trial_d5_reminder`, `billing.trial_d0_expired`, `billing.bre_b_report_pending_admin`, `billing.bre_b_approved`, `billing.bre_b_rejected`), `SPEC-08` (`tenant.inventory.low_stock` para `PRD-08`), `SPEC-12` (`team.member_invited`), `SPEC-15` (comunidades) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

1. **Inexistencia de sección de Notificaciones en el Backoffice del Comercio (`GEN-06`):**
   - El comercio requiere una vista propia en `/workspace/notifications` para consultar el historial de notificaciones operativas recibidas, marcarlas como leídas y configurar únicamente las preferencias que son competencia directa del comercio (`community.digest`, `community.join_accepted`, `referral.registered` y `tenant.inventory.low_stock`), sin exponer configuración interna o competencia exclusiva de la SaaS ni términos de infraestructura como «inquilino».
2. **Desconexión entre catálogo PostgreSQL (`/admin/settings/notifications`), layout institucional y edición asistida:**
   - Las plantillas actuales carecen de una configuración global estandarizada de **encabezado (`body.header`) y pie de página (`body.footer`)** heredada automáticamente por todas las notificaciones del sistema, obligando a duplicar HTML institucional en cada plantilla.
   - El editor del cuerpo de correo en `/admin/settings/notifications` es un `<textarea>` plano sin **editor de texto enriquecido (WYSIWYG)** ni botón **«Mejorar con AI»** conectado al servicio de inferencia habilitado a nivel SaaS (`ai_platform_keys`).

---

## 4. Objetivo y valor de negocio

Centralizar en **un sistema cohesivo de doble cara respaldado por PostgreSQL** todas las comunicaciones y alertas:
1. **En el Backoffice de la SaaS (`/admin/settings/notifications`):**
   - Configurar una única vez el **Encabezado (`body.header`) y Pie de Página (`body.footer`)** institucional bilingüe (`es`/`en`), heredado automáticamente por todas las plantillas al renderizar/enviar.
   - Editar únicamente el cuerpo específico de cada notificación mediante un **Editor de Texto Enriquecido (WYSIWYG)** propio (con alternancia a HTML y chips de variables en cursor) e integración **«Mejorar con AI»** usando la inferencia de plataforma SaaS.
   - Activar/desactivar (`is_enabled`) eventos con protección de roles `platform_*` y salvaguardas para eventos de sistema/obligatorios.
2. **En el Backoffice del Comercio (`/workspace/notifications`):**
   - Dar al comercio una bandeja in-app clara con campana e indicador de no leídas (`99+`) en `TenantWorkspaceShell` y gestión de **Preferencias de Alertas** limitada estrictamente a los 4 eventos de competencia del comercio (`community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`) con terminología limpia («miembro» en lugar de «inquilino») y cumplimiento estricto de Title Case (`AGENTS.md §4.8`).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión de esquema y semillas en PostgreSQL (`packages/domain/src/db/schemas/admin/notifications.ts`, `admin-dashboard.service.ts`, `notifications-and-leads.service.ts`, `ai-assist-catalog.seed.ts`):
  - Columna `tenant_configurable` (`BOOLEAN NOT NULL DEFAULT true`) en `admin.email_events` (reutilizando `is_enabled`, `is_system` y `variables_schema`), ajustada para que **únicamente** los 4 eventos de competencia del comercio (`community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`) sean configurables/visibles en `/workspace/notifications`, y sustituyendo «inquilino» por «miembro» en `community.join_accepted` y textos visibles del comercio.
  - Nueva tabla `admin.email_layout_configs` (`locale`: `'es' | 'en'`, `header_html`, `footer_html`, `is_enabled`, columnas de auditoría) con semillas institucionales iniciales en `es` y `en`.
  - Nuevas tablas `admin.tenant_notification_preferences` y `admin.tenant_in_app_notifications`.
  - Registro en `ai_assist_fields` / `ai_assist_prompts` de `email.template_body`, `email.layout_header` y `email.layout_footer` preservando variables `{{...}}`.
- Soporte de inferencia SaaS (`scope === "platform"`, roles `platform_owner` y `platform_admin`) en `POST /api/ai/enhance` y `AiCredentialResolverService` consumiendo las llaves activas de plataforma (`ai_platform_keys`).
- `NotificationDispatcherService` respaldado por PostgreSQL y conectado en runtime a `SPEC-04` (`BillingService` incluyendo `billing.bre_b_report_pending_admin` y `BillingRemindersService`), `SPEC-08` (`TenantProductsAndMediaService`) y `SPEC-12` (`TenantContactsAndUsersService`).
- Composición automática `header_html + rendered_body_html + footer_html` en `sendSystemNotificationEmail` y en la vista previa administrativa.
- Actualización de `/api/admin/notifications` y `/admin/settings/notifications`:
  - Vista unificada en **«Plantillas y Eventos»**: eliminación de la tabla plana inferior que duplicaba filas por `ES`/`EN`; las 4 secciones funcionales (*Inventario y Productos*, *Facturación y Bre-B*, *Equipo, Comercios y Comunidad*, *Autenticación y Plataforma*) presentan de manera uniforme una única fila por evento con **Remitente Vinculado**, **Asunto del Correo**, **chips bilingües `ES`/`EN` con versión y estado**, switch «Notificación Activa» y un único botón **«Editar Plantilla»**.
  - Modal bilingüe único en una sola vista (`save_bilingual_template`): cabecera compartida para evento, remitente vinculado y estado de publicación + pestañas `Español (ES)` | `Inglés (EN)` con estado independiente para editar asunto, cuerpo y vista previa sin perder cambios ni duplicar registros; guardado tolerante cuando un idioma completo queda vacío (siempre que al menos un idioma esté completo).
  - Completitud inicial bilingüe (`CANONICAL_TEMPLATES_SEED`): agregado de plantillas oficiales `EN` para los 8 eventos restantes (`billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`, `referral.registered`, `community.role_promoted`, `community.join_accepted`, `community.digest`, `landing.lead_received`), completando cobertura `ES`/`EN` en los 18 eventos.
  - Pestaña **«Encabezado y Pie Global»** para editar `body.header` y `body.footer` en `es`/`en` con `EmailRichTextEditor` + **«Mejorar con AI»**.
  - `EmailRichTextEditor` propio (sin dependencias externas, barra WYSIWYG, inserción de variables en cursor, modo HTML crudo y «Mejorar con AI» con revisión Aceptar/Descartar) tanto en plantillas individuales como en el layout global.
  - Switch «Notificación Activa» (`toggle_event`) con bloqueo `is_system` y `ConfirmationModal` (`--dsn-*`).
- Endpoints y UI del comercio (`/api/tenant/notifications*`, `/workspace/notifications`, `TenantWorkspaceShell`), con **Title Case gramatical estricto** (preposiciones/artículos/conjunciones en minúscula salvo inicio de frase).

### Fuera de alcance
- Notificaciones push móviles nativas (FCM/APNs) o SMS pagos por terceros en esta fase.
- Exposición de configuraciones de competencia exclusiva SaaS (`billing.*`, `team.*`, `tenant.welcome`, `community.role_promoted`, `auth.*`, `landing.*`) en las preferencias del comercio.

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `platform_owner` / `platform_admin` | Activar/desactivar eventos (`is_enabled`, excepto `is_system = true`), editar plantillas HTML enriquecidas, usar «Mejorar con AI» SaaS y configurar `body.header` / `body.footer` global en `/admin/settings/notifications` | Sí | Validación de rol en `/api/admin/notifications` y `/api/ai/enhance`; `ConfirmationModal` para desactivar obligatorios; solo `platform_owner` edita plantillas `auth.*` (`isSystem`) |
| `tenant_owner` | Leer bandeja in-app («Centro de Mensajes»), marcar leídas y configurar preferencias (`community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`) en `/workspace/notifications` | Sí | Solo de su `client_id`; cualquier evento ajeno a las 4 claves de comercio es rechazado en `PUT /api/tenant/notifications/preferences` |
| `tenant_agent` | Leer bandeja in-app («Centro de Mensajes») y marcar notificaciones como leídas | Sí | No ve ni puede mutar «Preferencias de Alertas» (`403 Forbidden` en `PUT /api/tenant/notifications/preferences`) |

---

## 7. Modelo de datos

### 7.1 Extensión de `admin.email_events` (`packages/domain/src/db/schemas/admin/notifications.ts`)
- Columnas existentes: `is_enabled`, `is_system`, `variables_schema`.
- Columna agregada: `tenant_configurable` (`BOOLEAN NOT NULL DEFAULT true`). Solo `true` para `community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`.

### 7.2 Nueva tabla de identidad global `admin.email_layout_configs` (`notifications.ts`)
- `id`: `UUID` PK (`default uuidv7()`).
- `locale`: `TEXT` `NOT NULL`, `UNIQUE`, `CHECK (locale IN ('es', 'en'))`.
- `header_html`: `TEXT` `NOT NULL`.
- `footer_html`: `TEXT` `NOT NULL`.
- `is_enabled`: `BOOLEAN` `NOT NULL`, default `true`.
- `...auditColumns()`.

### 7.3 Nuevas tablas en plano de control `admin` (`notifications.ts`)
- **`admin.tenant_notification_preferences`:** `(id, client_id, event_key, email_enabled, in_app_enabled, custom_recipient_email, ...auditColumns())`, `UNIQUE (client_id, event_key)`.
- **`admin.tenant_in_app_notifications`:** `(id, client_id, event_key, title, body, severity, action_url, read_at, created_at)`, índice `(client_id, read_at, created_at)`.

---

## 8. Reglas de negocio

- **RN-SPEC-14-01 (Control administrativo maestro sobre eventos y plantillas):** Si un evento en `admin.email_events` tiene `is_enabled = false`, el motor central omite el envío SMTP y la creación de notificaciones dejando traza `notifications.skipped_disabled` en Pino sin afectar la transacción origen. Los eventos `is_system = true` (`auth.*`) no pueden desactivarse.
- **RN-SPEC-14-02 (Plantilla obligatoria de Stock Mínimo `PRD-08`):** `tenant.inventory.low_stock` incluye plantillas bilingües (`es`/`en`), variables soportadas (`{{business_name}}`, `{{product_name}}`, `{{sku}}`, `{{current_stock}}`, `{{min_threshold}}`, `{{product_admin_url}}`) y edición enriquecida/asistida desde `/admin/settings/notifications`.
- **RN-SPEC-14-03 (Alcance estricto del comercio y terminología limpia):**
  - En `/workspace/notifications` (pestaña «Preferencias de Alertas»), **únicamente** se listan y son editables por `tenant_owner` los 4 eventos de competencia del comercio:
    1. `tenant.inventory.low_stock`
    2. `community.join_accepted` *(descripción redactada con «miembro», nunca «inquilino»)*
    3. `community.digest`
    4. `referral.registered`
  - Todos los demás eventos (`billing.*`, `team.*`, `tenant.welcome`, `community.role_promoted`, `auth.*`, `landing.*`) son competencia exclusiva de la SaaS y no se muestran en «Preferencias de Alertas» ni se aceptan en `PUT /api/tenant/notifications/preferences`.
  - El «Centro de Mensajes» continúa mostrando las alertas in-app recibidas por el comercio (`SPEC-04`, `SPEC-08`, `SPEC-12`).
- **RN-SPEC-14-04 (Renderizado seguro anti-XSS e identidad global `body.header` + `body.footer`):**
  - Todas las variables interpoladas en `body_html` se escapan contra HTML/script injection (`escapeHtmlVariable`) antes de renderizar.
  - Si `admin.email_layout_configs` para el idioma efectivo (`es`/`en`, fallback `es`) tiene `is_enabled = true`, `sendSystemNotificationEmail` y la Vista Previa componen automáticamente `header_html + rendered_body_html + footer_html` (interpolando de forma segura `{{brand_name}}` y `{{year}}` en encabezado/pie) dentro de un contenedor HTML institucional unificado.
- **RN-SPEC-14-05 (Despacho no bloqueante `after()`):** Toda emisión de notificación invocada desde rutas API de negocio ejecuta despacho en `after()` sin bloquear ni revertir la transacción principal.
- **RN-SPEC-14-06 (Aviso administrativo de comprobantes Bre-B):** `BillingService.submitManualBreBReport` despacha `billing.bre_b_report_pending_admin` hacia usuarios activos `platform_owner` / `platform_admin` (fallback a remitente `billing`/`soporte`).
- **RN-SPEC-14-07 (Asistencia AI SaaS y editor enriquecido en plantillas):**
  - `POST /api/ai/enhance` y `AiCredentialResolverService` admiten `scope === "platform"` (`platform_owner` / `platform_admin`) resolviendo credenciales activas de plataforma (`ai_platform_keys`) sin requerir BYOK ni trial.
  - `EmailRichTextEditor` permite edición WYSIWYG o código HTML, inserción de `{{variables}}` en cursor y «Mejorar con AI» (propuesta editable con aceptación explícita del administrador, preservando las variables del evento).

---

## 9. Contratos de interfaz

### 9.1 `GET / POST /api/admin/notifications`
- Autenticación/Autorización: `platform_owner` o `platform_admin` (HTTP 401/403 RFC 9457).
- `GET` retorna además `layoutConfigs: Array<{ id, locale, headerHtml, footerHtml, isEnabled }>`.
- `POST` soporta:
  - `save_provider`
  - `save_sender`
  - `save_template` (guardado simple compatible hacia atrás por idioma)
  - `save_bilingual_template` (guardado unificado de `es` y/o `en` bajo un mismo `eventKey`, `senderId` y `status` compartido; valida pares incompletos y exige al menos un idioma diligenciado)
  - `toggle_event` (`{ action: "toggle_event", eventKey, isEnabled }`)
  - `save_layout` (`{ action: "save_layout", locale: "es" | "en", headerHtml, footerHtml, isEnabled }`)

### 9.2 `POST /api/ai/enhance` (Extensión plataforma)
- Admite sesiones `tenant`, `onboarding_prospect` y `platform` (`platform_owner` / `platform_admin`).
- Soporta campos `email.template_body`, `email.layout_header`, `email.layout_footer`.

### 9.3 `GET /api/tenant/notifications`, `PUT /api/tenant/notifications/preferences`, `PATCH /api/tenant/notifications/[id]/read`, `POST /api/tenant/notifications/read-all`
- `GET` devuelve únicamente las 4 preferencias de competencia del comercio cuando `canManagePreferences = true`.
- `PUT` valida que cada `eventKey` esté dentro del conjunto permitido del comercio (`400 INVALID_NOTIFICATION_EVENT` para eventos de plataforma/SaaS).

---

## 10. Especificación de UI/UX

- **Title Case estricto (`AGENTS.md §4.8`):** Todo título, pestaña y etiqueta de formulario escribe en minúscula artículos, preposiciones y conjunciones cortas salvo al inicio de frase (*«Preferencias de Alertas»*, *«Centro de Mensajes»*, *«Centro de Notificaciones»*, *«Plantillas y Eventos»*, *«Encabezado y Pie Global»*, *«Marcar Todo como Leído»*, *«Ir al Recurso»*, *«Mejorar con AI»*).
- **Backoffice SaaS (`/admin/settings/notifications`):**
  - Pestañas: `Servidores SMTP`, `Direcciones Remitentes`, `Plantillas y Eventos`, `Encabezado y Pie Global`.
  - En `Plantillas y Eventos`: las 4 secciones funcionales muestran de forma homogénea por evento: clave, badge, descripción, **Remitente Vinculado**, **Asunto del Correo**, **chips bilingües de idioma, versión y estado (`ES` y `EN`)**, switch «Notificación Activa» y botón **«Editar Plantilla»** (sin tabla plana duplicada por idioma). El Modal único comparte evento, remitente y estado arriba, y ofrece pestañas `Español (ES)` / `Inglés (EN)` con `EmailRichTextEditor`, variables en cursor, «Mejorar con AI» y «Vista Previa Completa» heredando `body.header` + `body` + `body.footer`.
  - En `Encabezado y Pie Global`: selector `es`/`en`, switch de habilitación, `EmailRichTextEditor` para `Encabezado del Correo (body.header)` y `Pie de Página del Correo (body.footer)` con botón «Mejorar con AI» y vista previa institucional en vivo.
- **Backoffice Comercio (`/workspace/notifications` + `TenantWorkspaceShell`):**
  - Campana con contador (`99+`) en cabecera móvil y cabecera del sidebar escritorio + ítem «Notificaciones».
  - Pestaña «Centro de Mensajes» + pestaña «Preferencias de Alertas» (solo `tenant_owner`, con exactamente los 4 eventos del comercio).

---

## 11. Criterios de aceptación (Gherkin)

```gherkin
Característica: Notificaciones del comercio, layout global y edición enriquecida con AI

  Escenario: Comercio ve únicamente sus 4 preferencias de competencia y sin término "inquilino"
    Dado que el propietario de "Comercial Andes" abre "/workspace/notifications" en "Preferencias de Alertas"
    Entonces visualiza únicamente "tenant.inventory.low_stock", "community.join_accepted", "community.digest" y "referral.registered"
    Y no visualiza eventos de facturación, equipo ni plataforma
    Y la descripción de "community.join_accepted" utiliza el término "miembro" sin exponer "inquilino"

  Escenario: Administrador SaaS configura encabezado y pie global y edita plantilla con editor enriquecido y AI
    Dado que un "platform_admin" accede a "/admin/settings/notifications"
    Cuando configura "headerHtml" y "footerHtml" en "Encabezado y Pie Global" y guarda
    Y edita la plantilla "tenant.inventory.low_stock" usando el editor enriquecido y "Mejorar con AI"
    Entonces el borrador sugerido por AI conserva las variables "{{product_name}}" y solo aplica cuando el admin hace clic en "Aceptar Sugerencia"
    Y al previsualizar o enviar el correo, el sistema envuelve el cuerpo con el encabezado y pie institucional global
```

---

## 12. Requisitos no funcionales y 13. Dependencias

- Confiabilidad SMTP (`email_deliveries` + `after()`), observabilidad Pino (`notifications.*`), sanitización HTML estricta (`sanitizeEmailHtml` + `escapeHtmlVariable`).
- Sin nuevas dependencias npm externas en `apps/admin` para el editor enriquecido.

---

## 14. Definition of Done

- [x] Tabla `admin.email_layout_configs` migrada y poblada con encabezado/pie inicial `es`/`en`; `sendSystemNotificationEmail` y vista previa componen `header + body + footer`.
- [x] `/workspace/notifications` muestra únicamente los 4 eventos de competencia del comercio (`community.digest`, `community.join_accepted`, `referral.registered`, `tenant.inventory.low_stock`), sin la palabra «inquilino» y con Title Case gramatical estricto.
- [x] `EmailRichTextEditor` con barra WYSIWYG, modo HTML, inserción de variables en cursor y «Mejorar con AI» (`scope === "platform"`, `ai_platform_keys`, `email.template_body`, `email.layout_header`, `email.layout_footer`).
- [x] Pruebas unitarias/integración + `tsc --noEmit` + `eslint` + `drizzle-kit check` + protocolo §4.18 ejecutados en verde (Ronda 2).
- [x] Las 4 secciones de `/admin/settings/notifications` muestran información uniforme sin tabla inferior duplicada (Remitente, Asunto, chips `ES`/`EN` con versión/estado, switch y botón único de edición).
- [x] Modal bilingüe único (`Español (ES)` | `Inglés (EN)`) guardando vía `save_bilingual_template` sobre `admin.email_templates(event_key, locale, version)` con sincronización de remitente y tolerancia a idioma vacío completo.
- [x] Semillas `EN` completadas para los 18 eventos en `CANONICAL_TEMPLATES_SEED`, además de pruebas, typecheck, eslint focalizado y protocolo `§4.18` en verde (Ronda 3).

---

## 15. Decisiones consolidadas (2026-11-17 — Ronda 2)

1. **Alcance estricto del comercio y terminología:** En `/workspace/notifications` («Preferencias de Alertas») se muestran únicamente `community.digest`, `community.join_accepted`, `referral.registered` y `tenant.inventory.low_stock` (`tenant_configurable = true`); se corrige «inquilino» → «miembro» y se corrige Title Case gramatical en todos los títulos, pestañas y labels.
2. **Layout institucional global:** Nueva tabla `admin.email_layout_configs` (`es`/`en`, `header_html`, `footer_html`, `is_enabled`) gestionada en pestaña «Encabezado y Pie Global» de `/admin/settings/notifications` y heredada automáticamente al enviar y previsualizar cualquier plantilla.
3. **Editor enriquecido propio:** Componente `EmailRichTextEditor` sin dependencias externas (WYSIWYG + modo HTML + inserción de `{{variables}}` en cursor), reutilizado en cuerpo de plantilla, `body.header` y `body.footer`.
4. **«Mejorar con AI» con inferencia SaaS:** `POST /api/ai/enhance` y `AiCredentialResolverService` habilitan `scope === "platform"` (`platform_owner`/`platform_admin`) consumiendo `ai_platform_keys` y registrando los campos `email.template_body`, `email.layout_header` y `email.layout_footer` en `ai-assist-catalog.seed.ts`.

---

## 16. Decisiones consolidadas (2026-11-17 — Ronda 3 · `/grill-me`)

1. **Presentación homogénea en todas las secciones sin duplicar filas por idioma:** Se elimina la tabla plana inferior («Funcionalidad / Evento») y se unifica todo dentro de las 4 secciones funcionales (*Inventario y Productos*, *Facturación y Bre-B*, *Equipo, Comercios y Comunidad*, *Autenticación y Plataforma*). Cada evento ocupa una sola fila con Remitente Vinculado, Asunto del Correo, chips bilingües `ES`/`EN` con versión y estado, switch «Notificación Activa» y un único botón «Editar Plantilla».
2. **Estrategia i18n sobre esquema actual + edición bilingüe única:** Se conserva `admin.email_templates(event_key, locale, version)` en PostgreSQL para mantener integridad referencial con `admin.email_deliveries.template_id` y el historial por idioma, pero la configuración y edición ocurre en un único modal bilingüe (Evento, Remitente Vinculado y Estado compartidos arriba; pestañas `Español (ES)` / `Inglés (EN)` abajo) persistido mediante `save_bilingual_template` sincronizando el remitente entre idiomas.
3. **Cobertura completa `EN` para los 18 eventos:** Se agregan las 8 plantillas oficiales faltantes en inglés (`billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`, `referral.registered`, `community.role_promoted`, `community.join_accepted`, `community.digest`, `landing.lead_received`) para que todos los eventos nazcan bilingües, tolerando además guardado parcial cuando un idioma completo queda sin diligenciar.
