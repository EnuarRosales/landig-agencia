# BILL-001 · Diseño · Facturación SaaS, pagos y comprobantes

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
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

### 3.2 `subscriptions`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id`, único por inquilino |
| `plan_id` | `varchar(64)` | FK a `plans.id` |
| `status` | `varchar(32)` | `trialing`, `active`, `past_due`, `suspended`, `cancelled` |
| `cycle` | `varchar(16)` | `monthly`, `annual` |
| `trial_ends_at` | `timestamptz` | Fecha de expiración del trial |
| `current_period_start` | `timestamptz` | Inicio del ciclo vigente |
| `current_period_end` | `timestamptz` | Fin del ciclo vigente |
| `gateway` | `varchar(16)` | `wompi` o `stripe` |

### 3.3 `invoices`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `client_id` | `uuid` | FK a `clients.id` |
| `invoice_number` | `varchar(32)` | Consecutivo interno (ej. `INV-2026-00001`) |
| `status` | `varchar(32)` | `draft`, `issued`, `paid`, `past_due`, `void` |
| `subtotal_cents` | `bigint` | Monto neto en centavos |
| `tax_cents` | `bigint` | 0 en v1 (sin retenciones ni IVA) |
| `total_cents` | `bigint` | Monto total a pagar |
| `currency` | `varchar(3)` | `COP` o `USD` |
| `due_at` | `timestamptz` | Fecha límite de pago |
| `paid_at` | `timestamptz` | Fecha de pago efectivo |

### 3.4 `payments`
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

### 3.5 `payment_receipts`
| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | Identificador único |
| `payment_id` | `uuid` | FK a `payments.id`, único |
| `receipt_number` | `varchar(32)` | Consecutivo de comprobante (ej. `REC-2026-00001`) |
| `pdf_url` | `varchar(512)` | Ruta al archivo generado en almacenamiento |
| `emailed_to` | `varchar(255)` | Correo donde se remitió el comprobante |
| `emailed_at` | `timestamptz` | Fecha y hora del envío de correo |
| `created_at` | `timestamptz` | Fecha de emisión |

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
| Sin Impuestos | La factura generada tiene `tax_cents = 0` y `total_cents = subtotal_cents`. |
| Exportación Excel | Endpoint `/api/billing/export?format=xlsx&period=monthly` descarga un archivo `.xlsx` válido y legible. |
| Exportación PDF | Endpoint `/api/billing/export?format=pdf&period=monthly` descarga un documento `.pdf` con tabla estructurada. |
