# SPEC-16 · Programa de Referidos en el Backoffice del Inquilino: Enlace Único, Métricas y Canje de Créditos

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-16` |
| **Nombre** | Programa de Referidos del Inquilino: Enlace Único, Seguimiento, Antifraude y Canje en Suscripción |
| **Tipo de intervención** | Nuevo desarrollo de UI y endpoints sobre servicios de dominio existentes (`REF-001`) |
| **Prioridad** | P2 — Media (canal orgánico de crecimiento del ecosistema y reducción de costo de plan) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin`, `apps/web` (si captura cookie/query `?r={code}` en registro/landing) |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-07` |
| **Specs previas relacionadas** | `REF-001`, `BILL-001`, `ADM-001` |
| **Specs integradas / dependientes** | `SPEC-04` (aplica `availableCreditCents` de referidos al calcular factura neta de Wompi / Stripe / Bre-B en renovación o upgrade), `SPEC-14` (notificación al ganar recompensa por referido calificado), `SPEC-17` (i18n y tablas estándar) |
| **Wave de ejecución sugerida** | Wave 4 — Expansión de Valor y Reglas Transversales UI |

---

## 3. Problema / Situación actual

El análisis del repositorio confirma que el motor de dominio del Programa de Referidos (`REF-001`) ya está diseñado e implementado en `packages/domain`:
- Esquema `packages/domain/src/db/schemas/admin/referrals.ts` (`referralPrograms`, `referralCodes`, `referrals`, `referralRewards`).
- Servicios `packages/domain/src/services/referrals.service.ts` (`ReferralsService.ensureReferralCode`, `ReferrerPanelData`, reglas antifraude y calificación al primer pago) y `packages/domain/src/services/referral-credit-billing.manager.ts`.
- Gestión administrativa SaaS ya operativa en `apps/admin/app/admin/referrals/` y `/api/admin/referrals`.

Sin embargo, el **Backoffice del Inquilino carece por completo de acceso al programa de referidos (`GEN-07`)**:
1. No existe ninguna ruta `/workspace/referrals` ni elemento en `TenantWorkspaceShell` para que el propietario del comercio obtenga su código o enlace de referido (`mocter.co/r/{code}`), consulte cuántos comercios invitó, cuáles pagaron su primera factura, ni cuánto crédito acumulado tiene vigente para descontar de su plan.
2. No existe endpoint `/api/tenant/referrals` autenticado para el comercio.

---

## 4. Objetivo y valor de negocio

Exponer de forma clara, transparente y segura el **Programa De Referidos** al inquilino en `/workspace/referrals`:
- Generar y presentar su **enlace único compartible** (botón copiar en 1 clic, QR compartible opcional) y reglas claras de la recompensa vigente en `admin.referral_programs`.
- Mostrar en tiempo real sus **métricas** (referidos pendientes, calificados, recompensados, crédito total ganado y crédito disponible vigente con fecha de expiración a 365 días).
- Integrar la visualización y aplicación del saldo de créditos de referidos directamente en el cálculo neto de pagos/renovaciones (`SPEC-04`).

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Verificación de `ReferralsService` (`getReferrerPanelData(clientId, clientSlug)`) para asegurar:
  - Construcción agnóstica de entorno de `referralLink` usando `env.NEXT_PUBLIC_APP_URL` / dominio configurado en `@t3-oss/env-nextjs` (prohibido hardcodear dominio o puertos locales `AGENTS.md §4.12`, `§4.16`).
  - Exposición del historial paginado de `referrals` del comercio **enmascarando información confidencial** de los referidos (mostrar razón social / nombre comercial parcial o alias + estado + fecha + recompensa ganada, sin filtrar emails personales ni datos tributarios completos).
  - Visualización de `referralRewards` disponibles con su fecha de vencimiento (`expiresAt`) y ledger de redenciones en facturas de `SPEC-04`.
- Creación de endpoints en `apps/admin`:
  - `GET /api/tenant/referrals`: Garantiza existencia del código único (`ensureReferralCode`) si el programa está activo y retorna `ReferrerPanelData` + términos vigentes del `ReferralProgram` activo.
- Creación de vista `apps/admin/app/workspace/referrals/page.tsx` [Nuevo] + `referrals-view.tsx` [Nuevo] + ítem en menú lateral `TenantWorkspaceShell` («Programa De Referidos» visible para `tenancy_owner`).
- Garantía de captura y atribución en registro nuevo (`apps/web` / `/register`) cuando llega con parámetro `?r={code}` o cookie de atribución.

### Fuera de alcance
- Retiro de créditos de referidos en efectivo a cuentas bancarias (los créditos aplican únicamente como descuento directo en facturación de suscripciones SaaS según modelo de `REF-001` y `SPEC-04`).
- Referidos multinivel (solo aplica Modelo A unilateral de 1 nivel).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Consultar su código único, copiar enlace, ver métricas, referidos y saldo de créditos disponibles para usar en su plan | Sí | Solo de su `client_id` |
| `tenancy_users` (`tenant_agent`) | Ver métricas financieras de referidos, recompensas o canjear créditos de facturación | No | `403 Forbidden` (módulo oculto en navegación lateral para agentes) |
| `platform_owner` / `platform_admin` | Configurar reglas globales del programa (`active/paused`, fijo o porcentaje) en `/admin/referrals` | Sí | Ya existente |

---

## 7. Modelo de datos

Reutiliza íntegro el esquema existente de `packages/domain/src/db/schemas/admin/referrals.ts`:
- **`admin.referral_programs`**: `status` (`'active' | 'paused' | 'ended'`), `reward_type` (`'fixed' | 'percent'`), `reward_value`, `currency`, `attribution_days` (default `60`), `cap_referrals_per_referrer`, `credit_validity_days` (default `365`).
- **`admin.referral_codes`**: `client_id` único, `code` (ej. `ANDES482`), `status` (`'active' | 'disabled'`).
- **`admin.referrals`**: `referrer_client_id`, `referred_client_id`, `referral_code_id`, `status` (`'pending' | 'qualified' | 'rewarded' | 'rejected'`), `rejection_reason`, `attributed_at`, `qualified_at`, `expires_at`.
- **`admin.referral_rewards`**: `client_id`, `referral_id`, `amount_cents`, `remaining_cents`, `currency`, `status` (`'available' | 'partially_redeemed' | 'redeemed' | 'expired'`), `expires_at`.

---

## 8. Reglas de negocio

- **RN-SPEC-16-01 (Generación determinista bajo programa activo):** Si existe un `referral_programs` con `status = 'active'`, al abrir `/workspace/referrals` por primera vez, el sistema invoca idempotente `ensureReferralCode(clientId, clientSlug)` asignando un código legible al comercio. Si el programa está `paused`, la UI informa claramente el estado sin permitir generar nuevos referidos bonificables mientras dure la pausa, conservando disponibles los créditos ya ganados vigentes.
- **RN-SPEC-16-02 (Protección antifraude visible y estricta `REF-001`):** Se rechazan automáticamente en atribución/calificación (`status = 'rejected'`): autorreferencias (`referrer_client_id === referred_client_id`), coincidencia exacta de documento tributario/identidad (`tax_id` / `DNI`) entre referente y referido, o abuso desde misma IP dentro de la ventana de verificación.
- **RN-SPEC-16-03 (Disparo de recompensa al primer pago efectivo confirmado):** Ninguna prueba gratuita (`trialing`) ni reporte Bre-B pendiente (`pending_review`) otorga crédito anticipado. La recompensa pasa a `available` exclusivamente cuando la primera factura paga del referido queda en estado `paid` (vía Wompi, Stripe o aprobación manual de comprobante Bre-B en `SPEC-04`).
- **RN-SPEC-16-04 (Privacidad de comercios referidos):** El listado mostrado en `/workspace/referrals` nunca expone datos privados de contacto (correo, teléfono, documento tributario ni facturación exacta) del comercio referido, mostrando únicamente nombre comercial abreviado/identificador seguro, fecha de registro, estado (`Pendiente Primer Pago` / `Acreditado` / `No Elegible`) y crédito generado.
- **RN-SPEC-16-05 (Redención FIFO en checkout SaaS `SPEC-04`):** Los créditos disponibles (`remaining_cents > 0`, `expires_at > NOW()`) se aplican en orden FEFO (primero los próximos a vencer) al generar una factura en `/workspace/billing` (`SPEC-04`), reduciendo el importe final a transferir por Wompi, Stripe o Bre-B (hasta un mínimo de `$0` o mínimo técnico de pasarela).

---

## 9. Contratos de interfaz

### 9.1 `GET /api/tenant/referrals` [Nuevo]
- **Autenticación:** Exclusivo `tenancy_owner` (`403` para `tenant_agent`).
- **Query:** `?page=1&limit=20&status=`.
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "data": {
      "program": {
        "status": "active",
        "rewardType": "fixed",
        "rewardValue": 50000,
        "currency": "COP",
        "attributionDays": 60,
        "creditValidityDays": 365
      },
      "code": "ANDES482",
      "referralLink": "https://mocter.co/r/ANDES482",
      "metrics": {
        "totalReferred": 4,
        "pendingCount": 2,
        "rewardedCount": 2,
        "totalEarnedCents": 10000000,
        "availableCreditCents": 5000000
      },
      "referrals": { "items": [...], "total": 4, "page": 1, "limit": 20 },
      "rewards": [
        { "id": "uuid", "amountCents": 5000000, "remainingCents": 5000000, "expiresAt": "2027-11-13T00:00:00Z", "status": "available" }
      ]
    }
  }
  ```

