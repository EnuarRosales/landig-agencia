# SPEC-16 · Programa de Referidos en el Backoffice del Inquilino: Enlace Único, Métricas y Canje de Créditos

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-16` |
| **Nombre** | Programa de Referidos del Inquilino: Enlace Único, Seguimiento, Antifraude y Canje en Suscripción |
| **Tipo de intervención** | Desarrollo de UI, endpoints, migración incremental, atribución cross-portal y canje FEFO sobre `REF-001` |
| **Prioridad** | P2 — Media (canal orgánico de crecimiento del ecosistema y reducción de costo de plan) |
| **Versión** | 1.1.0 (Decisiones de diseño D-01 a D-04 ratificadas) |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`, `apps/web` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-07` |
| **Specs previas relacionadas** | `REF-001`, `BILL-001`, `ADM-001`, `SPEC-04`, `SPEC-14`, `SPEC-17` |
| **Specs integradas / dependientes** | `SPEC-04` (calificación automática tras pago Wompi/Stripe/Bre-B y aplicación FEFO de créditos en checkout `/workspace/billing`), `SPEC-14` (`referral.registered` y `referral.reward_credited` vía `NotificationDispatcherService`), `SPEC-17` (i18n bilingüe `es`/`en` y `DataTable` estándar) |
| **Wave de ejecución sugerida** | Wave 4 — Expansión de Valor y Reglas Transversales UI |

---

## 3. Problema / Situación actual

El motor base del Programa de Referidos (`REF-001`) existe en `packages/domain`:
- Esquema `packages/domain/src/db/schemas/admin/referrals.ts` (`referralPrograms`, `referralCodes`, `referrals`, `referralRewards`).
- Servicios `packages/domain/src/services/referrals.service.ts` y `packages/domain/src/services/referral-credit-billing.manager.ts`.
- Gestión administrativa SaaS en `apps/admin/app/admin/referrals/` y `/api/admin/referrals`.

Sin embargo, existen brechas críticas de extremo a extremo (`GEN-07`):
1. El Backoffice del Inquilino no dispone de ruta `/workspace/referrals`, acceso en `TenantWorkspaceShell` ni endpoint autenticado `GET /api/tenant/referrals`.
2. No existe la ruta corta pública `/r/[code]` en `apps/web`, `/register` no captura ni persiste códigos de referido, y en el flujo real el registro (`POST /api/auth/register`) solo crea el `user`, mientras el comercio (`admin.clients`) recién se crea en `apps/admin` durante el Paso 1 del Onboarding (`POST /api/tenant/onboarding`).
3. `CheckoutService` (`SPEC-04`) emite facturas con `creditCents: 0` sin consultar `referral_rewards`, y `ReferralCreditBillingManager` presenta un defecto al redimir múltiples recompensas en una misma factura (solo descuenta la última recompensa iterada).
4. `BillingService.registerPayment` y `BillingService.reviewManualBreBReport` no disparan `ReferralsService.qualifyReferral()`, ni las validaciones antifraude de `tax_id`/DNI e IP operan al calificar el primer pago. Además, las recompensas `fixed` heredaban la moneda de la factura del referido en lugar de `program.currency`.

---

## 4. Objetivo y valor de negocio

Exponer de forma clara, transparente y segura el **Programa de Referidos** al propietario del comercio en `/workspace/referrals` y cerrar el ciclo completo de atribución, calificación, notificación y canje:
- Generar y presentar su **enlace único compartible** (`{NEXT_PUBLIC_APP_URL}/r/{code}`), con botón **Copiar Enlace**, botón **Copiar Código** y **Código QR SVG** descargable/compartible, junto a las reglas vigentes en `admin.referral_programs`.
- Mostrar en tiempo real sus **métricas** (total invitados, pendientes de primer pago, recompensados, crédito total ganado y saldo disponible vigente) y tablas paginadas de **Comercios Invitados** (con nombre comercial enmascarado) y **Créditos y Redenciones** vinculadas a facturas.
- Preservar la atribución de extremo a extremo desde `apps/web` (`/r/{code}` → `/register`) hasta Onboarding Paso 1 (`apps/admin`).
- Integrar el **canje FEFO de créditos** con toggle activo por defecto en `/workspace/billing` (`SPEC-04`), liquidando al instante cuando el total neto llega a `$0` y descontando al confirmar el pago cuando existe saldo restante, sin quemar créditos en órdenes abandonadas o reportes Bre-B rechazados.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- **Atribución cross-portal (D-01):**
  - Route Handler `apps/web/app/r/[code]/route.ts`: valida sintaxis del código, guarda cookie `HttpOnly` `mocter_ref` (`SameSite=Lax`, vigencia según `attribution_days` / 60 días) y redirige `307` a `/register?r={code}`.
  - `/register` (`apps/web`): acepta `?r={code}`, alias `?ref={code}` y cookie `mocter_ref`; muestra insignia informativa si hay código de invitación y lo envía a `POST /api/auth/register`.
  - Persistencia en BD de `admin.users.referred_by_code` (migración Drizzle `0044`) + fallback en cookie `mocter_ref`, para resistir verificación de correo en otro dispositivo o cambio de subdominio (`mocter.co` → `admin.mocter.co`).
  - Invocación automática e idempotente de `ReferralsService.attributeReferral()` al crear `admin.clients` en Onboarding Paso 1 (`POST /api/tenant/onboarding`), despachando notificación `referral.registered` (`SPEC-14`).
- **Dominio, antifraude y ledger de redenciones (D-02, D-03):**
  - Migración Drizzle `0044`:
    - `admin.users.referred_by_code` (`varchar(32)`, nullable).
    - `admin.referrals.attributed_ip_hash` (`varchar(128)`, nullable, HMAC-SHA256 con `AUTH_RATE_LIMIT_PEPPER`, nunca IP en claro).
    - `admin.referral_reward_redemptions` (ledger normalizado 1:N entre `referral_rewards` e `invoices`, con restricción única `(reward_id, invoice_id)` para idempotencia estricta).
  - Método `ReferralsService.getTenantReferralsOverview(clientId, clientSlug, publicBaseUrl, query)` con enlace `{publicBaseUrl}/r/{code}`, QR SVG data URL, programa vigente, métricas, historial paginado de referidos con nombre comercial enmascarado (ej. `Café An***`), recompensas vigentes y ledger de redenciones vinculadas a facturas.
  - Antifraude reforzado en atribución **y** calificación (`qualifyReferral`): autorreferencia (`referrer_client_id === referred_client_id`), coincidencia exacta normalizada de `tax_id` / `DNI` (`clients.tax_id` y `client_billing_profiles.dni`) y abuso por misma IP hasheada (`attributed_ip_hash` compartida entre referente y referido o exceso de umbral en ventana de atribución).
  - Corrección de moneda en `qualifyReferral`: las recompensas `fixed` se emiten siempre en `program.currency`; las `percent` en la moneda de la primera factura paga.
  - Corrección del defecto multi-reward en `ReferralCreditBillingManager` y conexión FEFO en `CheckoutService` + `BillingService` (`registerPayment` y `reviewManualBreBReport` approve) + cableado de `getBillingService()` en webhooks Wompi y Stripe.
- **Notificaciones (`SPEC-14`, D-04):**
  - Reutilizar `referral.registered` al atribuir un referido en estado `pending`.
  - Crear evento dedicado `referral.reward_credited` (bilingüe `es`/`en`, email + in-app, remitente `referidos@mocter.co`, configurable en `/workspace/notifications`) disparado al acreditar recompensa en `qualifyReferral`.
- **API y UI del Inquilino (`apps/admin`, D-04):**
  - Declarar `NEXT_PUBLIC_APP_URL` en `apps/admin/env.ts` y verificar `.env.example`.
  - Endpoint `GET /api/tenant/referrals` protegido con `handle()` RFC 9457, rol propietario (`tenant_owner` / `tenancy_owner`, `403` para `tenant_agent`) y validación Zod de query params.
  - Vista `/workspace/referrals` (`page.tsx` + `referrals-view.tsx`) con layout perimetral (`AGENTS.md §4.19`), enlace + Copiar Enlace + Copiar Código + QR SVG descargable, 4 KPIs, tabla estándar `DataTable` de **Comercios Invitados** y bloque **Créditos y Redenciones**, completamente bilingüe (`es`/`en`) y en Title Case gramatical (`AGENTS.md §4.8`).
  - Ítem **Programa de Referidos** en `TenantWorkspaceShell` visible exclusivamente para propietarios (`ownerOnly: true`).
  - Exposición de `availableReferralCreditCents` en `/api/tenant/billing` (`WorkspaceBillingDto`) y toggle «Aplicar Crédito de Referidos» en `BillingCheckoutPanel` (`/workspace/billing`).

### Fuera de alcance
- Retiro de créditos de referidos en efectivo a cuentas bancarias (los créditos aplican únicamente como descuento directo en facturación de suscripciones SaaS según modelo de `REF-001` y `SPEC-04`).
- Referidos multinivel (solo aplica Modelo A unilateral de 1 nivel).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenant_owner` / `tenancy_owner` | Consultar su código único, copiar enlace/QR, ver métricas, referidos enmascarados, créditos, redenciones y canjear saldo en `/workspace/billing` | Sí | Solo de su `client_id` activo |
| `tenant_agent` (`tenancy_users`) | Ver métricas financieras de referidos, recompensas o canjear créditos de facturación | No | `403 Forbidden` (módulo oculto en navegación lateral para agentes) |
| `platform_owner` / `platform_admin` | Configurar reglas globales del programa (`active`/`paused`/`ended`, fijo o porcentaje) en `/admin/referrals` | Sí | Ya existente |

