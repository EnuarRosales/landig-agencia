# CHW-002 · Tareas · Estabilización de la Interoperabilidad Chatwoot–Mocter

> Reglas permanentes: ejecutar las tareas en el orden indicado, marcar `[x]` únicamente cuando los comandos
> de verificación pasen exitosamente, no saltar tareas y no modificar código fuera de las especificaciones aprobadas.

---

## Fase 1 · Variables de Entorno, Topología de Red y Contrato de Gateway

- [x] **T-01 · Tipar y validar el contrato de entorno de Chatwoot en `env.ts` y `.env.example`**
  - En `apps/admin/env.ts` y `packages/domain/src/utils/env.ts`, tipar y validar con Zod:
    - `CHATWOOT_INTERNAL_URL` (servidor, URL interna de llamadas API backend hacia Chatwoot).
    - `NEXT_PUBLIC_CHATWOOT_URL` (cliente/servidor, URL pública de carga del iframe en el navegador).
    - `CHATWOOT_PLATFORM_TOKEN` (servidor, token maestro de `PlatformApp`).
    - `CHATWOOT_WEBHOOK_URL` (servidor, URL alcanzable por `chatwoot-rails` hacia `/api/webhooks/chatwoot`).
    - `CHATWOOT_SUPER_ADMIN_USER_ID` (servidor, entero positivo por defecto `1`).
  - Documentar las 5 variables en `.env.example` indicando sus valores para desarrollo local (`http://chatwoot-rails:3000`, `http://localhost:3001`, `http://admin-portal:3003/api/webhooks/chatwoot`) y producción (`https://chatapp.mocter.co`, `https://admin.mocter.co/api/webhooks/chatwoot`).
  - Propagar las variables en el servicio `admin-portal` de `docker-compose.yml` si faltan.
  - Verificación: `pnpm --filter @mocter/domain build && pnpm --filter @mocter/admin build` compilan sin errores de validación de variables de entorno.

- [x] **T-02 · Extender `ChatwootHttpPlatformGateway` para webhook, usuarios por rol y SSO**
  - En `packages/domain/src/services/chatwoot-provisioning.service.ts`:
    - Actualizar `getChatwootHttpConfig()` para resolver primero `CHATWOOT_INTERNAL_URL` (con fallback a `CHATWOOT_BASE_URL`).
    - Implementar `ensureAccountWebhook({ accountId, serviceToken, webhookUrl, subscriptions })`: consulta `GET /api/v1/accounts/:id/webhooks` y, si no existe un webhook con esa URL, lo registra vía `POST /api/v1/accounts/:id/webhooks` con las suscripciones `conversation_created`, `conversation_status_changed`, `conversation_updated`, `message_created` y `message_updated`.
    - Implementar `ensureMemberUserInAccount({ accountId, email, name, role })`: crea o recupera el usuario en `POST /platform/api/v1/users` y lo vincula con su rol (`administrator` o `agent`) en `POST /platform/api/v1/accounts/:id/account_users`.
    - Implementar `getUserSsoLoginUrl({ userId })`: consume `GET /platform/api/v1/users/:userId/login` con `api_access_token: CHATWOOT_PLATFORM_TOKEN` y retorna la URL efímera con `sso_auth_token`.
  - Verificación: pruebas unitarias en `packages/domain/src/services/__tests__/chatwoot-provisioning.service.test.ts` pasando con `pnpm --filter @mocter/domain test`.

---

## Fase 2 · Corrección de Gating, Mapeo de Planes, Paquete Operativo y Onboarding

- [x] **T-03 · Derivar `chatwoot_inboxes` en `TenantCapabilityGateService` y corregir `buildChatwootFeaturesAndLimitsForPlan`**
  - En `packages/domain/src/services/tenant-capability-gate.service.ts`:
    - Consultar `admin.plan_limits` para el `planId` del inquilino (`dimension = 'chatwoot_inboxes'`).
    - Establecer `capabilities['chatwoot_inboxes'] = true` cuando `mode === 'UNLIMITED'` o `(mode === 'NUMERIC' && (value ?? 0) > 0)`, permitiendo que `client_feature_overrides` pueda sobreescribirlo si existe un override explícito.
  - En `packages/domain/src/services/chatwoot-provisioning.service.ts`:
    - Corregir `buildChatwootFeaturesAndLimitsForPlan` para mapear `row.dimension === "chatwoot_agents"` → `limits.agents` y `row.dimension === "chatwoot_inboxes"` → `limits.inboxes` leyendo `row.mode` (`UNLIMITED` → `null`, `DISABLED` → `0`, `NUMERIC` → `row.value ?? null`).
  - Verificación: pruebas unitarias de `TenantCapabilityGateService` y `ChatwootProvisioningService` verificando que `capabilities.chatwoot_inboxes` es `true` en planes con bandejas activas y que `limits` incluye `{ agents, inboxes }` con los valores correctos.

