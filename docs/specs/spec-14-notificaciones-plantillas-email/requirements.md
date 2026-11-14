# SPEC-14 · Centro de Notificaciones del Comercio y Plantillas Administrativas de Email (Stock Mínimo, Vencimientos y Bre-B)

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-14` |
| **Nombre** | Centro de Notificaciones del Inquilino, Preferencias Operativas y Plantillas Administrativas de Email |
| **Tipo de intervención** | Nuevo módulo en Backoffice Inquilino + Extensión del gestor de plantillas SaaS (`/admin/settings/notifications`) |
| **Prioridad** | P1 — Alta (habilita alertas de stock mínimo `PRD-08`, renovaciones `PLN-03`, Bre-B `ONB-12` y equipo `EQU-02`) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-06` (y componente de plantillas administrativas y activación de notificaciones solicitado en `PRD-08` + soporte email de `PLN-03` y `ONB-12`) |
| **Specs previas relacionadas** | `NTF-001`, `ADM-001`, `BILL-001` |
| **Specs consumidoras de eventos email** | `SPEC-04` (`billing.renewal_reminder_d5`, `billing.renewal_reminder_d0`, `billing.bre_b_report_received`, `billing.bre_b_report_approved`, `billing.bre_b_report_rejected`), `SPEC-08` (`tenant.inventory.low_stock` para `PRD-08`), `SPEC-12` (`team.member_invited`), `SPEC-15` (invitaciones comunidad) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

1. **Inexistencia de sección de Notificaciones en el Backoffice del Inquilino (`GEN-06`):**
   - El comercio no dispone de una vista propia en `/workspace/notifications` para consultar el historial de notificaciones operativas recibidas (pedidos, alertas de inventario, avisos de facturación/trial, comunidad), marcarlas como leídas, ni configurar a qué correo(s) del negocio desea recibir las alertas o activar/desactivar alertas opcionales.
2. **Eventos y plantillas faltantes + control de activación por evento en `/admin/settings/notifications` (`PRD-08`, `PLN-03`, `SPEC-04`):**
   - Aunque existe `apps/admin/app/admin/settings/notifications/notifications-view.tsx` (pestañas `smtp`, `senders`, `templates`) y las tablas `admin.email_events`, `admin.email_templates`, `admin.email_deliveries`, actualmente el catálogo administrativo **no incorpora el evento y plantilla de «Stock Mínimo Alcanzado» (`PRD-08`)**, ni los avisos `D-5` / `D-0` de renovación (`PLN-03`), ni los correos del nuevo método **Bre-B** (`SPEC-04`), ni un control explícito por evento en la vista administrativa para **activar / desactivar (`is_active`)** cada notificación de manera uniforme.

---

## 4. Objetivo y valor de negocio

Centralizar en **un sistema cohesivo de doble cara** todas las comunicaciones y alertas:
1. **En el Backoffice de la SaaS (`/admin/settings/notifications`):** Registrar, activar/desactivar y editar las plantillas HTML/Texto (`es`/`en`) de todos los eventos del sistema —incluyendo obligatoriamente **Alerta De Stock Mínimo (`PRD-08`)**, **Recordatorios `D-5` / `D-0` (`PLN-03`)**, **Comprobantes Bre-B (`SPEC-04`)** e **Invitación De Equipo (`SPEC-12`)**—.
2. **En el Backoffice del Inquilino (`/workspace/notifications`):** Dar al comercio una bandeja in-app clara con indicador de no leídas en cabecera y gestión de **Preferencias De Notificación** (correo destinatario de alertas operativas y activación/desactivación por categoría permitida).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión de semillas y catálogo `admin.email_events` + `admin.email_templates` (`packages/domain/src/db/schemas/admin/notifications.ts`) con los nuevos eventos en `es` e `en`:
  - `tenant.inventory.low_stock` (categoría `tenant`)
  - `billing.renewal_reminder_d5` (categoría `billing`)
  - `billing.renewal_reminder_d0` (categoría `billing`)
  - `billing.bre_b_report_pending_admin` (categoría `billing` — aviso al equipo admin SaaS cuando reportan comprobante Bre-B)
  - `billing.bre_b_report_approved` (categoría `billing`)
  - `billing.bre_b_report_rejected` (categoría `billing`)
  - `team.member_invited` (categoría `tenant`)
- Actualización de `apps/admin/app/admin/settings/notifications/notifications-view.tsx` para permitir **activar / desactivar (`isActive`)** cada evento/notificación desde una pestaña o lista clara de **Eventos Y Activación** (además de editar sus plantillas en `es`/`en` y variables disponibles).
- Nuevas tablas para inquilino (en control `admin` o celda según scope multi-vista):
  - `admin.tenant_notification_preferences`: preferencias por `client_id` y `event_key` (`in_app_enabled`, `email_enabled`, `override_recipient_email`).
  - `admin.tenant_in_app_notifications`: bandeja de notificaciones visibles dentro del workspace (`id`, `client_id`, `event_key`, `title`, `body`, `severity`, `action_url`, `read_at`, `created_at`).