---

## 7. Modelo de datos

Reutiliza y extiende el esquema de `packages/domain/src/db/schemas/admin/referrals.ts` y `users.ts`:
- **`admin.referral_programs`**: `status` (`'draft' | 'active' | 'paused' | 'ended'`), `reward_type` (`'fixed' | 'percent'`), `reward_value` (centavos enteros si `fixed`, porcentaje entero `1..100` si `percent`), `currency` (`'COP' | 'USD'`), `attribution_days` (default `60`), `cap_referrals_per_referrer`, `credit_validity_days` (default `365`).
- **`admin.referral_codes`**: `client_id` único, `code` (ej. `ANDES482`), `status` (`'active' | 'inactive'`).
- **`admin.referrals`**: `program_id`, `referrer_client_id`, `referred_client_id` único, `code`, `status` (`'pending' | 'qualified' | 'rewarded' | 'rejected'`), `rejected_reason`, `attributed_at`, `qualified_at`, **`attributed_ip_hash`** (nuevo, `varchar(128)`, nullable, HMAC-SHA256).
- **`admin.referral_rewards`**: `referral_id` único, `referrer_client_id`, `amount_cents`, `remaining_cents`, `currency`, `status` (`'pending' | 'available' | 'partially_redeemed' | 'redeemed' | 'expired' | 'void'`), `credited_at`, `expires_at`, `redeemed_at`, `applied_invoice_id`.
- **`admin.referral_reward_redemptions`** (nuevo ledger normalizado): `id`, `reward_id` (FK `referral_rewards.id`), `invoice_id` (FK `invoices.id`), `client_id` (FK `clients.id`), `amount_cents` (`bigint > 0`), `currency` (`'COP' | 'USD'`), `redeemed_at`, columnas de auditoría y restricción única `(reward_id, invoice_id)`.
- **`admin.users.referred_by_code`** (nueva columna nullable `varchar(32)`): preserva el código de referido capturado durante el registro hasta que el comercio se materializa en Onboarding Paso 1.

