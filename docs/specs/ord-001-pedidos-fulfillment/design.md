# ORD-001 · Diseño · Pedidos y fulfillment

| Atributo | Valor |
|---|---|
| ID | ORD-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/design.md) · [BOT-002](../bot-002-motor-atencion-prompts/design.md). REP-001 consume las métricas de pedidos; no es una dependencia de ORD-001. |
| Estado | Aprobada |

## 1. Principios

1. **El pedido es un snapshot.** Precios, nombres y datos de envío quedan congelados al registrar.
2. **Estados explícitos, historial inmutable.** Cada transición deja evento con actor y motivo.
3. **Idempotente por conversación.** El bot puede reintentar sin duplicar.
4. **Pago y envío no bloquean la venta.** Tienen estados propios.
5. **Sin PII en logs.** Dirección, documento y teléfono viven solo en la base.

## 2. Arquitectura

```text
BOT-002 (registrar_pedido) ──┐
Panel (alta manual) ─────────┼──► Servicio de pedidos (celda, RLS)
                              │       ├─ orders (snapshot)
                              │       ├─ order_items
                              │       ├─ order_events (append-only)
                              │       └─ order_returns
                              ├─► tenant_labels: compra-realizada
                              ├─► CRM-001: prospecto → customer
                              ├─► REP-001: métricas de venta
                              └─► Aviso al inquilino
```

## 3. Modelo de datos (celda, schema `admin`, RLS)

### 3.1 `orders`

| Atributo | Regla |
|---|---|
| `client_id` + `id` | PK compuesta, RLS |
| `number` | Único por inquilino; `ORD-AAAAAM-####` |
| `prospect_id` | FK local a `prospects`, nullable (pedido manual sin prospecto) |
| `chatwoot_conversation_id` | Referencia externa; único con estado activo para idempotencia |
| `source` | `bot` o `manual` |
| `status` | `registered`/`confirmed`/`preparing`/`shipped`/`delivered`/`cancelled`/`returned` |
| `payment_method` | Snapshot del método (contra entrega, transferencia, …) |
| `payment_status` | `pending`/`paid`/`refunded`/`failed` |
| `shipping_method` | `home` u `office` |
| `carrier_id` + `carrier_name` | FK local a `shipping_carriers` + snapshot del nombre |
| `tracking_code` | Nullable |
| `customer_name`, `customer_phone`, `customer_document` | Datos del envío (documento obligatorio en `office`) |
| `address_line`, `city`, `state`, `postal_code` | Datos del envío |
| `subtotal_cents`, `shipping_cents`, `discount_cents`, `total_cents` | Enteros ≥ 0; `currency` = `clients.currency` |
| `notes` | Texto libre del inquilino |
| Auditoría | Columnas de la directiva (RF-10.9) |

### 3.2 `order_items`

| Atributo | Regla |
|---|---|
| `id` | PK |
| `order_id` | FK a `orders` |
| `product_id` | Referencia local, nullable si el producto se archiva |
| `product_name`, `product_sku` | Snapshot |
| `quantity` | > 0 |
| `unit_price_cents` | Precio del escalón aplicado o del producto |
| `tier_min_qty` | Escalón usado (nullable) |
| `line_total_cents` | `quantity × unit_price_cents` |

### 3.3 `order_events`

| Atributo | Regla |
|---|---|
| `id` | PK |
| `order_id` | FK |
| `from_status` · `to_status` | Estados de la máquina |
| `actor` | Usuario, `bot` o `system` |
| `reason` | Nullable |
| `created_at` | Inmutable; append-only |

### 3.4 `order_returns`

| Atributo | Regla |
|---|---|
| `id` | PK |
| `order_id` | FK |
| `reason` | Texto |
| `amount_cents` | ≥ 0 |
| `status` | `requested`/`approved`/`received`/`refunded` |
| `actor` | Usuario o `system` |
| Auditoría | Columnas de la directiva |

## 4. Máquina de estados