- [x] **T-04 · Completar `runProvisioningFlow` con siembra HTTP de las 6 etiquetas en `pg-cell-XX` y registro de webhook**
  - En `packages/domain/src/services/chatwoot-provisioning.service.ts` (`runProvisioningFlow`):
    - Tras asegurar el inbox webchat, iterar las 6 etiquetas reservadas (`RESERVED_LABELS`), invocar `gateway.pushLabelToChatwoot(...)` con el `serviceToken` y actualizar `chatwoot_label_id` en la tabla `admin.tenant_labels` de la celda del inquilino (`pg-cell-XX`) mediante `CellDatabasePoolManager` (si el inquilino ya tiene asignación activa en `admin.tenant_cell_assignments`).
    - Invocar `gateway.ensureAccountWebhook` con `CHATWOOT_WEBHOOK_URL`.
    - Mantener la semántica Fail-Soft: cualquier excepción en el flujo captura el error, actualiza `admin.chatwoot_accounts` a `state = 'failed'` con `last_error`, emite `appLogger.warn` y retorna sin romper el alta del comercio.
  - Verificación: pruebas unitarias verificando la invocación de `pushLabelToChatwoot`, `ensureAccountWebhook` y el manejo `failed` ante errores del gateway.

- [x] **T-05 · Integrar el aprovisionamiento idempotente en el Paso 1 del Onboarding (`/onboarding`)**
  - En `packages/domain/src/services/tenant-onboarding.service.ts` (`completeStep1Business`):
    - Tanto en el Caso A (`existingClient` proveniente de Alta Manual) como en el Caso B (nuevo cliente en Alta Autónoma), una vez confirmados `admin.clients` y `admin.client_plans`, invocar de forma fail-soft `chatwootService.provisionOrRetryAccount({ clientId, tenantName, locale, planId })` si la cuenta aún no existe o su estado en `admin.chatwoot_accounts` es distinto de `'active'`.
  - Verificación: prueba unitaria de `completeStep1Business` confirmando que se dispara `provisionOrRetryAccount` en alta autónoma y en reintento de alta manual sin abortar el Paso 1 si Chatwoot falla.

---

## Fase 3 · Route Handler SSO (`/api/auth/chatwoot/embed`) y Vista Operativa Celular (`/workspace/conversations`)

- [x] **T-06 · Implementar `GET /api/auth/chatwoot/embed` en `apps/admin`**
  - Crear `apps/admin/app/api/auth/chatwoot/embed/route.ts` envuelto en `handle()` (RFC 9457) y con `appLogger`:
    - Soportar el parámetro `scope = 'workspace' | 'admin'` (por defecto `'workspace'`).
    - **Modo `workspace` (`tenant_owner`, `tenant_agent`):**
      - Validar sesión activa (`mocter_sid`), `clientId` activo y verificar `capabilities.chatwoot_inboxes` mediante `TenantCapabilityGateService`.
      - Consultar `admin.chatwoot_accounts` para el `clientId`; si no está en `state = 'active'` o no tiene `chatwootAccountId`, retornar respuesta controlada.
      - Resolver el usuario del miembro en Chatwoot mediante `ensureMemberUserInAccount` con rol `'administrator'` para `tenant_owner` y `'agent'` para `tenant_agent`.
      - Obtener la URL SSO con `getUserSsoLoginUrl({ userId })`, reescribir su origen a `NEXT_PUBLIC_CHATWOOT_URL` apuntando a `/app/accounts/:chatwootAccountId/dashboard` y responder con `NextResponse.redirect(targetUrl, 307)`.
    - **Modo `admin` (`platform_owner`, `platform_admin`):**
      - Validar sesión activa y rol global `platform_owner` o `platform_admin`.
      - Validar `targetPath` permitido (exclusivamente rutas bajo `/super_admin`, p. ej. `/super_admin`, `/super_admin/accounts` o `/super_admin/accounts/:id`).
      - Obtener la URL SSO para `CHATWOOT_SUPER_ADMIN_USER_ID` vía `getUserSsoLoginUrl`, reescribir su origen a `NEXT_PUBLIC_CHATWOOT_URL` con redirección hacia `targetPath` y responder con `NextResponse.redirect(targetUrl, 307)`.
  - Verificación: prueba unitaria/integración del Route Handler verificando respuestas `307`, bloqueo `403` cuando falta capacidad o rol, y resolución diferenciada para `workspace` vs `admin`.