- Endpoints del inquilino:
  - `GET /api/tenant/notifications` (bandeja paginada + conteo `unreadCount` + lista de preferencias).
  - `PATCH /api/tenant/notifications/[id]/read` y `POST /api/tenant/notifications/read-all`.
  - `PUT /api/tenant/notifications/preferences`.
- Nueva pantalla `apps/admin/app/workspace/notifications/page.tsx` [Nuevo] + `notifications-view.tsx` [Nuevo] + campanita / badge de no leídas discreta en `TenantWorkspaceShell`.

### Fuera de alcance
- Notificaciones push móviles nativas (FCM/APNs) o SMS pagos por terceros en esta fase.
- Desactivación por el inquilino de correos legales/obligatorios de seguridad o facturación crítica (ej. recuperación de contraseña, rechazo de pago, `D-0` de expiración — estas tienen bandera `user_configurable = false`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `platform_owner` / `platform_admin` | Activar/desactivar eventos globales (`is_active`) y editar plantillas de email (`subject`, `body_html`) en `/admin/settings/notifications` | Sí | Auditoría obligatoria; soporta previsualización y envío de prueba |
| `tenancy_owner` | Leer bandeja in-app, marcar leídas y configurar preferencias de email/alerta del comercio | Sí | Solo de su `client_id`; no puede silenciar eventos marcados `is_mandatory = true` |
| `tenancy_users` (`tenant_agent`) | Leer alertas operativas permitidas (ej. stock mínimo, nuevos pedidos asignables) y marcar su lectura | Sí | Sin permisos para cambiar preferencias globales ni correos destinatarios de facturación |

---

## 7. Modelo de datos

### 7.1 Extensión de `admin.email_events` (`packages/domain/src/db/schemas/admin/notifications.ts`)
- Verificar/agregar columna:
  - `is_active`: `BOOLEAN` `NOT NULL`, default `true` (switch administrativo global).
  - `tenant_configurable`: `BOOLEAN` `NOT NULL`, default `true` (`false` para correos obligatorios como autenticación o cobros/rechazos de facturación).
  - `allowed_variables`: `JSONB` `string[]` (ej. `["productName", "sku", "currentStock", "minThreshold", "productUrl"]` para `tenant.inventory.low_stock`).

### 7.2 Nuevas tablas en plano de control `admin` (`notifications.ts`)
- **`admin.tenant_notification_preferences`:**
  - `id`: `UUID` PK.
  - `client_id`: `UUID` FK → `admin.clients.id`, `NOT NULL`.
  - `event_key`: `VARCHAR(120)` FK → `admin.email_events.key`, `NOT NULL`.
  - `email_enabled`: `BOOLEAN` `NOT NULL`, default `true`.
  - `in_app_enabled`: `BOOLEAN` `NOT NULL`, default `true`.
  - `custom_recipient_email`: `VARCHAR(255)` nullable (si el comercio desea dirigir alertas de inventario a `bodega@empresa.co` distinto de `commercial_email`).
  - `updated_at`: `TIMESTAMPTZ`.
  - `UNIQUE (client_id, event_key)`.
- **`admin.tenant_in_app_notifications`:**
  - `id`: `UUID` PK.
  - `client_id`: `UUID` FK → `admin.clients.id`, `NOT NULL`, indexado `(client_id, read_at, created_at DESC)`.
  - `event_key`: `VARCHAR(120)` `NOT NULL`.
  - `title`: `VARCHAR(200)` `NOT NULL`.
  - `body`: `TEXT` `NOT NULL`.
  - `severity`: `VARCHAR(16)` (`'info' | 'warning' | 'success' | 'critical'`), `NOT NULL`, default `'info'`.
  - `action_url`: `TEXT` nullable (ruta interna relativa ej. `/workspace/products?highlight=...`).
  - `read_at`: `TIMESTAMPTZ` nullable.
  - `created_at`: `TIMESTAMPTZ` `NOT NULL`.

---

## 8. Reglas de negocio

- **RN-SPEC-14-01 (Control administrativo maestro sobre eventos y plantillas):** Si un evento en `admin.email_events` tiene `is_active = false` en `/admin/settings/notifications`, el motor central de correos omite el envío SMTP y deja traza `skipped_disabled_by_admin` en logs sin generar error de aplicación en el módulo disparador (`SPEC-08` o `SPEC-04`).
- **RN-SPEC-14-02 (Plantilla obligatoria de Stock Mínimo `PRD-08`):** El evento `tenant.inventory.low_stock` incluye plantillas bilingües predeterminadas (`es`/`en`), variables soportadas (`{{businessName}}`, `{{productName}}`, `{{sku}}`, `{{currentStock}}`, `{{minThreshold}}`, `{{productAdminUrl}}`) y control administrativo completo desde `/admin/settings/notifications` para editar asunto/HTML o activar/desactivar la notificación.
- **RN-SPEC-14-03 (Resolución jerárquica de destinatario y respeto de preferencias):** Para despachar un email de evento `tenant_configurable = true`:
  1. Verificar que `email_events.is_active = true`.
  2. Consultar `tenant_notification_preferences` para `(client_id, event_key)`: si existe y `email_enabled = false`, no envía correo (sí puede registrar notificación in-app si `in_app_enabled = true`).
  3. Destinatario resuelto en orden: `custom_recipient_email` → `clients.commercial_email` → `clients.contact_email`.
  4. Para eventos obligatorios (`tenant_configurable = false`, ej. `D-0` vencimiento, rechazo Bre-B, invitación equipo), el comercio no puede apagar `email_enabled`.
- **RN-SPEC-14-04 (Renderizado seguro anti-XSS en variables de plantilla):** Todas las variables dinámicas interpoladas en plantillas HTML (`{{productName}}`, `{{rejectionReason}}`, etc.) se escapan contra HTML/script injection antes de renderizar y enviar por SMTP.
- **RN-SPEC-14-05 (Despacho no bloqueante `after()`):** Toda emisión de notificación invocada desde rutas API de negocio (`SPEC-04`, `SPEC-08`, `SPEC-12`) ejecuta envío/cola de email dentro de `after()` (`AGENTS.md §4.13`) y registra resultado en `admin.email_deliveries` sin bloquear ni hacer fallar la transacción principal si el servidor SMTP tarda.

---

## 9. Contratos de interfaz

### 9.1 `POST /api/admin/notifications` (Extensión de acciones existentes)
- Agregar acción `toggle_event`: `{ action: "toggle_event", eventKey: string, isActive: boolean }` verificando rol `platform_*`.
- Soportar creación/edición de plantillas para los 7 nuevos eventos semilla con validación de variables y vista previa.

### 9.2 `GET /api/tenant/notifications` [Nuevo]
- Query `?tab=inbox|preferences&unreadOnly=true&page=1&limit=20`.
- Retorna `{ unreadCount, notifications: [...], preferences: [...] }`.

### 9.3 `PUT /api/tenant/notifications/preferences` [Nuevo]
- Autenticación: `tenancy_owner`.
- Request: `{ items: Array<{ eventKey: string, emailEnabled: boolean, inAppEnabled: boolean, customRecipientEmail?: string | null }> }`.
- Error `422 MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED` si intenta apagar email en evento no configurable.

### 9.4 `PATCH /api/tenant/notifications/[id]/read` y `POST /api/tenant/notifications/read-all` [Nuevos]
- Aislados estrictamente por `clientId`.

---

## 10. Especificación de UI/UX

- **En Backoffice SaaS (`/admin/settings/notifications`):**
  - Pestaña «Plantillas Y Eventos» ampliada con switch **«Notificación Activa»** por cada evento (incluyendo sección clara para **Inventario Y Productos**, **Facturación Y Bre-B**, **Equipo Y Comunidad**), lista visible de variables disponibles clickeables al editar HTML/Asunto y modal `--dsn-*` si se desactiva un evento crítico.
- **En Backoffice Inquilino (`/workspace/notifications` + icono campana en header de `TenantWorkspaceShell`):**
  - Campana en barra superior con contador discreto de no leídas (máx `99+`) que enlaza o abre vista `/workspace/notifications`.
  - Dos pestañas Mobile First:
    1. **Centro De Mensajes:** Lista ordenada cronológicamente con estado Leída/No Leída, severidad visual (badge stock bajo / vencimiento / pago aprobado), botón «Marcar Todo Como Leído» y enlace directo al recurso (`Ver Producto`, `Ir A Facturación`).
    2. **Preferencias De Alertas:** Tabla/tarjetas por evento con switches `Alerta En Plataforma` / `Alerta Por Correo`, campo opcional «Correo Destinatario Específico» (ej. para bodega en alerta de stock) y badge «Obligatoria» en eventos no desactivables.
  - Labels en Title Case, i18n `es`/`en`, cero códigos internos (`PRD-08`, `PLN-03`).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Notificaciones del inquilino y plantillas administrativas de email

  Escenario: Administrador SaaS visualiza, edita plantilla y activa/desactiva evento de stock mínimo
    Dado que un "platform_admin" accede a "/admin/settings/notifications"
    Cuando abre la lista de eventos y plantillas
    Entonces encuentra el evento "tenant.inventory.low_stock" con sus plantillas en español e inglés y el interruptor de activación
    Cuando personaliza el asunto a "Alerta de inventario: {{productName}}" y guarda los cambios
    Y posteriormente ocurre una alerta de stock mínimo en un comercio que tiene la preferencia activa
    Entonces el sistema envía el correo usando la plantilla editada y crea la notificación in-app en el comercio

  Escenario: Comercio dirige alertas de stock mínimo al correo de su jefe de bodega
    Dado que el propietario de "Comercial Andes" abre "/workspace/notifications" en la pestaña "Preferencias De Alertas"
    Cuando configura "customRecipientEmail = bodega@andes.co" para el evento de stock mínimo y guarda
    Entonces las siguientes alertas de inventario bajo se envían a "bodega@andes.co" respetando su preferencia
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de correo personalizado inválido en preferencias de notificación
    Dado que un propietario ingresa "customRecipientEmail = correo-roto" en PUT "/api/tenant/notifications/preferences"
    Cuando el servidor valida el formulario con Zod
    Entonces responde HTTP 400 Problem Details sin guardar preferencias parciales
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Evento desactivado globalmente por la SaaS no dispara envíos SMTP ni rompe el flujo origen
    Dado que el administrador SaaS desactivó "tenant.inventory.low_stock" en "/admin/settings/notifications"
    Cuando un pedido reduce el stock físico de un producto por debajo del mínimo en un comercio
    Entonces el pedido se confirma correctamente en su transacción principal
    Y el despachador de notificaciones registra evento omitido sin enviar ningún correo SMTP

  Escenario: Comercio no puede desactivar notificaciones obligatorias de facturación o seguridad
    Dado que el evento "billing.renewal_reminder_d0" tiene "tenant_configurable = false"
    Cuando un propietario intenta enviar "emailEnabled: false" sobre ese evento en la API
    Entonces el backend responde HTTP 422 "MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED"
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Un agente no puede modificar correos destinatarios ni apagar notificaciones globales del comercio
    Dado que un usuario "tenant_agent" está autenticado
    Cuando intenta ejecutar PUT "/api/tenant/notifications/preferences" o marcar leída una notificación del comercio B
    Entonces recibe HTTP 403 Forbidden (para preferencias) y HTTP 404 (para notificación ajena)
```

### (e) Escenarios de borde

```gherkin
  Escenario: Sanitización HTML de nombre de producto malicioso al renderizar plantilla de stock mínimo
    Dado que un comercio creó un producto llamado "<script>alert(1)</script>Camisa"
    Cuando se dispara el email "tenant.inventory.low_stock"
    Entonces el motor escapa las entidades HTML del parámetro antes de interpolar en "bodyHtml" evitando cualquier etiqueta "<script>" ejecutable en el correo
```

---

## 12. Requisitos no funcionales

- **Confiabilidad SMTP:** Uso de `admin.email_deliveries` (outbox/registro ya existente en `NTF-001`) con ejecución en `after()` para no bloquear respuestas HTTP de pedidos, productos o pagos.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `notifications.dispatched`, `notifications.skipped_disabled`, `notifications.smtp_failed` correlacionados por `requestId`, `clientId`, `eventKey`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `NTF-001` (motor SMTP y tablas `email_*`), `SPEC-04` (eventos billing/Bre-B), `SPEC-08` (evento stock mínimo), `SPEC-12` (evento invitación).
- **Riesgos:**
  - *Servidor SMTP sin configurar en un entorno nuevo:* Mitigado preservando siempre la notificación in-app en `tenant_in_app_notifications` y registrando estado explícito en `email_deliveries` sin tumbar operaciones del negocio.

---

## 14. Definition of Done

- [ ] Nuevos eventos semilla (`tenant.inventory.low_stock`, `billing.renewal_reminder_d5`, `billing.renewal_reminder_d0`, `billing.bre_b_report_*`, `team.member_invited`) y columna `is_active` / `tenant_configurable` migrados y poblados en BD.
- [ ] Nuevas tablas `tenant_notification_preferences` y `tenant_in_app_notifications` con migración SQL y servicio `NotificationsAndLeadsService` ampliado.
- [ ] Actualizado `/admin/settings/notifications` con activación por evento y edición de las nuevas plantillas (`PRD-08`).
- [ ] Creada vista `/workspace/notifications`, badge en `TenantWorkspaceShell` y endpoints `/api/tenant/notifications*` (`es`/`en`, Title Case, Mobile First, RFC 9457).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas abiertas; alineado con las instrucciones explícitas sobre `PRD-08`, `PLN-03`, `ONB-12` y `GEN-06`.