---

## 10. Especificación de UI/UX

- **Vista `/workspace/referrals` (`referrals-view.tsx`):**
  - Tarjeta hero con **Tu Enlace De Referido**, campo de solo lectura con botón **«Copiar Enlace»** (feedback visual «Copiado»), botón **«Copiar Código»** y explicación clara de cómo funciona en 3 pasos (*Comparte tu enlace → Tu referido paga su primer plan → Recibes crédito automático para tu suscripción*).
  - 4 KPIs claros Mobile First: Total Invitados, En Periodo De Prueba / Pendientes, Recompensados, y **Saldo Disponible Para Tu Plan** (con botón rápido «Aplicar En Mi Suscripción» hacia `/workspace/billing`).
  - Tabla estándar paginada/filtrable (`SPEC-17`) de **Comercios Invitados** y bloque inferior con **Créditos Y Vencimientos**.
  - Todos los labels en **Title Case**, idioma `es`/`en`, cero códigos internos (`REF-001`, `GEN-07`).

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Panel de programa de referidos para el propietario del comercio

  Escenario: Propietario visualiza por primera vez su enlace único de referido y métricas reales
    Dado que existe un programa de referidos "active" otorgando "$50.000 COP" por referido que pague su primer plan
    Y el comercio "Café Andes" aún no tenía código asignado
    Cuando el propietario accede a "/workspace/referrals" (GET "/api/tenant/referrals")
    Entonces el sistema genera un único código legible "ANDES..." y retorna el enlace construido desde el dominio configurado en entorno
    Y muestra las tarjetas de métricas, la explicación de recompensa y la tabla vacía o poblada de invitados

  Escenario: Acreditación automática al aprobarse la primera factura paga de un referido
    Dado que "Tienda Beta" se registró con el código "ANDES482" de "Café Andes" durante un trial inicial
    Cuando "Tienda Beta" paga su primera factura (vía Wompi o aprobación manual Bre-B)
    Entonces "ReferralsService.qualifyReferral" cambia el referido a "rewarded" y acredita la recompensa vigente en "availableCreditCents" de "Café Andes"
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Parámetros de paginación o filtro de estado inválidos rechazados
    Dado que el cliente invoca GET "/api/tenant/referrals?limit=999"
    Cuando el servidor valida los query params con Zod
    Entonces responde HTTP 400 Problem Details exigiendo un límite válido
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo antifraude ante autorreferencia o coincidencia de NIT/documento
    Dado que el propietario de "Café Andes" (NIT 900111222) registra un segundo comercio intentando usar su propio código "ANDES482"
    Cuando se evalúa la atribución antifraude en "ReferralsService"
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
```

---

## 12. Requisitos no funcionales

- **Compatibilidad de entorno (`AGENTS.md §4.12`, `§4.16`):** El enlace `mocter.co/r/{code}` se construye usando variable de entorno `NEXT_PUBLIC_APP_URL` declarada en `env.ts` / `.env.example`, nunca hardcoded ni con puertos locales.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.referrals.panel_loaded`, `referrals.reward_credited`, `referrals.fraud_rejected` con `requestId`, `clientId`.

---

## 13. Dependencias y riesgos

- **Dependencias:** `REF-001` (`ReferralsService` + `ReferralCreditBillingManager`), `SPEC-04` (calificación tras pago Bre-B/Wompi/Stripe y aplicación de créditos en checkout), `SPEC-14` (notificación de recompensa), `SPEC-17` (tablas estándar).
- **Riesgos:**
  - *Pérdida de parámetro `?r={code}` durante registro/verificación de email:* Mitigado almacenando `referralCode` en sesión/cookie `HttpOnly` de registro hasta completar alta en `POST /api/tenant/register`.

---

## 14. Definition of Done

- [ ] Repositorio Drizzle completo conectado a `ReferralsService.getReferrerPanelData` y endpoint `GET /api/tenant/referrals` protegido para `tenancy_owner` con `handle()` RFC 9457.
- [ ] Enlace `/workspace/referrals` agregado en `TenantWorkspaceShell` (visible únicamente a `tenancy_owner`) + vista `referrals-view.tsx` en `es`/`en`, Title Case, Mobile First y tabla estándar.
- [ ] Integración verificada entre confirmación de pago (`SPEC-04`), calificación de referido y visualización de crédito redimible.
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas abiertas para esta especificación.

