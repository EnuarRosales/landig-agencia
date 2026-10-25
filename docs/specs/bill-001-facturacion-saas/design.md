# BILL-001 · Diseño · Facturación SaaS, pagos y comprobantes

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 1.3 (Aprobada — payment_methods, prorrateo y créditos) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [REP-001](../rep-001-informes-dashboards/design.md) |
| Estado | Aprobada |

## 1. Principios de Diseño

1. **Custodia delegada en pasarelas:** Mocter nunca almacena datos sensibles de tarjetas (PAN/CVV); delega la captura y tokenización a Wompi y Stripe.
2. **Procesamiento de webhooks idempotente:** Toda transacción se valida criptográficamente y es tolerante a entregas duplicadas.
3. **Preparación DIAN sin fricción inmediata:** Se capturan los datos fiscales bajo la especificación de Matías API, pero se emiten comprobantes internos en PDF y Excel para no bloquear el lanzamiento comercial.
4. **Visibilidad contable para ambos actores:** Tanto el inquilino como el superadmin de la SaaS tienen acceso al registro de pagos y su exportación en Excel y PDF.

## 2. Arquitectura de Integración

```mermaid
flowchart TD
    subgraph Frontend / Checkout
        UI[Panel Inquilino / Checkout] -->|Tokeniza COP| WompiJS[Wompi Widget / Web Checkout]
        UI -->|Tokeniza USD| StripeElements[Stripe Elements]
    end

    subgraph Pasarelas de Pago
        WompiJS --> WompiAPI[Wompi API]
        StripeElements --> StripeAPI[Stripe API]
    end

    subgraph Router Global / mocter-admin
        WompiAPI -->|Webhook transaction.updated| WH_Wompi[/api/webhooks/wompi]
        StripeAPI -->|Webhook payment_intent.succeeded| WH_Stripe[/api/webhooks/stripe]

        WH_Wompi --> Validator[Verificador de Firma HMAC & Idempotencia]
        WH_Stripe --> Validator

        Validator --> BillingEngine[Motor de Cobro & Suscripciones]
        BillingEngine --> DB[(PostgreSQL Router Global)]

        BillingEngine --> ReceiptService[Servicio de Comprobantes]
        ReceiptService --> EmailWorker[Despacho de Correo Asíncrono]
        ReceiptService --> Exporters[Exportador Excel & PDF]
    end
```

## 3. Modelo de Datos (Router Global, schema `admin`)

### 3.1 `client_billing_profiles` (Datos fiscales Matías API)
| Columna | Tipo | Regla |
|---|---|---|
| `client_id` | `uuid` PK | FK a `clients.id` |
| `identity_document_id` | `integer` | 3 = CC, 6 = NIT, etc. (según catálogo Matías API) |
| `dni` | `varchar(32)` | Número de identificación o NIT con DV |
| `company_name` | `varchar(255)` | Razón social o nombres y apellidos |
| `email` | `varchar(255)` | Correo oficial de facturación |
| `address` | `varchar(255)` | Dirección fiscal (opcional) |
| `city_code` | `varchar(16)` | Código DANE de municipio (opcional) |
| `updated_at` | `timestamptz` | Auditoría |

### 3.2 `payment_methods`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id` |
| `gateway` | `varchar(16)` | `wompi` o `stripe` |
| `gateway_customer_id` | `varchar(255)` | Token de cliente de la pasarela |
| `gateway_payment_method_id` | `varchar(255)` | Token de método; nunca PAN/CVV |
| `brand` | `varchar(32)` | Marca de la tarjeta o método |
| `last4` | `char(4)` | Últimos 4 dígitos |
| `is_default` | `boolean` | Método por defecto del inquilino |
| `status` | `varchar(16)` | `active`/`inactive` |
| Auditoría | — | `created_at`, `updated_at`, `created_by`, `updated_by` |

Único `(client_id, gateway, gateway_payment_method_id)`. Solo puede haber un `is_default = true` por cliente (índice parcial).

### 3.3 `subscriptions`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id`, único por inquilino |
| `plan_id` | `uuid` | FK a `plans.id` (UUID); el slug público vive en `plans.code` |
| `status` | `varchar(32)` | `trialing`, `active`, `past_due`, `suspended`, `cancelled` |
| `cycle` | `varchar(16)` | `monthly`, `annual` |
| `trial_ends_at` | `timestamptz` | Fecha de expiración del trial |
| `current_period_start` | `timestamptz` | Inicio del ciclo vigente |
| `current_period_end` | `timestamptz` | Fin del ciclo vigente |
| `gateway` | `varchar(16)` | `wompi` o `stripe` |