| Desde | Hacia | Regla |
|---|---|---|
| `registered` | `confirmed` | El inquilino confirma manualmente (D-06) |
| `confirmed` | `preparing` | Inicia preparación |
| `preparing` | `shipped` | Requiere transportadora y tracking opcional |
| `shipped` | `delivered` | Confirmación de entrega |
| `registered`/`confirmed`/`preparing` | `cancelled` | Motivo obligatorio; si `payment_status = paid`, exige reembolso |
| `delivered` | `returned` | Devolución `received`; genera evento |

Toda transición inserta `order_events`; una transición inválida se rechaza con error explícito.

## 5. Registro e idempotencia

`registrar_pedido` (BOT-002) llama al servicio con `client_id`, conversación, ítems y datos. En una transacción: busca un pedido activo para esa conversación; si existe, lo devuelve; si no, calcula precios por escalón, congela snapshots, crea `orders` + `order_items`, inserta `registered`, aplica `compra-realizada` y actualiza el prospecto. Un índice único parcial `(client_id, chatwoot_conversation_id) WHERE status NOT IN ('cancelled','returned')` refuerza la idempotencia ante concurrencia.

## 6. Precios y totales

- El precio unitario se resuelve con `product_price_tiers` por cantidad; si no hay escalón, `products.price_cents`.
- `subtotal = Σ line_total`; `total = subtotal + shipping − discount`; nunca negativo.
- El envío puede ser gratis por política del inquilino (O-03); se guarda `shipping_cents = 0` con la razón en `notes` o política.
- La moneda es la del inquilino al momento del registro y se congela.

## 7. Pago, envío y devoluciones

- **Pago:** contra entrega nace `pending`; transferencia/paid se actualiza manualmente. Cancelar con pago `paid` exige `order_returns` con `refunded` antes de cerrar.
- **Envío:** `office` exige documento; la transportadora la elige siempre el inquilino manualmente (D-07). El costo se resuelve con la regla D-08: gratis solo si la política del negocio y el indicador del producto coinciden; si no, `products.shipping_cost_cents` o el costo por defecto de la política. El monto aplicado queda en `orders.shipping_cents`.
- **Devoluciones:** mínimas (motivo, monto, estado); el pedido pasa a `returned` al recibirse. Sin logística inversa.

## 8. Integraciones

- **CRM-001:** el registro pasa el prospecto a `customer`; la etiqueta `compra-realizada` se aplica en la conversación.
- **REP-001:** pedidos y devoluciones alimentan ventas, conversión y ticket promedio.
- **BOT-002:** el contrato de `registrar_pedido` queda cerrado por esta spec; el motor no conoce las tablas internas.

## 9. Roles y auditoría

`tenant_owner` y `tenant_agent` operan los pedidos de su inquilino; `platform_admin` solo por break-glass auditado. Cada transición y devolución queda en `order_events`/`audit_log`; los logs no incluyen PII.

## 10. Verificación

| Control | Prueba |
|---|---|
| Idempotencia | Dos llamadas con la misma conversación producen un solo pedido |
| Snapshot | Cambiar el precio del producto no altera un pedido existente |
| Escalones | 2 unidades aplican el precio del escalón y el total coincide |
| Estados | Una transición inválida se rechaza y no deja evento |
| Pago | Cancelar con pago `paid` exige reembolso |
| Envío gratis | Solo es 0 cuando política y producto coinciden; si no, se aplica el costo del producto o el de la política |
| Etiquetas | El registro aplica `compra-realizada` y el prospecto pasa a `customer` |
| Reportes | REP-001 refleja el pedido y la devolución |

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Pedido duplicado por reintentos | Índice único parcial + transacción |
| Precio desactualizado | Snapshot al registrar |
| PII en logs | Redacción y auditoría |
| Cancelación con pago hecho | Reembolso obligatorio antes de cerrar |
| Devolución sin trazabilidad | Tabla y eventos inmutables |

## 12. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| BOT-002 | Contrato `registrar_pedido` y flujo de captura |
| CRM-001 | Prospecto, etapa y etiqueta |
| ADM-001 | Productos, escalones, transportadoras, métodos de pago, moneda |
| REP-001 | Métricas de venta y devoluciones |
| DSN-001 | Vista de pedidos con la tabla estándar |
| BILL-001 | Facturación electrónica y pagos de la SaaS (fuera de ORD-001) |
