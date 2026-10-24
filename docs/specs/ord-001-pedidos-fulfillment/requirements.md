# ORD-001 · Requisitos · Pedidos y fulfillment

| Atributo | Valor |
|---|---|
| ID | ORD-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md) · [BOT-002](../bot-002-motor-atencion-prompts/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [REP-001](../rep-001-informes-dashboards/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Borrador |

## 1. Propósito

Modelar el pedido como objeto de negocio del inquilino: registro desde el bot o manual, ítems con precio congelado, pago, envío, transportadora, estados y devoluciones. Es el destino del contrato `registrar_pedido` de BOT-002 y la fuente de las métricas de venta de REP-001.

## 2. Requisitos de origen (decisión del usuario)

- «O-01: ¿orders se modela en ADM-001 o en una spec de pedidos? una nueva spec.»
- «si continua con el tema de pedidos»

## 3. Requisitos funcionales

### RF-01 · Registro del pedido

| ID | Requisito |
|---|---|
| RF-01.1 | El pedido se crea desde el bot mediante `registrar_pedido` (BOT-002) o manualmente desde el panel por el `tenant_owner`/`tenant_agent`. |
| RF-01.2 | `registrar_pedido` es **idempotente por conversación**: una conversación activa no genera dos pedidos; el reintento devuelve el pedido existente. |
| RF-01.3 | Todo pedido nace con número legible único por inquilino (`ORD-AAAAAM-####`) y guarda su origen (`bot` o `manual`). |
| RF-01.4 | El pedido se vincula al prospecto (CRM-001) por `prospect_id` y a la conversación de Chatwoot por referencia externa, sin FK entre planos. |

### RF-02 · Estados y transiciones

| ID | Requisito |
|---|---|
| RF-02.1 | Estados del pedido: `registered` → `confirmed` → `preparing` → `shipped` → `delivered`; salidas `cancelled` (antes de `shipped`) y `returned` (desde `delivered`). |
| RF-02.2 | Cada transición valida el estado origen, registra actor, fecha y motivo, y es inmutable en el historial (`order_events`). |
| RF-02.3 | Una transición inválida se rechaza con mensaje explícito y no altera el pedido. |
| RF-02.4 | `registered` aplica la etiqueta `compra-realizada` y pasa el prospecto a `customer` (CRM-001). |

### RF-03 · Ítems, precios y totales

| ID | Requisito |
|---|---|
| RF-03.1 | El pedido guarda **snapshot** de cada ítem: producto, nombre, SKU, cantidad, precio unitario aplicado y total de línea; los cambios posteriores del catálogo no alteran el pedido. |
| RF-03.2 | El precio unitario respeta el escalón de `product_price_tiers` según la cantidad; si no hay escalón, usa el precio del producto. |
| RF-03.3 | Totales en centavos: `subtotal + envío - descuento = total`, sin valores negativos; la moneda es la del inquilino (`clients.currency`). |

### RF-04 · Pago

| ID | Requisito |
|---|---|
| RF-04.1 | El método de pago se toma del contexto del negocio (ADM-001 `client_business_info.payment_methods`) y se guarda como snapshot en el pedido. |
| RF-04.2 | Estado de pago independiente del estado del pedido: `pending`, `paid`, `refunded`, `failed`. Contra entrega nace `pending`. |
| RF-04.3 | Un pedido `cancelled` con pago `paid` exige registrar el reembolso antes de cerrar la cancelación. |

### RF-05 · Envío y transportadoras

| ID | Requisito |
|---|---|
| RF-05.1 | Método de envío: `home` (domicilio) u `office` (oficina de transportadora); `office` exige documento del cliente. |
| RF-05.2 | La transportadora la elige **siempre el inquilino, manualmente**, entre las admitidas (`shipping_carriers`) o queda pendiente; se guarda snapshot del nombre y un `tracking_code` opcional. |
| RF-05.3 | Los datos de envío (nombre, teléfono, documento, dirección, ciudad, departamento) viven en el pedido, no en el prospecto. |
| RF-05.4 | **Costo de envío:** la política de envío del negocio es la primera fuente de verdad y el producto tiene su indicador de envío gratis. Es gratis solo si **ambas** condiciones coinciden; en caso contrario se aplica `products.shipping_cost_cents` (o el costo por defecto de la política si el producto no define uno). El monto aplicado se guarda en el pedido. |

### RF-06 · Devoluciones

| ID | Requisito |
|---|---|
| RF-06.1 | Una devolución registra motivo, monto, estado (`requested`/`approved`/`received`/`refunded`) y actor; el pedido pasa a `returned` cuando se recibe. |
| RF-06.2 | La devolución no edita el pedido original: agrega eventos y deja trazas. |

### RF-07 · Integraciones

| ID | Requisito |
|---|---|
| RF-07.1 | El registro del pedido aplica `compra-realizada` (ADM-001 `tenant_labels`) y actualiza el prospecto (CRM-001) en la misma operación lógica. |
| RF-07.2 | REP-001 consume pedidos y devoluciones para ventas, conversión y ticket promedio. |
| RF-07.3 | Los avisos de pedido nuevo al inquilino se emiten por el canal configurado; nunca incluyen datos de pago sensibles. |

### RF-08 · Seguridad, roles y auditoría

| ID | Requisito |
|---|---|
| RF-08.1 | `tenant_owner` y `tenant_agent` gestionan pedidos de su inquilino; el acceso de plataforma es break-glass auditado. |
| RF-08.2 | Toda tabla cumple la auditoría global (DAT-001 RF-10.9); los logs no contienen dirección, documento ni teléfono. |
| RF-08.3 | La UI de pedidos cumple la directiva de i18n (es/en) y el sistema de diseño DSN-001 (tablas con paginación, filtros y ordenamiento). |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | El pedido se crea en `registered` al completar los datos; el pago y el envío tienen estados propios. | El bot no bloquea la venta esperando pago. |
| D-02 | Snapshot de ítems y precios en el pedido. | Los cambios de catálogo no alteran ventas históricas. |
| D-03 | Idempotencia por conversación activa. | Elimina pedidos duplicados por reintentos del bot. |
| D-04 | Historial append-only de transiciones. | Auditoría y métricas confiables. |
| D-05 | Devolución mínima (motivo + estado), sin logística inversa. | Se resuelve la operación; el RMA completo queda para otra iteración. |
| D-06 | La confirmación del pedido la hace **el inquilino manualmente**; no hay regla automática. | El inquilino controla qué pedidos acepta. |
| D-07 | La transportadora la elige **siempre el inquilino, manualmente**, entre las admitidas. | Sin reglas por ciudad en esta versión. |
| D-08 | **Regla de envío:** la política del negocio es la primera fuente de verdad y el producto tiene su propio indicador de envío gratis. Solo es gratis cuando **ambas** condiciones coinciden; si no, se aplica el costo de envío definido en el producto (con el costo por defecto de la política como respaldo). | Una sola regla determinista, sin ambigüedad para el bot. |

## 5. Decisiones abiertas

No quedan decisiones abiertas.

Resueltas: O-01 → confirmación manual del inquilino (D-06); O-02 → transportadora manual (D-07); O-03 → regla política + producto (D-08); O-04 → fuera de ORD-001, se cubre en la spec de facturación SaaS (`BILL-001`).

## 6. Fuera de alcance

Facturación electrónica, logística inversa completa, integración con pasarelas de pago en línea, inventario/stock y comisiones.

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| BOT-002 | `registrar_pedido` implementa el contrato definido aquí. |
| CRM-001 | Prospecto → `customer`; etiqueta `compra-realizada`. |
| ADM-001 | Consume `product_price_tiers`, `shipping_carriers`, `client_business_info`, `clients.currency`. |
| REP-001 | Ventas, conversión, ticket promedio y devoluciones. |
| DSN-001 | Vista de pedidos con la tabla estándar. |

## 8. Trazabilidad

- L1 (2026-10-23): «O-01: ¿orders se modela en ADM-001 o en una spec de pedidos? una nueva spec.»
- L2 (2026-10-23): «si continua con el tema de pedidos.»
- L3 (2026-10-23): decisiones del usuario: O-01 confirmación **manual del inquilino**; O-02 transportadora **manual**; O-03 envío gratis solo si coinciden la **política del negocio** y el **indicador de envío gratis del producto**; en caso contrario se aplica el costo de envío del producto. O-04 (facturación electrónica) queda fuera de ORD-001 y se planifica en `BILL-001`.
