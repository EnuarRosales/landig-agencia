# REF-001 · Diseño · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.3 (Borrador — decisiones O-01 a O-07 cerradas; pendiente aprobación final) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [BILL-001](../bill-001-facturacion-saas/design.md) · [REP-001](../rep-001-informes-dashboards/design.md) |
| Estado | Borrador |

## 1. Principios

1. **Atribución clara y única.** Un referido, un referente, una ventana de 60 días por defecto, configurable desde el backoffice.
2. **Se paga cuando convierte.** La recompensa se entrega tras el primer pago del referido.
3. **Antifraude desde el día uno.** Autorreferencia, NIT, medio de pago e IP.
4. **Modelo A aprobado; parámetros comerciales configurables.** El crédito se calcula y aplica con la configuración vigente del backoffice; no se hardcodea.
5. **Crédito con vencimiento y trazabilidad.** Cada crédito tiene `credited_at`, `expires_at` y un estado explícito; a los 365 días se anula el saldo no usado.
6. **Sin trial extendido como recompensa.**

## 2. Arquitectura

```text
Inquilino (líder) ──► código/enlace ──► alta del referido
                                          │
                                          ▼
                                   referrals (pending)
                                          │ primer pago
                                          ▼
                                   referrals (qualified)
                                          │
                         ┌────────────────┴────────────────┐
                         ▼                                 ▼
                 Modelo A: crédito BILL-001        Modelo B: comisión (payout)
                 (referente)                      + descuento (referido)
                         │                                 │
                         └──────────► referral_rewards ◄────┘
                                          │
                                          ▼
                                   REP-001 (CAC, LTV)
```

## 3. Modelo de datos (Router Global)

| Tabla | Atributos |
|---|---|
| `referral_programs` | `id`, `name`, `model` (`credit`; `cash_discount` reservado), `reward_type` (`fixed`/`percent`), `reward_value` (monto fijo en `currency` o porcentaje de la primera factura), `currency` (`char(3)`), `trigger` (`first_paid_invoice`), `attribution_days` (default 60), `cap_referrals_per_referrer` (nullable; `null` = sin tope, sin default), `credit_validity_days` (default 365), `starts_at`/`ends_at` (nullable), `status` (`draft`/`active`/`paused`/`ended`; default `active`), auditoría |
| `referral_codes` | `client_id`, `code` único, `status`, `created_at` |
| `referrals` | `referrer_client_id`, `referred_client_id`, `code`, `status` (`pending`/`qualified`/`rewarded`/`rejected`), `attributed_at`, `qualified_at`, `rejected_reason`, auditoría |
| `referral_rewards` | `id`, `referral_id` (único), `referrer_client_id`, `model`, `amount_cents`, `remaining_cents`, `currency`, `status` (`pending`/`available`/`partially_redeemed`/`redeemed`/`expired`/`void`), `credited_at`, `expires_at`, `redeemed_at`, `applied_invoice_id` (última aplicación), `payout_reference` (solo Modelo B), `tax_withheld_cents` (solo Modelo B), auditoría |

Reglas: un `referred_client_id` aparece una sola vez; el código es único; la recompensa se calcula con la configuración vigente al calificar. `reward_type = fixed` usa `reward_value` como monto en `currency`; `reward_type = percent` usa `reward_value` como porcentaje de la primera factura pagada. No hay un número fijo de créditos: `amount_cents` es el resultado del cálculo. Cada `referral_id` genera como máximo un `referral_rewards`; si `cap_referrals_per_referrer` no es `null`, se aplica ese tope; cada aplicación descuenta `remaining_cents` y deja el estado `partially_redeemed` si queda saldo o `redeemed` si llega a cero; el crédito vence a los 365 días de `credited_at`; desactivar el programa no borra ni vence créditos ya acreditados.

## 4. Flujo de atribución y calificación

1. El referente comparte su código/enlace.
2. El referido se registra con el código dentro de la ventana; se crea `referrals(pending)`.
3. Cuando el referido queda `active` y paga efectivamente un plan (mensual o anual), pasa a `qualified`; se evalúa antifraude.
4. Si existe `cap_referrals_per_referrer` y el referente ya lo alcanzó, el referido queda `qualified` sin crédito nuevo. Si no, se crea **un único** `referral_rewards` por `referral_id`, con `credited_at = now()` y `expires_at = credited_at + 365 días`:
   - **Modelo A:** el crédito queda `available` y se imputa a la próxima factura del referente (`applied_invoice_id`); cada aplicación descuenta `remaining_cents`. Si llega a cero pasa a `redeemed`; si queda saldo pasa a `partially_redeemed`.
   - **Modelo B:** reservado; no se implementa en v1.
