# BILL-001 · Requisitos · Facturación SaaS, pagos y comprobantes

| Atributo | Valor |
|---|---|
| ID | BILL-001 |
| Versión | 1.3 (Aprobada — payment_methods, prorrateo y créditos) |
| Fecha | 2026-10-25 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md). REP-001 consume su facturación; no es una dependencia de BILL-001. |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Gestionar el ciclo de cobro de la suscripción SaaS: registro de pasarela de pagos dual (**Wompi** para Colombia y **Stripe** para pagos internacionales), cobros recurrentes, dunning, conciliación, aplicación de **créditos de referidos** en factura, captura de datos fiscales para facturación electrónica futura (bajo estándar de **Matías API**) y emisión de comprobantes de pago internos descargables en Excel y PDF tanto para el inquilino como para la SaaS.

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «aqui tenemos un cuello de botella por que si vamos a tener varios planes de un valor monetario se debe contemplar para la SaaS un tema de gestion de pagos con registro de pasarela de pagos y demas temas como la facturacion electronica basada en normatividad colombiana.»
- «Problema es que se requiere recibir pagos no solo de Colombia, tambien internacionales, se requiere una pasarela de pagos internacional.»
- «Confirmo a Wompi con su documentacion 'https://docs.wompi.co/docs/', pero tambien es necesario tener una pasarela internacional se define a Stripe basados en su documentacion 'https://docs.stripe.com/apis'.»
- «En la fase inicial del sistema se requiere simplemente capturar los datos requeridos para realizar la facturacion electronica futura para ello consultar las especificaciones en 'https://api-v2.matias-api.com/api/docs', por el momento no se emitira factura, simplemente un comprobante de pago que se podra consulta en el backoffice tanto del inquilino como de la SaaS y al inquilino se le debe enviar por correo su comprobante. La SaaS e inquilino debe poder exportar en formato excel y .pdf, esto para el registro de pagos recibidos/realizado segun cada caso por diferentes criterios diario, semanal, mensual, trimestral, semestras, anual y por rango de fechas especifico.»
- «En esta primera implementacion no se a aplicaran retenciones o cobros de impuestos, Maquina de estados aprobada, Bajo interpretacion de la documentacion de las pasarelas de pago propuestas se deben establecer los criterios de aceptacion.»

## 3. Requisitos funcionales

### RF-01 · Suscripciones y planes
| ID | Requisito |
|---|---|
| RF-01.1 | El inquilino se suscribe a un plan del catálogo de ADM-001 (`plans`), con ciclo mensual o anual. |
| RF-01.2 | La suscripción tiene estados: `trialing`, `active`, `past_due`, `suspended`, `cancelled`; el plan vigente se refleja en `clients.plan_id` y `client_plans`. |
| RF-01.3 | Cambios de plan (upgrade/downgrade) aplican prorrateo y quedan auditados; la cancelación mantiene el servicio hasta el fin del ciclo pagado. |
| RF-01.4 | El trial del plan es de 14 días por defecto, configurable por plataforma. |
| RF-01.5 | **Prorrateo por días restantes:** si cambia de plan a mitad de ciclo, `credit = precio_actual × días_restantes / días_del_ciclo` y `charge = precio_nuevo × días_restantes / días_del_ciclo`; `net = charge − credit` se aplica en la próxima factura. Si el neto es negativo, queda como crédito a favor; el total nunca es negativo. Cada cambio se registra en `subscription_changes` con `from_plan_id`, `to_plan_id`, `net_cents` y auditoría. |