### 3.4 `invoices`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id` |
| `invoice_number` | `varchar(32)` | Consecutivo interno (ej. `INV-2026-00001`) |
| `status` | `varchar(32)` | `draft`, `issued`, `paid`, `past_due`, `void` |
| `subtotal_cents` | `bigint` | Monto neto en centavos |
| `tax_cents` | `bigint` | 0 en v1 (sin retenciones ni IVA) |
| `credit_cents` | `bigint` | Créditos de referidos aplicados; default 0 |
| `applied_referral_credit_id` | `uuid` | FK nullable a `referral_rewards.id`; crédito redimido en esta factura |
| `proration_cents` | `bigint` | Neto de prorrateo; positivo cobra, negativo acredita; default 0 |
| `total_cents` | `bigint` | `subtotal_cents + tax_cents - credit_cents + proration_cents`; nunca negativo |
| `currency` | `varchar(3)` | `COP` o `USD` |
| `due_at` | `timestamptz` | Fecha límite de pago |
| `paid_at` | `timestamptz` | Fecha de pago efectivo |

### 3.5 `payments`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id` |
| `invoice_id` | `uuid` | FK a `invoices.id` |
| `gateway` | `varchar(16)` | `wompi` o `stripe` |
| `gateway_reference` | `varchar(255)` | ID único de transacción de la pasarela (clave idempotencia) |
| `amount_cents` | `bigint` | Monto pagado |
| `currency` | `varchar(3)` | `COP` o `USD` |
| `status` | `varchar(32)` | `pending`, `approved`, `rejected`, `refunded` |
| `created_at` | `timestamptz` | Fecha de registro |

### 3.6 `payment_receipts`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `payment_id` | `uuid` | FK a `payments.id`, único |
| `receipt_number` | `varchar(32)` | Consecutivo de comprobante (ej. `REC-2026-00001`) |
| `pdf_url` | `varchar(512)` | Ruta al archivo generado en almacenamiento |
| `emailed_to` | `varchar(255)` | Correo donde se remitió el comprobante |
| `emailed_at` | `timestamptz` | Fecha y hora del envío de correo |
| `created_at` | `timestamptz` | Fecha de emisión |

### 3.7 `subscription_changes`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `subscription_id` | `uuid` | FK a `subscriptions.id` |
| `from_plan_id` | `uuid` | FK a `plans.id` |
| `to_plan_id` | `uuid` | FK a `plans.id` |
| `effective_at` | `timestamptz` | Momento del cambio |
| `remaining_days` | `integer` | Días restantes del ciclo al cambiar |
| `credit_cents` | `bigint` | Crédito por el plan anterior |
| `charge_cents` | `bigint` | Cobro por el plan nuevo |
| `net_cents` | `bigint` | `charge_cents - credit_cents`; positivo cobra, negativo acredita |
| `invoice_id` | `uuid` nullable | Factura donde se aplicó el neto |
| `status` | `varchar(16)` | `pending`/`applied`/`void` |
| Auditoría | — | `created_at`, `created_by` |

---

## 4. Protocolos de Webhooks e Idempotencia

### 4.1 Webhook Wompi (`/api/webhooks/wompi`)
1. **Validación de Checksum:**
   Wompi envía en el payload la propiedad `signature.checksum` y las propiedades firmadas en `signature.properties`. El servidor concatena los valores en el orden indicado, agrega el secreto de eventos (`WOMPI_EVENTS_SECRET`) y calcula el hash `SHA256`. Si no coincide, rechaza con HTTP 401.
2. **Idempotencia:**
   Se busca en `payments` por `gateway_reference = payload.data.transaction.id`. Si ya existe con estado `approved`, se retorna HTTP 200 inmediatamente sin reprocesar.
3. **Transición:**
   Si el estado es `APPROVED`, se marca la factura como `paid`, la suscripción como `active`, se genera `payment_receipts` y se encola el email.

### 4.2 Webhook Stripe (`/api/webhooks/stripe`)
1. **Validación de Firma:**
   Se extrae la cabecera `Stripe-Signature` y se invoca `stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET)`.
2. **Idempotencia:**
   Se utiliza `payment_intent.id` como `gateway_reference`. Si ya existe registrado, se retorna HTTP 200 sin duplicar.