---

## 8. Reglas de negocio

- **RN-SPEC-16-01 (Generación determinista bajo programa activo):** Si existe un `referral_programs` con `status = 'active'`, al abrir `/workspace/referrals` por primera vez, el sistema invoca idempotentemente `ensureReferralCode(clientId, clientSlug)` asignando un código legible al comercio. Si el programa está `paused` o `ended`, la UI informa claramente el estado sin permitir generar nuevos códigos/referidos bonificables mientras dure la pausa, conservando disponibles y visibles los créditos ya ganados vigentes.
- **RN-SPEC-16-02 (Protección antifraude visible y estricta en atribución y calificación):** Se rechazan automáticamente (`status = 'rejected'`):
  1. Autorreferencias (`referrer_client_id === referred_client_id`).
  2. Coincidencia exacta normalizada de documento tributario/identidad (`clients.tax_id` o `client_billing_profiles.dni`) entre referente y referido, verificada tanto en `attributeReferral` como en `qualifyReferral`.
  3. Abuso desde misma IP: `attributed_ip_hash` (HMAC-SHA256 con `AUTH_RATE_LIMIT_PEPPER`) coincidente con el referente o al superar el umbral máximo de atribuciones desde la misma IP dentro de la ventana de atribución (default 3 atribuciones por referente desde una misma IP).