### RF-02 · Pasarelas de pagos duales (Wompi y Stripe)
| ID | Requisito |
|---|---|
| RF-02.1 | **Wompi (Colombia):** Soporta métodos locales tokenizados (PSE, Nequi, Bancolombia Transferencia y tarjetas de crédito/débito). La moneda base de cobro es COP. |
| RF-02.2 | **Stripe (Internacional):** Soporta tarjetas de crédito/débito globales tokenizadas vía Stripe Elements / Payment Intents. La moneda base de cobro es USD. |
| RF-02.3 | **Cero almacenamiento de PAN:** Mocter **nunca almacena números de tarjeta ni CVV** en sus bases de datos ni logs; únicamente almacena tokens de cliente/método (`gateway_customer_id`, `gateway_payment_method_id`, marca y últimos 4 dígitos). |
| RF-02.4 | **Webhooks idempotentes:** Los eventos de cobro (`transaction.updated` en Wompi, `payment_intent.succeeded` en Stripe) se procesan verificando la firma criptográfica del webhook y garantizando idempotencia por `gateway_reference` único. |
| RF-02.5 | **Métodos tokenizados:** los tokens de cliente/método (`gateway_customer_id`, `gateway_payment_method_id`), marca y últimos 4 dígitos viven en `payment_methods`, con `is_default` y estado. Nunca se almacenan PAN ni CVV. |

### RF-03 · Ciclo de facturación interna y dunning
| ID | Requisito |
|---|---|
| RF-03.1 | Cada ciclo genera una factura interna en la entidad `invoices` con la máquina de estados: `borrador` → `emitida` → `pagada` \| `vencida` \| `anulada`. |
| RF-03.2 | En esta fase inicial **no se aplican retenciones ni cobros de IVA/impuestos**: `tax_cents = 0`. El total es `subtotal_cents - credit_cents` y nunca puede ser negativo. |
| RF-03.3 | Un pago fallido dispara reintentos automáticos (días 3, 5 y 7); durante este lapso la suscripción pasa a `past_due`. Agotados los reintentos, el inquilino pasa a `suspended` (afectando `clients.lifecycle_status`). |
| RF-03.4 | Un pago regularizado devuelve la suscripción y el inquilino al estado `active` de forma inmediata. |
| RF-03.5 | **Créditos de referidos:** al emitir una factura, BILL-001 consulta los créditos `available`/`partially_redeemed` de REF-001 del inquilino, los imputa por orden de vencimiento y reduce `total_cents`. Registra `credit_cents` y `applied_referral_credit_id`; descuenta `remaining_cents` en REF-001: si llega a cero pasa a `redeemed`, si queda saldo pasa a `partially_redeemed`. Si el total queda en cero, la factura se marca `pagada` sin llamar a la pasarela. |

### RF-04 · Captura de datos fiscales (Matías API) y comprobantes de pago
| ID | Requisito |
|---|---|
| RF-04.1 | **No emisión DIAN en v1:** No se emite factura electrónica UBL 2.1 ante la DIAN en la fase inicial. |
| RF-04.2 | **Captura de datos fiscales:** El sistema captura y valida los campos requeridos por la especificación de **Matías API** (`Customer`): `identity_document_id` (tipo documento: CC, NIT, CE, etc.), `dni` (número de identificación / NIT con DV), `company_name` (razón social o nombres y apellidos) y `email` de facturación. |
| RF-04.3 | **Comprobante de pago interno:** Al confirmarse el pago, se genera un comprobante con consecutivo interno consultable en el backoffice del inquilino y en el backoffice de la SaaS. |
| RF-04.4 | **Envío por correo:** El comprobante de pago se despacha automáticamente al correo fiscal del inquilino al confirmarse la transacción. |
| RF-04.5 | **Exportación a Excel y PDF:** Tanto el inquilino como la SaaS pueden exportar el listado de comprobantes y pagos en formatos **Excel (`.xlsx`) y PDF (`.pdf`)** con filtros por período: diario, semanal, mensual, trimestral, semestral, anual y rango de fechas personalizado. |

### RF-05 · Roles, auditoría e i18n
| ID | Requisito |
|---|---|
| RF-05.1 | `platform_owner` y `platform_admin` tienen control total de cobros, planes y reportes de la SaaS; el `tenant_owner` accede exclusivamente a sus propios comprobantes y métodos de pago. |
| RF-05.2 | Todo intento de cobro, webhook y cambio de estado se audita cumpliendo `DAT-001` RF-10.9. |
| RF-05.3 | Todas las vistas de facturación y comprobantes están internacionalizadas (es/en, Español por defecto). |

