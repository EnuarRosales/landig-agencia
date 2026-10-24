# REF-001 · Diseño · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.1 (Borrador — pendiente de decisión del equipo comercial) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [BILL-001](../bill-001-facturacion-saas/design.md) · [REP-001](../rep-001-informes-dashboards/design.md) |
| Estado | Borrador |

## 1. Principios

1. **Atribución clara y única.** Un referido, un referente, una ventana.
2. **Se paga cuando convierte.** La recompensa se entrega tras el primer pago del referido.
3. **Antifraude desde el día uno.** Autorreferencia, NIT, medio de pago e IP.
4. **El modelo es comercial, no técnico.** La spec soporta dos modelos; el equipo decide.
5. **Sin trial extendido como recompensa.**

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
| `referral_programs` | `id`, `name`, `model` (`credit`/`cash_discount`), `reward_value` (`amount_cents` o `percent`), `trigger` (`first_paid_invoice`), `attribution_days`, `cap_per_referrer_cents`, `starts_at`/`ends_at`, `status` (`draft`/`active`/`paused`/`ended`), auditoría |
| `referral_codes` | `client_id`, `code` único, `status`, `created_at` |
| `referrals` | `referrer_client_id`, `referred_client_id`, `code`, `status` (`pending`/`qualified`/`rewarded`/`rejected`), `attributed_at`, `qualified_at`, `rejected_reason`, auditoría |
| `referral_rewards` | `referral_id`, `model`, `amount_cents` o `percent`, `status` (`pending`/`applied`/`paid`/`failed`), `applied_invoice_id`, `payout_reference`, `tax_withheld_cents`, auditoría |

Reglas: un `referred_client_id` aparece una sola vez; el código es único; la recompensa se calcula con el programa vigente al calificar.

## 4. Flujo de atribución y calificación

1. El referente comparte su código/enlace.
2. El referido se registra con el código dentro de la ventana; se crea `referrals(pending)`.
3. Al pagar su primera factura (BILL-001), el referido pasa a `qualified`; se evalúa antifraude.
4. Se crea `referral_rewards(pending)` y se aplica:
   - **Modelo A:** crédito en la próxima factura del referente (`applied_invoice_id`).
   - **Modelo B:** descuento en la factura del referido y comisión al referente por payout (`payout_reference`), con retención registrada.
5. REP-001 registra conversión, CAC, LTV y costo.

## 5. Antifraude

- Autorreferencia por dueño/NIT.
- Mismo medio de pago, IP o dispositivo entre referente y referido.
- Altas en bloque o patrones anómalos → `rejected` o revisión manual.
- Reembolso o baja dentro de la ventana revierte la recompensa no pagada.

## 6. Modelos de recompensa

| Modelo | Quién recibe | Cómo se aplica | Requisitos |
|---|---|---|---|
| A · Crédito | Referente | Crédito en la próxima factura SaaS | BILL-001; sin payout |
| B · Comisión + descuento | Referente (cash) y referido (descuento) | Payout por pasarela + descuento en factura | Pasarela de payout, retención y soporte tributario |

El modelo B requiere decisión del equipo comercial y del área contable/tributaria (O-01, O-06). **No se contempla trial extendido.**

## 7. Panel y métricas

El inquilino ve su código, referidos, estado y recompensa acumulada. REP-001 agrega conversión, CAC, LTV y costo del programa por período.

## 8. Gobernanza

`platform_owner`/`platform_admin` configuran y pausan el programa; `platform_sales` consulta. Toda acción se audita; no se guardan datos de pago sensibles.

## 9. Verificación

| Control | Prueba |
|---|---|
| Atribución | Un referido con código dentro de la ventana queda asociado a un solo referente |
| Calificación | Sin primer pago no hay recompensa |
| Antifraude | Autorreferencia y duplicados por NIT/pago se rechazan |
| Modelo A | El crédito se aplica a la factura del referente |
| Modelo B | El descuento y la comisión se registran con su retención y referencia de payout |
| Métricas | REP-001 refleja conversión, CAC y costo del programa |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fraude de referidos | Antifraude + revisión manual + reversión |
| Costo descontrolado | Topes por referente y duración del programa |
| Tributación de la comisión | Decisión contable (O-06) y registro de retención |
| Confusión con el programa de inferencia | Dominios separados; sin mezclar saldos |

## 11. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| BILL-001 | Crédito en factura, descuento y payout |
| ADM-001 | Inquilinos, comunidad y rol `originator` |
| REP-001 | Métricas del programa |
| DSN-001 | Panel de referidos |
