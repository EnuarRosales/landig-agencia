# REF-001 · Requisitos · Programa de referidos

| Atributo | Valor |
|---|---|
| ID | REF-001 |
| Versión | 0.1 (Borrador — pendiente de decisión del equipo comercial) |
| Fecha | 2026-10-24 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [BILL-001](../bill-001-facturacion-saas/requirements.md) · [REP-001](../rep-001-informes-dashboards/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Borrador |

## 1. Propósito

Incentivar a los inquilinos —en especial a los líderes de comunidad— que traen nuevos inquilinos a la plataforma. El programa atribuye referidos, califica cuando el referido paga y entrega una recompensa. **El modelo de recompensa queda pendiente de decisión del equipo comercial**: se documentan las dos opciones evaluadas.

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
| RF-02.1 | Un referido califica cuando queda `active` y paga su primera factura (o el hito que defina el programa). |
| RF-02.2 | Se rechazan autorreferencias y duplicados por NIT, dueño, medio de pago o IP; los patrones de alta masiva se marcan para revisión. |
| RF-02.3 | Un referido reembolsado o dado de baja dentro de la ventana revierte la recompensa si aún no se pagó. |

### RF-03 · Recompensas (dos modelos documentados)

| ID | Requisito |
|---|---|
| RF-03.1 | **Modelo A — Crédito en la factura SaaS (recomendado operativamente):** el referente recibe un crédito que se aplica a su próxima factura; sin payout ni tributación de por medio. |
| RF-03.2 | **Modelo B — Comisión en efectivo para quien refiere + descuento para el referido:** el referente recibe un valor monetario (payout) y el referido obtiene un descuento en su plan. Requiere pasarela de payout, soporte tributario colombiano y factura/soporte de la comisión. |
| RF-03.3 | El programa define monto o porcentaje, hito de calificación, tope por referente y duración. El modelo y los valores se fijan en la decisión comercial (O-01 a O-07). |
| RF-03.4 | **No existe recompensa por “trial extendido”.** Las opciones válidas son crédito o comisión + descuento. |

### RF-04 · Aplicación y pago

| ID | Requisito |
|---|---|
| RF-04.1 | El crédito o descuento se aplica en BILL-001 contra la factura correspondiente y queda reflejado en el saldo. |
| RF-04.2 | La comisión en efectivo se paga por la pasarela aprobada, con referencia única y estado (`pending`/`paid`/`failed`); el comprobante y la retención aplicable se registran. |
| RF-04.3 | Ninguna recompensa se paga antes de la calificación del referido. |

### RF-05 · Panel y métricas

| ID | Requisito |
|---|---|
| RF-05.1 | El inquilino ve su código, referidos, estado y recompensa acumulada. |
| RF-05.2 | REP-001 mide conversión de referidos, CAC, LTV y costo del programa por período. |

### RF-06 · Gobernanza

| ID | Requisito |
|---|---|
| RF-06.1 | `platform_owner`/`platform_admin` configuran el programa (modelo, monto, topes, ventana) y pueden pausarlo; `platform_sales` lo consulta. |
| RF-06.2 | Toda tabla cumple la auditoría global (DAT-001 RF-10.9); no se registran datos de pago sensibles. |
| RF-06.3 | La UI cumple i18n (es/en) y DSN-001. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | REF-001 es una spec nueva; no se mezcla con cobro (BILL-001) ni con inferencia (BOT-001). | Dominio de marketing con reglas propias. |
| D-02 | El beneficiario es el inquilino, no el usuario individual. | El líder de comunidad recibe el incentivo a través de su negocio. |
| D-03 | La recompensa se entrega solo tras la calificación del referido. | Evita pagar por altas que no convierten. |
| D-04 | Antifraude obligatorio (autorreferencia, NIT, pago, IP). | Protege el margen del programa. |
| D-05 | Modelo de recompensa **pendiente de decisión comercial**: A (crédito) o B (comisión + descuento). | Se documentan ambos; no se implementa hasta decidir. |
| D-06 | “Trial extendido” queda descartado como recompensa. | Solo crédito o comisión + descuento. |

## 5. Decisiones abiertas (equipo comercial)

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿Modelo A (crédito) o B (comisión en efectivo + descuento al referido)? | Define la infraestructura y el tratamiento tributario. |
| O-02 | ¿Monto fijo o porcentaje de la primera factura? ¿Cuánto? | Margen y atractivo del programa. |
| O-03 | ¿Unilateral o doble (referente y referido)? | Costo y conversión. |
| O-04 | ¿Tope mensual o total por referente? | Control del gasto. |
| O-05 | ¿Ventana de atribución (60 días propuesta)? | Atribución y disputas. |
| O-06 | Si es comisión en efectivo, ¿cómo se trata la retención en la fuente y el soporte? | Cumplimiento tributario colombiano. |
| O-07 | ¿Duración del programa (permanente, por campaña)? | Operación y presupuesto. |

## 6. Fuera de alcance

Multinivel, pagos en efectivo sin soporte, referidos entre contactos finales (CRM-001) y comisiones por inferencia (BOT-001).

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| BILL-001 | Crédito/descuento en facturas y payout si se elige el modelo B. |
| ADM-001 | Inquilinos, roles y comunidad (`originator`); el beneficiario es el inquilino. |
| REP-001 | Conversión de referidos, CAC, LTV y costo del programa. |
| DSN-001 | Panel de referidos con la tabla estándar. |

## 8. Trazabilidad

- L1 (2026-10-24): «estaba pensando en aplicar algun tema de marketing de afiliado reconociendo un determinado valor como incentivo a aquellos usuarios que vinculen al sistema a mas personas, gancho ideal para los denominados lideres de comunidad.»
- L2 (2026-10-24): «Deja documentado los modelos propuestos, elimina "Trial extendido" y agrega "Comisión en Efectivo para quien refiere y Descuento para el referido". Deja esto documentado pero pendiente de decision de equipo para madurar la idea con el componente comercial.»
