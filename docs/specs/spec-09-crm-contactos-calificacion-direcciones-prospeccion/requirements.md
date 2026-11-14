# SPEC-09 · CRM Avanzado: Ficha Integral Ver/Editar, Calificación, Ventana WhatsApp 24h, Múltiples Direcciones y Prospección

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-09` |
| **Nombre** | CRM Avanzado: Ficha Integral Ver/Editar, Calificación por Estrellas, Ventana WhatsApp 24h, Múltiples Direcciones y Prospección |
| **Tipo de intervención** | Evolución de módulo CRM existente + Extensión de modelo de datos en celda |
| **Prioridad** | P1 — Alta (operación diaria de ventas, prospección y retención por WhatsApp) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `CRM-02`, `CRM-03`, `CRM-04`, `CRM-05` |
| **Specs previas relacionadas** | `CRM-001`, `CHW-002`, `ORD-001` |
| **Specs dependientes / integradas** | `SPEC-01` (limpieza de etiqueta «CRM Celular» → «Contactos Y Clientes»), `SPEC-11` (pedidos reutilizan múltiples direcciones guardadas del contacto), `SPEC-13` (eventos entrantes de Chatwoot alimentan timestamp de ventana de 24h), `SPEC-17` (paginación, filtros, ordenamiento y formato estándar de tablas) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

Aunque `packages/domain/src/db/schemas/tenant/crm.ts` y `packages/domain/src/services/crm.service.ts` implementan la base de prospectos y consentimientos Ley 1581, la experiencia operativa en `apps/admin/app/workspace/contacts/contacts-view.tsx` y `/api/tenant/contacts` presenta vacíos críticos frente a las observaciones `CRM-02`..`CRM-05`:

1. **Modal de ficha Ver/Editar incompleto y ausencia de calificación (`CRM-02`, `PV-02` aprobada):**
   - La UI actual apenas muestra una lista básica y no expone todos los campos de `cell_contacts` (`documentType`, `documentNumber`, `phoneLandline`, `source`, `channel`, `stage`, `tags`, `notes`, `language`) ni cuenta con campos de **teléfono secundario**, **empresa (`company_name`)**, **fecha de cumpleaños (`birth_date`)** ni **calificación del contacto (1 a 5 estrellas, comentario e historial de evaluaciones)**.
2. **Sin visibilidad de la ventana de atención de 24 horas de WhatsApp Cloud API (`CRM-03`):**
   - Los agentes y vendedores necesitan saber en tiempo real dentro del CRM si un contacto tiene activa o vencida la ventana gratuita de 24 horas de conversación de WhatsApp (y cuántas horas/minutos restan) para evitar fallos al enviar mensajes libres vs. plantillas aprobadas.
3. **Ubicación geográfica rígida de un solo texto sin múltiples direcciones (`CRM-04`):**
   - `cell_contacts` solo guarda una dirección plana (`city`, `state`, `addressLine`), impidiendo gestionar múltiples direcciones frecuentes por cliente (ej. «Casa», «Oficina», «Bodega») y dificultando seleccionar rápidamente la dirección de despacho al crear un pedido.
4. **Prospección y conversión de etapas sin flujo guiado en Backoffice (`CRM-05`):**
   - Las etapas del embudo (`new`, `in_conversation`, `qualified`, `customer`, `discarded`) y el registro de consentimientos/prospección (`cell_prospect_consents`) existen en dominio pero carecen de acciones directas en la vista CRM para calificar, convertir un prospecto en cliente, registrar notas rápidas e iniciar/registrar prospección cumpliendo tratamiento de datos.

---

## 4. Objetivo y valor de negocio

Convertir `/workspace/contacts` en un **CRM comercial operativo completo**:
- Ficha integral **Ver y Editar** con datos demográficos completos, empresa, cumpleaños y **calificación 1–5 estrellas con trazabilidad histórica**.
- **Indicador en vivo de ventana WhatsApp 24h** calculado a partir de la última interacción entrante del contacto.
- **Libreta de múltiples direcciones** vinculada al contacto y disponible como autocompletado al registrar pedidos (`SPEC-11`).
- **Embudo de prospección y conversión a cliente** con filtros por etapa, estado de consentimiento de datos y métricas claras de calidad.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión de `packages/domain/src/db/schemas/tenant/crm.ts`:
  - Nuevas columnas en `cell_contacts`: `phone_secondary`, `company_name`, `birth_date`, `rating_avg` (`NUMERIC(3,2)` cache o última calificación vigente `rating_stars`), `rating_comment`, `last_inbound_message_at` (`TIMESTAMPTZ` — actualizada por webhooks de Chatwoot / canal WhatsApp) y `converted_to_customer_at`.
  - Nueva tabla `cell_contact_ratings`: historial de calificaciones (`id`, `client_id`, `contact_id`, `stars` `1..5`, `comment`, `rated_by_user_id`, `created_at`).
  - Nueva tabla `cell_contact_addresses`: múltiples direcciones por contacto (`id`, `client_id`, `contact_id`, `label` ej. `"Casa"` / `"Oficina"`, `country`, `state`, `city`, `address_line`, `neighborhood`, `postal_code`, `reference_notes`, `is_default`, `created_at`, `updated_at`).
- Extensión de `CrmService` y endpoints `/api/tenant/contacts*`:
  - `GET / POST /api/tenant/contacts` (con filtros por etapa, ventana WhatsApp activa/expirada, calificación, etiqueta y paginación real).
  - `GET / PATCH / DELETE /api/tenant/contacts/[id]` (detalle completo incluyendo direcciones, historial de calificaciones, estado de consentimientos y cálculo exacto de ventana 24h).
  - `POST /api/tenant/contacts/[id]/ratings` (registrar nueva calificación 1–5 estrellas).
  - `GET / POST / PATCH / DELETE /api/tenant/contacts/[id]/addresses` (CRUD de direcciones múltiples con garantía de una sola `is_default = true`).
  - `PATCH /api/tenant/contacts/[id]/stage` (transición controlada de etapa en embudo de prospección / conversión a cliente).
- Actualización de `apps/admin/app/api/webhooks/chatwoot/route.ts` para actualizar `last_inbound_message_at` cuando un mensaje entrante (`message_type === 'incoming'`) proviene del cliente en Chatwoot (`CRM-03`).
- Rediseño de `apps/admin/app/workspace/contacts/contacts-view.tsx` con tabla estándar paginada/ordenable/filtrable, badges visuales de ventana 24h (`Activa · Xh Ym restantes` / `Expirada`), estrellas de calificación, modal/drawer **Ver/Editar Contacto**, pestaña de **Direcciones** y flujo de **Prospección/Conversión**.

### Fuera de alcance
- Envío de plantillas masivas de pago de WhatsApp Business (campañas Meta) fuera de Chatwoot.
- Memoria vectorial profunda del contacto (`cell_contact_memories` ya operada por el motor conversacional del bot).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Ver, crear, editar, calificar, gestionar direcciones, cambiar etapas y eliminar lógicamente contactos | Sí | Solo de su `client_id` |
| `tenancy_users` (`tenant_agent`) | Ver ficha, crear, editar datos operativos, calificar, agregar direcciones y actualizar etapa de prospección | Sí | Solo de su `client_id` |
| `tenancy_users` (`tenant_agent`) | Eliminar contactos o exportar base completa masiva | No | Restringido al `tenancy_owner` (`403 Forbidden`) |

---

## 7. Modelo de datos

### 7.1 Extensión de `cell_contacts` (`packages/domain/src/db/schemas/tenant/crm.ts`)
- `phone_secondary`: `VARCHAR(32)` nullable (formato E.164 o teléfono alterno).
- `company_name`: `VARCHAR(160)` nullable.
- `birth_date`: `DATE` nullable (no acepta fechas futuras).
- `current_rating_stars`: `SMALLINT` nullable (`CHECK 1..5`).
- `current_rating_comment`: `TEXT` nullable.
- `last_inbound_message_at`: `TIMESTAMPTZ` nullable (fuente canónica para calcular ventana 24h de WhatsApp).
- `converted_to_customer_at`: `TIMESTAMPTZ` nullable (timestamp al pasar por primera vez a `stage = 'customer'`).
- `deleted_at`: `TIMESTAMPTZ` nullable (eliminación lógica para preservar integridad con órdenes históricas en `cell_orders`).

### 7.2 Nueva tabla `cell_contact_ratings` (en `pg-cell-XX`)
- `id`: `UUID` PK.
- `client_id`: `UUID` `NOT NULL`, RLS `app.current_client_id`.
- `contact_id`: `UUID` FK → `cell_contacts.id` (`ON DELETE CASCADE`).
- `stars`: `SMALLINT` `NOT NULL` (`1..5`).
- `comment`: `TEXT` nullable (máx. `1,000` chars).
- `rated_by_user_id`: `UUID` `NOT NULL`.
- `rated_by_name`: `VARCHAR(160)` `NOT NULL`.
- `created_at`: `TIMESTAMPTZ` `NOT NULL`.

### 7.3 Nueva tabla `cell_contact_addresses` (en `pg-cell-XX`)
- `id`: `UUID` PK.
- `client_id`: `UUID` `NOT NULL`, RLS `app.current_client_id`.
- `contact_id`: `UUID` FK → `cell_contacts.id` (`ON DELETE CASCADE`).
- `label`: `VARCHAR(80)` `NOT NULL` (ej. «Casa», «Oficina», «Principal»).
- `country`: `VARCHAR(64)` `NOT NULL`, default `'Colombia'`.
- `state`: `VARCHAR(120)` nullable.
- `city`: `VARCHAR(120)` `NOT NULL`.
- `address_line`: `TEXT` `NOT NULL`.
- `neighborhood`: `VARCHAR(120)` nullable.
- `postal_code`: `VARCHAR(32)` nullable.
- `reference_notes`: `TEXT` nullable.
- `is_default`: `BOOLEAN` `NOT NULL`, default `false` (índice único parcial por `contact_id` `WHERE is_default = true`).
- `created_at`, `updated_at`: `TIMESTAMPTZ`.

---

## 8. Reglas de negocio

- **RN-SPEC-09-01 (Cálculo determinista de ventana de 24 horas de WhatsApp `CRM-03`):**
  - La ventana se considera **Activa** si `last_inbound_message_at IS NOT NULL` y `(NOW() - last_inbound_message_at) < INTERVAL '24 hours'`.
  - Se calcula `remainingSeconds = Math.max(0, Math.floor((last_inbound + 24h - NOW()) / 1000))`.
  - Si `last_inbound_message_at` es nulo o han pasado `>= 24 horas`, el estado es **Expirada** (o **Sin Mensajes Entrantes**) y la UI advierte claramente que un contacto por WhatsApp requiere plantilla aprobada o esperar respuesta del cliente.
- **RN-SPEC-09-02 (Trazabilidad histórica de calificaciones `CRM-02`):** Toda calificación asignada (`1..5` estrellas y comentario opcional) inserta un registro inmutable en `cell_contact_ratings` y actualiza simultáneamente `current_rating_stars` y `current_rating_comment` en `cell_contacts` para ordenamiento y filtrado rápido. No se sobrescriben calificaciones históricas anteriores.
- **RN-SPEC-09-03 (Invariante de dirección principal única `CRM-04`):** Si un contacto posee al menos una dirección en `cell_contact_addresses`, exactamente una debe estar marcada con `is_default = true`. Al crear la primera dirección, se asigna automáticamente como predeterminada; al marcar otra como predeterminada, la anterior pasa a `false` dentro de la misma transacción, sincronizando además `country`, `state`, `city`, `address_line` y `postal_code` hacia `cell_contacts` por compatibilidad.
- **RN-SPEC-09-04 (Prospección y conversión de etapa con cumplimiento de datos `CRM-05`):**
  - Todo contacto nuevo inicia en etapa `new` (o `customer` únicamente si proviene directamente de la creación de un pedido confirmado en `SPEC-11`).
  - Al promover un prospecto a `customer`, se registra `converted_to_customer_at` (si no existía previamente) y se conserva la fuente de origen (`source`: `whatsapp`, `web`, `referral`, `manual`, etc.).
  - Al registrar/capturar un prospecto manual desde prospección comercial, puede registrarse simultáneamente el estado de consentimiento de tratamiento de datos (`cell_prospect_consents`) sin inventar aceptaciones falsas si el cliente aún no ha otorgado consentimiento.
- **RN-SPEC-09-05 (Validación de cuotas de contactos según plan `SPEC-03`):** Crear un contacto nuevo valida `contacts` del plan activo en `TenantCapabilityGateService` cuando sea `LIMITED`.
- **RN-SPEC-09-06 (Eliminación segura):** Eliminar un contacto aplica borrado lógico (`deleted_at = NOW()`), nunca cascada destructiva sobre pedidos existentes, y requiere confirmación explícita en modal `--dsn-*` (exclusivo para `tenancy_owner`).

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/contacts` y `POST /api/tenant/contacts`
- `GET`: Soporta filtros `?q=&stage=&whatsappWindow=active|expired|none&minRating=1..5&source=&page=1&limit=20&sort=`. Devuelve lista paginada incluyendo `whatsappWindowStatus` calculado en tiempo real, `currentRatingStars` y `defaultAddressSummary`.
- `POST`: Valida Zod (`fullName`, `phoneMobile`, `phoneSecondary`, `email`, `companyName`, `birthDate`, dirección inicial opcional, consentimiento opcional) y cuota del plan.