- **RN-SPEC-16-03 (Disparo de recompensa al primer pago efectivo confirmado y moneda segura):** Ninguna prueba gratuita (`trialing`) ni reporte Bre-B pendiente (`pending_review`) otorga crédito anticipado. La recompensa pasa a `available` exclusivamente cuando la primera factura paga del referido queda en estado `paid` (vía Wompi, Stripe o aprobación manual de comprobante Bre-B en `SPEC-04`). Si el programa es `fixed`, el monto se acredita en `program.currency`; si es `percent`, se calcula sobre el monto efectivamente pagado en la moneda de la factura. Al acreditarse, se despacha `referral.reward_credited` (`SPEC-14`).
- **RN-SPEC-16-04 (Privacidad de comercios referidos):** El listado mostrado en `/workspace/referrals` nunca expone datos privados de contacto (correo, teléfono, documento tributario ni facturación exacta) del comercio referido, mostrando únicamente nombre comercial enmascarado (ej. `Café An***`), fecha de registro, estado (`Pendiente de Primer Pago` / `Calificado` / `Acreditado` / `No Elegible`) y crédito generado.
- **RN-SPEC-16-05 (Redención FEFO segura en checkout SaaS `SPEC-04`):** Los créditos disponibles (`remaining_cents > 0`, `expires_at > NOW()`, misma moneda que la factura) se aplican en orden FEFO (primero los próximos a vencer) en `/workspace/billing` mediante un toggle activo por defecto («Aplicar Crédito de Referidos»):
  - Si `totalCents === 0`, la factura se marca `paid` inmediatamente sin pasarela (`gateway: "referral_credit"`), se activa o renueva la suscripción y se registran las deducciones FEFO en `referral_rewards` y `referral_reward_redemptions`.
  - Si `totalCents > 0`, se genera la orden Wompi / Stripe / Bre-B por el importe neto (`subtotalCents - creditCents`), pero los créditos se deducen en `referral_rewards` y `referral_reward_redemptions` únicamente cuando el pago se confirma (`paid`), evitando quemar saldo en órdenes abandonadas o comprobantes Bre-B rechazados.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/referrals` [Nuevo]
- **Autenticación:** Exclusivo propietario del comercio (`tenant_owner` / `tenancy_owner`, `403` para `tenant_agent`), envuelto en `handle()` RFC 9457.
- **Query (Zod):** `?page=1&limit=20&status=pending|qualified|rewarded|rejected` (`page >= 1`, `1 <= limit <= 100`).
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "program": {
        "id": "uuid",
        "name": "Programa de Referidos Mocter",
        "status": "active",
        "rewardType": "fixed",
        "rewardValue": 5000000,
        "currency": "COP",
        "attributionDays": 60,
        "creditValidityDays": 365,
        "capReferralsPerReferrer": null
      },
      "code": "ANDES482",
      "referralLink": "https://mocter.co/r/ANDES482",
      "qrSvgDataUrl": "data:image/svg+xml;base64,...",
      "metrics": {
        "totalReferred": 4,
        "pendingCount": 2,
        "rewardedCount": 2,
        "totalEarnedCents": 10000000,
        "availableCreditCents": 5000000,
        "currency": "COP"
      },
      "referrals": {
        "items": [
          {
            "id": "uuid",
            "referredBusinessMasked": "Tienda Be***",
            "status": "rewarded",
            "attributedAt": "2026-11-10T12:00:00.000Z",
            "qualifiedAt": "2026-11-12T15:30:00.000Z",
            "rewardAmountCents": 5000000,
            "rewardCurrency": "COP"
          }
        ],
        "total": 4,
        "page": 1,
        "limit": 20
      },
      "rewards": [
        {
          "id": "uuid",
          "referralId": "uuid",
          "amountCents": 5000000,
          "remainingCents": 2000000,
          "currency": "COP",
          "creditedAt": "2026-11-12T15:30:00.000Z",
          "expiresAt": "2027-11-12T15:30:00.000Z",
          "status": "partially_redeemed"
        }
      ],
      "redemptions": [
        {
          "id": "uuid",
          "rewardId": "uuid",
          "invoiceId": "uuid",
          "invoiceNumber": "INV-2026-104210",
          "amountCents": 3000000,
          "currency": "COP",
          "redeemedAt": "2026-11-15T09:00:00.000Z"
        }
      ]
    }
  }
  ```
  *(Nota de unidades: `rewardValue` se expresa en centavos cuando `rewardType === "fixed"` —ej. `5000000` equivale a `$50.000 COP`— y en entero `1..100` cuando `rewardType === "percent"`).*

