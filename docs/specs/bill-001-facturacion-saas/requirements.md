# BILL-001 · Requisitos · Facturación SaaS, pagos y facturación electrónica

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [REP-001](../rep-001-informes-dashboards/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Borrador |

## 1. Propósito

Gestionar el ciclo de cobro de la SaaS: suscripción del inquilino a un plan, registro de la pasarela de pagos, cobros, conciliación, dunning y **facturación electrónica colombiana (DIAN)** mediante un proveedor autorizado. Es el complemento de ADM-001 (planes y ciclo de vida) y de REP-001 (ingresos).

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «aqui tenemos un cuello de botella por que si vamos a tener varios planes de un valor monetario se debe contemplar para la SaaS un tema de gestion de pagos con registro de pasarela de pagos y demas temas como la facturacion electronica basada en normatividad colombiana.»

## 3. Requisitos funcionales

### RF-01 · Suscripciones

| ID | Requisito |
|---|---|
| RF-01.1 | El inquilino se suscribe a un plan del catálogo de ADM-001 (`plans`), con ciclo mensual o anual. |
| RF-01.2 | La suscripción tiene estados: `trialing`, `active`, `past_due`, `suspended`, `cancelled`; el plan vigente se refleja en `clients.plan_id` y `client_plans`. |
| RF-01.3 | Cambios de plan (upgrade/downgrade) aplican prorrateo y quedan auditados; la cancelación mantiene el servicio hasta el fin del ciclo pagado. |
| RF-01.4 | El trial de plan (días) es configurable por plataforma (O-04). |

### RF-02 · Pasarela de pagos

| ID | Requisito |
|---|---|
| RF-02.1 | El inquilino registra un método de pago tokenizado en la pasarela (tarjeta, PSE o Nequi según la pasarela elegida); Mocter **nunca almacena datos de tarjeta**. |
| RF-02.2 | El cobro soporta 3DS cuando la pasarela lo exige y notificaciones por webhook **idempotentes** (misma referencia, un solo pago). |
| RF-02.3 | El método de pago se puede actualizar y eliminar; el predeterminado se usa para el próximo cobro. |
| RF-02.4 | El registro y la actualización del método se hacen desde el panel del inquilino, sin exponer secretos en el frontend. |

### RF-03 · Cobros, dunning y conciliación

| ID | Requisito |
|---|---|
| RF-03.1 | Cada ciclo genera una factura interna con líneas, impuestos, moneda y total; el cobro se intenta en la fecha de renovación. |
| RF-03.2 | Un pago fallido dispara reintentos con días de gracia; agotados los reintentos, el inquilino pasa a `past_due` y luego a `suspended` (ADM-001 `lifecycle_status`). |
| RF-03.3 | Pagos y facturas se concilian por referencia idempotente; reembolsos y notas crédito se registran contra la factura. |
| RF-03.4 | El historial de cobros, pagos, reintentos y notas es visible para el `tenant_owner` y auditable. |

### RF-04 · Facturación electrónica (Colombia)

| ID | Requisito |
|---|---|
| RF-04.1 | La emisión se hace a través de un **proveedor autorizado de facturación electrónica**; Mocter no construye el motor DIAN. |
| RF-04.2 | Se guardan los datos fiscales del inquilino: NIT, razón social, régimen y responsabilidades tributarias; la factura usa IVA y retenciones según su régimen (O-03). |
| RF-04.3 | La factura se emite en XML UBL 2.1 con CUFE, numeración autorizada y PDF; se registran los eventos DIAN (acuse, aceptación, rechazo). |
| RF-04.4 | Las notas crédito se emiten por el mismo canal y quedan vinculadas a la factura original. |
| RF-04.5 | El inquilino descarga XML y PDF de sus facturas desde el panel. |

### RF-05 · Roles, auditoría e i18n

| ID | Requisito |
|---|---|
| RF-05.1 | `platform_owner`/`platform_admin` gestionan planes, cobros y facturación; `platform_sales` consulta lo comercial; el `tenant_owner` ve solo sus facturas y métodos. |
| RF-05.2 | Toda tabla cumple la auditoría global (DAT-001 RF-10.9); no se registran datos de tarjeta ni secretos en logs. |
| RF-05.3 | La UI de facturación cumple la directiva de i18n (es/en) y DSN-001. |

### RF-06 · Reportes

| ID | Requisito |
|---|---|
| RF-06.1 | REP-001 consume suscripciones, cobros, dunning e ingresos para MRR, churn y recaudación. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | La facturación SaaS vive en el Router Global (plano de control). | Coherente con `plans`, `clients` y `client_plans`. |
| D-02 | La pasarela es externa y tokenizada; Mocter nunca toca datos de tarjeta. | Reduce el alcance PCI. |
| D-03 | La facturación electrónica se delega en un proveedor autorizado. | No se construye el motor DIAN; se integra y se audita. |
| D-04 | Un plan vigente por inquilino (coherente con `clients.plan_id`). | El historial vive en `client_plans`. |
| D-05 | Moneda de cobro: la del inquilino (`clients.currency`, COP inicial). | Sin multi-moneda en esta versión. |
| D-06 | Dunning con reintentos y gracia antes de suspender. | Evita cortes por un fallo transitorio. |

## 5. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿Pasarela de pagos: Wompi, Stripe, MercadoPago u otra? | Define métodos (PSE/Nequi/tarjeta), comisiones y webhooks. |
| O-02 | ¿Proveedor autorizado de facturación electrónica? | Define integración, numeración y eventos DIAN. |
| O-03 | ¿IVA y retenciones aplicables por régimen del inquilino? | Afecta el cálculo de la factura y la asesoría contable. |
| O-04 | ¿Días de trial del plan? | Afecta la conversión y el calendario de cobro. |
| O-05 | ¿Los precios de `plans` se fijan en COP o se habilita multi-moneda? | Impacta catálogo y cobros. |

## 6. Fuera de alcance

Construir el motor DIAN, contabilidad general, nómina, impuestos distintos de los de la factura, y la billetera de inferencia de BOT-001 (dominio separado).

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Consume `plans`, `client_plans`, `clients.plan_id` y `lifecycle_status`; agrega datos fiscales al cliente (O-03). |
| REP-001 | MRR, churn, cobros y recaudación. |
| AUTH-001 | Roles de plataforma y acceso del `tenant_owner` a sus facturas. |
| DAT-001 | Auditoría RF-10.9; datos de facturación en el Router. |
| DSN-001 | Vistas de facturación con la tabla estándar. |

## 8. Trazabilidad

- L1 (2026-10-23): «aqui tenemos un cuello de botella por que si vamos a tener varios planes de un valor monetario se debe contemplar para la SaaS un tema de gestion de pagos con registro de pasarela de pagos y demas temas como la facturacion electronica basada en normatividad colombiana.»
