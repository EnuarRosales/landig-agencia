# SPEC-04 · Flujo Integral de Suscripción SaaS, Trial, Pago con Bre-B y Renovación / Upgrade

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-04` |
| **Nombre** | Flujo Integral de Suscripción SaaS, Periodo de Prueba, Pago con Bre-B y Renovación / Upgrade |
| **Tipo de intervención** | Nuevo desarrollo de negocio + Remediación de endpoint crítico (`/api/billing/checkout`) |
| **Prioridad** | P0 — Crítica (monetización SaaS, onboarding Paso 5 y continuidad operativa) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `ONB-12`, `PLN-02`, `PLN-03`, `PLN-04` |
| **Specs previas relacionadas** | `BILL-001`, `ADM-001`, `NTF-001`, `REF-001` |
| **Specs dependientes** | `SPEC-06` (Paso 5 de Onboarding consume la sesión de pago o activación de prueba), `SPEC-14` (plantillas de email para `D-5`, `D-0` y confirmación/rechazo de comprobante Bre-B) |
| **Wave de ejecución sugerida** | Wave 2 — Monetización, Identidad y Onboarding |

---

## 3. Problema / Situación actual

La infraestructura de facturación de la SaaS presenta vacíos operativos que impiden al comercio pagar, iniciar su prueba de forma formal o renovar/cambiar de plan desde la interfaz:

1. **Endpoint de checkout inyectado con stub (`ONB-12`, `PLN-02`, `PLN-04`):**
   - `apps/admin/app/api/billing/checkout/route.ts` (línea 84) exporta `export const POST = createCheckoutRouteHandler({} as any);`, por lo que toda petición de checkout falla en ejecución y usa captura insegura `catch (error: any)`.
2. **Ausencia del flujo completo en Paso 5 de Onboarding y `/workspace/billing` (`ONB-12`, `PLN-02`):**
   - No existe la transición unificada que permita elegir entre **«Pagar Plan Ahora»** o **«Iniciar Periodo De Prueba»** (usando `plans.trial_days`), ni la experiencia de pago o renovación/upgrade de suscripción desde `apps/admin/app/workspace/billing/billing-view.tsx` (`PLN-04`).
3. **Inexistencia del canal Bre-B para Colombia ni confirmación manual con continuidad (`ONB-12` — precisión obligatoria):**
   - `admin.payment_gateways_config` (`packages/domain/src/db/schemas/admin/payment-gateways-config.ts`) y `GatewaysConfigForm` (`apps/admin/app/admin/billing/gateways-config-form.tsx`) contemplan únicamente `wompi` y `stripe`. No existe soporte para **Bre-B** (sistema oficial de pagos inmediatos e interoperables de Colombia del Banco de la República), ni generación de llave + Código QR dinámico con el monto exacto, ni carga de voucher/comprobante, ni bandeja de aprobación/rechazo manual en `/admin/billing` manteniendo la continuidad de prueba o plan actual mientras se verifica.
4. **Falta de control de activación/desactivación uniforme de canales SaaS y avisos `D-5` / `D-0` (`PLN-03`):**
   - Es necesario garantizar que todos los canales de cobro de la SaaS (`wompi`, `stripe`, `bre_b`) puedan activarse/desactivarse desde `/admin/billing` y emitir alertas visibles en el Backoffice + recordatorios `D-5` y `D-0` antes del vencimiento.

---

## 4. Objetivo y valor de negocio

Formalizar e implementar de punta a punta el ciclo financiero entre el **inquilino y la plataforma Mocter**:
- Habilitar la suscripción al plan desde el **Paso 5 del Onboarding** con opción explícita de pago inmediato o acceso inmediato en **periodo de prueba** (`trial_days`).
- Incorporar **Bre-B (Colombia)** como tercer canal oficial sin pasarela ni costo transaccional, con llave en texto, **Código QR dinámico con monto exacto**, reporte de comprobante/voucher por el inquilino, revisión manual en `/admin/billing` y **continuidad garantizada** (mantiene trial para comercio nuevo o condiciones del plan vigente para comercio antiguo durante la verificación).
- Conectar `POST /api/billing/checkout`, `wompi`, `stripe` y `bre_b` bajo control de activación/desactivación desde `/admin/billing`.
- Entregar autogestión de **renovación, cambio de ciclo y upgrade de plan** en `/workspace/billing`, además de **recordatorios visibles e email `D-5` y `D-0`** antes del vencimiento.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Extensión de canales de pago de la SaaS (`wompi`, `stripe`, **`bre_b`**) con switch `isEnabled` administrable en `/admin/billing` (`GatewaysConfigForm`).
- Configuración específica de `bre_b` en `/admin/billing`: país válido exclusivamente Colombia (`CO`), moneda `COP`, titular/comercio receptor, tipo de llave Bre-B, valor de llave Bre-B en texto y plantilla/parámetros de generación de QR dinámico con valor exacto.
- Tabla/entidad para reportes de pago manual (`admin.billing_manual_payment_reports`) y carga segura de comprobante/voucher hacia SeaweedFS (`SPEC-00`).
- Bandeja de verificación manual de vouchers Bre-B en `/admin/billing` con acciones «Aprobar Pago» y «Rechazar Pago».
- Regla de continuidad de servicio mientras el voucher está `pending_review` (mantiene `trialing` en nuevos o plan vigente en antiguos).
- Flujo de activación de periodo de prueba (`POST /api/tenant/billing/trial`), checkout/pago de plan (`POST /api/billing/checkout` corregido), renovación, cambio de ciclo (`monthly`/`annual`) y upgrade de plan (`POST /api/tenant/billing/upgrade`).
- Alerta in-app de vencimiento próximo (`<= 5 días`) + job/trigger de notificaciones `D-5` y `D-0` (emitiendo evento hacia el sistema de plantillas de `SPEC-14`).

### Fuera de alcance
- Pasarelas de cobro para que los clientes finales le paguen al comercio inquilino (restricción inicial: la SaaS no procesa pagos de clientes del inquilino; esos canales informativos viven en `SPEC-05`).
- Diseño de los pasos 1–4 del asistente de onboarding (cubierto por `SPEC-06`).
- Edición visual de plantillas HTML de email (`SPEC-14`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Iniciar trial, pagar plan, reportar comprobante Bre-B, renovar o cambiar de plan | Sí | Solo sobre su `client_id` activo |
| `tenancy_users` (`tenant_agent`) | Iniciar pagos, cambiar plan o reportar comprobantes | No | Recibe `403 Forbidden`; tampoco accede a facturas SaaS |
| `platform_owner` / `platform_admin` | Activar/desactivar Wompi, Stripe o Bre-B y configurar llave Bre-B en `/admin/billing` | Sí | Auditoría obligatoria en `admin.audit_log` |
| `platform_owner` / `platform_admin` | Aprobar o rechazar manualmente comprobantes Bre-B en `/admin/billing` | Sí | Exige motivo si rechaza; registra revisor y timestamp |

---

## 7. Modelo de datos

### 7.1 Extensión de `admin.payment_gateways_config` (`packages/domain/src/db/schemas/admin/payment-gateways-config.ts`)
- Ampliar dominio permitido de `id` (y constraint/validación Zod): `'wompi' | 'stripe' | 'bre_b'`.
- Campos adicionales (o en columna JSONB estructurada `channel_metadata` con comentarios SQL):
  - `supported_countries`: `TEXT[]` / `JSONB` (ej. `['CO']` obligatorio para `'bre_b'`, `['CO']` o configurable para `'wompi'`, `['*']` para `'stripe'`).
  - `bre_b_key_type`: `VARCHAR(32)` nullable (`'phone' | 'email' | 'document' | 'alphanumeric' | 'merchant_code'`).
  - `bre_b_key_value`: `VARCHAR(160)` nullable (llave pública en texto mostrada al comercio).
  - `bre_b_recipient_name`: `VARCHAR(160)` nullable (nombre del titular receptor en Banco de la República / entidad).
  - `bre_b_qr_payload_template`: `TEXT` nullable (plantilla parametrizada para renderizar código QR dinámico con el monto exacto en COP y referencia de orden).

### 7.2 Extensión de `admin.subscriptions` y `admin.payments` (`packages/domain/src/db/schemas/admin/billing.ts`)
- Ampliar `gateway` permitido en `payments` y `subscriptions`: `'wompi' | 'stripe' | 'bre_b' | 'trial'`.
- Estados válidos de `subscriptions.status`: `'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'`.
- Añadir en `subscriptions`:
  - `pending_upgrade_plan_id`: `UUID` FK nullable → `admin.plans.id` (para no mutar ni perder el plan anterior mientras un voucher Bre-B de upgrade/renovación espera confirmación).
  - `pending_upgrade_cycle`: `VARCHAR(16)` nullable (`'monthly' | 'annual'`).
  - `d5_reminder_sent_at`: `TIMESTAMPTZ` nullable (idempotencia de aviso `D-5`).
  - `d0_reminder_sent_at`: `TIMESTAMPTZ` nullable (idempotencia de aviso `D-0`).

### 7.3 Nueva tabla `admin.billing_manual_payment_reports` (`packages/domain/src/db/schemas/admin/billing.ts`)
- `id`: `UUID` PK.
- `client_id`: `UUID` FK → `admin.clients.id`, `NOT NULL`, indexado.
- `subscription_id`: `UUID` FK → `admin.subscriptions.id`, `NOT NULL`.
- `invoice_id`: `UUID` FK → `admin.invoices.id`, `NOT NULL`.
- `target_plan_id`: `UUID` FK → `admin.plans.id`, `NOT NULL`.
- `target_cycle`: `VARCHAR(16)` (`'monthly' | 'annual'`), `NOT NULL`.
- `operation_kind`: `VARCHAR(24)` (`'new_subscription' | 'renewal' | 'upgrade'`), `NOT NULL`.
- `channel`: `VARCHAR(16)` (`'bre_b'`), `NOT NULL`.
- `expected_amount_cents`: `BIGINT` `NOT NULL`.
- `reported_amount_cents`: `BIGINT` `NOT NULL`.
- `currency`: `VARCHAR(8)` (`'COP'`), `NOT NULL`.
- `payment_reference`: `VARCHAR(120)` nullable (referencia o CUS de transferencia reportada por el inquilino).
- `voucher_media_key`: `TEXT` `NOT NULL` (ruta privada en SeaweedFS del comprobante subido — jamás pública sin firma).
- `voucher_mime_type`: `VARCHAR(64)` `NOT NULL`.
- `dynamic_qr_payload`: `TEXT` `NOT NULL` (snapshot exacto del payload QR mostrado al momento de generar la orden).
- `bre_b_key_snapshot`: `VARCHAR(160)` `NOT NULL`.
- `status`: `VARCHAR(24)` (`'pending_review' | 'approved' | 'rejected'`), `NOT NULL`, default `'pending_review'`.
- `submitted_by_user_id`: `UUID` `NOT NULL`.
- `reviewed_by_user_id`: `UUID` nullable.
- `reviewed_at`: `TIMESTAMPTZ` nullable.
- `rejection_reason`: `TEXT` nullable.
- `created_at`, `updated_at`: `TIMESTAMPTZ`.
- **Estrategia de eliminación:** No se eliminan reportes financieros (`ON DELETE RESTRICT`); historial contable inmutable con estado `approved`/`rejected`.

---

## 8. Reglas de negocio

- **RN-SPEC-04-01 (Activación e independencia de canales de cobro SaaS):** Todos los canales de pago de suscripción (`wompi`, `stripe`, `bre_b`) poseen un interruptor `isEnabled` administrado exclusivamente desde `/admin/billing`. En el selector de pago del inquilino solo se muestran los canales donde `isEnabled = true` y cuya cobertura geográfica/monetaria aplique.
- **RN-SPEC-04-02 (Restricción territorial y monetaria exclusiva de Bre-B):** El método **Bre-B** solo está disponible cuando el país del comercio (`admin.clients.country` o perfil de facturación) sea Colombia (`CO`) y la moneda de cobro sea `COP`. Para comercios de otros países o cobros en `USD`, Bre-B no aparece como opción ni se acepta en el backend (`422 BRE_B_COLOMBIA_ONLY`).
- **RN-SPEC-04-03 (QR Dinámico con monto exacto y llave en texto Bre-B):** Al seleccionar Bre-B para una suscripción, renovación o upgrade, el sistema calcula el importe neto final en COP (aplicando créditos de referidos disponibles si aplica, nunca negativo), genera un payload de QR dinámico que embebe exactamente dicho monto y referencia de factura, y presenta simultáneamente la llave Bre-B en texto plano para copia manual.
- **RN-SPEC-04-04 (Reporte obligatorio de voucher y verificación manual SaaS):** Un pago vía Bre-B no activa automáticamente el plan pago ni cobra comisión de pasarela. El inquilino debe adjuntar su comprobante/voucher (`PNG`, `JPG`, `WEBP` o `PDF`, máximo 10 MiB); el reporte nace en `pending_review` y pasa a la cola del Backoffice SaaS (`/admin/billing`) donde un administrador aprueba o rechaza manualmente con trazabilidad completa.
- **RN-SPEC-04-05 (Continuidad garantizada durante verificación manual Bre-B — Regla Vinculante):** Mientras exista un reporte Bre-B en estado `pending_review`:
  - **Comercio nuevo:** Mantiene activo su estado de periodo de prueba (`subscriptions.status = 'trialing'`) con acceso completo a la plataforma conforme a `plans.trial_days` del plan seleccionado. Si no tenía trial creado aún al reportar en el paso 5 del onboarding, se le inicializa `trialing` automáticamente.
  - **Comercio antiguo (renovación o upgrade):** Conserva íntegramente su `plan_id`, límites, cuotas y capacidades actuales hasta que el pago sea confirmado manualmente en `/admin/billing`. En renovaciones próximas al vencimiento, la suscripción permanece operativa en estado de gracia verificada mientras exista un `pending_review` abierto (sujeto a política configurable de días máximos de espera en revisión).
- **RN-SPEC-04-06 (Activación o rechazo tras revisión manual):**
  - Al **aprobar** el pago Bre-B: se marca el reporte `approved`, la factura pasa a `paid`, se crea/actualiza la suscripción al `target_plan_id` / `target_cycle`, se sincroniza `admin.clients.plan_id` y `quota_version`, y se envía correo de confirmación al inquilino.
  - Al **rechazar** el pago Bre-B: es obligatorio indicar motivo (`>= 10` caracteres); el reporte pasa a `rejected`, la factura pendiente queda cancelada o reintentable, no se aplica upgrade ni renovación, y el comercio (si es nuevo, sigue su trial hasta su expiración natural; si es antiguo, mantiene su estado base real) recibe notificación por correo y en UI para reintentar o cargar otro voucher.
- **RN-SPEC-04-07 (Acceso gratuito a periodo de prueba sin cobro):** Si el inquilino elige «Comenzar Periodo De Prueba» en Onboarding (`ONB-12`), se crea su suscripción con `status = 'trialing'`, `trial_ends_at = NOW() + plans.trial_days * INTERVAL '1 day'` sin requerir tarjeta ni comprobante previo (salvo que un plan tenga `trial_days = 0`, caso en el cual exige pago previo).
- **RN-SPEC-04-08 (Alertas de vencimiento `D-5` y `D-0`):** Un proceso programado idempotente evalúa diariamente suscripciones próximas a expirar (`trial_ends_at` o `current_period_end`): emite alerta + email en `D-5` (5 días antes) y en `D-0` (día del vencimiento), registrando `d5_reminder_sent_at` y `d0_reminder_sent_at` para evitar envíos duplicados, además de mostrar banner contextual en `/workspace` cuando faltan `<= 5` días.
- **RN-SPEC-04-09 (Cambio de plan / Upgrade y Renovación `PLN-04`):** El `tenancy_owner` puede iniciar desde `/workspace/billing` la renovación anticipada, el cambio de ciclo (`monthly` ↔ `annual`) o el cambio a un plan superior/diferente activo (`is_public = true`), recalculando cuotas automáticamente tras la confirmación del pago.

---

## 9. Contratos de interfaz

### 9.1 `POST /api/billing/checkout` (Remediación de handler `{}` → servicio real)
- **Autenticación:** `tenancy_owner` del `clientId` solicitado (`403` si otro tenant o `tenant_agent`).
- **Request JSON:** `{ clientId, planId, cycle, gateway: 'wompi' | 'stripe' | 'bre_b', operationKind: 'new_subscription' | 'renewal' | 'upgrade' }`.
- **Response `200 OK`:**
  - Si `wompi` o `stripe`: `{ ok: true, data: { gateway, checkoutUrl, invoiceId, amountCents, currency } }`.
  - Si `bre_b`: `{ ok: true, data: { gateway: 'bre_b', invoiceId, amountCents, currency: 'COP', breB: { recipientName, keyType, keyValue, dynamicQrPayload, dynamicQrSvgDataUrl, referenceCode } } }`.
- **Errores RFC 9457:** `422 GATEWAY_DISABLED`, `422 BRE_B_COLOMBIA_ONLY`, `422 PENDING_BRE_B_REVIEW_EXISTS`.

### 9.2 `POST /api/tenant/billing/trial` [Nuevo]
- **Propósito:** Activa el periodo de prueba en Paso 5 de Onboarding o cuando el comercio elegible inicia su prueba.
- **Response `200 OK`:** Suscripción en `trialing` con `trialEndsAt`.

### 9.3 `POST /api/tenant/billing/bre-b/report` [Nuevo — Multipart FormData]
- **Propósito:** Recibe `invoiceId`, `paymentReference`, `reportedAmountCents` y archivo `voucher` (`File`). Sube el comprobante a SeaweedFS bajo prefijo privado `billing-vouchers/{clientId}/...`, crea el registro en `admin.billing_manual_payment_reports` en `pending_review`, garantiza estado de continuidad (trial en nuevos / conserva plan actual en antiguos), y dispara evento de notificación a administración.

### 9.4 `GET /api/admin/billing/gateways` y `PUT /api/admin/billing/gateways` (Extensión)
- Soporta `id: 'wompi' | 'stripe' | 'bre_b'`, persistiendo configuración específica Bre-B y toggle `isEnabled` uniforme para los tres métodos.

### 9.5 `GET /api/admin/billing/manual-reports` y `POST /api/admin/billing/manual-reports/[id]/review` [Nuevos]
- **Autenticación:** `platform_owner` / `platform_admin`.
- `GET`: Lista reportes ordenados por `pending_review` primero, con URL firmada/protegida de descarga temporal del comprobante.
- `POST .../review`: `{ action: 'approve' | 'reject', rejectionReason?: string }`. Ejecuta transacción atómica de aprobación o rechazo + emisión de email al comercio.

### 9.6 `POST /api/admin/billing/reminders/dispatch` (Cron / Job interno)
- Evalúa suscripciones `D-5` y `D-0` de forma idempotente y delega el envío a las plantillas de `SPEC-14`.

---

## 10. Especificación de UI/UX

- **En `/admin/billing` (Backoffice SaaS):**
  - Pestaña «Canales De Pago»: 3 tarjetas homologadas con interruptor «Canal Activo» (`wompi`, `stripe`, **Bre-B (Solo Colombia)**). La tarjeta Bre-B incluye selector «Tipo De Llave Bre-B», campo «Llave Bre-B», campo «Titular Receptor» y nota aclaratoria de cero costo transaccional y verificación manual.
  - Pestaña «Pagos Bre-B Por Verificar» (con badge numérico de pendientes): tabla paginada, con filtros y ordenamiento (`AGENTS.md §4.8`), vista previa segura del comprobante adjunto, detalle de monto esperado vs reportado y botones en Title Case «Aprobar Pago» / «Rechazar Pago» usando modales `--dsn-*` (solicita motivo obligatorio al rechazar; nunca `window.confirm`).
- **En Onboarding Paso 5 y `/workspace/billing` (Backoffice Inquilino):**
  - Selector claro de ciclo (`Mensual` / `Anual`) y catálogo comparativo para Upgrade/Renovación (`PLN-04`).
  - Selector de método de cobro mostrando únicamente los canales habilitados y válidos para el país/moneda del comercio (`Wompi`, `Stripe`, `Bre-B`).
  - Al seleccionar **Bre-B**, tarjeta Mobile First clara con:
    1. Monto exacto a transferir en COP.
    2. **Código QR Dinámico** nítido (con fondo claro para lectura confiable en apps bancarias colombianas).
    3. **Llave Bre-B en texto** con botón «Copiar Llave».
    4. Zona de carga «Subir Comprobante De Transferencia» y campo «Referencia De Transferencia (Opcional)» + botón «Reportar Pago».
  - Estado visual cuando existe comprobante en revisión: banner azul/ámbar informativo *«Tu pago por Bre-B está en verificación. Sigues operando normalmente con tu periodo de prueba / plan actual mientras confirmamos la transferencia.»*
  - Banner de alerta de vencimiento en shell del workspace cuando restan `<= 5` días del periodo actual o trial.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Suscripción SaaS, periodo de prueba, pagos Bre-B y renovación/upgrade

  Escenario: Inquilino nuevo omite pago inmediato y accede en periodo de prueba en el paso 5
    Dado que el comercio "Boutique Sol" seleccionó el plan "Emprendedor" con "trial_days = 14"
    Cuando en el paso 5 elige "Comenzar Periodo De Prueba"
    Entonces el backend crea una suscripción con estado "trialing" y fecha de fin a 14 días
    Y redirige al tablero operativo del inquilino sin solicitar datos de tarjeta

  Escenario: Inquilino en Colombia paga con Bre-B mediante QR dinámico y mantiene su trial mientras se verifica
    Dado que el canal "bre_b" está activo en "/admin/billing" con llave "@mocter" y el comercio "Tienda Bogotá" está en Colombia (COP)
    Cuando el propietario elige pagar el plan mensual de "$149.000 COP" con Bre-B
    Entonces el sistema genera la factura pendiente, muestra la llave "@mocter" en texto y un Código QR Dinámico con monto exacto "149000" COP
    Cuando el propietario sube el archivo PDF del comprobante y pulsa "Reportar Pago"
    Entonces el comprobante se almacena en SeaweedFS y el reporte queda en estado "pending_review"
    Y el comercio nuevo conserva estado "trialing" operativo sin bloquear su acceso

  Escenario: Administrador SaaS aprueba pago Bre-B y activa suscripción o upgrade
    Dado que existe un reporte Bre-B en estado "pending_review" por renovación o upgrade del comercio "Tienda Bogotá"
    Cuando el administrador ingresa a "/admin/billing", visualiza el voucher y pulsa "Aprobar Pago"
    Entonces el sistema marca el reporte como "approved", la factura como "paid", actualiza la suscripción al plan y ciclo pagados
    Y el comercio pasa a reflejar el nuevo plan y límites de inmediato

  Escenario: Recordatorio automático en D-5 y D-0 de vencimiento de suscripción o trial
    Dado que existen dos comercios cuya fecha de expiración es dentro de exactamente 5 días (D-5) y hoy (D-0)
    Cuando se ejecuta la tarea programada de recordatorios de facturación
    Entonces se emite un único aviso y correo correspondiente a D-5 y D-0 respectivamente actualizando "d5_reminder_sent_at" y "d0_reminder_sent_at"
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de reporte Bre-B sin archivo de voucher o formato inválido
    Dado que el propietario intenta enviar un reporte Bre-B sin adjuntar archivo o adjuntando un ejecutable ".exe"
    Cuando envía POST "/api/tenant/billing/bre-b/report"
    Entonces el servidor responde HTTP 400 Problem Details rechazando la solicitud
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bre-B oculto e impedido para comercios fuera de Colombia o facturación en USD
    Dado que el comercio "Miami Shop" tiene país "US" y moneda "USD"
    Cuando consulta métodos de pago disponibles o invoca POST "/api/billing/checkout" con gateway "bre_b"
    Entonces el canal Bre-B no aparece disponible y una invocación directa retorna HTTP 422 "BRE_B_COLOMBIA_ONLY"

  Escenario: Continuidad del plan actual para comercio antiguo si Bre-B está en verificación o es rechazado
    Dado que el comercio antiguo "Moda Med" tiene plan "Básico" vigente y reporta un voucher Bre-B para hacer upgrade a "Pro"
    Cuando el reporte queda en "pending_review" y posteriormente es rechazado por el administrador con motivo "Monto incompleto"
    Entonces durante todo el trámite "Moda Med" conserva intacto su plan "Básico"
    Y tras el rechazo recibe notificación con el motivo "Monto incompleto" sin quedar bloqueado ni promovido al plan "Pro"

  Escenario: Canal desactivado desde el Backoffice de la SaaS no puede usarse para pagar
    Dado que el administrador desactiva el interruptor "isEnabled = false" para "wompi" en "/admin/billing"
    Cuando un comercio intenta iniciar checkout con "wompi"
    Entonces el backend responde HTTP 422 "GATEWAY_DISABLED"
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Un colaborador del comercio o un usuario de otro comercio no puede aprobar ni leer vouchers ajenos
    Dado que un usuario "tenant_agent" o un propietario del comercio B intenta acceder a un comprobante del comercio A o al endpoint "/api/admin/billing/manual-reports/[id]/review"
    Cuando realiza la petición HTTP
    Entonces el backend responde HTTP 403 Forbidden y jamás expone la URL del comprobante
```

