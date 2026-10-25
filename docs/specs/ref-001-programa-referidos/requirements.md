# REF-001 · Requisitos · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.3 (Borrador — decisiones O-01 a O-07 cerradas; pendiente aprobación final) |
| Fecha | 2026-10-24 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [BILL-001](../bill-001-facturacion-saas/requirements.md) · [REP-001](../rep-001-informes-dashboards/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Borrador |

## 1. Propósito

Incentivar a los inquilinos —en especial a los líderes de comunidad— que traen nuevos inquilinos a la plataforma. El programa atribuye referidos, califica cuando el referido queda activo y paga efectivamente un plan, y entrega una recompensa. **El modelo aprobado es A — crédito en factura.** La recompensa es parametrizable desde el backoffice de la SaaS, se entrega una sola vez por referido calificado y el crédito vence a los 365 días desde su acreditación.

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «estaba pensando en aplicar algun tema de marketing de afiliado reconociendo un determinado valor como incentivo a aquellos usuarios que vinculen al sistema a mas personas, gancho ideal para los denominados lideres de comunidad.»
- «Deja documentado los modelos propuestos, elimina "Trial extendido" y agrega "Comisión en Efectivo para quien refiere y Descuento para el referido". Deja esto documentado pero pendiente de decision de equipo para madurar la idea con el componente comercial.»

## 3. Requisitos funcionales

### RF-01 · Atribución

| ID | Requisito |
|---|---|
| RF-01.1 | Cada inquilino tiene un código y enlace de referido único; el beneficiario es el inquilino (el líder de comunidad lo representa). |
| RF-01.2 | La atribución ocurre en el alta con ventana configurable (60 días por defecto); una cuenta solo puede tener un referente. |
| RF-01.3 | El estado del referido es `pending` → `qualified` → `rewarded`, con salida `rejected` y motivo. |

### RF-02 · Calificación y antifraude

| ID | Requisito |
|---|---|
| RF-02.1 | Un referido califica cuando queda `active` y ha pagado efectivamente un plan, sin importar si su periodicidad es mensual o anual. |
| RF-02.2 | Se rechazan autorreferencias y duplicados por NIT, dueño, medio de pago o IP; los patrones de alta masiva se marcan para revisión. |
| RF-02.3 | Un referido reembolsado o dado de baja dentro de la ventana revierte la recompensa si aún no se pagó. |

### RF-03 · Recompensas (dos modelos documentados)

| ID | Requisito |
|---|---|
| RF-03.1 | **Modelo A — Crédito en la factura SaaS (aprobado):** el referente recibe un crédito que se aplica a su próxima factura; sin payout ni retención en la fuente. |
| RF-03.2 | **Modelo B — Comisión en efectivo + descuento al referido:** queda documentado como alternativa futura, pero **no se habilita en v1**. Requiere pasarela de payout, soporte tributario colombiano y una nueva decisión comercial. |
| RF-03.3 | **Recompensa parametrizable:** `platform_owner`/`platform_admin` configuran desde el backoffice el tipo (`fixed` o `percent`), el valor (monto fijo en moneda o porcentaje de la primera factura), la moneda, el tope por referente (opcional) y la ventana de atribución. **No se fija un número de créditos por referido**: el crédito resultante se calcula con esa configuración y se registra en `amount_cents`. Ningún valor comercial se hardcodea en código. |
| RF-03.4 | **No existe recompensa por “trial extendido”.** Las opciones válidas son crédito o comisión + descuento; en v1 solo se habilita crédito. |
| RF-03.5 | La recompensa se genera **una sola vez por referido** y solo después de que el referido esté `active` y haya pagado efectivamente un plan mensual o anual. El crédito puede aplicarse parcialmente hasta agotarse o vencer. |
| RF-03.6 | El crédito tiene una **vigencia máxima de 365 días** contados desde la fecha efectiva de acreditación. Al vencer, el saldo no utilizado se marca `expired` y se anula; no se extiende automáticamente. |
| RF-03.7 | El crédito se imputa a la próxima factura del referente. Si el crédito supera el total de la factura, el remanente queda disponible hasta su vencimiento. |
| RF-03.8 | **Programa unilateral en v1:** solo el referente recibe el crédito. El referido no recibe descuento ni crédito por el hecho de haber sido referido. |
| RF-03.9 | **Tope total por referente configurable:** sin valor fijo por defecto (`null` = sin tope). Si el backoffice configura un tope, al alcanzarlo no se generan nuevos créditos para ese referente; los ya generados conservan su vigencia. |

### RF-04 · Aplicación y pago

| ID | Requisito |
|---|---|
| RF-04.1 | El crédito se aplica en BILL-001 contra la próxima factura del referente, reduce el total a pagar y queda reflejado en el saldo y en el comprobante. |
| RF-04.2 | La comisión en efectivo (Modelo B) se pagaría por la pasarela aprobada, con referencia única y estado (`pending`/`paid`/`failed`); el comprobante y la retención aplicable se registrarían. No se implementa en v1. |
| RF-04.3 | Ninguna recompensa se acredita antes de la calificación del referido. |
| RF-04.4 | Un mismo `referral_id` genera **un solo crédito**; puede aplicarse en una o varias facturas hasta agotar `remaining_cents` o vencer. No se generan créditos duplicados. |
| RF-04.5 | Un job de vencimiento marca los créditos con `expires_at <= now()` como `expired` y anula el saldo remanente. La expiración es idempotente y auditada. |

### RF-05 · Panel y métricas

| ID | Requisito |
|---|---|
| RF-05.1 | El inquilino ve su código, referidos, estado y créditos acumulados. |
| RF-05.2 | REP-001 mide conversión de referidos, CAC, LTV y costo del programa por período. |

### RF-06 · Gobernanza

| ID | Requisito |
|---|---|
| RF-06.1 | Existe un **área de gestión de referidos en el backoffice de la SaaS**. `platform_owner`/`platform_admin` pueden activar o desactivar el programa con un solo clic, configurar el modelo (v1: crédito), el tipo y valor de la recompensa, la moneda, el tope por referente y la ventana de atribución. `platform_sales` solo consulta. |
| RF-06.2 | El programa inicia **activo por defecto**. Al desactivarlo se detienen nuevas atribuciones y acreditaciones, pero **los créditos ya acumulados se conservan** y siguen su ciclo normal hasta ser redimidos o vencer. |
| RF-06.3 | Toda tabla cumple la auditoría global (DAT-001 RF-10.9); no se registran datos de pago sensibles. |
| RF-06.4 | La UI cumple i18n (es/en) y DSN-001. El área de gestión muestra programa, configuración, créditos, referidos y auditoría. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | REF-001 es una spec nueva; no se mezcla con cobro (BILL-001) ni con inferencia (BOT-001). | Dominio de marketing con reglas propias. |
| D-02 | El beneficiario es el inquilino, no el usuario individual. | El líder de comunidad recibe el incentivo a través de su negocio. |
| D-03 | La recompensa se entrega solo tras la calificación del referido. | Evita pagar por altas que no convierten. |
| D-04 | Antifraude obligatorio (autorreferencia, NIT, pago, IP). | Protege el margen del programa. |
| D-05 | **Modelo A aprobado:** crédito en la factura SaaS. Modelo B queda documentado como alternativa futura, no habilitada en v1. | Elimina payout y retención en la fuente de la primera versión. |
| D-06 | “Trial extendido” queda descartado como recompensa. | Solo crédito o comisión + descuento. |
| D-07 | La recompensa es **parametrizable desde el backoffice** (tipo fijo/porcentaje, valor, moneda, tope y ventana); no se hardcodea. | Permite ajustar el programa comercial sin redesplegar. |
| D-08 | La recompensa se acredita **una sola vez por referido**, solo cuando el referido está `active` y pagó efectivamente un plan mensual o anual. | Evita duplicados y pagos por altas que no convierten. |
| D-09 | El crédito vence a los **365 días** desde su acreditación; el saldo no usado se anula. | Controla el pasivo y evita créditos eternos. |
| D-10 | El programa inicia **activo**, se activa/desactiva con un clic y los créditos acumulados persisten al desactivarlo. | Operación simple sin perder compromisos ya adquiridos. |
| D-11 | **Programa unilateral en v1:** solo el referente recibe el crédito; el referido no recibe descuento. | Menor costo y complejidad; el beneficio al referido queda para una campaña futura. |
| D-12 | **Tope total por referente configurable**, sin valor fijo por defecto (`null` = sin tope). | Controla el gasto si se necesita, sin imponer un número de créditos ni limitar el programa por mes. |
| D-13 | **Ventana de atribución de 60 días** desde el registro del referido, configurable desde el backoffice. | Equilibrio entre conversión y exposición a fraude; el valor puede ajustarse sin redesplegar. |

## 5. Decisiones abiertas (equipo comercial)

| ID | Pregunta | Impacto |
|---|---|---|
No quedan decisiones abiertas en REF-001.

**Cerradas el 2026-10-24:** O-01 (Modelo A), O-02 (recompensa parametrizable desde backoffice), O-03 (unilateral: solo el referente), O-04 (tope total configurable, sin valor fijo por defecto), O-05 (ventana de atribución de 60 días, configurable), O-06 (no aplica en Modelo A; se reabre solo si se habilita Modelo B) y O-07 (programa permanente con toggle activo/pausado, sin campañas por fecha en v1).

## 6. Fuera de alcance

Multinivel, pagos en efectivo sin soporte, referidos entre contactos finales (CRM-001) y comisiones por inferencia (BOT-001).

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| BILL-001 | Aplicación del crédito de referidos a la próxima factura: campo de crédito, reducción del total y referencia al crédito redimido. |
| ADM-001 | Inquilinos, roles y comunidad (`originator`); el beneficiario es el inquilino. El área de gestión de referidos vive en el backoffice de la SaaS. |
| REP-001 | Conversión de referidos, CAC, LTV y costo del programa. |
| DSN-001 | Panel de referidos con la tabla estándar. |

## 8. Trazabilidad

- L1 (2026-10-24): «estaba pensando en aplicar algun tema de marketing de afiliado reconociendo un determinado valor como incentivo a aquellos usuarios que vinculen al sistema a mas personas, gancho ideal para los denominados lideres de comunidad.»
- L2 (2026-10-24): «Deja documentado los modelos propuestos, elimina "Trial extendido" y agrega "Comisión en Efectivo para quien refiere y Descuento para el referido". Deja esto documentado pero pendiente de decision de equipo para madurar la idea con el componente comercial.»
- L3 (2026-10-24): «Se habia indicado que esto debe ser administrable desde el backoffice de la SaaS, dado que es un tema comercial debe ser parametrizable, para que se pueda varian con facilidad en el tiempo, tambien se establecio que es redimible por unica vez por referido y solo cuando este este activo es decir haya realizado el pago efectivo de un plan sin importar si es de periodicidad mensual o anual. Tambien que dichos creditos deben tener una vigencia maxima de un año contados desde la fecha efectiva de su acreditación. Resumiendo debe existir una area de gestion de sistema de referidos. El sistema de referidos debe poder ser activado o desactivado a un solo clic, los credito acumulados se mantienen ante una inactivacion de la funcionalidad. Por defecto inicia activa.Valida este contexto y ajusta la documentacion»
- 2026-10-24: O-01 cerrada con Modelo A; O-02 cerrada como recompensa parametrizable desde backoffice (monto fijo o porcentaje, nunca un número fijo de créditos); O-03 cerrada como programa unilateral (solo el referente); O-04 cerrada con tope total configurable, sin valor fijo por defecto; O-05 cerrada con ventana de atribución de 60 días, configurable; O-06 cerrada como no aplicable en Modelo A; O-07 cerrada como programa permanente con toggle. Se agregan redención única por referido, vigencia de 365 días, activo por defecto y persistencia de créditos al desactivar.
- 2026-10-24, interpretación aplicada: «redimible por única vez por referido» = un solo crédito por referido; puede aplicarse parcialmente en una o varias facturas hasta agotar `remaining_cents` o vencer. Si el negocio exige consumo en una sola factura, se ajusta antes de implementar.
- 2026-10-25, corrección del usuario: la recompensa se define como **valor fijo en moneda o porcentaje de la primera factura**, configurable desde el backoffice; **no es un número fijo de créditos**. El tope por referente también es configurable y no tiene valor fijo por defecto.