---

## 4. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Latencia de API | P95 ≤ 200 ms en consulta de métodos y comprobantes; P95 ≤ 500 ms en generación de checkout session. |
| RNF-02 | Disponibilidad | 99.9% de uptime para endpoints de recepción de webhooks de pasarelas. |
| RNF-03 | Procesamiento de Webhooks | Tiempo de procesamiento del webhook ≤ 1.5 s; confirmación de HTTP 200 a la pasarela antes de tareas pesadas (despacho de emails asíncrono). |
| RNF-04 | Seguridad Financiera | Cumplimiento estricto de nivel PCI-DSS SAQ A (tokenización en cliente, cero PAN/CVV en servidores Mocter). Firma de webhooks validada mediante secreto HMAC compartido. |
| RNF-05 | Exportación | Generación de archivos Excel (`.xlsx`) y PDF (`.pdf`) para hasta 10,000 registros en ≤ 3.0 s. |

---

## 5. Criterios de Aceptación (BDD)

### CA-BILL-01 · Procesamiento idempotente de webhook Wompi
- **Dado** que un inquilino realiza un pago mediante PSE en Colombia por valor de 150,000 COP,
- **Cuando** Wompi envía el webhook `transaction.updated` con estado `APPROVED` y referencia `wompi_ref_123`,
- **Entonces** el sistema valida la firma del checksum contra el secreto configurado, cambia el estado de la factura de `emitida` a `pagada`, activa la suscripción y genera el comprobante de pago;
- **Y si** Wompi reenvía el mismo evento con la misma referencia, el sistema responde HTTP 200 sin duplicar pagos ni emitir un segundo comprobante.

### CA-BILL-02 · Procesamiento de pago internacional vía Stripe
- **Dado** que un inquilino internacional adquiere un plan en USD mediante tarjeta de crédito,
- **Cuando** Stripe confirma el evento `payment_intent.succeeded` con referencia `pi_stripe_456`,
- **Entonces** se valida la firma de Stripe (`Stripe-Signature`), se actualiza la factura a `pagada`, se asocia el método de pago tokenizado para renovación futura y se dispara el correo con el comprobante adjunto.

### CA-BILL-03 · Captura de datos fiscales bajo estándar Matías API
- **Dado** un inquilino en su proceso de checkout o configuración de cuenta,
- **Cuando** ingresa sus datos fiscales (`identity_document_id=3`, `dni="900123456-1"`, `company_name="Soluciones SAS"`, `email="facturacion@soluciones.com"`),
- **Entonces** el sistema valida la coherencia del DNI y formato de email, almacenándolos en `client_billing_profiles` listos para integración futura con la API de Matías.

### CA-BILL-04 · Exportación de comprobantes en Excel y PDF
- **Dado** un administrador en el panel del inquilino o el superadmin en el panel de la SaaS,
- **Cuando** selecciona el filtro de período "trimestral" y pulsa "Exportar Excel",
- **Entonces** se descarga un archivo `.xlsx` estructurado con columnas de fecha, referencia, pasarela, monto, moneda y estado de comprobante;
- **Y cuando** pulsa "Exportar PDF", se descarga un documento vectorizado paginado con los mismos registros.

### CA-BILL-05 · Dunning y ciclo de gracia
- **Dado** un intento de cobro automático que resulta rechazado por fondos insuficientes,
- **Cuando** la pasarela notifica el rechazo,
- **Entonces** la factura pasa a `vencida`, la suscripción a `past_due`, se agenda el segundo intento a los 3 días y se envía un correo de alerta al inquilino;
- **Y si** tras el intento del día 7 no hay pago, la suscripción pasa a `suspended` y el inquilino se suspende en la plataforma.

### CA-BILL-06 · Aplicación de créditos de referidos
- **Dado** un inquilino con un crédito `available` de 50,000 COP y una factura emitida de 150,000 COP,
- **Cuando** BILL-001 genera la factura,
- **Entonces** registra `credit_cents = 50,000`, `total_cents = 100,000` y descuenta `remaining_cents` en REF-001 hasta cero, dejando el crédito `redeemed`;
- **Y si** el crédito supera el total de la factura, el total queda en cero, la factura se marca `pagada` sin pasarela y el remanente queda `partially_redeemed` hasta su vencimiento.