### 9.2 `GET /r/[code]` (`apps/web`) [Nuevo]
- Valida formato del código (`^[A-Za-z0-9_-]{3,32}$`).
- Emite cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` acorde a la ventana de atribución (default 60 días), con nombre `mocter_ref`.
- Redirige `307` hacia `/es/register?r={CODE}` (o locale preferido por el navegador/cookie).

### 9.3 Extensión `POST /api/billing/checkout` y `GET /api/tenant/billing`
- `GET /api/tenant/billing` incluye `availableReferralCreditCents` y `referralCreditCurrency` en `WorkspaceBillingDto`.
- `POST /api/billing/checkout` acepta `applyReferralCredits?: boolean` (default `true`). Si los créditos FEFO cubren el 100%, retorna `{ gateway: "referral_credit", paidWithoutGateway: true, invoiceId, invoiceNumber, subtotalCents, creditsAppliedCents, amountCents: 0, receiptNumber, ... }`.

---

## 10. Especificación de UI/UX

- **Vista `/workspace/referrals` (`referrals-view.tsx`):**
  - Contenedor raíz `w-full space-y-6 p-4 md:px-8 md:py-6` (`AGENTS.md §4.19`).
  - Banner contextual si el programa está pausado o finalizado, aclarando que los créditos vigentes siguen siendo redimibles en `/workspace/billing`.
  - Tarjeta hero **Tu Enlace de Referido** con campo de solo lectura, botón **Copiar Enlace** (feedback «Copiado»), botón **Copiar Código**, panel con **Código QR Compartible** (SVG + botón **Descargar QR**) y guía en 3 pasos (*Comparte tu enlace → Tu referido paga su primer plan → Recibes crédito automático para tu suscripción*).
  - 4 KPIs Mobile First: **Total Invitados**, **Pendientes de Primer Pago**, **Recompensados** y **Saldo Disponible para tu Plan** (con botón rápido **Aplicar en Mi Suscripción** hacia `/workspace/billing`).
  - Tabla estándar `DataTable` (`SPEC-17`) de **Comercios Invitados** (filtro por estado, paginación, degradación a tarjetas en móvil) mostrando nombre comercial enmascarado, fecha, estado y crédito.
  - Sección **Créditos y Redenciones** mostrando lotes de crédito con fecha de vencimiento (`expiresAt`), saldo restante y tabla de redenciones aplicadas a facturas.
  - Todos los labels en **Title Case gramatical estándar** (`AGENTS.md §4.8`), bilingüe `es`/`en`, cero códigos internos (`REF-001`, `GEN-07`, `SPEC-16`).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Panel de programa de referidos para el propietario del comercio

  Escenario: Propietario visualiza por primera vez su enlace único de referido, QR y métricas reales
    Dado que existe un programa de referidos "active" otorgando "$50.000 COP" por referido que pague su primer plan
    Y el comercio "Café Andes" aún no tenía código asignado
    Cuando el propietario accede a "/workspace/referrals" (GET "/api/tenant/referrals")
    Entonces el sistema genera un único código legible "ANDES..." y retorna el enlace "{NEXT_PUBLIC_APP_URL}/r/ANDES..." y su QR SVG
    Y muestra las tarjetas de métricas, la explicación de recompensa, la tabla de invitados y el bloque de créditos y redenciones

  Escenario: Atribución cross-portal desde enlace corto hasta Onboarding Paso 1
    Dado que un prospecto visita "/r/ANDES482" en apps/web y completa su registro y verificación de correo
    Cuando crea su comercio "Tienda Beta" en el Paso 1 del Onboarding en apps/admin
    Entonces "ReferralsService.attributeReferral" registra el referido en estado "pending" y despacha "referral.registered" al referente

  Escenario: Acreditación automática al aprobarse la primera factura paga de un referido
    Dado que "Tienda Beta" se registró con el código "ANDES482" de "Café Andes"
    Cuando "Tienda Beta" paga su primera factura (vía Wompi, Stripe o aprobación manual Bre-B)
    Entonces "ReferralsService.qualifyReferral" cambia el referido a "rewarded", acredita la recompensa en "program.currency" y despacha "referral.reward_credited"

  Escenario: Canje FEFO de créditos en checkout SaaS cubriendo el 100% sin pasarela
    Dado que "Café Andes" tiene "$100.000 COP" disponibles en créditos de referidos (en dos lotes de "$50.000 COP")
    Cuando solicita renovar un plan de "$80.000 COP" en "/workspace/billing" con "Aplicar Crédito de Referidos" activo
    Entonces el checkout liquida la factura en "$0" sin invocar pasarela, activa la suscripción y registra dos redenciones FEFO en "admin.referral_reward_redemptions"
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Parámetros de paginación o filtro de estado inválidos rechazados
    Dado que el cliente invoca GET "/api/tenant/referrals?limit=999"
    Cuando el servidor valida los query params con Zod
    Entonces responde HTTP 400 Problem Details exigiendo un límite válido (1..100)
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo antifraude ante autorreferencia, coincidencia de NIT/DNI o abuso de IP
    Dado que el propietario de "Café Andes" (NIT 900111222) registra un segundo comercio intentando usar su propio código "ANDES482"
    Cuando se evalúa la atribución o la calificación antifraude en "ReferralsService"
    Entonces el referido queda marcado como "rejected" sin generar ningún crédito disponible
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Un colaborador (tenant_agent) no tiene acceso al módulo de referidos ni a créditos financieros
    Dado que un usuario con rol "tenant_agent" está autenticado en el comercio
    Cuando consulta el menú lateral o invoca directamente GET "/api/tenant/referrals"
    Entonces el enlace no aparece en su menú y el endpoint responde HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Programa de referidos pausado permite usar créditos ganados vigentes pero bloquea nuevas atribuciones
    Dado que administración SaaS cambia "referral_programs.status" a "paused"
    Y "Café Andes" aún posee "$50.000 COP" en créditos disponibles no vencidos
    Cuando accede a "/workspace/referrals"
    Entonces visualiza un aviso de programa pausado temporalmente mientras conserva visible su saldo de "$50.000 COP" utilizable en "/workspace/billing"

  Escenario: Orden Bre-B rechazada o checkout abandonado no consume créditos de referidos
    Dado que "Café Andes" inicia una orden Bre-B de "$100.000 COP" aplicando "$50.000 COP" de crédito (neto "$50.000 COP")
    Cuando abandona el checkout o un administrador rechaza el comprobante Bre-B
    Entonces el saldo disponible de "$50.000 COP" permanece intacto
```