### 9.2 `GET / PATCH / DELETE /api/tenant/contacts/[id]` [Nuevo / Extensión]
- `GET`: Retorna ficha completa del contacto, estado exacto de ventana 24h (`{ status: 'active' | 'expired' | 'none', expiresAt, remainingSeconds }`), arreglo `addresses[]`, arreglo `ratingsHistory[]`, consentimientos registrados y resumen de últimos pedidos.
- `PATCH`: Actualiza ficha completa incluyendo empresa, cumpleaños y teléfono secundario.
- `DELETE`: Exclusivo `tenancy_owner`; eliminación lógica verificando pertenencia al `clientId`.

### 9.3 Subrecursos nuevos
- `POST /api/tenant/contacts/[id]/ratings`: `{ stars: 1..5, comment?: string }` → inserta historial y actualiza cabecera.
- `GET / POST /api/tenant/contacts/[id]/addresses` y `PATCH / DELETE /api/tenant/contacts/[id]/addresses/[addressId]`: CRUD de múltiples direcciones + flag `isDefault`.
- `PATCH /api/tenant/contacts/[id]/stage`: `{ stage: 'new' | 'in_conversation' | 'qualified' | 'customer' | 'discarded', notes?: string }`.

---

## 10. Especificación de UI/UX

- **Vista `/workspace/contacts` (`contacts-view.tsx`):**
  - Título limpio «Contactos Y Clientes» (`SPEC-01`).
  - Barra de filtros y búsqueda con indicador de cuota `Usado / Límite` del plan (`SPEC-03`), paginación y ordenamiento (`SPEC-17`).
  - Columnas claras: Nombre y Empresa, Teléfono Principal / Secundario, Etapa (badge de color semántico), **Ventana WhatsApp 24h** (badge verde con tiempo restante exacto «18h 20m» o badge neutro «Ventana Expirada» / «Sin Mensajes»), **Calificación** (estrellas 1–5), Ciudad Principal, Acciones (**Ver / Editar**, **Calificar**, **Direcciones**, **Eliminar** solo owner).
