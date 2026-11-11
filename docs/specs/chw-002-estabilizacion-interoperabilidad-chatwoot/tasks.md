# CHW-002 · Tareas · Estabilización de la Interoperabilidad Chatwoot–Mocter

> Reglas permanentes: ejecutar las tareas en el orden indicado, marcar `[x]` únicamente cuando los comandos
> de verificación pasen exitosamente, no saltar tareas y no modificar código fuera de las especificaciones aprobadas.

---

## Fase 1 · Variables de Entorno, Topología de Red y Gateway Platform API

- [ ] **T-01 · Tipar y validar el contrato de doble URL en `env.ts`**
  - Configurar `CHATWOOT_INTERNAL_URL` (servidor) y `NEXT_PUBLIC_CHATWOOT_URL` (cliente/iframe) en `apps/admin/env.ts` y `packages/domain/src/utils/env.ts` con Zod.
  - Asegurar la propagación de `CHATWOOT_PLATFORM_TOKEN` en `admin-portal` en `docker-compose.yml`.
  - Documentar las variables con comentarios precisos en `.env.example`.
  - Verificación: `pnpm --filter @mocter/admin build` compila sin errores de validación de variables de entorno.

- [ ] **T-02 · Unificar la red Docker y resolución DNS en desarrollo local**
  - Conectar el servicio `admin-portal` con el stack de `chatwoot` mediante la red compartida o alias `chatwoot-rails` en `docker-compose.yml`.
  - Configurar en local `CHATWOOT_INTERNAL_URL=http://mocter-chatwoot-rails-1:3000` (o nombre de servicio resoluble) y `NEXT_PUBLIC_CHATWOOT_URL=http://localhost:3000`.
  - Verificación: `docker exec -it mocter-core-admin-portal-1 wget -qO- http://mocter-chatwoot-rails-1:3000/api` responde código HTTP 200/401/404 sin error de resolución de host (`ENOTFOUND` o `ECONNREFUSED`).

- [ ] **T-03 · Extender `ChatwootHttpPlatformGateway` para el paquete operativo completo**
  - Implementar en `ChatwootHttpPlatformGateway` (`chatwoot-provisioning.service.ts`):
    - `ensureWebchatInbox`: creación de bandeja web widget por defecto vía `POST /api/v1/accounts/:id/inboxes`.
    - `seedAccountLabels`: creación de las 4 etiquetas comerciales reservadas vía `POST /api/v1/accounts/:id/labels`.
    - `registerAccountWebhook`: registro de la URL de webhook hacia `mocter-admin` vía `POST /api/v1/accounts/:id/webhooks`.
    - `generateUserLoginUrl`: obtención de URL efímera de SSO vía `GET /platform/api/v1/users/:id/login`.
  - Verificación: pruebas unitarias con mock de Platform API pasando en `pnpm --filter @mocter/domain exec vitest run src/services/chatwoot-provisioning.service.test.ts`.

---

## Fase 2 · Corrección del Algoritmo de Habilitación y Aprovisionamiento Fail-Soft

- [ ] **T-04 · Corregir el cálculo de habilitación de atención (`isChatwootEnabledForPlan`)**
  - Reemplazar en `chatwoot-provisioning.service.ts` la comprobación errónea `plan.chatwootEnabled` por la consulta canónica de cuotas de `chatwoot_agents` en `admin.plan_limits` y capacidades activas en `admin.plan_capability_values`.
  - Actualizar `provisionTenantChatwootAccount` y `syncAllAccountsForPlan` para utilizar esta función.
  - Verificación: prueba unitaria que verifique que un plan con `chatwoot_agents.value > 0` o `mode = 'UNLIMITED'` dispara el aprovisionamiento sin omitirlo (`skipped: false`).

- [ ] **T-05 · Implementar resiliencia Fail-Soft en el aprovisionamiento síncrono**
  - Garantizar que si Chatwoot arriende timeout o error de red durante `provisionTenantChatwootAccount`:
    - El registro en `admin.chatwoot_accounts` queda persistido con `state = 'failed'` y el mensaje en `last_error`.
    - La creación del inquilino en `createAdminTenant` o en el Onboarding no hace rollback ni arroja excepción no controlada hacia el cliente.
    - Se emite un log estructurado tipado `appLogger.warn`.
  - Verificación: prueba unitaria simulando fallo de red del gateway; la creación del cliente concluye con éxito y la cuenta queda en estado `failed`.

- [ ] **T-06 · Integrar el aprovisionamiento en el Paso 1 de Onboarding (`/onboarding`)**
  - Conectar el servicio de persistencia del Paso 1 del Onboarding unificado (TNT-001) para que, al crear `admin.clients` y vincular `admin.client_plans`, invoque `provisionTenantChatwootAccount`.
  - Verificación: simular alta autónoma completando el Paso 1 y verificar que se inserta la fila en `admin.chatwoot_accounts`.