### CA-BILL-07 · Prorrateo por cambio de plan
- **Dado** un inquilino en un plan mensual de 100,000 COP con 15 días restantes del ciclo de 30,
- **Cuando** cambia a un plan de 200,000 COP,
- **Entonces** el sistema calcula `credit = 50,000`, `charge = 100,000`, `net = 50,000`, registra el cambio en `subscription_changes` y aplica el neto en la próxima factura;
- **Y si** el nuevo plan es más barato y el neto es negativo, el crédito queda a favor y el total de la factura nunca es negativo.

---

## 6. Decisiones del documento

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | La facturación SaaS vive en el Router Global (plano de control). | Coherente con `plans`, `clients` y `client_plans`. |
| D-02 | Pasarela dual: Wompi (Colombia) y Stripe (Internacional). | Cobertura total de pagos locales e internacionales sin intermediación manual. |
| D-03 | No emisión de factura electrónica DIAN en v1; captura de campos Matías API. | Elimina bloqueantes regulatorios iniciales y prepara el terreno para la Fase 1.1. |
| D-04 | Emisión de comprobantes internos descargables en Excel y PDF y enviados por email. | Transparencia contable inmediata para inquilino y SaaS. |
| D-05 | Sin retenciones ni cobro de impuestos en v1. | Modelo financiero simplificado para el lanzamiento. |
| D-06 | Máquina de estados: `borrador` → `emitida` → `pagada` \| `vencida` \| `anulada`. | Consistencia de estados en todo el ciclo de vida de cobro. |
| D-07 | Los créditos de referidos se aplican a la próxima factura, por orden de vencimiento y sin reembolso en efectivo. | Reduce el total a pagar y evita payout; el remanente se conserva hasta vencer. |
| D-08 | Los tokens de pago viven en `payment_methods`; el gateway custodia PAN/CVV. | Cumple PCI-DSS SAQ A y RF-02.3. |
| D-09 | El cambio de plan usa prorrateo por días restantes y se registra en `subscription_changes`. | Coherente con RF-01.3 y con la vista de upgrade de LND-001. |

## 7. Decisiones abiertas

No quedan decisiones abiertas en BILL-001.

Cerradas el 2026-10-24:
- O-01: Wompi + Stripe como pasarelas oficiales.
- O-02: Proveedor DIAN diferido; captura de datos fiscales según Matías API y emisión de comprobantes internos.
- O-03: Sin retenciones ni cobros de impuestos en v1.
- O-04: Trial de 14 días ratificado.
- O-05: Moneda COP en Wompi y USD en Stripe.

## 8. Fuera de alcance

Emisión directa de factura electrónica UBL 2.1 a la DIAN (reservada para Fase 1.1), pasarelas de pago de criptoactivos, liquidación contable tributaria compleja y cobro online a clientes finales del inquilino (dominio de tienda del inquilino, no de la SaaS).

## 9. Anexo i18n · Catálogo de Cadenas

| Clave | Español (`locales/es.json`) | Inglés (`locales/en.json`) |
|---|---|---|
| `billing.title` | Facturación y Comprobantes | Billing and Receipts |
| `billing.receipt` | Comprobante de Pago | Payment Receipt |
| `billing.status.draft` | Borrador | Draft |
| `billing.status.issued` | Emitida | Issued |
| `billing.status.paid` | Pagada | Paid |
| `billing.status.past_due` | Vencida | Past Due |
| `billing.status.void` | Anulada | Void |
| `billing.export.excel` | Exportar Excel (.xlsx) | Export Excel (.xlsx) |
| `billing.export.pdf` | Exportar PDF (.pdf) | Export PDF (.pdf) |
| `billing.filter.custom` | Rango personalizado | Custom range |
| `billing.fiscal.tax_id` | Número de identificación / NIT | Tax ID / NIT |