---

## 12. Requisitos no funcionales

- **Compatibilidad de entorno (`AGENTS.md §4.12`, `§4.16`):** El enlace `{NEXT_PUBLIC_APP_URL}/r/{code}` se construye usando `NEXT_PUBLIC_APP_URL` declarada en `apps/admin/env.ts`, `apps/web/env.ts`, `packages/domain/src/utils/env.ts` y `.env.example`, nunca hardcoded ni acoplado a puertos locales.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos estructurados Pino `tenant.referrals.panel_loaded`, `referrals.attributed`, `referrals.reward_credited`, `referrals.fraud_rejected`, `referrals.credits_redeemed` con `requestId` y `clientId`.
- **Seguridad y privacidad:** Las IPs para antifraude se almacenan exclusivamente como HMAC-SHA256 con `AUTH_RATE_LIMIT_PEPPER`; nunca se guardan ni registran IPs en claro en tablas de negocio ni se exponen PII de comercios referidos.

---

## 13. Dependencias y riesgos

- **Dependencias:** `REF-001` (`ReferralsService` + `ReferralCreditBillingManager`), `SPEC-04` (`CheckoutService` + `BillingService`), `SPEC-14` (`NotificationDispatcherService`), `SPEC-17` (`DataTable` + diccionarios i18n).
- **Riesgos mitigados:**
  - *Pérdida de `?r={code}` entre `apps/web` y `apps/admin` o entre dispositivos:* Mitigado con cookie `HttpOnly` `mocter_ref` + persistencia en `admin.users.referred_by_code` al registrarse.
  - *Pérdida de créditos en checkouts abandonados:* Mitigado deduciendo créditos parciales exclusivamente al confirmarse el pago (con idempotencia en `referral_reward_redemptions`).
  - *Doble descuento por reintento de webhook:* Mitigado con índice único `(reward_id, invoice_id)` en `admin.referral_reward_redemptions`.

