# SPEC-11 · Pedidos Completo: CRUD Integral, 12 Estados Homologados (Dropi/Effi), Guías PDF y Repetir Pedido

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-11` |
| **Nombre** | Pedidos Completo: CRUD Integral, 12 Estados Homologados Dropi/Effi, Impresión de Guías y Repetir Pedido |
| **Tipo de intervención** | Evolución integral de módulo transaccional (`cell_orders`) |
| **Prioridad** | P0 — Crítica (gestión diaria de ventas, logística, inventario y recompra) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `PED-02`, `PED-04`, `PED-05`, `PED-06` |
| **Specs previas relacionadas** | `ORD-001`, `CRM-001`, `NTF-001` |
| **Specs integradas / dependientes** | `SPEC-01` (terminología «Pedidos» sin jerga), `SPEC-05` (`tenant_payment_channels` seleccionable en pedido), `SPEC-08` (atributos dinámicos, combos, precio/costo y descuento de stock con alerta mínima), `SPEC-09` (selección de contacto + sus múltiples direcciones guardadas), `SPEC-10` (mensajes automáticos de confirmación y despacho), `SPEC-17` (paginación, filtros, ordenamiento estándar) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

La revisión de `packages/domain/src/db/schemas/tenant/orders.ts`, `packages/domain/src/services/orders.service.ts` y `apps/admin/app/api/tenant/orders/[id]/route.ts` evidencia cuatro carencias operativas severas:

1. **CRUD de pedidos incompleto (`PED-02`):**
   - El endpoint `[id]/route.ts` solo soporta `PATCH` exclusivo de estado; no existe endpoint `GET` de detalle ni `PUT` para editar ítems, dirección, método de pago de `tenant_payment_channels`, transportadora, flete o notas (antes del despacho), ni cancelación/anulación formal documentada, ni modal **Ver Pedido** completo con trazabilidad de eventos en la UI (`apps/admin/app/workspace/orders/orders-view.tsx`).
2. **Solo 7 estados genéricos incompatibles con logística e-commerce colombiana (`PED-04`, `PV-04` aprobada):**
   - Actualmente `cell_orders.status` admite únicamente `registered`, `confirmed`, `preparing`, `shipped`, `delivered`, `cancelled`, `returned`. Esto no permite mapear los flujos reales de logística y ERP en Colombia (**Dropi** y **Effi ERP**), donde es indispensable distinguir `pending_confirmation`, `guide_generated`, `dispatched`, `in_transit`, `out_for_delivery`, `delivery_issue` y `return_in_progress`.
3. **Inexistencia de funcionalidad «Repetir Pedido» (`PED-05`):**
   - Cuando un cliente recurrente vuelve a comprar lo mismo o similar, el operador debe recrear todo el pedido desde cero.
4. **Sin generación ni impresión de guía / remisión (`PED-06`):**
   - No existe vista ni archivo descargable/imprimible de **guía / rótulo de envío y resumen de pedido** con datos de remitente (comercio), destinatario, dirección completa, contraentrega / valor a recaudar, número de guía y código de barras/QR operativo.

---

## 4. Objetivo y valor de negocio

Dotar al comercio de un **módulo de gestión de Pedidos de nivel ERP/Dropi-ready**:
- Ciclo completo **Ver / Crear / Editar / Cambiar Estado / Cancelar** integrado con CRM (`SPEC-09`), Canales de Pago (`SPEC-05`) e Inventario/Atributos de Productos (`SPEC-08`).
- Máquina de **12 estados homologados con Dropi & Effi ERP** con validación de transiciones, auditoría en `cell_order_events` e impacto controlado en stock físico.
- Acción en un clic **«Repetir Pedido»** que clona ítems activos recalculando precios actuales y verificando stock disponible.
- Generación inmediata de **Guía / Remisión Imprimible (PDF / vista de impresión térmica y carta)** con los datos logísticos completos.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Adopción oficial de los **12 estados homologados (`PV-04`)** en `cell_orders`, migración de estados previos (`registered` → `pending_confirmation`, `shipped` → `dispatched`), validador de transiciones y etiquetas bilingües (`es`/`en`).
- Actualización de `cell_orders` y `cell_order_items` para soportar: vínculo opcional a `contact_address_id`, `payment_channel_id`, `selected_attributes` (JSONB de atributos dinámicos del producto `SPEC-08`), `unit_cost_cents` (snapshot para cálculo de utilidad real), `guide_generated_at`, `external_erp_reference` / `dropi_order_id` y motivos estructurados de cancelación/novedad.
- Implementación completa en `OrdersService` y `/api/tenant/orders*`:
  - `GET / POST /api/tenant/orders` (búsqueda, filtro por estado, fecha, pago, transportadora, paginación y ordenamiento).
  - `GET / PUT / PATCH /api/tenant/orders/[id]` (detalle con `items`, `events`, `returns`; edición completa permitida antes de `dispatched`; transición de estado con notas y datos de transportadora/guía).
  - `POST /api/tenant/orders/[id]/repeat` (**Repetir Pedido** `PED-05`: genera borrador prellenado para revisión o nuevo pedido en estado `pending_confirmation` verificando disponibilidad y precios vigentes).
  - `GET /api/tenant/orders/[id]/guide` (**Guía / Rótulo PDF o HTML imprimible** `PED-06` en formato carta o etiqueta 10x15cm).
- Descuento de inventario físico en productos (`SPEC-08`) al pasar a estado confirmado/en preparación (`confirmed` / `preparing`) y restitución atómica si se cancela o retorna confirmado a inventario, disparando alerta de stock mínimo cuando aplique (`PRD-08`).
- Rediseño completo de `apps/admin/app/workspace/orders/orders-view.tsx` + modales Ver/Crear/Editar/Cambio de Estado/Guía.

### Fuera de alcance
- Integración API directa en vivo contra Dropi o Effi ERP en esta fase (se deja homologado al 100% el modelo de estados y campos `external_erp_reference` listo para conector futuro).
- Pasarela de pago electrónica dentro del pedido (sigue siendo registro/informe de canal de pago del comercio).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Ver, crear, editar, cambiar estado, generar/imprimir guía, repetir pedido y cancelar | Sí | Solo en su `client_id` |
| `tenancy_users` (`tenant_agent`) | Ver, crear, editar pre-despacho, avanzar estado operativo, imprimir guía y repetir pedido | Sí | Solo en su `client_id` |
| `tenancy_users` (`tenant_agent`) | Cancelar pedido pagado o eliminar registro histórico | No / Limitado | Cancelar pedido ya pagado o emitir devolución monetaria requiere `tenancy_owner` (o validación de permiso); prohibido borrado físico de pedidos emitidos |

---

## 7. Modelo de datos

### 7.1 Los 12 Estados Oficiales Homologados (`PED-04`, `PV-04`)
| Código interno | Etiqueta ES | Etiqueta EN | Mapeo Dropi / Effi |
| --- | --- | --- | --- |
| `pending_confirmation` | Pendiente De Confirmación | Pending Confirmation | Pendiente / Por confirmar |
| `confirmed` | Confirmado | Confirmed | Confirmado (descuenta stock) |
| `preparing` | En Preparación | Preparing | Alistamiento / Bodega |
| `guide_generated` | Guía Generada | Guide Generated | Guía generada / Con rótulo |
| `dispatched` | Despachado | Dispatched | Despachado / Entregado a transportadora |
| `in_transit` | En Tránsito | In Transit | En tránsito / En camino |
| `out_for_delivery` | En Reparto | Out For Delivery | En reparto local |
| `delivery_issue` | Novedad En Entrega | Delivery Issue | Novedad / Dirección errada / Reprogramar |
| `delivered` | Entregado | Delivered | Entregado exitoso |
| `return_in_progress` | Devolución En Curso | Return In Progress | Devolución en tránsito |
| `returned` | Devuelto | Returned | Devuelto en bodega |
| `cancelled` | Cancelado | Cancelled | Cancelado / Anulado |

### 7.2 Extensión de `cell_orders` y `cell_order_items` (`packages/domain/src/db/schemas/tenant/orders.ts`)
- En `cell_orders`:
  - `prospect_id`: `UUID` FK nullable → `cell_contacts.id` (`ON DELETE SET NULL`), conservando el nombre físico existente en celda y exponiendo `contactId` como alias en DTOs y contratos API para retrocompatibilidad con `BotOrderCaptureService` y CRM (`SPEC-09`).
  - `contact_address_id`: `UUID` FK nullable → `cell_contact_addresses.id` (sin perder snapshot textual `address_line`, `city`, `state`, `postal_code` si luego editan el contacto).
  - `payment_channel_id`: `UUID` FK nullable → `tenant_payment_channels.id` (+ snapshot `payment_method`).
  - `stock_deducted`: `BOOLEAN` `NOT NULL`, default `false` (bandera idempotente para nunca descontar doble el inventario).
  - `guide_generated_at`: `TIMESTAMPTZ` nullable.
  - `cancellation_reason` / `issue_notes`: `TEXT` nullable.
  - `repeated_from_order_id`: `UUID` nullable (referencia al pedido origen en «Repetir Pedido»).
  - `external_erp_system` / `external_erp_reference`: `TEXT` nullable (campos ACL preparados para sincronización futura con Dropi / Effi ERP).
  - Índice parcial `orders_cw_conversation_active_unique` actualizado a estados activos pre-despacho (`status IN ('pending_confirmation', 'confirmed', 'preparing', 'guide_generated')`).
- En `cell_order_items`:
  - `selected_attributes`: `JSONB` nullable (ej. `{ "Color": "Negro", "Talla": "M" }`).
  - `unit_cost_cents`: `BIGINT` `NOT NULL`, default `0` (snapshot de rentabilidad al momento de vender).
- **`cell_order_events`:** Registra toda creación, edición relevante, repetición de pedido (`repeated_from_order_id`), transición de estado (`from_status`, `to_status`), usuario actor, timestamp y nota logística.
- **Estrategia de eliminación:** Los pedidos **nunca se eliminan físicamente** para preservar consecutivos (`cell_order_sequences`), auditoría contable e inventario; la anulación se realiza mediante transición controlada al estado `cancelled`.

---

## 8. Reglas de negocio

- **RN-SPEC-11-01 (Snapshot inmutable de precios, dirección y canal de pago al vender):** Al crear un pedido, los precios unitarios, costos unitarios, atributos seleccionados, dirección del destinatario y método de pago se copian como snapshot en el pedido e ítems, de modo que cambios futuros en el catálogo o CRM no alteren pedidos históricos.
- **RN-SPEC-11-02 (Grafo flexible operativo de transiciones de los 12 estados):**
  - Todo pedido nace en `pending_confirmation` (o `confirmed` si el comercio lo confirma explícitamente al crearlo manualmente).
  - Se permiten atajos operativos pre-despacho (`pending_confirmation` → `confirmed` | `cancelled`; `confirmed` → `preparing` | `guide_generated` | `dispatched` | `cancelled`; `preparing` → `guide_generated` | `dispatched` | `cancelled`; `guide_generated` → `dispatched` | `cancelled`) asegurando siempre que cualquier paso hacia `preparing`/`guide_generated`/`dispatched` ejecute el descuento idempotente de stock si `stock_deducted = false`.
  - Para transicionar a `guide_generated` o `dispatched`, debe existir al menos dirección de entrega (o método retiro/oficina) y, para `dispatched`, transportadora (`carrierName` o `carrierId`) y código de guía (`trackingCode`) obligatorios.
  - Post-despacho: `dispatched` → `in_transit` | `out_for_delivery` | `delivery_issue` | `delivered` | `return_in_progress`; `in_transit` → `out_for_delivery` | `delivery_issue` | `delivered` | `return_in_progress`; `out_for_delivery` → `delivered` | `delivery_issue` | `return_in_progress`.
  - Desde `delivery_issue` se puede retomar `out_for_delivery`, pasar a `delivered`, o iniciar `return_in_progress`.
  - Desde `delivered` se puede pasar a `return_in_progress` o `returned` (cuando se registra recepción de devolución). Desde `return_in_progress` se puede completar `returned` o `cancelled` (cancelación justificada con retorno de mercancía). `returned` y `cancelled` son estados terminales.
- **RN-SPEC-11-03 (Edición limitada previa al despacho `PED-02`):** Se permite editar ítems, dirección, flete y método de pago únicamente mientras el pedido no haya alcanzado `dispatched` ni estados posteriores (`in_transit`, `out_for_delivery`, `delivered`, `return_in_progress`, `returned`, `cancelled`). Luego del despacho solo se admiten cambios de estado logístico, número de guía/novedades y notas internas.
- **RN-SPEC-11-04 (Sincronización transaccional e idempotente de inventario físico `SPEC-08`):**
  - Cuando un pedido entra por primera vez a `confirmed` (o avanza directo a `preparing`/`guide_generated`/`dispatched` con `stock_deducted = false`), se descuenta `quantity` de `cell_products.stock_quantity` para cada ítem físico (`kind === 'physical'`) —y sus componentes físicos si es `combo`— dentro de `db.transaction` con `SELECT ... FOR UPDATE`. Si el producto tiene `availability === 'in_stock'`, se exige existencia suficiente (error `422 INSUFFICIENT_STOCK`). Si el ítem es digital/servicio, texto libre sin `productId`, o tiene `availability` `preorder`/`backorder`, no bloquea por stock insuficiente (`preorder`/`backorder` descuenta hasta un piso de `0` evitando negativos). Si `stock_deducted = true` y se editan ítems vía `PUT` pre-despacho, se ajusta el delta neto de inventario de forma atómica. Acto seguido se dispara `evaluateLowStockAfterStockMutation` (`PRD-08`) vía `after()`.
  - Si un pedido con `stock_deducted = true` pasa a `cancelled` o `returned`, se restituye el stock y se marca `stock_deducted = false`.
- **RN-SPEC-11-05 (Reglas de «Repetir Pedido» `PED-05`):** Al invocar repetir sobre una orden existente $O$, el sistema lee el catálogo actual:
  - Verifica cuáles productos/variantes de $O$ siguen existiendo y en estado `active`; si alguno fue eliminado o inactivado, los excluye advirtiendo explícitamente al usuario en el detalle (`warnings[]` / `skippedItems[]`).
  - Recalcula precios unitarios usando los **precios vigentes actuales** (no copia precios viejos obsoletos) y prellena cliente, dirección predeterminada actual (o la de $O$) y canal de pago vigente para que el operador confirme y cree el nuevo pedido con nuevo consecutivo (`repeated_from_order_id = O.id`).
- **RN-SPEC-11-06 (Generación de Guía / Remisión imprimible `PED-06`):** Todo pedido con dirección válida (o retiro en oficina) puede generar su guía en formato HTML print-ready (`@page` `100mm 150mm` o `letter`) y PDF binario liviano (`application/pdf`) generado en TypeScript puro sin dependencias externas, incluyendo: logo y datos del comercio remitente (`SPEC-05`), código consecutivo del pedido + código QR de tracking/verificación (reutilizando el codificador ISO 18004 de `BreBQrService`), destinatario, teléfono, ciudad/dirección completa, listado resumido de ítems, valor a recaudar si es contraentrega o «PAGADO» si es prepago, transportadora y número de guía. Al generar por primera vez desde `preparing` puede opcionalmente avanzar a `guide_generated`.
- **RN-SPEC-11-07 (RBAC de cancelación pagada y hook desacoplado de mensajes `SPEC-10`):** Únicamente `tenant_owner` puede cancelar un pedido con `paymentStatus === 'paid'` (exigiendo confirmación de reembolso) o registrar devoluciones monetarias (`403 Forbidden` para `tenant_agent`). Al transicionar a `confirmed`, `dispatched` o `delivery_issue`, un hook desacoplado (`OrderNotificationHook`) renderiza la plantilla correspondiente de `SPEC-10` (`default_messages` en `admin.tenant_bots`) y registra auditoría estructurada sin bloquear la transacción.

---

## 9. Contratos de interfaz

### 9.1 `GET / POST /api/tenant/orders`
- `GET`: `?q=&status=&paymentStatus=&carrier=&dateFrom=&dateTo=&page=1&limit=20&sort=created_at:desc`.
- `POST`: Crea pedido validando contacto, ítems, atributos obligatorios, stock si nace confirmado y canal de pago de `tenant_payment_channels`.

### 9.2 `GET / PUT / PATCH /api/tenant/orders/[id]`
- `GET`: Retorna pedido completo + `items[]` + `events[]` (timeline cronológico) + `returns[]` + transiciones válidas permitidas desde el estado actual (`allowedNextStatuses[]`).
- `PUT`: Edición completa pre-despacho (`items`, dirección, método de pago, flete, descuento, notas) recalculando totales e inventario si aplica.
- `PATCH`: Transición formal de estado `{ status, carrierName?, trackingCode?, notes?, reason? }` registrando evento en `cell_order_events` + ajuste atómico de stock + emisión de mensaje de despacho si corresponde (`SPEC-10`).

### 9.3 `POST /api/tenant/orders/[id]/repeat` [Nuevo]
- Retorna borrador prellenado validado con precios/stock actuales y lista `skippedItems[]` (si hubo productos inactivos), o crea directamente el pedido si `confirmImmediately: true`.

### 9.4 `GET /api/tenant/orders/[id]/guide?format=pdf|html&size=10x15|letter` [Nuevo]
- Genera documento de guía / rótulo listo para imprimir con encabezado de seguridad y validación de aislamiento `clientId`. Actualiza `guide_generated_at` (y opcionalmente registra evento en `cell_order_events`).

---

## 10. Especificación de UI/UX

- **Vista `/workspace/orders` (`orders-view.tsx`):**
  - Barra de métricas rápidas (Pendientes, En Preparación/Guía, En Tránsito/Novedad, Entregados) + tabla paginada, filtrable por cualquiera de los 12 estados homologados y rango de fechas, ordenable (`SPEC-17`).
  - Acciones por fila: **Ver Pedido**, **Editar** (habilitado pre-despacho), **Cambiar Estado**, **Imprimir Guía**, **Repetir Pedido**.
- **Modal «Ver Pedido»:** Encabezado con número de orden + badge del estado actual entre los 12 estados + barra de línea de tiempo logística, tarjeta de Cliente y Dirección, tabla de Productos (con atributos elegidos y costo/margen visible para owner), desglose de totales/flete/pago, historial completo de eventos (`cell_order_events`) y botones rápidos «Imprimir Guía» y «Repetir Pedido».
- **Modal «Crear / Editar Pedido»:** Selector de contacto CRM con autocompletado inmediato de sus **múltiples direcciones (`SPEC-09`)**, buscador de productos activos con selector dinámico de sus **atributos (`SPEC-08`)**, selector de **canales de pago del comercio (`SPEC-05`)**, transportadora y flete.
- **Modal «Cambiar Estado» y «Cancelar Pedido»:** Construidos con modales `--dsn-*` (`AGENTS.md §4.17`); si el destino es `dispatched`, solicita obligatoriamente transportadora y guía; si es `cancelled` o `delivery_issue`, exige motivo claro.
- Todos los labels en **Title Case**, `es`/`en` i18n, Mobile First, cero códigos internos en vistas.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Gestión completa de pedidos, 12 estados Dropi/Effi, guías y repetir pedido

  Escenario: Ciclo completo de 12 estados con descuento e inventario e impresión de guía
    Dado que existe un producto físico "Termo 1L" con stock "10" y umbral mínimo "8"
    Cuando el operador crea un pedido por 3 unidades asociado al contacto "Carlos Ruiz" con su dirección "Oficina" y método "Contraentrega"
    Y lo transiciona a "confirmed" -> "preparing" -> "guide_generated" -> "dispatched" ingresando transportadora "Servientrega" y guía "SRV-998811"
    Entonces el stock vigente del producto desciende idempotente una sola vez a "7" y dispara la alerta de stock mínimo
    Y cada transición queda auditada en "cell_order_events"
    Y GET "/api/tenant/orders/[id]/guide" genera la guía imprimible con el número "SRV-998811", valor contraentrega y datos completos

  Escenario: Repetir pedido clona ítems activos recalculando precios vigentes
    Dado que el pedido "#1001" del cliente "Ana" tuvo el producto P1 a "$50.000" (hoy vale "$55.000" activo) y el producto P2 (hoy inactivo)
    Cuando el operador pulsa "Repetir Pedido" (POST "/api/tenant/orders/1001/repeat")
    Entonces el sistema prepara el nuevo pedido prellenado únicamente con P1 al precio vigente de "$55.000"
    Y advierte explícitamente en la lista "skippedItems" que P2 ya no está activo en catálogo
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de transición a Despachado sin transportadora o número de guía
    Dado que un pedido está en estado "guide_generated"
    Cuando el usuario intenta cambiarlo a "dispatched" enviando "trackingCode" vacío
    Entonces el servidor retorna HTTP 400 Problem Details exigiendo transportadora y número de guía obligatorios
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo de edición de ítems o dirección cuando el pedido ya fue despachado
    Dado que un pedido se encuentra en estado "in_transit"
    Cuando se intenta modificar los productos o la dirección mediante PUT "/api/tenant/orders/[id]"
    Entonces el servidor responde HTTP 422 "ORDER_LOCKED_AFTER_DISPATCH" impidiendo mutar la carga ya enviada

  Escenario: Cancelación de pedido confirmado restituye el inventario descontado
    Dado que un pedido con "stock_deducted = true" había descontado 2 unidades del producto P1
    Cuando el propietario confirma cancelar el pedido (status = "cancelled") con motivo "Cliente desistió antes del despacho"
    Entonces el inventario de P1 aumenta en "+2" unidades y "stock_deducted" vuelve a false
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Aislamiento por inquilino al consultar guía o repetir pedido
    Dado que el pedido O1 pertenece al comercio A
    Cuando el comercio B solicita GET "/api/tenant/orders/O1/guide" o POST "/api/tenant/orders/O1/repeat"
    Entonces el backend responde HTTP 404 Not Found sin exponer información ni generar guía
```