- **Modal / Drawer «Ficha Del Contacto» (Ver y Editar):**
  - Pestaña 1 **Datos Generales**: Nombre Completo, Empresa, Tipo y Número De Documento, Teléfono Principal, Teléfono Secundario, Correo Electrónico, Fecha De Cumpleaños, Idioma Preferido, Etapa De Prospección y Notas.
  - Pestaña 2 **Direcciones De Envío**: Lista de direcciones del cliente con badge «Predeterminada», formulario para añadir/editar múltiples direcciones («Etiqueta Ej. Oficina», País, Departamento/Estado, Ciudad, Dirección, Barrio, Código Postal, Referencias) y botón «Marcar Como Predeterminada».
  - Pestaña 3 **Calificación E Historial**: Selector interactivo de 1 a 5 estrellas, campo «Comentario De Calificación», botón «Guardar Calificación» e historial cronológico debajo (quién calificó, fecha, estrellas y comentario).
  - Pestaña 4 **Consentimiento Y Atención**: Estado de ventana WhatsApp 24h con explicación clara para el operador y estado de autorización de datos Ley 1581.
- Todos los labels en **Title Case**, Mobile First, i18n `es`/`en` y modales `--dsn-*` sin `window.confirm`.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: CRM completo con calificación, ventana WhatsApp 24h, direcciones y prospección

  Escenario: Webhook entrante de Chatwoot activa la ventana de 24 horas en el CRM
    Dado que el contacto "Laura Gómez" no tenía mensajes recientes en "cell_contacts"
    Cuando ingresa un mensaje entrante del cliente desde Chatwoot hace 2 horas
    Entonces "last_inbound_message_at" se actualiza y GET "/api/tenant/contacts" calcula ventana "active" con "22h 00m" restantes
    Y la tabla CRM muestra badge verde "Activa · 22h"

  Escenario: Operador agrega múltiples direcciones y cambia la dirección predeterminada
    Dado que "Laura Gómez" tiene registrada la dirección "Casa" como predeterminada
    Cuando el operador agrega una segunda dirección "Oficina" en Medellín y la marca como predeterminada
    Entonces "cell_contact_addresses" garantiza que únicamente "Oficina" tenga "is_default = true"
    Y al abrir la creación de pedidos para "Laura Gómez" ambas direcciones aparecen seleccionables con "Oficina" preseleccionada

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
  Escenario: Eliminación de la dirección predeterminada promueve automáticamente otra existente o exige orden
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
  Escenario: Expiración exacta de la ventana de 24 horas sin mensajes nuevos
    Dado que "last_inbound_message_at" ocurrió hace 24 horas y 1 minuto
    Cuando el agente consulta el contacto en CRM
    Entonces el estado calculado es "expired" con "remainingSeconds = 0" y la UI indica que la ventana de atención libre finalizó
