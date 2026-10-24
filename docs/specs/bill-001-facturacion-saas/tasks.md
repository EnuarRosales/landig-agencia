# BILL-001 · Tareas · Facturación SaaS, pagos y facturación electrónica

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Borrador |

## Convenciones

- **No ejecutar estas tareas hasta que BILL-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: ADM-001 (planes, clientes, lifecycle) y AUTH-001 (roles).

## Fase 0 · Decisiones

- [ ] **T-01 · [HUMANO] Cerrar las decisiones abiertas**
  - Resolver O-01 (pasarela), O-02 (proveedor de facturación electrónica), O-03 (IVA/retenciones), O-04 (días de trial) y O-05 (moneda).
  - Verificación: cada decisión queda registrada en `requirements.md` §5 con su resultado y fecha.

## Fase 1 · Suscripciones y facturación interna

- [ ] **T-02 · Crear las migraciones de billing**
  - `subscriptions`, `billing_cycles`, `invoices`, `invoice_lines`, `credit_notes` y `dunning_events` con auditoría, índices y comentarios.
  - Verificación: `drizzle-kit check` pasa; una suscripción no puede tener dos ciclos solapados.

- [ ] **T-03 · Implementar el ciclo de suscripción**
  - Alta, trial, renovación, upgrade/downgrade con prorrateo, cancelación y sincronización con `clients.plan_id`/`client_plans`.
  - Verificación: un upgrade prorratea y actualiza el plan; una cancelación conserva el servicio hasta el fin del ciclo.

- [ ] **T-04 · Implementar facturas internas y dunning**
  - Generación por ciclo, totales e impuestos, reintentos con gracia y transición a `past_due`/`suspended`.
  - Verificación: un cobro fallido agenda reintentos y suspende al agotarlos; el pago regularizado reactiva.

## Fase 2 · Pasarela

- [ ] **T-05 · Integrar la pasarela elegida**
  - Tokenización, métodos (tarjeta/PSE/Nequi), 3DS, webhooks idempotentes y actualización/eliminación del método.
  - Verificación: un webhook repetido produce un solo pago; Mocter no almacena datos de tarjeta.

- [ ] **T-06 · Conciliar pagos, reembolsos y notas crédito**
  - Pagos vs facturas por referencia; reembolsos y notas contra la factura; historial para el inquilino.
  - Verificación: el saldo de la factura cuadra con pagos y notas; un reembolso deja traza.

## Fase 3 · Facturación electrónica

- [ ] **T-07 · Integrar el proveedor autorizado**
  - Datos fiscales del inquilino, emisión UBL 2.1, CUFE, PDF/XML, eventos DIAN y notas crédito.
  - Verificación: la factura electrónica coincide en totales e impuestos con la interna; el estado DIAN y los eventos quedan registrados.

- [ ] **T-08 · Implementar la descarga para el inquilino**
  - XML y PDF por factura, con permisos del `tenant_owner`.
  - Verificación: el inquilino descarga solo sus facturas; otro inquilino no accede.

## Fase 4 · Reportes y cierre

- [ ] **T-09 · Integrar métricas en REP-001**
  - MRR, churn, recaudación, dunning y notas crédito por período.
  - Verificación: el dashboard coincide con las facturas y pagos del período.

- [ ] **T-10 · [LAB] Validar pasarela y proveedor en sandbox**
  - Cobro aprobado, rechazado, 3DS y emisión/aceptación de factura electrónica en entorno de pruebas.
  - Verificación: el ciclo completo funciona en sandbox sin datos reales.

- [ ] **T-11 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-06 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia; ninguno queda «asumido».

- [ ] **T-12 · [HUMANO] Aprobar BILL-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