### (e) Escenarios de borde

```gherkin
  Escenario: Prevención de doble envío de reporte Bre-B para una misma factura pendiente
    Dado que ya existe un reporte "pending_review" asociado a la factura pendiente de un comercio
    Cuando intenta reportar un segundo comprobante sobre la misma factura en revisión
    Entonces el backend responde HTTP 422 "PENDING_BRE_B_REVIEW_EXISTS" indicando que ya hay un pago en verificación
```

---

## 12. Requisitos no funcionales

- **Integridad financiera e idempotencia:** Aprobación manual dentro de `db.transaction` con `SELECT ... FOR UPDATE` sobre `billing_manual_payment_reports` para impedir doble acreditación ante clics simultáneos; cálculo de importes estrictamente en centavos enteros (`BIGINT`).
- **Seguridad de vouchers:** Carga en bucket/prefijo privado en SeaweedFS (`SPEC-00`); los administradores previsualizan vía proxy autenticado `/api/admin/billing/manual-reports/[id]/voucher` con validación de rol `platform_*`, nunca vía URLs públicas predecibles.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino JSON `billing.checkout.created`, `billing.breb.reported`, `billing.breb.reviewed`, `billing.reminder.dispatched` con `requestId`, `clientId`, `invoiceId`, sin datos de tarjetas.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-00` (SeaweedFS operativo para guardar vouchers), `SPEC-03` (catálogo completo de planes y capacidades), `SPEC-14` (plantillas de email `D-5`, `D-0`, confirmación/rechazo Bre-B).
- **Riesgos:**
  - *Compatibilidad del estándar QR de Bre-B / EMVCo Colombia:* Mitigado parametrizando generador determinístico basado en estándar EMVCo/QR interoperable vigente de Banco de la República y validándolo visualmente en pruebas humanas (`T-HUMANO`).
  - *Comercio antiguo con periodo expirado justo durante revisión lenta del admin:* Mitigado otorgando ventana de gracia controlada mientras exista `status = 'pending_review'` (máximo configurable en plataforma, p. ej. 72h).

---

## 14. Definition of Done

- [ ] Eliminado stub `{} as any` y `catch (error: any)` en `apps/admin/app/api/billing/checkout/route.ts`.
- [ ] `admin.payment_gateways_config` y `GatewaysConfigForm` actualizados con toggles reales para `wompi`, `stripe` y `bre_b` (exclusivo CO/COP).
- [ ] Generador de QR Dinámico Bre-B + carga privada de voucher + bandeja de aprobación/rechazo en `/admin/billing` funcionando extremo a extremo.
- [ ] Regla de continuidad verificada con tests de integración para inquilinos nuevos (`trialing`) y antiguos (conservación de plan vigente).
- [ ] Flujo de Renovación / Cambio de ciclo / Upgrade en `/workspace/billing` y recordatorios `D-5` / `D-0` implementados con pruebas automatizadas.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Todos los aspectos funcionales de `ONB-12`, `PLN-02`, `PLN-03`, `PLN-04` (incluyendo los tres canales configurables y las reglas exactas de Bre-B) quedaron confirmados explícitamente por el usuario.

