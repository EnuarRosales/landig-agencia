# SPEC-09 · CRM Avanzado: Ficha Integral Ver/Editar, Calificación, Atención Omnicanal (Prioridad WhatsApp), Múltiples Direcciones y Prospección

## 1. Identificación

| Campo                         | Valor                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                        | `SPEC-09`                                                                                                                                            |
| **Nombre**                    | CRM Avanzado Omnicanal: Ficha Integral Ver/Editar, Calificación por Estrellas, Prioridad y Ventana WhatsApp 24h, Múltiples Direcciones y Prospección |
| **Tipo de intervención**      | Evolución de módulo CRM existente + Extensión de modelo de datos en celda                                                                            |
| **Prioridad**                 | P1 — Alta (operación diaria omnicanal de ventas, prospección y retención con prioridad WhatsApp)                                                     |
| **Versión**                   | 1.1.0                                                                                                                                                |
| **Estado**                    | Aprobada para implementación (actualizada con decisiones omnicanal y multi-fuente)                                                                   |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`                                                                                                                      |

---

## 2. Trazabilidad

| Elemento                            | Referencia                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IDs de observaciones cubiertos**  | `CRM-02`, `CRM-03`, `CRM-04`, `CRM-05`                                                                                                                                                                                                                                                                                              |
| **Specs previas relacionadas**      | `CRM-001`, `CHW-002`, `ORD-001`, `BOT-001` (`RF-11.6`)                                                                                                                                                                                                                                                                              |
| **Specs dependientes / integradas** | `SPEC-01` (limpieza de etiqueta «CRM Celular» → «Contactos Y Clientes»), `SPEC-11` (pedidos reutilizan múltiples direcciones guardadas del contacto), `SPEC-13` (eventos entrantes omnicanal de Chatwoot refrescan actividad y ventana 24h de WhatsApp), `SPEC-17` (paginación, filtros, ordenamiento y formato estándar de tablas) |
| **Wave de ejecución sugerida**      | Wave 3 — Refactorización de Módulos Operativos                                                                                                                                                                                                                                                                                      |

---

## 3. Problema / Situación actual

Aunque `packages/domain/src/db/schemas/tenant/crm.ts` y `packages/domain/src/services/crm.service.ts` implementan la base de prospectos y consentimientos Ley 1581, la experiencia operativa en `apps/admin/app/workspace/contacts/contacts-view.tsx` y `/api/tenant/contacts` presenta vacíos críticos frente a las observaciones `CRM-02`..`CRM-05` y a la operación omnicanal real del negocio:

1. **Modal de ficha Ver/Editar incompleto y ausencia de calificación (`CRM-02`, `PV-02` aprobada):**
   - La UI actual apenas muestra una lista básica y no expone los campos de `cell_contacts` (`documentType`, `documentNumber`, `phoneLandline`, `source`, `channel`, `stage`, `tags`, `notes`, `language`) ni cuenta con campos de **teléfono secundario**, **empresa (`company_name`)**, **fecha de cumpleaños (`birth_date`)** ni **calificación del contacto (1 a 5 estrellas, comentario e historial de evaluaciones)**.
2. **Operación omnicanal sin distinción entre fuente de origen, canal preferido y ventana WhatsApp 24h (`CRM-03`):**
   - Los leads y contactos ingresan desde **múltiples fuentes** (WhatsApp, Instagram, Facebook, Web Chat, Telegram, Email, SMS, Referidos, API o creación manual en Backoffice) y requieren atención **omnicanal con priorización del canal de WhatsApp**.
   - Actualmente `ingestFromChatwoot` fija `source = "whatsapp"` sin distinguir el canal real entrante, no reconcilia contactos manuales existentes por teléfono/correo (generando duplicados) y no separa el timestamp de último mensaje omnicanal (`last_inbound_message_at`) del timestamp exclusivo de WhatsApp (`last_whatsapp_inbound_at`) necesario para saber en tiempo real si la ventana gratuita de 24h de Meta está activa o expirada.
3. **Ubicación geográfica rígida de un solo texto sin múltiples direcciones (`CRM-04`):**
   - `cell_contacts` solo guarda una dirección plana (`city`, `state`, `addressLine`), impidiendo gestionar múltiples direcciones frecuentes por cliente (ej. «Casa», «Oficina», «Bodega») y dificultando seleccionar rápidamente la dirección de despacho al crear un pedido.
4. **Prospección, consentimientos omnicanal y conversión de etapas sin flujo guiado en Backoffice (`CRM-05`):**
   - Las etapas del embudo (`new`, `in_conversation`, `qualified`, `customer`, `discarded`) y el registro de consentimientos/prospección (`cell_prospect_consents`) existen en dominio pero carecen de acciones directas en la vista CRM para calificar, convertir un prospecto en cliente, registrar/revocar consentimientos omnicanal con evidencia e iniciar seguimiento priorizando WhatsApp.

---

## 4. Objetivo y valor de negocio

Convertir `/workspace/contacts` en un **CRM comercial omnicanal con priorización de WhatsApp**:

- **Atención omnicanal y multi-fuente unificada:** captura automática desde cualquier canal de Chatwoot (`WhatsApp`, `Instagram`, `Facebook`, `Web`, `Telegram`, `Email`, `SMS`, `Line`, `API`) y creación manual seleccionando la fuente de origen, con reconciliación sin duplicados.
- **Priorización operativa de WhatsApp e indicador en vivo de ventana 24h:** `preferred_channel` con prioridad por defecto hacia WhatsApp, ordenamiento/filtros que destacan contactos con ventana de 24h activa y acceso directo a la bandeja embebida `/workspace/conversations`.
- **Ficha integral Ver y Editar:** datos demográficos completos, empresa, cumpleaños y **calificación 1–5 estrellas con trazabilidad histórica**.
- **Libreta de múltiples direcciones:** vinculada al contacto y lista para autocompletado en pedidos (`SPEC-11`).
- **Embudo de prospección y consentimientos Ley 1581:** transición guiada de etapas, otorgamiento y revocación manual de consentimientos con trazabilidad de canal y evidencia.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance

- Extensión de `packages/domain/src/db/schemas/tenant/crm.ts`:
  - Nuevas columnas en `cell_contacts`: `phone_secondary`, `company_name`, `birth_date`, `preferred_channel`, `last_channel`, `last_inbound_message_at`, `last_whatsapp_inbound_at`, `current_rating_stars`, `current_rating_comment`, `converted_to_customer_at`.
  - Ampliación de restricción `contacts_source_check` en `cell_contacts` para admitir: `'whatsapp'`, `'instagram'`, `'facebook'`, `'web'`, `'telegram'`, `'email'`, `'sms'`, `'manual'`, `'referral'`, `'import'`, `'api'`, `'other'`.
  - Nueva tabla `cell_contact_ratings`: historial de calificaciones (`id`, `client_id`, `contact_id`, `stars` `1..5`, `comment`, `rated_by_user_id`, `rated_by_name`, `created_at`, `updated_at`, `created_by`, `updated_by`) con FK compuesta `(client_id, contact_id)` → `admin.contacts(client_id, id)`.
  - Nueva tabla `cell_contact_addresses`: múltiples direcciones por contacto (`id`, `client_id`, `contact_id`, `label`, `country`, `state`, `city`, `address_line`, `neighborhood`, `postal_code`, `reference_notes`, `is_default`, `created_at`, `updated_at`, `created_by`, `updated_by`) con FK compuesta `(client_id, contact_id)` → `admin.contacts(client_id, id)` e índice único parcial `WHERE is_default = true`.
- Extensión de `CrmService`, repositorio Drizzle CRM y capa de servicios del workspace (`/api/tenant/contacts*`):
  - Reconciliación omnicanal idempotente en `ingestFromChatwoot` (`chatwootContactId` → `phone_mobile` E.164 único → `email` único), preservando `source` inmutable de origen, actualizando `last_channel`, `last_inbound_message_at` y, cuando corresponda a WhatsApp, `last_whatsapp_inbound_at`.
  - `GET / POST /api/tenant/contacts`: listado paginado con filtros por `q`, `stage`, `source`, `channel`, `whatsappWindow=active|expired|none`, `minRating=1..5` y ordenamiento (`whatsapp_priority` por defecto o por `last_inbound`, `created_at`, `rating`, `full_name`); creación manual eligiendo `source`, `preferredChannel`, `stage`, datos ampliados y dirección inicial opcional, con detección de duplicados (`409 Conflict`).
  - `GET / PATCH / DELETE /api/tenant/contacts/[id]`: detalle completo incluyendo ventana 24h (`computeWhatsappWindow`), `addresses[]`, `ratingsHistory[]`, `consents[]` y últimos pedidos; actualización integral; borrado lógico exclusivo para `tenancy_owner`.
  - `POST /api/tenant/contacts/[id]/ratings`: registrar nueva calificación 1–5 estrellas conservando historial.
  - `GET / POST /api/tenant/contacts/[id]/addresses` y `PATCH / DELETE /api/tenant/contacts/[id]/addresses/[addressId]`: CRUD de múltiples direcciones con invariante de única dirección `is_default = true`.
  - `PATCH /api/tenant/contacts/[id]/stage`: transición controlada de etapa en embudo de prospección / conversión a cliente.
  - `POST /api/tenant/contacts/[id]/consents` y `PATCH /api/tenant/contacts/[id]/consents/[consentId]/revoke`: otorgamiento y revocación manual de consentimientos Ley 1581 desde la ficha del contacto.
- Actualización de `apps/admin/app/api/webhooks/chatwoot/route.ts` para normalizar canales omnicanal de Chatwoot (`Channel::Whatsapp`, `Channel::Instagram`, `Channel::FacebookPage`, `Channel::WebWidget`, `Channel::Telegram`, `Channel::Email`, `Channel::Sms`, `Channel::Api`, `Channel::Line`), identificar eventos entrantes (`message_type === 'incoming'`) y refrescar `last_inbound_message_at` y `last_whatsapp_inbound_at` según canal.
- Rediseño de `apps/admin/app/workspace/contacts/contacts-view.tsx` usando `<DataTable />` (`SPEC-17` / `DSN-001`), badges de fuente/canal omnicanal, badge de ventana WhatsApp 24h (`Activa · Xh Ym` / `Ventana Expirada` / `Sin WhatsApp`), toggle de prioridad WhatsApp, acceso directo a `/workspace/conversations`, modal de creación multi-fuente y modal/drawer de 4 pestañas **Ficha Del Contacto** (`contact-detail-modal.tsx`).

### Fuera de alcance

- Importación masiva de contactos desde archivos CSV/Excel (queda diferida a una especificación futura dedicada).
- Envío de plantillas masivas de pago de WhatsApp Business (campañas Meta) fuera de Chatwoot.
- Reimplementar bandejas de mensajería fuera de Chatwoot embebido (`AGENTS.md §4.10`).
- Memoria vectorial profunda del contacto (`cell_contact_memories` ya operada por el motor conversacional del bot).

---

## 6. Actores y permisos

| Actor / Rol                      | Operación                                                                                                                                   | Permitido | Condición                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------ |
| `tenancy_owner`                  | Ver, crear, editar, calificar, gestionar direcciones, cambiar etapas, registrar/revocar consentimientos y eliminar lógicamente contactos    | Sí        | Solo de su `client_id`                           |
| `tenancy_users` (`tenant_agent`) | Ver ficha, crear, editar datos operativos, calificar, agregar direcciones, cambiar etapa de prospección y registrar/revocar consentimientos | Sí        | Solo de su `client_id`                           |
| `tenancy_users` (`tenant_agent`) | Eliminar contactos o exportar base completa masiva                                                                                          | No        | Restringido al `tenancy_owner` (`403 Forbidden`) |

---

## 7. Modelo de datos

### 7.1 Extensión de `cell_contacts` (`packages/domain/src/db/schemas/tenant/crm.ts`)

Columnas existentes conservadas (`id`, `client_id`, `full_name`, `document_type`, `document_number`, `email`, `phone_mobile`, `phone_landline`, `country`, `state`, `city`, `address_line`, `postal_code`, `source`, `channel`, `chatwoot_contact_id`, `assigned_user_id`, `stage`, `tags`, `language`, `notes`, `first_contacted_at`, `last_seen_at`, `deleted_at`, `deleted_by`) más:

- `phone_secondary`: `TEXT` nullable (teléfono secundario/alterno; se mantiene `phone_landline` por compatibilidad).
- `company_name`: `TEXT` nullable (razón social o empresa del contacto).
- `birth_date`: `DATE` nullable (no acepta fechas futuras).
- `preferred_channel`: `TEXT` nullable (canal preferido de atención; p. ej. `'whatsapp'`, `'instagram'`, `'facebook'`, `'website'`, `'telegram'`, `'email'`, `'sms'`, `'manual'`).
- `last_channel`: `TEXT` nullable (último canal omnicanal donde interactuó el contacto).
- `last_inbound_message_at`: `TIMESTAMPTZ` nullable (último mensaje entrante del contacto en **cualquier canal**).
- `last_whatsapp_inbound_at`: `TIMESTAMPTZ` nullable (último mensaje entrante recibido **específicamente por WhatsApp**; fuente canónica de la ventana 24h Meta).
- `current_rating_stars`: `SMALLINT` nullable (`CHECK (current_rating_stars IS NULL OR (current_rating_stars >= 1 AND current_rating_stars <= 5))`).
- `current_rating_comment`: `TEXT` nullable.
- `converted_to_customer_at`: `TIMESTAMPTZ` nullable (timestamp al pasar por primera vez a `stage = 'customer'`).
- Actualización de `contacts_source_check`:
  `source IN ('whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'email', 'sms', 'manual', 'referral', 'import', 'api', 'other')`.

### 7.2 Nueva tabla `cell_contact_ratings` (`admin.contact_ratings` en `pg-cell-XX`)

- `id`: `UUID` not null, default `uuidv7()`.
- `client_id`: `UUID` `NOT NULL`, RLS `app.current_client_id`.
- `contact_id`: `UUID` `NOT NULL`.
- `stars`: `SMALLINT` `NOT NULL` (`CHECK (stars >= 1 AND stars <= 5)`).
- `comment`: `TEXT` nullable (máx. `1,000` caracteres validados en servicio/API).
- `rated_by_user_id`: `UUID` nullable (para actores de sistema o usuario resuelto en sesión).
- `rated_by_name`: `TEXT` `NOT NULL`.
- `...auditColumns()` (`created_at`, `updated_at`, `created_by`, `updated_by`).
- PK compuesta `(client_id, id)`.
- FK compuesta `(client_id, contact_id)` → `admin.contacts(client_id, id)` `ON DELETE CASCADE`.

### 7.3 Nueva tabla `cell_contact_addresses` (`admin.contact_addresses` en `pg-cell-XX`)

- `id`: `UUID` not null, default `uuidv7()`.
- `client_id`: `UUID` `NOT NULL`, RLS `app.current_client_id`.
- `contact_id`: `UUID` `NOT NULL`.
- `label`: `TEXT` `NOT NULL` (ej. «Casa», «Oficina», «Bodega»).
- `country`: `TEXT` `NOT NULL`, default `'Colombia'`.
- `state`: `TEXT` nullable.
- `city`: `TEXT` `NOT NULL`.
- `address_line`: `TEXT` `NOT NULL`.
- `neighborhood`: `TEXT` nullable.
- `postal_code`: `TEXT` nullable.
- `reference_notes`: `TEXT` nullable.
- `is_default`: `BOOLEAN` `NOT NULL`, default `false` (índice único parcial `(client_id, contact_id)` `WHERE is_default = true`).
- `...auditColumns()` (`created_at`, `updated_at`, `created_by`, `updated_by`).
- PK compuesta `(client_id, id)`.
- FK compuesta `(client_id, contact_id)` → `admin.contacts(client_id, id)` `ON DELETE CASCADE`.

---

## 8. Reglas de negocio

- **RN-SPEC-09-01 (Cálculo determinista de ventana de 24 horas exclusiva de WhatsApp `CRM-03`):**
  - La ventana se calcula exclusivamente con `last_whatsapp_inbound_at` (nunca con mensajes de Instagram, Web u otros canales) para evitar falsos positivos frente a Meta Cloud API.
  - Se considera **Activa** si `last_whatsapp_inbound_at IS NOT NULL` y `(NOW() - last_whatsapp_inbound_at) < INTERVAL '24 hours'`.
  - Se calcula `remainingSeconds = Math.max(0, Math.floor((lastWhatsappInbound + 24h - NOW()) / 1000))`.
  - Si `last_whatsapp_inbound_at` es nulo (`none`) o han pasado `>= 24 horas` (`expired`), la UI advierte que el contacto por WhatsApp requiere plantilla aprobada o esperar un nuevo mensaje entrante del cliente, manteniendo visible la actividad omnicanal (`last_inbound_message_at` y `last_channel`).
- **RN-SPEC-09-02 (Trazabilidad histórica de calificaciones `CRM-02`):** Toda calificación asignada (`1..5` estrellas y comentario opcional) inserta un registro inmutable en `cell_contact_ratings` y actualiza simultáneamente `current_rating_stars` y `current_rating_comment` en `cell_contacts` para ordenamiento y filtrado rápido. No se sobrescriben calificaciones históricas anteriores.
- **RN-SPEC-09-03 (Invariante de dirección principal única `CRM-04`):** Si un contacto posee al menos una dirección en `cell_contact_addresses`, exactamente una debe estar marcada con `is_default = true`. Al crear la primera dirección, se asigna automáticamente como predeterminada; al marcar otra como predeterminada, la anterior pasa a `false` dentro de la misma transacción, sincronizando además `country`, `state`, `city`, `address_line` y `postal_code` hacia `cell_contacts` por compatibilidad. Si se elimina la dirección predeterminada y quedan otras direcciones, la más reciente restante se promueve automáticamente a `is_default = true`.
- **RN-SPEC-09-04 (Origen multi-fuente, reconciliación omnicanal y priorización de WhatsApp `CRM-05`):**
  - `source` registra el origen inicial de captura (`whatsapp`, `instagram`, `facebook`, `web`, `telegram`, `email`, `sms`, `manual`, `referral`, `import`, `api`, `other`) y no se sobrescribe cuando el contacto interactúa posteriormente por otro canal.
  - En ingesta desde Chatwoot (`ingestFromChatwoot`), el orden de reconciliación es: (1) `chatwoot_contact_id` activo, (2) coincidencia única por `phone_mobile` E.164 activo, (3) coincidencia única por `email` normalizado activo. Al reconciliar por teléfono o correo, se enlaza `chatwoot_contact_id` (si estaba nulo) y se actualizan `last_channel`, `last_inbound_message_at`, `last_seen_at` y `last_whatsapp_inbound_at` (únicamente si el canal del evento es WhatsApp). Si existe ambigüedad de múltiples coincidencias, se conserva registro de advertencia sin fusionar incorrectamente.
  - En creación manual (`POST /api/tenant/contacts`), si ya existe un contacto activo (`deleted_at IS NULL`) en el comercio con el mismo `phoneMobile` E.164, `email` o `(documentType, documentNumber)`, se rechaza con HTTP `409 Conflict` indicando el contacto existente.
  - Si un contacto tiene `phone_mobile` o proviene de WhatsApp y no se especificó `preferred_channel`, se asigna `preferred_channel = 'whatsapp'` por defecto para reflejar la priorización operativa del canal.
  - Todo contacto nuevo inicia en `stage = 'new'` (o el elegido válidamente en el alta; `'customer'` solo si proviene de conversión o pedido confirmado en `SPEC-11`). Al promover a `customer`, se fija `converted_to_customer_at` si aún era nulo.
- **RN-SPEC-09-05 (Consentimientos omnicanal Ley 1581 sin falsas aceptaciones):** En la ficha del contacto y durante el alta comercial, nunca se premarcan ni inventan consentimientos por defecto. El operador puede registrar explícitamente otorgamientos (`data_treatment`, `commercial_comms`) o revocaciones inmediatas indicando `channel` (`manual`, `whatsapp_buttons`, `web_form`, `import`) y `evidenceRef` opcional.
- **RN-SPEC-09-06 (Validación de cuotas de contactos según plan `SPEC-03`):** Crear un contacto nuevo (manual o por webhook) valida la cuota `contacts` del plan activo cuando sea `LIMITED`.
- **RN-SPEC-09-07 (Eliminación segura):** Eliminar un contacto aplica borrado lógico (`deleted_at = NOW()`, `deleted_by = actor`), nunca cascada destructiva sobre pedidos existentes, y requiere confirmación explícita en modal `--dsn-*` (`ConfirmationModal`, exclusivo para `tenancy_owner`).

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/contacts` y `POST /api/tenant/contacts`

- `GET`: Soporta `?q=&stage=&source=&channel=&whatsappWindow=active|expired|none&minRating=1..5&page=1&limit=20&sortBy=whatsapp_priority|last_inbound|created_at|rating|full_name&sortDir=asc|desc`.
  Devuelve `{ ok: true, data: { items, pagination: { page, limit, total, totalPages }, quota } }` incluyendo `source`, `preferredChannel`, `lastChannel`, `lastInboundMessageAt`, `lastWhatsappInboundAt`, `whatsappWindow` (`{ status, expiresAt, remainingSeconds }`), `currentRatingStars`, `defaultAddressSummary`.
- `POST`: Valida Zod (`fullName`, `phoneMobile`, `phoneSecondary`, `email`, `documentType`, `documentNumber`, `companyName`, `birthDate`, `source`, `preferredChannel`, `stage`, `language`, `tags`, `notes`, `initialAddress?`), valida cuota `contacts` y unicidad (`409 Conflict` ante duplicado activo).

### 9.2 `GET / PATCH / DELETE /api/tenant/contacts/[id]` [Nuevo]

- `GET`: Retorna ficha completa del contacto, `whatsappWindow` exacto, `addresses[]`, `ratingsHistory[]`, `consents[]` y `recentOrders[]`.
- `PATCH`: Actualiza ficha completa (`fullName`, `companyName`, `documentType`, `documentNumber`, `phoneMobile`, `phoneSecondary`, `phoneLandline`, `email`, `birthDate`, `language`, `preferredChannel`, `tags`, `notes`; preserva `source` original). Valida duplicidad (`409 Conflict`) si cambia teléfono, correo o documento hacia otro contacto activo.
- `DELETE`: Exclusivo `tenancy_owner` (`403 Forbidden` para `tenant_agent`); borrado lógico verificando pertenencia al `clientId`.

### 9.3 Subrecursos nuevos

- `POST /api/tenant/contacts/[id]/ratings`: `{ stars: 1..5, comment?: string }` → inserta historial y actualiza cabecera.
- `GET / POST /api/tenant/contacts/[id]/addresses` y `PATCH / DELETE /api/tenant/contacts/[id]/addresses/[addressId]`: CRUD de múltiples direcciones + flag `isDefault`.
- `PATCH /api/tenant/contacts/[id]/stage`: `{ stage: 'new' | 'in_conversation' | 'qualified' | 'customer' | 'discarded', notes?: string }`.
- `POST /api/tenant/contacts/[id]/consents` y `PATCH /api/tenant/contacts/[id]/consents/[consentId]/revoke`: otorgar o revocar consentimientos Ley 1581 con trazabilidad de canal y evidencia.

### 9.4 Webhook omnicanal `POST /api/webhooks/chatwoot`

- Mapea `inbox.channel_type` / `conversation.channel` desde nomenclatura Chatwoot (`Channel::Whatsapp` / `whatsapp` → `whatsapp_cloud` + fuente `whatsapp`; `Channel::Instagram` → `instagram`; `Channel::FacebookPage` → `facebook`; `Channel::WebWidget` → `web`; `Channel::Telegram` → `telegram`; `Channel::Email` → `email`; `Channel::Sms` → `sms`; `Channel::Api` → `api`; `Channel::Line` → `line`).
- Identifica si el evento representa un mensaje entrante real (`event === 'message_created'` y `message_type === 'incoming'` o equivalente numérico `0` de Chatwoot) para refrescar `last_inbound_message_at` y, cuando el canal sea WhatsApp, `last_whatsapp_inbound_at`.

---

## 10. Especificación de UI/UX

- **Vista `/workspace/contacts` (`contacts-view.tsx`):**
  - Título limpio «Contactos Y Clientes» (`SPEC-01`) con subtítulo operativo omnicanal e indicador de cuota `Usado / Límite` (`SPEC-03`).
  - Barra de filtros y búsqueda con `<DataTable />` (`SPEC-17`): búsqueda por texto, filtros por **Etapa**, **Fuente De Origen**, **Ventana WhatsApp 24h**, **Calificación Mínima**, y selector de ordenamiento con **Prioridad WhatsApp** activo por defecto.
  - Columnas claras: Nombre y Empresa, Fuente / Canal Preferido (resaltando WhatsApp), Teléfono Principal / Secundario, Etapa (badge semántico), **Ventana WhatsApp 24h** (badge verde con tiempo restante «18h 20m» / «Ventana Expirada» / «Sin Mensajes WhatsApp»), **Calificación** (estrellas 1–5), Ciudad Principal, Acciones (**Ver / Editar**, **Abrir Conversación** hacia `/workspace/conversations`, **Eliminar** solo owner).
- **Modal «Nuevo Prospecto / Contacto»:**
  - Permite capturar Nombre Completo, Fuente De Origen (selector con Manual, Referido, WhatsApp, Instagram, Facebook, Web, etc.), Canal Preferido (por defecto WhatsApp si hay móvil), Teléfono Principal E.164, Teléfono Secundario, Correo Electrónico, Empresa, Etapa Inicial y Dirección Inicial opcional.
- **Modal «Ficha Del Contacto» (`contact-detail-modal.tsx` — Ver y Editar en 4 pestañas):**
  - Pestaña 1 **Datos Generales**: Nombre Completo, Empresa, Tipo y Número De Documento, Teléfono Principal, Teléfono Secundario, Correo Electrónico, Fecha De Cumpleaños, Idioma Preferido, Fuente De Origen (informativo), Canal Preferido, Etapa De Prospección y Notas.
  - Pestaña 2 **Direcciones De Envío**: Lista de direcciones del cliente con badge «Predeterminada», formulario para añadir/editar múltiples direcciones (Etiqueta, País, Departamento/Estado, Ciudad, Dirección, Barrio, Código Postal, Referencias) y botón «Marcar Como Predeterminada».
  - Pestaña 3 **Calificación E Historial**: Selector interactivo de 1 a 5 estrellas, «Comentario De Calificación», botón «Guardar Calificación» e historial cronológico debajo (quién calificó, fecha, estrellas y comentario).
  - Pestaña 4 **Atención Y Consentimiento**: Resumen omnicanal (`Fuente`, `Último Canal`, `Canal Preferido`, `Último Mensaje Entrante`), estado en vivo de ventana WhatsApp 24h con explicación clara para el operador, acceso a `/workspace/conversations` y gestión explícita de consentimientos Ley 1581 (`Tratamiento De Datos` y `Comunicaciones Comerciales`: otorgar con canal/evidencia y revocar).
- Todos los labels en **Title Case**, sin clases `uppercase`, Mobile First, i18n `es`/`en` completo y modales `--dsn-*` (`ConfirmationModal`, cero `window.confirm`).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: CRM omnicanal con prioridad WhatsApp, múltiples fuentes, calificación, direcciones y prospección

  Escenario: Webhook entrante de WhatsApp activa la ventana de 24 horas y actualiza actividad omnicanal
    Dado que el contacto "Laura Gómez" no tenía mensajes recientes en "cell_contacts"
    Cuando ingresa un mensaje entrante del cliente por canal WhatsApp desde Chatwoot hace 2 horas
    Entonces "last_whatsapp_inbound_at" y "last_inbound_message_at" se actualizan con "last_channel = whatsapp_cloud"
    Y GET "/api/tenant/contacts" calcula ventana "active" con "22h 00m" restantes

  Escenario: Mensaje entrante de Instagram actualiza actividad omnicanal sin activar falsamente ventana WhatsApp 24h
    Dado que "Laura Gómez" fue creada manualmente con fuente "manual"
    Cuando escribe un mensaje entrante desde Instagram vía Chatwoot con el mismo correo electrónico
    Entonces se reconcilia el contacto existente conservando "source = manual", actualizando "last_channel = instagram" y "last_inbound_message_at"
    Pero "last_whatsapp_inbound_at" permanece nulo y su ventana WhatsApp figura como "none"

  Escenario: Operador agrega múltiples direcciones y cambia la dirección predeterminada
    Dado que "Laura Gómez" tiene registrada la dirección "Casa" como predeterminada
    Cuando el operador agrega una segunda dirección "Oficina" en Medellín y la marca como predeterminada
    Entonces "cell_contact_addresses" garantiza que únicamente "Oficina" tenga "is_default = true"
    Y sincroniza ciudad y dirección principal en "cell_contacts"

  Escenario: Agente califica un contacto con 5 estrellas dejando traza histórica
    Dado que el contacto tenía una calificación previa de 3 estrellas
    Cuando el agente registra una nueva calificación de 5 estrellas con comentario "Comprador mayorista recurrente"
    Entonces "cell_contact_ratings" conserva tanto la evaluación de 3 estrellas como la nueva de 5 estrellas
    Y el contacto pasa a mostrar 5 estrellas en su ficha y tabla CRM
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de calificación fuera de rango 1..5 o fecha de cumpleaños futura
    Dado que se envía POST "/api/tenant/contacts/[id]/ratings" con "stars = 6" o PATCH con "birthDate = 2035-01-01"
    Cuando el servidor valida la petición
    Entonces responde HTTP 400 Problem Details rechazando los valores inválidos
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Creación manual duplicada por teléfono o correo retorna conflicto
    Dado que existe un contacto activo con teléfono "+573001234567"
    Cuando un operador intenta crear otro contacto manual con "+573001234567"
    Entonces el servidor responde HTTP 409 Problem Details sin crear duplicado

  Escenario: Eliminación de la dirección predeterminada promueve automáticamente otra existente
    Dado que un contacto tiene dos direcciones ("Oficina" predeterminada y "Casa")
    Cuando se elimina "Oficina" desde la libreta de direcciones
    Entonces la dirección restante "Casa" pasa automáticamente a "is_default = true" sin dejar al contacto sin dirección principal cuando aún tiene direcciones
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Colaborador puede editar, calificar y agregar direcciones pero no eliminar un contacto
    Dado que un usuario "tenant_agent" está autenticado en el comercio
    Cuando califica un contacto (POST "/ratings") obtiene HTTP 201
    Pero cuando intenta eliminarlo (DELETE "/api/tenant/contacts/[id]")
    Entonces recibe HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Expiración exacta de la ventana de 24 horas de WhatsApp sin mensajes nuevos
    Dado que "last_whatsapp_inbound_at" ocurrió hace 24 horas y 1 minuto
    Cuando el agente consulta el contacto en CRM
    Entonces el estado calculado es "expired" con "remainingSeconds = 0" y la UI indica que la ventana de atención libre finalizó
```

---

## 12. Requisitos no funcionales

- **Rendimiento:** Cálculo de ventana 24h en memoria/SQL sin llamadas HTTP síncronas externas a Chatwoot al listar la tabla de CRM.
- **Integridad y aislamiento:** Todas las tablas nuevas (`cell_contact_ratings`, `cell_contact_addresses`) heredan `client_id` + política RLS `ENABLE + FORCE ROW LEVEL SECURITY` con `app.current_client_id`.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.crm.contact_rated`, `tenant.crm.stage_changed`, `tenant.crm.consent_updated`, `tenant.crm.omnichannel_reconciled` con `requestId` y `clientId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-03` (cuota de `contacts`), `SPEC-11` (consumo de `cell_contact_addresses` al crear pedidos), `SPEC-13` / webhooks de Chatwoot (actualización omnicanal y de `last_whatsapp_inbound_at`), `SPEC-17` (`DataTable`, i18n `es`/`en`).
- **Riesgos:**
  - _Desfase horario en cálculo de ventana 24h:_ Mitigado almacenando y operando estrictamente en UTC (`TIMESTAMPTZ` + comparación servidor PostgreSQL/Node UTC).
  - _Falsos positivos de ventana 24h en atención omnicanal:_ Mitigado aislando `last_whatsapp_inbound_at` exclusivamente para eventos entrantes del canal WhatsApp.

---

## 14. Definition of Done

- [ ] Nuevas columnas omnicanales y ampliadas en `cell_contacts` + tablas `cell_contact_ratings` y `cell_contact_addresses` migradas en celda con RLS.
- [ ] Reconciliación omnicanal y actualización de `last_inbound_message_at` / `last_whatsapp_inbound_at` desde el webhook de Chatwoot.
- [ ] Endpoints `/api/tenant/contacts*` (incluyendo `[id]`, `/ratings`, `/addresses`, `/stage`, `/consents`) con validación Zod, `handle()` RFC 9457, RBAC y tests de integración.
- [ ] Vista `/workspace/contacts` con `<DataTable />`, prioridad WhatsApp, creación multi-fuente, ficha modal Ver/Editar de 4 pestañas, estrellas + historial, múltiples direcciones, ventana 24h WhatsApp, embudo de prospección y consentimientos Ley 1581 (`es`/`en`, Title Case, Mobile First, modales `--dsn-*`).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todas las decisiones sobre campos ampliados, calificación histórica (`PV-02`), atención omnicanal multi-fuente con priorización de WhatsApp, separación de `last_whatsapp_inbound_at` vs. `last_inbound_message_at`, reconciliación sin duplicados y gestión manual de consentimientos quedaron validadas y aprobadas con el usuario el 2026-11-15. Sin preguntas pendientes.