### (e) Escenarios de borde

```gherkin
  Escenario: Prevención de doble descuento de stock ante transiciones repetidas o concurrentes
    Dado que un pedido ya transicionó a "confirmed" con "stock_deducted = true"
    Cuando pasa a "preparing" y "guide_generated" o recibe peticiones concurrentes
    Entonces el stock físico del producto nunca vuelve a descontarse por segunda vez
```

---

## 12. Requisitos no funcionales

- **Concurrencia e integridad:** Uso obligatorio de `db.transaction` con bloqueo pesimista (`FOR UPDATE`) en consecutivo (`cell_order_sequences`), descuento/restitución de stock y verificación de transición válida.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.order.created`, `tenant.order.status_changed`, `tenant.order.repeated`, `tenant.order.guide_generated` con `requestId`, `clientId`, `orderId`, `fromStatus`, `toStatus`.
- **Seguridad (`AGENTS.md §4.14`):** Eliminar captura insegura que exponía `msg` en respuesta `[id]/route.ts` línea 72 usando wrapper `handle()` RFC 9457.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-05` (`tenant_payment_channels`), `SPEC-08` (stock físico + combos + atributos dinámicos), `SPEC-09` (direcciones múltiples de contacto), `SPEC-14` (alerta de stock mínimo al confirmar).
- **Riesgos:**
  - *Estados heredados en comercios existentes:* Mitigado mediante mapeo SQL idempotente en migración de celda (`registered` → `pending_confirmation`, `shipped` → `dispatched`).

