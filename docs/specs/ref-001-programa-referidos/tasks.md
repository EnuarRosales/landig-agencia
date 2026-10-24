# REF-001 · Tareas · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.1 (Borrador — pendiente de decisión del equipo comercial) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Borrador |

## Convenciones

- **No ejecutar estas tareas hasta que REF-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: BILL-001 (crédito/descuento/payout) y ADM-001 (inquilinos/comunidad).

## Fase 0 · Decisión comercial

- [ ] **T-01 · [HUMANO] Decidir el modelo de recompensa y sus parámetros**
  - Resolver O-01 a O-07: modelo A o B, monto/porcentaje, unilateral/doble, topes, ventana, tributación y duración.
  - Verificación: la decisión queda registrada en `requirements.md` §5 y en la trazabilidad; sin decisión no se implementa.

## Fase 1 · Atribución

- [ ] **T-02 · Crear las migraciones del programa**
  - `referral_programs`, `referral_codes`, `referrals` y `referral_rewards` con auditoría, únicos y comentarios.
  - Verificación: `drizzle-kit check` pasa; un referido no puede tener dos referentes.

- [ ] **T-03 · Implementar códigos y atribución**
  - Código/enlace único por inquilino, captura en el alta, ventana de atribución y estados.
  - Verificación: un alta con código dentro de la ventana queda asociada; fuera de la ventana no.

## Fase 2 · Calificación y recompensas

- [ ] **T-04 · Implementar calificación y antifraude**
  - Primer pago, autorreferencia, NIT, medio de pago e IP; reversión por reembolso/baja.
  - Verificación: sin pago no hay recompensa; un caso de autorreferencia se rechaza con motivo.

- [ ] **T-05 · Implementar el modelo A (crédito)**
  - Crédito en la próxima factura del referente vía BILL-001.
  - Verificación: el crédito aparece aplicado y el saldo cuadra.

- [ ] **T-06 · Implementar el modelo B (comisión + descuento) — solo si se aprueba**
  - Descuento al referido, payout al referente, retención y comprobante.
  - Verificación: el descuento y la comisión quedan registrados con su referencia y retención.

## Fase 3 · Panel y cierre

- [ ] **T-07 · Implementar el panel del referente y las métricas**
  - Código, referidos, estado y recompensa acumulada; REP-001 con conversión, CAC y costo.
  - Verificación: el panel refleja el estado real y el dashboard coincide con las recompensas del período.

- [ ] **T-08 · i18n y accesibilidad del panel**
  - es/en y DSN-001.
  - Verificación: el panel se completa en ambos idiomas con la tabla estándar.

- [ ] **T-09 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-06 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia; ninguno queda «asumido».

- [ ] **T-10 · [HUMANO] Aprobar REF-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.