```

---

## 12. Requisitos no funcionales

- **Rendimiento:** Cálculo de ventana 24h en memoria/SQL sin llamadas HTTP síncronas externas a Chatwoot al listar la tabla de CRM.
- **Integridad y aislamiento:** Todas las tablas nuevas (`cell_contact_ratings`, `cell_contact_addresses`) heredan `client_id` + política RLS `app.current_client_id`.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.crm.contact_rated`, `tenant.crm.stage_changed`, `tenant.crm.whatsapp_window_refreshed` con `requestId` y `clientId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-03` (cuota de `contacts`), `SPEC-11` (consumo de `cell_contact_addresses` al crear pedidos), `SPEC-13` / webhooks de Chatwoot (actualización de `last_inbound_message_at`).
- **Riesgos:**
  - *Desfase horario en cálculo de ventana 24h:* Mitigado almacenando y operando estrictamente en UTC (`TIMESTAMPTZ` + comparación servidor PostgreSQL/Node UTC).

---

## 14. Definition of Done

- [ ] Nuevas columnas en `cell_contacts` + tablas `cell_contact_ratings` y `cell_contact_addresses` migradas en celda con RLS.
- [ ] Actualización automática de `last_inbound_message_at` desde el webhook de mensajes entrantes de Chatwoot.
- [ ] Endpoints `/api/tenant/contacts*` (incluyendo `[id]`, `/ratings`, `/addresses`, `/stage`) con validación Zod, `handle()` RFC 9457, RBAC y tests de integración.
- [ ] Vista `/workspace/contacts` con ficha modal Ver/Editar completa, estrellas + historial, múltiples direcciones, indicador ventana 24h y embudo de prospección (`es`/`en`, Title Case, Mobile First, modales `--dsn-*`).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todas las decisiones sobre campos ampliados de contacto y calificación histórica (`PV-02`) fueron aprobadas por el usuario. Sin preguntas pendientes.