---

## 14. Definition of Done

- [x] Esquema `cell_orders` y `cell_order_items` actualizado con los 12 estados homologados, snapshots, `stock_deducted` y migración de datos previos.
- [x] `OrdersService` actualizado con máquina de 12 estados, descuento/reversión idempotente de stock, `repeatOrder` y generación de guía imprimible.
- [x] Endpoints `/api/tenant/orders`, `/[id]` (`GET`/`PUT`/`PATCH`), `/repeat` y `/guide` con Zod, `handle()` RFC 9457 y RBAC.
- [x] UI `/workspace/orders` completa Mobile First (`es`/`en`, Title Case, tabla estándar + modales Ver, Crear/Editar, Cambio de Estado `--dsn-*`, Repetir Pedido e Impresión de Guía).
- [x] `lint`/typecheck de los paquetes afectados, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Decisiones Aprobadas (PV-xx)

Todas las decisiones técnicas y de negocio quedaron validadas por el usuario:
- **`PV-04`:** Adopción de los 12 estados homologados con Dropi y Effi ERP.
- **`PV-11-01` (Grafo flexible operativo):** Cancelación directa permitida desde `pending_confirmation`, `confirmed`, `preparing`, `guide_generated` y `return_in_progress`; `delivery_issue` puede transicionar a `out_for_delivery`, `delivered` o `return_in_progress`; atajos pre-despacho permitidos garantizando descuento de stock y exigiendo `carrierName` + `trackingCode` al pasar a `dispatched`.
- **`PV-11-02` (Esquema y unificación):** Se conserva la columna física `prospect_id` en `cell_orders` (con FK opcional a `admin.contacts` y alias `contactId` en API/DTOs), se añaden `external_erp_system` / `external_erp_reference`, y `TenantWorkspaceService` delega el módulo de pedidos en `OrdersService`.
- **`PV-11-03` (Reglas de stock):** Validación estricta `INSUFFICIENT_STOCK` solo para productos `kind === 'physical'` con `availability === 'in_stock'` (y componentes físicos de `combo`); `preorder`/`backorder` no bloquean y se acotan a piso `0`; digitales/servicios e ítems libres sin `productId` no descuentan inventario; edición `PUT` pre-despacho ajusta deltas si `stock_deducted = true`.
- **`PV-11-04` (Guías HTML + PDF puro):** `format=html` print-ready (`@page`) + `format=pdf` mediante generador PDF 1.4 puro en TypeScript sin dependencias externas, reutilizando el codificador QR ISO/IEC 18004 de `BreBQrService`.
- **`PV-11-05` (RBAC y hook `SPEC-10`):** Cancelar pedido pagado o registrar devolución monetaria restringido a `tenant_owner`; hook desacoplado `OrderNotificationHook` renderiza plantillas de `SPEC-10` y audita sin bloquear la transición.

