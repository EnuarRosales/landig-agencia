# ORD-001 · Tareas · Pedidos y fulfillment

| Atributo | Valor |
|---|---|
| ID | ORD-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que ORD-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: ADM-001 (productos, escalones, transportadoras, pagos), CRM-001 (prospectos) y BOT-002 (`registrar_pedido`).

## Fase 0 · Decisiones

- [x] **T-01 · [HUMANO] Cerrar las decisiones abiertas**
  - Resueltas: confirmación manual (D-06), transportadora manual (D-07), regla de envío política + producto (D-08); facturación electrónica va a `BILL-001`.
  - Verificación: las decisiones quedan registradas en `requirements.md` §4/§5 y en la trazabilidad (L3).

## Fase 1 · Datos y estados

- [ ] **T-02 · Crear las migraciones de pedidos**
  - `orders`, `order_items`, `order_events` y `order_returns` con RLS, auditoría, FKs y el índice único parcial de idempotencia.
  - Verificación: `drizzle-kit check` pasa; una consulta sin contexto RLS no devuelve filas.

- [ ] **T-03 · Implementar la máquina de estados**
  - Transiciones válidas, eventos inmutables, motivo obligatorio en cancelación y reembolso antes de cerrar.
  - Verificación: una transición inválida se rechaza sin dejar evento; cada transición registra actor y fecha.

## Fase 2 · Registro y precios

- [ ] **T-04 · Implementar `registrar_pedido`**
  - Contrato de BOT-002: idempotencia por conversación, snapshot de ítems, precio por escalón y número legible.
  - Verificación: dos llamadas con la misma conversación producen un solo pedido; 2 unidades aplican el escalón correcto.

- [ ] **T-05 · Implementar totales y moneda**
  - `subtotal + envío − descuento = total`, en centavos y con la moneda del inquilino.
  - Verificación: un total nunca es negativo; la moneda queda congelada en el pedido.

- [ ] **T-06 · Implementar el alta manual de pedidos**
  - Formulario con la tabla estándar (paginación, filtros y ordenamiento), selección de producto y transportadora.
  - Verificación: un pedido manual se crea sin conversación de Chatwoot y con las mismas validaciones.

## Fase 3 · Pago, envío y devoluciones

- [ ] **T-07 · Implementar pago y envío**
  - Método de pago snapshot, estados de pago, método de envío, documento obligatorio en oficina y tracking.
  - Verificación: cancelar con pago `paid` exige reembolso; `office` sin documento se rechaza.

- [ ] **T-08 · Implementar devoluciones**
  - Motivo, monto, estados y transición a `returned` al recibirse.
  - Verificación: la devolución no edita el pedido original y deja eventos.

## Fase 4 · Integraciones y cierre

- [ ] **T-09 · Integrar etiqueta y CRM**
  - `registered` aplica `compra-realizada` y pasa el prospecto a `customer` en la misma operación lógica.
  - Verificación: la etiqueta aparece en Chatwoot y el prospecto cambia de etapa una sola vez.

- [ ] **T-10 · Integrar métricas en REP-001**
  - Ventas, conversión, ticket promedio y devoluciones por período.
  - Verificación: el dashboard refleja pedidos y devoluciones del período.

- [ ] **T-11 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-08 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia; ninguno queda «asumido».

- [x] **T-12 · [HUMANO] Aprobar ORD-001 (2026-10-25)**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
