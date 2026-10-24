# BILL-001 · Diseño · Facturación SaaS, pagos y facturación electrónica

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [REP-001](../rep-001-informes-dashboards/design.md) |
| Estado | Borrador |

## 1. Principios

1. **Cobrar sin fricción y sin sorpresas.** Ciclo claro, aviso previo, gracia antes de suspender.
2. **La pasarela custodia los datos de pago.** Mocter solo guarda tokens y referencias.
3. **La factura fiscal la emite un autorizado.** Mocter integra, no reimplementa DIAN.
4. **Todo es conciliable.** Cada cobro, pago, nota y evento tiene referencia idempotente.
5. **El inquilino ve lo suyo.** Facturas, pagos y métodos, sin acceso a otros.

## 2. Arquitectura

```text
Inquilino (panel) ──► Suscripción/cobro ──► Pasarela (token, 3DS, PSE/Nequi)
                                │                    │ webhook idempotente
                                ▼                    ▼
                     Router Global · billing     payments
                                │
                                ├─► Factura interna (invoices)
                                ├─► Proveedor de facturación electrónica ──► DIAN
                                │      (UBL 2.1, CUFE, eventos)
                                └─► REP-001 (MRR, churn, recaudación)
```

## 3. Modelo de datos (Router Global, schema `admin`)

| Tabla | Atributos |
|---|---|
| `subscriptions` | `client_id`, `plan_id`, `status` (`trialing`/`active`/`past_due`/`suspended`/`cancelled`), `cycle` (`monthly`/`annual`), `current_period_start`/`end`, `trial_ends_at`, `cancel_at`, auditoría |
| `billing_cycles` | `subscription_id`, `period_start`/`end`, `status` (`open`/`invoiced`/`paid`/`failed`), totales |
| `invoices` | `client_id`, `cycle_id`, `number` interno, `status` (`draft`/`issued`/`paid`/`void`), `subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `due_at`, auditoría |
| `invoice_lines` | `invoice_id`, `description`, `quantity`, `unit_price_cents`, `tax_rate`, `line_total_cents` |
| `payment_methods` | `client_id`, `gateway`, `token`, `brand`, `last4`, `is_default`, `status`, auditoría (sin PAN) |
| `payments` | `client_id`, `invoice_id`, `gateway_reference` (único), `amount_cents`, `status` (`pending`/`approved`/`rejected`/`refunded`), `paid_at`, auditoría |
| `dunning_events` | `subscription_id`, `invoice_id`, `attempt`, `scheduled_at`, `result`, `reason` |
| `credit_notes` | `client_id`, `invoice_id`, `number`, `amount_cents`, `reason`, `status`, auditoría |
| `electronic_invoices` | `invoice_id`, `provider`, `cufe`, `xml_url`, `pdf_url`, `dian_status` (`pending`/`accepted`/`rejected`), `events` JSONB, auditoría |

## 4. Ciclo de suscripción

| Desde | Hacia | Regla |
|---|---|---|
| `trialing` | `active` | Primer cobro aprobado |
| `trialing`/`active` | `past_due` | Cobro fallido; inician reintentos |
| `past_due` | `suspended` | Reintentos agotados o gracia vencida |
| `past_due`/`suspended` | `active` | Pago regularizado |
| `active` | `cancelled` | Cancelación; servicio hasta `current_period_end` |

El cambio de plan aplica prorrateo y actualiza `clients.plan_id` + `client_plans` en la misma operación.

## 5. Pasarela

- Registro del método en el frontend de la pasarela (tokenización); Mocter recibe solo el token y los últimos 4 dígitos.
- Webhooks idempotentes por `gateway_reference`; un evento repetido no duplica el pago.
- 3DS cuando la pasarela lo exija; el resultado se refleja en `payments.status`.
- Reintentos de cobro con backoff según `dunning_events`.

## 6. Facturación electrónica

1. Al emitir la factura interna, se envían los datos fiscales del inquilino (NIT, razón social, régimen, responsabilidades) al proveedor autorizado.
2. El proveedor devuelve CUFE, XML UBL 2.1 y PDF; se guardan referencias y estado DIAN.
3. Los eventos (acuse, aceptación, rechazo) se registran en `electronic_invoices.events`.
4. Las notas crédito se emiten por el mismo canal y se vinculan a la factura original.
5. El inquilino descarga XML/PDF desde el panel.

## 7. Dunning y suspensión

- Reintentos configurables (p. ej. 3, 5 y 7 días) con gracia antes de suspender.
- `past_due` avisa al inquilino; `suspended` aplica `clients.lifecycle_status` y corta el servicio según ADM-001.
- Un pago regularizado devuelve a `active` y reactiva el servicio.

## 8. Roles y seguridad

- `platform_owner`/`platform_admin`: planes, cobros, facturación y conciliación.
- `platform_sales`: lectura comercial; sin datos de tarjeta.
- `tenant_owner`: sus facturas, métodos y pagos.
- Sin datos de tarjeta en la base; logs sin PII; auditoría de cada evento.

## 9. Verificación

| Control | Prueba |
|---|---|
| Idempotencia | Un webhook repetido produce un solo pago |
| Suscripción | Upgrade con prorrateo actualiza plan y factura |
| Dunning | Cobro fallido agenda reintentos y suspende al agotarlos |
| Factura | La factura interna y la electrónica coinciden en totales e impuestos |
| Notas | Una nota crédito queda vinculada y descuenta el saldo |
| Roles | El `tenant_owner` no ve facturas de otro inquilino |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Datos de tarjeta | Tokenización; nunca PAN en Mocter |
| Rechazo DIAN | Estado y eventos; reintento y corrección con el proveedor |
| Fallo transitorio de cobro | Reintentos con gracia; aviso previo |
| Descuadre de conciliación | Referencias idempotentes y conciliación diaria |
| Cambio de régimen tributario | Datos fiscales versionados y validados |

## 11. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | Planes, `client_plans`, `clients.plan_id`, `lifecycle_status`, datos fiscales |
| REP-001 | MRR, churn, recaudación y dunning |
| AUTH-001 | Roles de plataforma y acceso del inquilino |
| DAT-001 | Auditoría y datos en el Router |
| DSN-001 | Vistas de facturación |
