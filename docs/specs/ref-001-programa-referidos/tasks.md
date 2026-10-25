# REF-001 · Tareas · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.3 (Borrador — decisiones O-01 a O-07 cerradas; pendiente aprobación final) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Borrador |

## Convenciones

- **No ejecutar estas tareas hasta que REF-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: BILL-001 (aplicación del crédito en factura) y ADM-001 (inquilinos, roles y backoffice SaaS).

## Fase 0 · Decisiones comerciales

- [x] **T-01 · [HUMANO] Cerrar las decisiones (2026-10-24)**
  - Cerradas: O-01 (Modelo A), O-02 (recompensa parametrizable: fija o porcentual), O-03 (unilateral), O-04 (tope configurable, sin valor fijo por defecto), O-05 (ventana de 60 días), O-06 (no aplica en Modelo A) y O-07 (permanente con toggle).
  - Verificación: todas las decisiones quedaron registradas en `requirements.md` §5 y en la trazabilidad.

## Fase 1 · Atribución

- [ ] **T-02 · Crear las migraciones del programa**
  - `referral_programs` con `model`, `reward_type`, `reward_value` (monto fijo o porcentaje), `currency`, `attribution_days`, `cap_referrals_per_referrer` (nullable; sin default), `credit_validity_days` (365), `status` (default `active`) y auditoría.
  - `referral_codes`, `referrals` y `referral_rewards` con `referral_id` único, `amount_cents`, `remaining_cents`, `credited_at`, `expires_at`, `redeemed_at`, `applied_invoice_id` y estados `pending`/`available`/`partially_redeemed`/`redeemed`/`expired`/`void`.
  - Verificación: `drizzle-kit check` pasa; un referido no puede tener dos referentes ni dos recompensas.

- [ ] **T-03 · Implementar códigos y atribución**
  - Código/enlace único por inquilino, captura en el alta, ventana de atribución y estados.
  - Verificación: un alta con código dentro de la ventana queda asociada; fuera de la ventana no.

## Fase 2 · Calificación, crédito y gestión

- [ ] **T-04 · Implementar calificación y antifraude**
  - El referido califica solo cuando está `active` y pagó efectivamente un plan mensual o anual.
  - Autorreferencia, NIT, medio de pago e IP; reversión por reembolso o baja dentro de la ventana.
  - Verificación: sin pago efectivo no hay crédito; un caso de autorreferencia se rechaza con motivo.

- [ ] **T-05 · Implementar el crédito del Modelo A**
  - Crear como máximo un `referral_rewards` por `referral_id`, con `credited_at` y `expires_at = credited_at + 365 días`.
  - No crear crédito nuevo si el referente alcanzó el tope configurado en `cap_referrals_per_referrer` (si existe; `null` = sin tope).
  - Calcular el monto con la configuración vigente (`fixed` o `percent`) y la moneda del programa.
  - Aplicar el crédito a la próxima factura del referente vía BILL-001; si hay remanente, conservarlo hasta `expires_at`.
  - Job diario idempotente que marca `expired` los créditos vencidos y anula el saldo.
  - Verificación: el crédito se aplica una sola vez, reduce el total de la factura y expira a los 365 días.

- [ ] **T-06 · Implementar el área de gestión y el toggle**
  - Ruta de backoffice SaaS para activar/desactivar el programa con un clic, configurar `reward_type`, `reward_value`, `currency`, `attribution_days`, `cap_referrals_per_referrer` y `credit_validity_days`.
  - Estado inicial `active`; al pausar se detienen nuevas atribuciones/acreditaciones y se conservan los créditos existentes.
  - Permisos `platform_owner`/`platform_admin`; `platform_sales` solo lectura; auditoría de cambios.
  - Verificación: el toggle cambia el estado; un crédito existente sigue disponible al pausar; los cambios de configuración solo afectan nuevas calificaciones.

## Fase 3 · Panel y cierre

- [ ] **T-07 · Implementar el panel del referente y las métricas**
  - Código, referidos, estado y créditos acumulados; REP-001 con conversión, CAC y costo.
  - Verificación: el panel refleja el estado real y el dashboard coincide con los créditos del período.

- [ ] **T-08 · i18n y accesibilidad del panel y del backoffice**
  - es/en y DSN-001.
  - Verificación: las vistas se completan en ambos idiomas con la tabla estándar.

- [ ] **T-09 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-06 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia; ninguno queda «asumido».

- [ ] **T-10 · [HUMANO] Aprobar REF-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.

## Reservado · Modelo B

- [ ] **T-11 · [FUTURO] Implementar comisión + descuento — solo si se aprueba**
  - Descuento al referido, payout al referente, retención y comprobante.
  - No forma parte de v1.