5. Si el crédito supera el total de la factura, el remanente sigue `partially_redeemed` hasta `expires_at`. Un job diario marca `expired` los créditos vencidos y anula el saldo.
6. REP-001 registra conversión, CAC, LTV y costo.

## 5. Antifraude

- Autorreferencia por dueño/NIT.
- Mismo medio de pago, IP o dispositivo entre referente y referido.
- Altas en bloque o patrones anómalos → `rejected` o revisión manual.
- Reembolso o baja dentro de la ventana revierte la recompensa no pagada.

## 6. Modelos de recompensa

| Modelo | Quién recibe | Cómo se aplica | Requisitos |
|---|---|---|---|
| A · Crédito | Referente | Crédito en la próxima factura SaaS; una vez por referido; vence a 365 días | BILL-001; sin payout |
| B · Comisión + descuento | Referente (cash) y referido (descuento) | Payout por pasarela + descuento en factura | Reservado; requiere pasarela de payout, retención, soporte tributario y nueva decisión comercial |

**Modelo A aprobado y unilateral en v1:** solo el referente recibe el crédito; el referido no recibe descuento. El modelo B queda documentado pero deshabilitado en v1. **No se contempla trial extendido.** Los parámetros de A (tipo, valor, moneda, tope y ventana) se configuran desde el backoffice y no se hardcodean.

## 7. Panel y métricas

El inquilino ve su código, referidos, estado y créditos acumulados. REP-001 agrega conversión, CAC, LTV y costo del programa por período.

## 8. Área de gestión y gobernanza

El backoffice de la SaaS expone un área de referidos (ruta propuesta: `/[locale]/admin/settings/referrals`) con:

- **Toggle de programa:** activo/pausado con un clic. Inicia activo. Al pausar se detienen nuevas atribuciones y acreditaciones; los créditos ya acreditados conservan su saldo y vencimiento.
- **Configuración comercial:** `reward_type` (`fixed`/`percent`), `reward_value` (monto fijo o porcentaje), `currency`, `attribution_days`, `cap_referrals_per_referrer` (opcional; `null` = sin tope) y `credit_validity_days` (365 por defecto).
- **Tablero:** referidos por estado, créditos `available`/`partially_redeemed`/`redeemed`/`expired`, monto acumulado y auditoría.
- **Permisos:** `platform_owner`/`platform_admin` editan y activan/desactivan; `platform_sales` solo consulta.

Toda acción se audita; no se guardan datos de pago sensibles.

## 9. Verificación

| Control | Prueba |
|---|---|
| Atribución | Un referido con código dentro de la ventana queda asociado a un solo referente |
| Calificación | Sin pago efectivo de un plan mensual o anual no hay crédito |
| Antifraude | Autorreferencia y duplicados por NIT/pago se rechazan |
| Modelo A | El crédito se aplica a la próxima factura del referente y reduce el total |
| Aplicación parcial | Un crédito de 200,000 sobre una factura de 150,000 deja `remaining_cents = 50,000` y estado `partially_redeemed` |
| Una vez por referido | Reintentos y recalificaciones no generan un segundo `referral_rewards` |
| Tope total | Con un tope configurado, al alcanzarlo el referente no genera créditos nuevos; los existentes conservan su vigencia. Sin tope (`null`), no se aplica límite |
| Vencimiento | Un crédito con `expires_at` vencido pasa a `expired` y no puede aplicarse |
| Toggle | Desactivar el programa detiene nuevas acreditaciones y conserva los créditos existentes |
| Configuración | Cambiar `reward_type`/`reward_value` en backoffice afecta solo a nuevas calificaciones |
| Métricas | REP-001 refleja conversión, CAC y costo del programa |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fraude de referidos | Antifraude + revisión manual + reversión |
| Costo descontrolado | Tope configurable (si se define) + una vez por referido + vencimiento a 365 días |
| Créditos vencidos no aplicados | Job diario de expiración + alerta en el panel |
| Programa desactivado con créditos pendientes | Los créditos persisten y siguen su ciclo; solo se detienen nuevas acreditaciones |
| Confusión con el programa de inferencia | Dominios separados; sin mezclar saldos |

## 11. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| BILL-001 | Aplicación del crédito a la próxima factura, reducción del total y referencia al crédito redimido |
| ADM-001 | Inquilinos, comunidad y rol `originator`; el área de gestión de referidos vive en el backoffice de la SaaS |
| REP-001 | Métricas del programa |
| DSN-001 | Panel de referidos |