- [x] **T-07 · Actualizar la vista operativa celular `/workspace/conversations`**
  - En `apps/admin/app/workspace/conversations/page.tsx` (y su cliente dedicado de workspace, cumpliendo `ADM-001 D-35`):
    - Verificar `context?.capabilities?.chatwoot_inboxes` y el estado de la cuenta en `admin.chatwoot_accounts`.
    - Si la cuenta está en `state = 'active'`, renderizar el `<iframe src="/api/auth/chatwoot/embed?scope=workspace">` ocupando el área operativa celular.
    - Si la cuenta está en `pending` / `provisioning` / `failed`, mostrar un estado informativo limpio en la celda sin exponer detalles técnicos ni siglas de especificaciones (`AGENTS.md` §4.15).
  - Verificación: `pnpm --filter @mocter/admin typecheck` y renderizado sin errores ni códigos de spec visibles.

---

## Fase 4 · Vista Administrativa SaaS (`/admin/conversations`) y Acciones en `/admin/tenants`

- [x] **T-08 · Rediseñar `/admin/conversations` como consola exclusiva de gobierno SaaS + Super Admin**
  - En `apps/admin/app/admin/conversations/page.tsx` (y su componente cliente exclusivo bajo `/admin/conversations`):
    - Eliminar cualquier acoplamiento con la bandeja operativa de los inquilinos y eliminar códigos de especificaciones visibles (`CHW-001`, `ADM-001`, `D-32`, etc., cumpliendo `AGENTS.md` §4.15).
    - Presentar las tarjetas de resumen del plano de control SaaS (cuentas activas, cuentas con error/pendientes, capacidades del catálogo, estado de webhooks) y el selector de destino de la consola de infraestructura:
      - «Consola Global Super Admin» (`/super_admin`)
      - «Cuentas De Plataforma» (`/super_admin/accounts`)
      - «Ficha De Cuenta Seleccionada» (`/super_admin/accounts/:accountId` cuando se recibe `?accountId=...`)
    - Conectar el `<iframe>` a `/api/auth/chatwoot/embed?scope=admin&targetPath=...`.
  - Verificación: comprobar que `/admin/conversations` no comparte componentes `.tsx` con `/workspace/conversations`, no exhibe códigos de spec en UI y carga el túnel SSO con `scope=admin`.

- [x] **T-09 · Implementar endpoints y acciones manuales de Chatwoot por inquilino en `/admin/tenants`**
  - Crear `apps/admin/app/api/admin/tenants/[id]/chatwoot/provision/route.ts` (`POST`, envuelto en `handle()`, roles `platform_owner` y `platform_admin`) que invoque `provisionOrRetryAccount` para el inquilino `[id]` y retorne el estado actualizado de `admin.chatwoot_accounts`.
  - Crear `apps/admin/app/api/admin/tenants/[id]/chatwoot/status/route.ts` (`GET`, envuelto en `handle()`, roles `platform_owner` y `platform_admin`).
  - Actualizar `fetchAdminTenantsDirectory` (`packages/domain/src/services/admin-dashboard.service.ts`), `apps/admin/app/admin/tenants/page.tsx` y `apps/admin/app/admin/tenants/tenant-actions.tsx`:
    - Incluir en cada fila del directorio el estado de Chatwoot (`state`, `chatwootAccountId`, `lastError`).
    - Agregar en `TenantActions` el botón en Title Case **«Aprovisionar En Chatwoot»** / **«Reintentar Sincronización»** con modal de confirmación accesible del sistema de diseño (`role="dialog"`, `aria-modal="true"`, tokens `--dsn-*`, cero diálogos nativos, `AGENTS.md` §4.17).
    - Agregar enlace **«Ver Cuenta En Super Admin»** hacia `/admin/conversations?accountId=<chatwootAccountId>` cuando la cuenta ya tiene `chatwootAccountId`.
  - Verificación: pruebas unitarias y de tipo pasando en `@mocter/domain` y `@mocter/admin`.

---

## Fase 5 · Verificación Integral, Recompilación y Salud de Contenedores

- [x] **T-10 · Ejecutar suite de calidad, recompilar, reiniciar contenedores y verificar salud (`AGENTS.md` §4.18)**
  - Ejecutar `pnpm lint` y `pnpm test` verificando cero errores.
  - Compilar `@mocter/domain` y `@mocter/admin`.
  - Reiniciar los contenedores afectados (`mocter-core-admin-portal-1` y `mocter-core-web-portal-1`) y verificar respuesta HTTP 200 y ausencia de excepciones en `docker logs`.
