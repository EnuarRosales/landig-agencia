# CHW-002 · Requisitos · Estabilización de la Interoperabilidad Chatwoot–Mocter

| Atributo | Valor |
|---|---|
| ID | CHW-002 |
| Versión | 1.1 |
| Estado | Aprobada · Revisión y remediación SDD cerrada en `/grill-me` |
| Fecha | 2026-11-11 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |
| Depende de | [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [ADM-001](../adm-001-mocter-admin/requirements.md) · [TNT-001](../tnt-001-entorno-operativo-inquilino/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-environment-and-traefik-compatibility.md` · `.agents/rules/rules-for-custom-confirmation-modals-no-native-dialogs.md` · `.agents/rules/rules-for-logging-core-and-server.md` · `.agents/rules/rules-for-exceptions-core-and-server.md` |

---

## 1. Propósito y Motivación

La especificación [CHW-001](../chw-001-inventario-chatwoot/requirements.md) definió el inventario técnico de Chatwoot Community `v4.19.1` como referencia de lectura, mientras que [ADM-001](../adm-001-mocter-admin/requirements.md) y [TNT-001](../tnt-001-entorno-operativo-inquilino/requirements.md) plantearon el aprovisionamiento de cuentas y el acceso embebido en iframe same-site con separación estricta entre el Backoffice Administrativo SaaS (`/admin/*`) y el Backoffice Operativo del Inquilino en su celda (`/workspace/*`, `ADM-001 D-35`).

Durante la auditoría arquitectónica y el contraste con el código de `packages/domain` y `apps/admin`, se identificaron **siete brechas técnicas concretas** que bloquean la comunicación efectiva con Chatwoot, impiden que los inquilinos operen su bandeja en la celda y desalinean el gobierno administrativo del Backoffice SaaS:

1. **Bloqueo permanente (Gating roto) en `/workspace/conversations` (`chatwoot_inboxes` en `plan_limits` vs `plan_capability_values`):**
   `WorkspaceConversationsPage` verifica `context?.capabilities?.chatwoot_inboxes` mediante `TenantCapabilityGateService`. Sin embargo, `chatwoot_inboxes` no es un código booleano en `CHATWOOT_CAPABILITY_CODES` (`admin.plan_capability_values`), sino una dimensión numérica en `admin.plan_limits` (`PLAN_DIMENSION_KEYS`). Como `TenantCapabilityGateService` solo consulta `plan_capability_values` y `client_feature_overrides`, `capabilities.chatwoot_inboxes` evalúa siempre a `undefined` (`false`), bloqueando permanentemente `/workspace/conversations` para todos los planes.
2. **Mapeo defectuoso de límites de plan hacia Chatwoot (`buildChatwootFeaturesAndLimitsForPlan`):**
   En `chatwoot-provisioning.service.ts`, `buildChatwootFeaturesAndLimitsForPlan` evalúa `if (row.dimension === "agents" || row.dimension === "inboxes")` y accede a `row.limitMode`. En el esquema Drizzle real (`admin.plan_limits`), las dimensiones son `"chatwoot_agents"`, `"chatwoot_inboxes"` y `"chatwoot_outbound_emails"`, y la columna de modalidad se llama `row.mode` (`NUMERIC` | `UNLIMITED` | `DISABLED`). Como consecuencia, el objeto `limits` enviado a Chatwoot resulta siempre vacío (`{}`).
3. **Topología de red, colisión de loopback y URL de webhook no alcanzable:**
   El contenedor `admin-portal` requiere un contrato dual (`CHATWOOT_INTERNAL_URL` para llamadas servidor-a-servidor y `NEXT_PUBLIC_CHATWOOT_URL` para el navegador/iframe), alineado en producción con `https://chatapp.mocter.co` según `docs/reference/production-services.md` (sin alterar redes de Traefik, `AGENTS.md` R-03), más una variable tipada `CHATWOOT_WEBHOOK_URL` para que el contenedor de Chatwoot pueda entregar webhooks hacia `mocter-admin` (`/api/webhooks/chatwoot`).
4. **Paquete operativo incompleto y falta de sincronización de etiquetas con la celda (`pg-cell-XX`):**
   `runProvisioningFlow` crea la cuenta, el usuario técnico (`service_user_id`) y el inbox webchat, pero solo almacena las 6 etiquetas reservadas en un `Map` en memoria (`this.labelsByClient`) sin crearlas por HTTP en Chatwoot (`POST /api/v1/accounts/:id/labels`), sin actualizar `chatwoot_label_id` en `admin.tenant_labels` dentro de la celda del inquilino (`pg-cell-XX`), y sin registrar el webhook (`POST /api/v1/accounts/:id/webhooks`).
5. **Ausencia de aprovisionamiento e idempotencia en el Paso 1 del Onboarding (`/onboarding`):**
   `completeStep1Business` en `tenant-onboarding.service.ts` crea o actualiza el cliente en el Paso 1 del Onboarding unificado, pero no invoca `provisionOrRetryAccount` ni verifica si un inquilino proveniente de Alta Manual (`existingClient`) quedó en estado `pending` o `failed` en `admin.chatwoot_accounts`.
6. **Ruta de Embed/SSO ausente en `apps/admin` y resolución de identidad `:user_id` por rol:**
   `apps/admin` carece del Route Handler `/api/auth/chatwoot/embed`. Además, `GET /platform/api/v1/users/:user_id/login` requiere el `:user_id` numérico en Chatwoot respetando el rol del miembro (`tenant_owner` → `administrator`, `tenant_agent` → `agent`) para `/workspace/conversations`, y el `CHATWOOT_SUPER_ADMIN_USER_ID` para el `platform_owner` en `/admin/conversations`.
7. **Acoplamiento indebido de vistas y referencia a ruta inexistente `/admin/tenants/[id]`:**
   Toda la gestión de inquilinos en `apps/admin` reside en el directorio `/admin/tenants` (`TenantActions`), no en una ruta `/admin/tenants/[id]`. Asimismo, la vista administrativa de Chatwoot del Backoffice SaaS (`/admin/conversations`) debe ser **totalmente independiente y diferente** de la vista operativa del inquilino en su celda (`/workspace/conversations`), operando exclusivamente sobre la consola Super Admin de Chatwoot (`/super_admin` y `/super_admin/accounts/:account_id`) sin invadir la bandeja operativa del inquilino.

Esta especificación **CHW-002** formaliza la remediación integral de la interoperabilidad entre Chatwoot y Mocter bajo estas reglas arquitectónicas.

---

## 2. Alcance

### Incluye

- **Gating y mapeo de planes corregidos:** Derivación de `chatwoot_inboxes` en `TenantCapabilityGateService` a partir de `admin.plan_limits` (y overrides) y corrección de `buildChatwootFeaturesAndLimitsForPlan` (`chatwoot_agents` → `limits.agents`, `chatwoot_inboxes` → `limits.inboxes`, `row.mode`).
- **Aprovisionamiento automatizado resiliente (Fail-soft) e idempotente:** Disparo síncrono en Alta Manual (`createAdminTenant`) y en el Paso 1 del Onboarding unificado (`completeStep1Business`, tanto para alta autónoma como para reintento idempotente de alta manual). Persistencia de estado (`pending`, `provisioning`, `active`, `failed`) y `last_error` en `admin.chatwoot_accounts`.
- **Paquete operativo completo en Chatwoot y celda (`pg-cell-XX`):** Creación de cuenta, usuario técnico de servicio con token cifrado (AES-256-GCM con AAD `client_id`), bandeja Webchat inicial, creación HTTP en Chatwoot de las 6 etiquetas reservadas (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`, `soporte`, `escalation-humano`) con actualización de `chatwoot_label_id` en `admin.tenant_labels` de `pg-cell-XX`, y registro automático del webhook hacia `CHATWOOT_WEBHOOK_URL`.
- **Contrato de entorno tipado en `env.ts`:** `CHATWOOT_INTERNAL_URL`, `NEXT_PUBLIC_CHATWOOT_URL`, `CHATWOOT_PLATFORM_TOKEN`, `CHATWOOT_WEBHOOK_URL` y `CHATWOOT_SUPER_ADMIN_USER_ID`, compatibles con desarrollo local y producción (`https://chatapp.mocter.co` bajo Traefik v2.11).
- **Separación estricta entre Backoffice SaaS (`/admin/conversations`) y Operación Celular (`/workspace/conversations`):**
  - En **`/workspace/conversations`** (vista operativa del inquilino en la celda): SSO transparente vía `/api/auth/chatwoot/embed?scope=workspace` con resolución *just-in-time* del usuario en Chatwoot por email de sesión y rol (`tenant_owner` → `administrator`, `tenant_agent` → `agent`), redirigiendo a `/app/accounts/:chatwoot_account_id/dashboard`.
  - En **`/admin/conversations`** (vista de gobierno administrativo de Chatwoot del Backoffice SaaS): consola exclusiva para `platform_owner` / `platform_admin` con telemetría de cuentas aprovisionadas y SSO Super Admin (`/api/auth/chatwoot/embed?scope=admin`) hacia `/super_admin` o la ficha administrativa de una cuenta `/super_admin/accounts/:chatwoot_account_id`, sin compartir componentes `.tsx` ni abrir la bandeja operativa del inquilino.
- **Acciones por inquilino en `/admin/tenants` (`TenantActions`):** Visualización de estado de Chatwoot, botón **«Aprovisionar En Chatwoot» / «Reintentar Sincronización»** con modal de confirmación DSN-001 (`POST /api/admin/tenants/[id]/chatwoot/provision`) y enlace a la ficha administrativa de la cuenta en `/admin/conversations?accountId=<chatwootAccountId>`.

### Excluye

- Modificar el código fuente de Chatwoot Community, su esquema interno o sus migraciones Rails (`AGENTS.md` R-02, CHW-001).
- Utilizar librerías o dependencias de Chatwoot Enterprise (`AGENTS.md` R-02, CHW-001 RF-06).
- Alterar las redes Docker de producción, reglas de balanceo o routers de Traefik (`AGENTS.md` R-03).
- Agregar migraciones SQL en `packages/domain/drizzle` (la estructura existente de `admin.chatwoot_accounts` y `admin.tenant_labels` ya soporta todos los campos requeridos).

---

## 3. Actores y Roles

| Actor | Rol en Mocter | Superficie UI | Permisos e Interacción con Chatwoot |
|---|---|---|---|
| **Platform Owner / Admin SaaS** | `platform_owner`, `platform_admin` | `/admin/conversations` y `/admin/tenants` (Backoffice SaaS) | Accede exclusivamente a la vista administrativa SaaS (`/super_admin` y `/super_admin/accounts/:account_id`) autenticada con `CHATWOOT_SUPER_ADMIN_USER_ID`, audita el estado de aprovisionamiento y dispara aprovisionamientos o reintentos en `/admin/tenants`. Nunca comparte vista con la operación celular del inquilino. |
| **Tenant Owner** | `tenant_owner` | `/workspace/conversations` (Backoffice Celular) | Accede a la bandeja operativa de su comercio (`/app/accounts/:account_id/dashboard`) vía SSO con su propio usuario de Chatwoot resuelto *just-in-time* con rol `administrator`. |
| **Tenant Agent** | `tenant_agent` | `/workspace/conversations` (Backoffice Celular) | Accede a la bandeja operativa de su comercio (`/app/accounts/:account_id/dashboard`) vía SSO con su propio usuario de Chatwoot resuelto *just-in-time* con rol `agent`. |
| **Servicio de Dominio Mocter** | `system` (Backend) | Servicios en `@mocter/domain` | Utiliza `CHATWOOT_PLATFORM_TOKEN` y el `service_token` cifrado sobre `CHATWOOT_INTERNAL_URL` para aprovisionar cuentas, usuarios, bandejas, etiquetas, webhooks y sincronizar capacidades del plan. |

---

## 4. Requisitos Funcionales

### CHW-RF-01 · Habilitación de Plan, Aprovisionamiento Automatizado y Resiliencia (Fail-Soft)

| ID | Requisito |
|---|---|
| **CHW-RF-01.1** | `isChatwootEnabledForPlan` determina si un plan incluye Chatwoot verificando si posee cuota activa en `admin.plan_limits` para `dimension = 'chatwoot_agents'` o `'chatwoot_inboxes'` (`mode = 'UNLIMITED'` o `(mode = 'NUMERIC' && value > 0)`) o al menos una capacidad habilitada en `admin.plan_capability_values`. |
| **CHW-RF-01.2** | `TenantCapabilityGateService.resolveCapabilities` debe derivar y exponer la clave booleana `chatwoot_inboxes` evaluando `admin.plan_limits` (`dimension = 'chatwoot_inboxes'` con `mode = 'UNLIMITED'` o `value > 0`) junto con `admin.client_feature_overrides`, garantizando que tanto `/workspace/conversations` como `/api/auth/chatwoot/embed` desbloqueen el acceso cuando el plan incluye bandejas de Chatwoot. |
| **CHW-RF-01.3** | En **Alta Manual (`/admin/tenants`)**, `createAdminTenant` ejecuta síncronamente `provisionOrRetryAccount` cuando el plan seleccionado tiene Chatwoot habilitado. |
| **CHW-RF-01.4** | En **Onboarding Unificado (`/onboarding`)**, `completeStep1Business` ejecuta síncronamente y de forma idempotente `provisionOrRetryAccount` tanto cuando crea el cliente por primera vez (Alta Autónoma) como cuando actualiza un cliente preexistente de Alta Manual (`existingClient`) cuya cuenta en `admin.chatwoot_accounts` no exista o esté en estado `pending` / `failed`. |
| **CHW-RF-01.5** | **Filosofía Fail-Soft:** Si Chatwoot no responde, arroja error HTTP o timeout, el alta o avance de onboarding en Mocter **no hace rollback ni bloquea el flujo**. El registro en `admin.chatwoot_accounts` se persiste con `state = 'failed'` y el detalle en `last_error`, emitiendo un evento estructurado `appLogger.warn`. |
| **CHW-RF-01.6** | En el directorio de inquilinos del Backoffice SaaS (`/admin/tenants` y su componente `TenantActions`), se muestra el badge de estado de Chatwoot (`Activo`, `Aprovisionando`, `Pendiente`, `Fallido`, `Sin vincular`), el detalle de `last_error` si existe, y el botón **«Aprovisionar En Chatwoot»** / **«Reintentar Sincronización»** protegido por un modal de confirmación accesible del sistema de diseño (`AGENTS.md` §4.17). |

---

### CHW-RF-02 · Paquete Operativo Completo en Chatwoot y Sincronización con Celda (`pg-cell-XX`)

| ID | Requisito |
|---|---|
| **CHW-RF-02.1** | **Creación de Cuenta y Mapeo de Límites:** `buildChatwootFeaturesAndLimitsForPlan` mapea `dimension = 'chatwoot_agents'` → `limits.agents` y `dimension = 'chatwoot_inboxes'` → `limits.inboxes` leyendo la columna `row.mode` (`UNLIMITED` → `null`, `NUMERIC` → `row.value`, `DISABLED` → `0`), enviando `POST /platform/api/v1/accounts` con `name`, `locale` (`es` o `en`), `features` y `limits`. |
| **CHW-RF-02.2** | **Usuario Técnico de Servicio:** Se crea o reutiliza el usuario técnico `service-{clientId}@mocter.internal` vía `POST /platform/api/v1/users`, se vincula a la cuenta con rol `administrator` en `POST /platform/api/v1/accounts/:id/account_users` y se obtiene su token de acceso. |
| **CHW-RF-02.3** | **Cifrado de Credenciales:** El token de acceso del usuario técnico se cifra en reposo con **AES-256-GCM** y AAD (`client_id`) en formato `bytea` (`Buffer`) en `admin.chatwoot_accounts.service_token_ciphertext` junto con `service_token_key_id`, cumpliendo la restricción `chk_chatwoot_accounts_token_key_pair`. |
| **CHW-RF-02.4** | **Bandeja Webchat Inicial:** Con el token del usuario técnico, se crea o recupera de forma idempotente la bandeja web por defecto mediante `POST /api/v1/accounts/:id/inboxes` (`channel.type = 'web_widget'`), persistiendo `webchat_inbox_id` y `webchat_website_token` en `admin.chatwoot_accounts`. |
| **CHW-RF-02.5** | **Siembra de las 6 Etiquetas Reservadas en Chatwoot y `pg-cell-XX`:** Durante `runProvisioningFlow`, se crean por HTTP en Chatwoot (`POST /api/v1/accounts/:id/labels`) las 6 etiquetas reservadas del catálogo canónico (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`, `soporte`, `escalation-humano`) y se actualiza el campo `chatwoot_label_id` en la tabla `admin.tenant_labels` de la celda del inquilino (`pg-cell-XX`) a través de `CellDatabasePoolManager`. |
| **CHW-RF-02.6** | **Registro Automático de Webhook:** Se registra de forma idempotente en Chatwoot (`GET` / `POST /api/v1/accounts/:id/webhooks`) el webhook apuntando a `CHATWOOT_WEBHOOK_URL` (`/api/webhooks/chatwoot`) con las suscripciones `conversation_created`, `conversation_status_changed`, `conversation_updated`, `message_created` y `message_updated`. |

---

### CHW-RF-03 · Contrato de Red Dual y Topología de Entorno

| ID | Requisito |
|---|---|
| **CHW-RF-03.1** | `apps/admin/env.ts` y `packages/domain/src/utils/env.ts` deben tipar y validar con Zod: `CHATWOOT_INTERNAL_URL`, `NEXT_PUBLIC_CHATWOOT_URL`, `CHATWOOT_PLATFORM_TOKEN`, `CHATWOOT_WEBHOOK_URL` y `CHATWOOT_SUPER_ADMIN_USER_ID`, documentándolas todas en `.env.example`. |
| **CHW-RF-03.2** | En desarrollo local (`docker-compose.yml`), `CHATWOOT_INTERNAL_URL` apunta al contenedor de Chatwoot (`http://chatwoot-rails:3000`), `NEXT_PUBLIC_CHATWOOT_URL` apunta a `http://localhost:3001`, y `CHATWOOT_WEBHOOK_URL` apunta a `http://admin-portal:3003/api/webhooks/chatwoot`. |
| **CHW-RF-03.3** | En producción (`docs/reference/production-services.md`), se respeta la topología vigente sin alterar redes ni routers de Traefik (`AGENTS.md` R-03): `NEXT_PUBLIC_CHATWOOT_URL` y `CHATWOOT_INTERNAL_URL` apuntan a `https://chatapp.mocter.co`, y `CHATWOOT_WEBHOOK_URL` apunta a `https://admin.mocter.co/api/webhooks/chatwoot`. |
| **CHW-RF-03.4** | **Same-Site Cookie Boundary y CSP:** Al operar bajo el mismo dominio raíz `mocter.co` (`admin.mocter.co` y `chatapp.mocter.co`), las cookies de sesión mantienen contexto Same-Site, y Chatwoot autoriza el embebido mediante `Content-Security-Policy: frame-ancestors 'self' https://admin.mocter.co http://localhost:3003;`. |

---

### CHW-RF-04 · Vista Operativa del Inquilino en la Celda (`/workspace/conversations`) y SSO por Rol

| ID | Requisito |
|---|---|
| **CHW-RF-04.1** | `apps/admin` implementa el Route Handler `GET /api/auth/chatwoot/embed`. Cuando se invoca para el entorno operativo del inquilino (`scope=workspace`, por defecto para roles `tenant_owner` y `tenant_agent`), valida la sesión activa (`mocter_sid`), la membresía activa del inquilino y la capacidad `chatwoot_inboxes` vía `TenantCapabilityGateService`. |
| **CHW-RF-04.2** | **Resolución Just-In-Time de Usuario por Rol:** Para evitar que un `tenant_agent` opere con privilegios de administrador del usuario técnico, el servicio resuelve (o crea *just-in-time* en Chatwoot mediante `POST /platform/api/v1/users` y `POST /platform/api/v1/accounts/:id/account_users`) el usuario de Chatwoot correspondiente al correo electrónico del miembro autenticado, asignándole el rol de Chatwoot acorde a su rol en Mocter (`tenant_owner` → `administrator`, `tenant_agent` → `agent`). |
| **CHW-RF-04.3** | Obtenido el `chatwootUserId` del miembro, `/api/auth/chatwoot/embed` invoca `GET /platform/api/v1/users/:user_id/login` sobre `CHATWOOT_INTERNAL_URL` con `CHATWOOT_PLATFORM_TOKEN`, reescribe el origen de la URL efímera con `NEXT_PUBLIC_CHATWOOT_URL` asegurando la ruta destino `/app/accounts/:chatwoot_account_id/dashboard`, y responde con `HTTP 307 Temporary Redirect`. |
| **CHW-RF-04.4** | **Aislamiento de Vista Celular (`ADM-001 D-35`):** `apps/admin/app/workspace/conversations/page.tsx` y su componente cliente son exclusivos de la operación de atención del inquilino en su celda: muestran únicamente su bandeja operativa embebida (o el estado de upgrade/pendiente de activación si su plan no incluye atención o la cuenta aún no está activa), sin exponer controles de infraestructura ni métricas de otros inquilinos. |

---

### CHW-RF-05 · Vista de Gestión Administrativa de Chatwoot en el Backoffice SaaS (`/admin/conversations` y `/admin/tenants`)

| ID | Requisito |
|---|---|
| **CHW-RF-05.1** | **Separación Total respecto a la Vista Celular:** La vista `/admin/conversations` (`apps/admin/app/admin/conversations/page.tsx`) es un módulo exclusivo de gobierno administrativo de la SaaS para `platform_owner` y `platform_admin`. Es estructural, visual y funcionalmente independiente de `/workspace/conversations`: no comparte componentes `.tsx` ni embebe la bandeja operativa de conversaciones de los inquilinos (`/app/accounts/:id/dashboard`). |
| **CHW-RF-05.2** | **Consola Super Admin y Gobierno SaaS en `/admin/conversations`:** La vista presenta el panel de control del plano SaaS (resumen de cuentas aprovisionadas en `admin.chatwoot_accounts`, estados `active`/`failed`/`pending`, sincronización de los 42 códigos de capacidades y salud de webhooks) junto con el visor embebido autenticado vía `/api/auth/chatwoot/embed?scope=admin` usando `CHATWOOT_SUPER_ADMIN_USER_ID`, el cual navega exclusivamente a vistas de administración de plataforma en Chatwoot: **Consola Global Super Admin** (`/super_admin`), **Cuentas de Plataforma** (`/super_admin/accounts`) o la **Ficha Administrativa de una Cuenta** (`/super_admin/accounts/:chatwoot_account_id`). |
| **CHW-RF-05.3** | **Acciones Administrativas en `/admin/tenants`:** Desde la tabla directorio de `/admin/tenants` (`TenantActions`), el `platform_owner` / `platform_admin` puede: (a) disparar **«Aprovisionar En Chatwoot»** o **«Reintentar Sincronización»** (`POST /api/admin/tenants/[id]/chatwoot/provision`) para dar de alta comercios sin cuenta (ej. `Synergia Market`) o recuperar cuentas en estado `failed`, y (b) abrir la **«Ficha En Super Admin»** (`/admin/conversations?accountId=<chatwootAccountId>`) para auditar los parámetros de la cuenta en la consola `/super_admin/accounts/:id` de Chatwoot. |

---

### CHW-RF-06 · Sincronización Dinámica de Planes y Capacidades

| ID | Requisito |
|---|---|
| **CHW-RF-06.1** | Mocter es la única **fuente de verdad** de las condiciones comerciales, cuotas numéricas (`chatwoot_agents`, `chatwoot_inboxes`, `chatwoot_outbound_emails`) y las 42 capacidades de Chatwoot. |
| **CHW-RF-06.2** | Cuando un administrador actualiza un plan en `/admin/plans` o un override de inquilino, `syncAllAccountsForPlan` o `syncAccountFeaturesAndLimits` envía `PATCH /platform/api/v1/accounts/:id` con el mapa actualizado de `features` y `limits`. |
| **CHW-RF-06.3** | La reducción de cuotas o desactivación de capacidades en Chatwoot oculta módulos en UI pero no elimina conversaciones ni datos históricos del inquilino. |

---

## 5. Requisitos No Funcionales

| ID | Requisito |
|---|---|
| **CHW-RNF-01** | **Seguridad Criptográfica:** Todos los tokens de servicio se cifran con AES-256-GCM y clave derivada de 32 bytes (`CHATWOOT_TOKEN_ENCRYPTION_KEY`) con AAD `client_id`. Ningún token o secreto se expone al cliente ni en logs. |
| **CHW-RNF-02** | **Rendimiento de Handoff:** La generación del enlace SSO y la redirección HTTP 307 en `/api/auth/chatwoot/embed` no debe superar los 500 ms en P95 cuando el usuario ya existe en Chatwoot. |
| **CHW-RNF-03** | **Trazabilidad y Excepciones Estrictas:** Todo log se emite como `LogEvent` JSON tipado correlacionado por `requestId` sin usar `console.*` (`AGENTS.md` §4.13), y todo Route Handler se envuelve en `handle()` respondiendo errores en formato RFC 9457 (`application/problem+json`, `AGENTS.md` §4.14). |
| **CHW-RNF-04** | **Cero Diálogos Nativos y Cero Códigos de Spec en UI:** Toda confirmación en UI emplea modales accesibles con tokens `--dsn-*` y botones en Title Case (`AGENTS.md` §4.17), y ningún texto visible al usuario incluye siglas técnicas como `CHW-002`, `RF-XX` o `D-XX` (`AGENTS.md` §4.15). |

---

## 6. Criterios de Aceptación

- [ ] **CA-01 (Aprovisionamiento en Alta Manual):** Al crear un inquilino desde `/admin/tenants` con un plan que incluya atención, se aprovisiona en Chatwoot y `admin.chatwoot_accounts` queda en `state = 'active'` con `chatwoot_account_id`, `service_user_id`, `webchat_inbox_id` y `webchat_website_token` poblados.
- [ ] **CA-02 (Aprovisionamiento e Idempotencia en Paso 1 de Onboarding):** Al confirmar el Paso 1 en `/onboarding` (tanto en alta autónoma como en un inquilino de alta manual cuya cuenta estaba `pending` o `failed`), se ejecuta `provisionOrRetryAccount` y la cuenta queda activa en Chatwoot sin duplicar registros.
- [ ] **CA-03 (Resiliencia Fail-Soft):** Si Chatwoot no está disponible durante el alta o el Paso 1, el comercio se guarda exitosamente en Mocter, `admin.chatwoot_accounts.state` queda en `'failed'` con `last_error`, y en `/admin/tenants` aparece la opción «Reintentar Sincronización».
- [ ] **CA-04 (Gating y Handoff SSO por Rol en `/workspace/conversations`):** `TenantCapabilityGateService` resuelve `chatwoot_inboxes = true` para planes con bandejas activas; al entrar a `/workspace/conversations`, `GET /api/auth/chatwoot/embed?scope=workspace` resuelve el usuario del miembro con su rol (`administrator` para `tenant_owner`, `agent` para `tenant_agent`) y redirige con HTTP 307 a `/app/accounts/:id/dashboard` sin pedir credenciales.
- [ ] **CA-05 (Consola Administrativa SaaS Independiente en `/admin/conversations`):** Al entrar a `/admin/conversations`, el `platform_owner` visualiza el panel de gobierno SaaS de cuentas Chatwoot y el visor embebido autenticado con `CHATWOOT_SUPER_ADMIN_USER_ID` apuntando a `/super_admin` (o `/super_admin/accounts/:account_id`), completamente separado de la bandeja operativa celular del inquilino.
- [ ] **CA-06 (Aprovisionamiento Manual en `/admin/tenants`):** En `/admin/tenants`, para un inquilino sin cuenta activa (ej. `Synergia Market`) o en estado `failed`, el botón «Aprovisionar En Chatwoot» / «Reintentar Sincronización» abre el modal de confirmación DSN-001, invoca `POST /api/admin/tenants/[id]/chatwoot/provision` y deja la cuenta en estado `active`.
- [ ] **CA-07 (Etiquetas en Celda y Webhook Activo):** El aprovisionamiento crea en Chatwoot las 6 etiquetas reservadas, actualiza sus `chatwoot_label_id` en `admin.tenant_labels` dentro de `pg-cell-XX`, y registra el webhook apuntando a `CHATWOOT_WEBHOOK_URL`.

---

## 7. Decisiones Aprobadas en Planeamiento (`/grill-me`)

| ID | Decisión | Justificación Arquitectónica |
|---|---|---|
| **D-01** | **Identificador CHW-002:** Especificación dedicada a la interoperabilidad activa en lugar de reabrir CHW-001 (inventario de lectura). | Mantiene a CHW-001 como referencia inmutable de Chatwoot v4.19.1 y concentra en CHW-002 los contratos de integración. |
| **D-02** | **Aprovisionamiento Fail-Soft Síncrono e Idempotente en Alta Manual y Paso 1 de Onboarding:** Si falla Chatwoot, no se revierte el inquilino y se registra `state = 'failed'` + `last_error`. En Paso 1 (`completeStep1Business`), se ejecuta también sobre clientes preexistentes (`existingClient`) si su cuenta no está `active`. | Protege el alta comercial frente a caídas de Chatwoot y garantiza convergencia automática cuando el inquilino completa el Paso 1 o mediante reintento manual. |
| **D-03** | **Contrato de Entorno y Dominio Productivo (`chatapp.mocter.co`):** Se tipan `CHATWOOT_INTERNAL_URL`, `NEXT_PUBLIC_CHATWOOT_URL`, `CHATWOOT_PLATFORM_TOKEN`, `CHATWOOT_WEBHOOK_URL` y `CHATWOOT_SUPER_ADMIN_USER_ID`. En producción se respeta `https://chatapp.mocter.co` (`production-services.md`, `R-03`). | Elimina colisiones de loopback en contenedores locales, permite que Chatwoot invoque el webhook de `mocter-admin` y respeta la topología productiva con Traefik. |
| **D-04** | **SSO Just-In-Time por Email y Rol del Miembro (Sin migración SQL):** En `/workspace/conversations`, `/api/auth/chatwoot/embed` resuelve o crea *just-in-time* en Chatwoot el usuario del miembro según su email y rol (`tenant_owner` → `administrator`, `tenant_agent` → `agent`) y solicita `GET /platform/api/v1/users/:id/login`. | Evita que un `tenant_agent` herede permisos de `administrator` del `service_user_id` técnico y no requiere migraciones DDL adicionales en `db-portal` ni `pg-cell-XX`. |
| **D-05** | **Derivación de `chatwoot_inboxes` en `TenantCapabilityGateService` y corrección de `buildChatwootFeaturesAndLimitsForPlan`:** `TenantCapabilityGateService` deriva `chatwoot_inboxes` desde `admin.plan_limits`, y `buildChatwootFeaturesAndLimitsForPlan` mapea `chatwoot_agents` y `chatwoot_inboxes` usando `row.mode`. | Desbloquea `/workspace/conversations` sin romper el contrato de capacidades en UI y corrige el envío de cuotas numéricas reales hacia Chatwoot. |
| **D-06** | **Separación Estricta entre Vista Administrativa SaaS (`/admin/conversations`) y Vista Operativa Celular (`/workspace/conversations`):** `/admin/conversations` usa `CHATWOOT_SUPER_ADMIN_USER_ID` para operar exclusivamente sobre `/super_admin` y `/super_admin/accounts/:id` junto a la telemetría del plano de control SaaS; se elimina la impersonación en la bandeja operativa del inquilino. | Cumple `ADM-001 D-35` y garantiza que la gestión de plataforma del Backoffice SaaS esté completamente separada de la operación diaria del inquilino en su celda. |
| **D-07** | **Acciones por Inquilino en `/admin/tenants` (`TenantActions`):** El estado de Chatwoot, el botón de aprovisionar/reintentar (`POST /api/admin/tenants/[id]/chatwoot/provision`) y el enlace a `/super_admin/accounts/:id` se integran directamente en `/admin/tenants` sin crear una página `/admin/tenants/[id]` adicional. | Mantiene la cohesión con la superficie real de `apps/admin` evitando rutas huérfanas o alcance innecesario. |
| **D-08** | **Persistencia Celular de Etiquetas (`pg-cell-XX`) y Registro de Webhook:** `runProvisioningFlow` empuja las 6 etiquetas reservadas a Chatwoot, actualiza `chatwoot_label_id` en `admin.tenant_labels` de `pg-cell-XX` vía `CellDatabasePoolManager`, y registra el webhook hacia `CHATWOOT_WEBHOOK_URL`. | Asegura que el CRM celular del inquilino tenga correlacionados los IDs reales de etiquetas de Chatwoot y reciba los eventos multicanal desde el primer minuto. |