---

## Fase 3 · Handoff SSO y Ruta de Embed en `apps/admin`

- [ ] **T-07 · Implementar el Route Handler `/api/auth/chatwoot/embed` en `apps/admin`**
  - Crear `apps/admin/app/api/auth/chatwoot/embed/route.ts` con tipado estricto, logging estructurado y soporte de excepciones RFC 9457:
    - Validación de cookie de sesión (`mocter_sid`).
    - Validación de capacidad `chatwoot_inboxes` mediante `TenantCapabilityGateService`.
    - Consulta a la Platform API (`GET /platform/api/v1/users/:id/login`) para obtener el token SSO de 5 minutos.
    - Redirección HTTP 307 adaptada a `NEXT_PUBLIC_CHATWOOT_URL`.
  - Verificación: `curl -I -b "mocter_sid=..." http://localhost:3003/api/auth/chatwoot/embed` responde `307 Temporary Redirect` hacia la URL de Chatwoot con `sso_auth_token`.

- [ ] **T-08 · Conectar `/workspace/conversations` con el iframe autenticado**
  - Actualizar `apps/admin/app/workspace/conversations/page.tsx` para cargar `/api/auth/chatwoot/embed`.
  - Incluir estados visuales de carga, gating por capacidad con botón a planes y mensaje contextual de error en caso de fallo de red.
  - Verificación: navegar a `/workspace/conversations` y verificar que el iframe no muestra 404 ni formulario de login.

---

## Fase 4 · Backoffice SaaS: Acceso Super Admin y Gestión de Inquilinos

- [ ] **T-09 · Implementar acceso Super Admin para el Platform Owner en `/admin/conversations`**
  - Modificar `apps/admin/app/admin/conversations/page.tsx` para autenticar al Platform Owner mediante SSO con usuario Super Admin de Chatwoot.
  - Implementar selector de vistas accesibles: Consola Super Admin (`/super_admin`), Ajustes de Cuenta Maestra (`/app/accounts/1/settings`) y Bandeja Global (`/app/accounts/1/inbox`).
  - Verificación: navegar a `/admin/conversations` con rol `platform_owner` y comprobar acceso transparente a la consola administrativa de Chatwoot.

- [ ] **T-10 · Crear acción manual de aprovisionamiento en `/admin/tenants/[id]`**
  - Implementar endpoint `POST /api/admin/tenants/[id]/chatwoot/provision` en `apps/admin`.
  - Diseñar el componente de estado de Chatwoot en la ficha del inquilino (`/admin/tenants/[id]`):
    - Badge con estado actual: `Activo` (verde), `Pendiente` (ámbar), `Fallido` (rojo con `last_error`), `Sin Cuenta` (gris).
    - Botón en Title Case: «Aprovisionar En Chatwoot» o «Reintentar Sincronización» con modal de confirmación del sistema de diseño (cero diálogos nativos).
  - Verificación: ejecutar la acción sobre `Synergia Market` y comprobar que su cuenta pasa a `active` en `admin.chatwoot_accounts`.

- [ ] **T-11 · Implementar acción de soporte «Inspeccionar Bandeja» en `/admin/tenants/[id]`**
  - Implementar endpoint `GET /api/admin/tenants/[id]/chatwoot/impersonate` para emitir acceso SSO temporal a la cuenta del inquilino.
  - Integrar botón accesible en la ficha del comercio para soporte técnico.
  - Verificación: hacer clic en «Inspeccionar Bandeja» y comprobar que se abre la cuenta del inquilino en Chatwoot.

---

## Fase 5 · Verificación Integral, Pruebas en Caliente y Documentación

- [ ] **T-12 · Recompilar, reiniciar contenedores y verificación de salud (Compile & Restart Protocol)**
  - Recompilar paquetes afectados: `pnpm --filter @mocter/domain build` y `pnpm --filter @mocter/admin build`.
  - Reiniciar contenedores: `docker restart mocter-core-admin-portal-1`.
  - Verificar ausencia de excepciones en `docker logs --tail 100 mocter-core-admin-portal-1` y respuesta HTTP 200 en `/api/health`.

- [ ] **T-13 · Pruebas End-to-End de interoperabilidad**
  - Crear un inquilino de prueba en `/admin/tenants` con plan que incluya atención y validar que se crea en Chatwoot con su cuenta, bandeja, etiquetas y webhook.
  - Validar que un inquilino sin plan de atención es omitido limpiamente.
  - Validar que la edición de un plan en `/admin/plans` sincroniza los 42 feature flags hacia la cuenta de Chatwoot.
  - Verificación: suites de pruebas pasando en Vitest (`pnpm test`).

