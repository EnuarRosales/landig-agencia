# BILL-001 · Tareas · Facturación SaaS, pagos y comprobantes

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
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
    - `subscriptions` (con estados `trialing`, `active`, `past_due`, `suspended`, `cancelled`).
    - `invoices` (con máquina de estados `draft`, `issued`, `paid`, `past_due`, `void`, `subtotal_cents`, `tax_cents = 0`).
    - `payments` (con `gateway_reference` único, `gateway` wompi/stripe).
    - `payment_receipts` (con `receipt_number`, `pdf_url`, `emailed_at`).
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
  - Endpoint para iniciar pago: redirige a Wompi Web Checkout para COP o genera clientSecret de Stripe Payment Intent para USD.
  - Verificación: Inquilino en Colombia obtiene referencia Wompi; inquilino internacional obtiene intent de Stripe.

---

## Fase 3 · Comprobantes de Pago y Exportadores Excel / PDF

- [ ] **T-07 · Implementar servicio de comprobantes internos y despacho de email**
  - Al recibir pago confirmado, generar registro en `payment_receipts` con numeración consecutiva.
  - Encolar tarea de despacho de correo electrónico con plantilla HTML y comprobante adjunto.
  - Verificación: Pago aprobado registra comprobante y envía correo al `email` fiscal registrado.

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

- [ ] **T-10 · Ejecutar pruebas automatizadas BDD**
  - Validar CA-BILL-01 (Idempotencia Wompi).
  - Validar CA-BILL-02 (Stripe USD).
  - Validar CA-BILL-03 (Datos fiscales Matías API).
  - Validar CA-BILL-04 (Exportación Excel y PDF).
  - Validar CA-BILL-05 (Dunning y gracia).
  - Verificación: Suite de tests automatizados pasa al 100%.

- [ ] **T-11 · [HUMANO] Aprobación final y pase a codificación**
  - Certificación de especificación lista para desarrollo.
