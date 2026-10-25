# BILL-001 · Tareas · Facturación SaaS, pagos y comprobantes

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 1.3 (Aprobada — payment_methods, prorrateo y créditos) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- Ejecutar en estricto orden; una tarea se marca `[x]` únicamente cuando su verificación automatizada o manual haya pasado.
- Las tareas **[HUMANO]** requieren validación del Product Owner.
- Las tareas **[LAB]** se ejecutan en entorno sandbox con llaves de prueba de pasarelas.
- Comandos base de verificación:
  ```bash
  pnpm --filter @mocter/domain exec drizzle-kit check
  pnpm lint
  pnpm test
  ```

---

## Fase 0 · Decisiones (Cerradas)

- [x] **T-01 · [HUMANO] Cerrar las decisiones abiertas** (2026-10-24)
  - Resuelto: Pasarela dual Wompi (Colombia) y Stripe (Internacional).
  - Resuelto: Captura de datos fiscales bajo especificación Matías API; no emisión DIAN en v1; comprobante interno.
  - Resuelto: Sin retenciones ni cobro de impuestos en v1.
  - Resuelto: Trial de 14 días.
  - Resuelto: Exportación en Excel (`.xlsx`) y PDF (`.pdf`) por períodos predefinidos y rango libre.
  - Verificación: Registrado en `requirements.md` §6 y `design.md`.

---

## Fase 1 · Esquema Drizzle y Modelado de Datos

- [ ] **T-02 · Crear las entidades de billing en packages/domain**
  - Implementar en `packages/domain/src/schema/admin/billing.ts` las tablas:
    - `client_billing_profiles` (con campos Matías API: `identity_document_id`, `dni`, `company_name`, `email`, `address`, `city_code`).
    - `payment_methods` (tokens de cliente/método, `brand`, `last4`, `is_default`, `status`; sin PAN/CVV).
    - `subscriptions` con `plan_id uuid` (FK a `plans.id`) y estados `trialing`, `active`, `past_due`, `suspended`, `cancelled`.
    - `invoices` (con máquina de estados `draft`, `issued`, `paid`, `past_due`, `void`, `subtotal_cents`, `tax_cents = 0`, `credit_cents`, `proration_cents`).
    - `payments` (con `gateway_reference` único, `gateway` wompi/stripe).
    - `payment_receipts` (con `receipt_number`, `pdf_url`, `emailed_at`).
    - `subscription_changes` (from/to plan, remaining_days, credit/charge/net, invoice_id).
  - Verificación: `pnpm --filter @mocter/domain exec drizzle-kit check` pasa sin errores sintácticos.

- [ ] **T-03 · Generar y validar la migración SQL de billing**
  - Ejecutar `pnpm --filter @mocter/domain db:generate`.
  - Revisar el SQL generado asegurando llaves foráneas, índices por `client_id` y restricción de unicidad en `payments.gateway_reference`.
  - Verificación: SQL validado sin advertencias destructivas.

---

## Fase 2 · Pasarelas Duales (Wompi y Stripe)

- [ ] **T-04 · [LAB] Implementar webhook de Wompi con checksum e idempotencia**
  - Crear endpoint `POST /api/webhooks/wompi`.
  - Validar firma HMAC SHA256 usando `WOMPI_EVENTS_SECRET`.
  - Comprobar idempotencia en `payments` por `gateway_reference`.
  - Actualizar `invoices.status = 'paid'` y `subscriptions.status = 'active'`.
  - Verificación: Test unitario con payload simulado de Wompi confirma transición de factura y rechazo de checksum erróneo.

- [ ] **T-05 · [LAB] Implementar webhook de Stripe con firma e idempotencia**
  - Crear endpoint `POST /api/webhooks/stripe`.
  - Validar cabecera `Stripe-Signature` mediante SDK oficial.
  - Procesar `payment_intent.succeeded` actualizando factura y suscripción.
  - Verificación: Stripe CLI trigger `payment_intent.succeeded` procesa correctamente sin duplicados.

- [ ] **T-06 · Implementar servicio de Checkout Session**
  - Endpoint para iniciar pago: redirige a Wompi Web Checkout para COP o genera clientSecret de Stripe Payment Intent para USD, usando el token de `payment_methods`.
  - Verificación: Inquilino en Colombia obtiene referencia Wompi; inquilino internacional obtiene intent de Stripe; no se almacena PAN/CVV.

---

## Fase 3 · Comprobantes de Pago y Exportadores Excel / PDF

- [ ] **T-07 · Implementar servicio de comprobantes internos y despacho de email**
  - Al recibir pago confirmado, generar registro en `payment_receipts` con numeración consecutiva.
  - Solicitar a NTF-001 el envío de `billing.payment_succeeded` o `billing.renewal` con el comprobante adjunto.
  - Verificación: Pago aprobado registra comprobante y NTF-001 envía el correo al `email` fiscal registrado.

- [ ] **T-08 · Implementar exportador a Excel (.xlsx)**
  - Endpoint `GET /api/billing/export?format=xlsx&period=...` usando `exceljs`.
  - Filtros: `daily`, `weekly`, `monthly`, `quarterly`, `semiannual`, `annual`, `custom`.
  - Verificación: Descarga de archivo `.xlsx` con columnas de fecha, referencia, pasarela, monto, estado.

- [ ] **T-09 · Implementar exportador a PDF (.pdf)**
  - Endpoint `GET /api/billing/export?format=pdf&period=...`.
  - Documento vectorizado con membrete, tabla paginada y totales.
  - Verificación: Descarga de archivo `.pdf` visualizable en visor estándar.

---

## Fase 4 · Verificación de Criterios BDD y Cierre

- [ ] **T-10 · Implementar aplicación de créditos de referidos**
  - Consultar créditos `available`/`partially_redeemed` de REF-001 al emitir la factura, imputarlos por `expires_at` y registrar `credit_cents`/`applied_referral_credit_id`.
  - Descontar `remaining_cents` en REF-001; dejar `redeemed` si llega a cero o `partially_redeemed` si queda saldo.
  - Si `total_cents = 0`, marcar la factura `pagada` sin pasarela y emitir comprobante.
  - Verificación: CA-BILL-06 pasa; un reintento no consume dos veces el mismo crédito.

- [ ] **T-10A · Implementar prorrateo por cambio de plan**
  - Calcular `credit_cents`, `charge_cents`, `remaining_days` y `net_cents`; registrar en `subscription_changes`.
  - Aplicar `proration_cents` en la próxima factura; si el neto es negativo, dejar crédito a favor y evitar total negativo.
  - Verificación: CA-BILL-07 pasa; un reintento no duplica el cambio ni el neto.

- [ ] **T-11 · Ejecutar pruebas automatizadas BDD**
  - Validar CA-BILL-01 (Idempotencia Wompi).
  - Validar CA-BILL-02 (Stripe USD).
  - Validar CA-BILL-03 (Datos fiscales Matías API).
  - Validar CA-BILL-04 (Exportación Excel y PDF).
  - Validar CA-BILL-05 (Dunning y gracia).
  - Validar CA-BILL-06 (Créditos de referidos).
  - Validar CA-BILL-07 (Prorrateo).
  - Verificación: Suite de tests automatizados pasa al 100%.

- [ ] **T-12 · [HUMANO] Aprobación final y pase a codificación**
  - Certificación de especificación lista para desarrollo.