3. **Transición:**
   En el evento `payment_intent.succeeded`, se actualiza la factura a `paid`, se asocia el comprobante y se reactiva el servicio.

### 4.3 Aplicación de créditos de referidos
1. Al emitir la factura, se consultan en REF-001 los créditos `available`/`partially_redeemed` del `client_id`, ordenados por `expires_at` ascendente.
2. Se imputan hasta cubrir `subtotal_cents + tax_cents`; se guarda `credit_cents` y el `applied_referral_credit_id` del último crédito aplicado (si hay varios, se registra cada aplicación en REF-001).
3. Cada aplicación descuenta `remaining_cents` en REF-001. Si llega a cero, el crédito pasa a `redeemed`; si queda saldo, pasa a `partially_redeemed` hasta `expires_at`.
4. Si `total_cents` queda en cero, la factura se marca `pagada` sin llamar a la pasarela y se emite el comprobante con la referencia del crédito.
5. La aplicación es idempotente: reintentos de emisión no consumen dos veces el mismo crédito.

### 4.4 Prorrateo por cambio de plan
1. Al cambiar de plan, se calculan `remaining_days = current_period_end - effective_at` y los días del ciclo.
2. `credit_cents = round(precio_actual × remaining_days / días_ciclo)`; `charge_cents = round(precio_nuevo × remaining_days / días_ciclo)`; `net_cents = charge_cents - credit_cents`.
3. Se inserta `subscription_changes` con `pending`; el neto se aplica en la próxima factura (`proration_cents`). Si el neto es negativo, queda como crédito a favor y el total de la factura no baja de cero.
4. Un cambio de plan es idempotente por `(subscription_id, effective_at)`; reintentos no duplican el registro ni el neto.
5. El cambio se audita con `from_plan_id`, `to_plan_id`, `net_cents` y actor.

---

## 5. Módulo de Exportación en Excel y PDF

### 5.1 Especificación Técnica
- **Excel (`.xlsx`):** Generado mediante la librería nativa `exceljs`. Contiene hoja de cálculo estilizada con título, filtros aplicados, cabeceras en negrita y formato de celdas según tipo (moneda con separadores, fechas ISO).
- **PDF (`.pdf`):** Generado mediante `@react-pdf/renderer` en servidor. Incluye membrete oficial, tabla paginada con alternancia de colores en filas y pie de página con número de página y fecha de emisión.

### 5.2 Filtros Temporales Soportados
- `daily`: Día en curso (00:00:00 a 23:59:59).
- `weekly`: Semana en curso (Lunes a Domingo).
- `monthly`: Mes calendario activo.
- `quarterly`: Trimestre calendario (Q1, Q2, Q3, Q4).
- `semiannual`: Semestre calendario (S1 o S2).
- `annual`: Año calendario en curso.
- `custom`: Rango libre `start_date` y `end_date` (formato `YYYY-MM-DD`).

---

## 6. Verificación y Testing

| Control | Prueba |
|---|---|
| Firma Wompi | Payload con checksum inválido retorna HTTP 401; checksum válido procesa el cobro. |
| Firma Stripe | Webhook sin firma o con secreto erróneo es rechazado con HTTP 400. |
| Idempotencia | Reenvío del mismo webhook 5 veces produce exactamente 1 pago y 1 comprobante. |
| Sin Impuestos | La factura generada tiene `tax_cents = 0` y `total_cents = subtotal_cents - credit_cents + proration_cents`. |
| Crédito de referidos | Un crédito de 50,000 sobre una factura de 150,000 deja `total_cents = 100,000` y el crédito pasa a `redeemed`. |
| Crédito mayor al total | Si el crédito supera el total, `total_cents = 0`, la factura queda `pagada` sin pasarela y el remanente sigue `partially_redeemed`. |
| Payment methods | Los tokens se guardan en `payment_methods`; no hay PAN/CVV; un solo default por cliente. |
| Prorrateo | Un plan de 100,000 con 15/30 días restantes que cambia a 200,000 produce `credit=50,000`, `charge=100,000`, `net=50,000` y un registro `subscription_changes`. |
| Prorrateo negativo | Un downgrade con neto negativo deja crédito a favor y `total_cents >= 0`. |
| Exportación Excel | Endpoint `/api/billing/export?format=xlsx&period=monthly` descarga un archivo `.xlsx` válido y legible. |
| Exportación PDF | Endpoint `/api/billing/export?format=pdf&period=monthly` descarga un documento `.pdf` con tabla estructurada. |