---

## 14. Definition of Done

- [x] Migración Drizzle `0044_spec16_referrals_attribution_and_redemptions.sql` creada, con comentarios de tabla/columna (`AGENTS.md §4.5`), validada con `drizzle-kit check` y aplicada en BD local.
- [x] `ReferralsService` actualizado con `getTenantReferralsOverview`, enmascaramiento de comercios, QR SVG, antifraude en atribución y calificación (`tax_id`/DNI + IP HMAC), moneda segura en `fixed`, y notificaciones `SPEC-14` (`referral.registered` y `referral.reward_credited`).
- [x] `ReferralCreditBillingManager`, `CheckoutService` y `BillingService` integrados con redención FEFO multi-reward idempotente, liquidación `$0` sin pasarela, deducción en confirmación de pago y `qualifyReferral` al pagar primera factura (Wompi, Stripe, Bre-B aprobado).
- [x] Atribución cross-portal implementada (`/r/[code]`, `/register`, `/api/auth/register`, Onboarding Paso 1).
- [x] Endpoint `GET /api/tenant/referrals` (protegido propietario, `handle()` RFC 9457, Zod), vista `/workspace/referrals`, ítem en `TenantWorkspaceShell` y toggle de créditos en `/workspace/billing` (`es`/`en`, Title Case, Mobile First).
- [x] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo `AGENTS.md §4.18` (build, reinicio de servicios Docker afectados y healthcheck HTTP 200).

---

## 15. Decisiones Ratificadas

| ID | Decisión | Estado |
| --- | --- | --- |
| **D-01** | Enlace corto `{NEXT_PUBLIC_APP_URL}/r/{code}` con cookie `HttpOnly` `mocter_ref` + persistencia en `admin.users.referred_by_code` + atribución automática en Onboarding Paso 1. | Ratificada |
| **D-02** | Toggle activo por defecto en `/workspace/billing` («Aplicar Crédito de Referidos»), liquidación inmediata `$0` sin pasarela y deducción FEFO al confirmar pago para órdenes con saldo neto `> $0`. | Ratificada |
| **D-03** | Antifraude `tax_id`/DNI en atribución y calificación + IP hasheada HMAC (`attributed_ip_hash`) + moneda segura `program.currency` para recompensas `fixed`. | Ratificada |
| **D-04** | Evento `referral.registered` en atribución y evento dedicado `referral.reward_credited` (`SPEC-14`) al premiar; QR SVG descargable, tabla de referidos enmascarados y ledger de Créditos y Redenciones en `/workspace/referrals`. | Ratificada |
