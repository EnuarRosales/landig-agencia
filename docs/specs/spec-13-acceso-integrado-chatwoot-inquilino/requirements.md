# SPEC-13 · Estabilización del Acceso Integrado de Chatwoot del Inquilino y Reubicación en Menú Lateral

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-13` |
| **Nombre** | Estabilización del Acceso Integrado de Chatwoot del Inquilino y Reubicación en Navegación |
| **Tipo de intervención** | Estabilización focalizada + Corrección de enrutamiento/navegación (con barrera de no-regresión SaaS) |
| **Prioridad** | P0 — Crítica (bandeja omnicanal operativa para atención diaria del comercio) |
| **Versión** | 1.1.0 |
| **Estado** | Actualizada por entrevista técnica y aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-04` |
| **Specs previas relacionadas** | `ADM-001` (D-32), `CHW-001` (§6.2), `CHW-002`, `SPEC-12` (gestión de equipo y flag `grantChatwootAccess`) |
| **Specs integradas / dependientes** | `SPEC-03` (capacidad de agentes/canales Chatwoot según plan), `SPEC-07` (layout y shell), `SPEC-09` (webhooks de mensajes entrantes refrescan ventana 24h), `SPEC-10` (etiquetas predeterminadas) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

1. **Fragilidad y huecos en el acceso embebido del inquilino (`GEN-04`):**
   - Mientras la integración administrativa de Chatwoot a nivel SaaS (`/admin/conversations` y rama `scope=admin` de `/api/auth/chatwoot/embed`) **opera correctamente en producción y desarrollo**, la ruta operativa del inquilino (`apps/admin/app/workspace/conversations/page.tsx` y rama `scope=workspace` en `apps/admin/app/api/auth/chatwoot/embed/route.ts`) presenta brechas estructurales:
     - Incluye fallback hardcoded acoplado a puerto local (`localhost:3001`, línea 42 de `embed/route.ts`), violando `AGENTS.md §4.16` y generando desfasajes frente a Traefik / entornos reales donde Chatwoot corre bajo `NEXT_PUBLIC_CHATWOOT_URL`.
     - No valida `?scope=` inválido (cae por defecto a `workspace` en vez de retornar `400 BAD_REQUEST`) ni rechaza explícitamente intentos `?accountId=...` cruzados con `403 CHATWOOT_ACCOUNT_MISMATCH`.
     - La lógica de negocio de `scope=workspace` reside inline dentro del Route Handler en lugar de un servicio aislado en `@mocter/domain`, sin actualizar `chatwootAgentId` en `cell_tenant_users` ni mapear caídas del servidor SSO a `502` controlado con logging estructurado (`requestId`).
     - En `apps/admin/app/workspace/conversations/page.tsx`, los estados `suspended` y `access_denied` (agente con `grantChatwootAccess = false` o membresía inactiva) no se interceptan antes de montar el `<iframe>`, exponiendo respuestas JSON de error dentro del marco; no hay i18n (`es`/`en`), no existe wrapper cliente para carga/timeout/recarga de bandeja ni reintento idempotente para el propietario cuando la cuenta está en `failed` o sin aprovisionar.
2. **Ubicación e idioma en la navegación lateral del comercio (`GEN-04`):**
   - En `apps/admin/components/tenant-workspace-shell.tsx`, el acceso a conversaciones aparece al final (bloque de módulos dinámicos, posición 10) con etiqueta fija en español en lugar de ocupar la **segunda posición** inmediatamente debajo de **«Tablero»** con diccionario i18n (`es`/`en`).
3. **Restricción absoluta de no-regresión (mandato explícito del producto):**
   - Queda **terminantemente prohibido** modificar o poner en riesgo la integración funcional de Chatwoot en el Backoffice administrativo de la SaaS (`/admin/conversations`, rama `scope=admin` y provisión administrativa base ya operativa).

---

## 4. Objetivo y valor de negocio

Estabilizar únicamente la **zona operativa de Chatwoot del inquilino** (`/workspace/conversations` → iframe same-site con redirección HTTP 307 hacia `.../app/accounts/{id}/dashboard`) garantizando:
1. Acceso fluido y agnóstico de entorno (compatible 100% con Traefik/HTTPS producción y desarrollo local usando `NEXT_PUBLIC_CHATWOOT_URL` sin puertos hardcoded en la lógica de negocio).
2. Reubicación prioritaria de **«Conversaciones»** (`Conversations` en inglés) en el **segundo lugar del menú del Backoffice** (debajo de **«Tablero»**).
3. Manejo completo de estados de usuario, cuenta y red en `es`/`en`, más reintento idempotente para el propietario si la provisión falló previamente.
4. Cero impacto o regresión sobre el módulo administrativo funcional `/admin/conversations` y `scope=admin` de la SaaS.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- **Servicio dedicado `TenantChatwootEmbedService`** (`packages/domain/src/services/tenant-chatwoot-embed.service.ts`) que encapsula la resolución de estado de página SSR y la emisión de redirección SSO `scope=workspace`, dejando **100% intacta** la rama `if (scope === "admin")` de `apps/admin/app/api/auth/chatwoot/embed/route.ts`.
- **Estandarización de entorno sobre `NEXT_PUBLIC_CHATWOOT_URL`:** Eliminación del fallback `"http://localhost:3001"` en `apps/admin/app/api/auth/chatwoot/embed/route.ts`, consumiendo `env.NEXT_PUBLIC_CHATWOOT_URL` (ya parametrizada en `env.ts`, `.env.example` y `docker-compose.yml`) y construyendo `frame-ancestors` en la rama `workspace` sin puertos hardcoded.
- **Validaciones estrictas en `GET /api/auth/chatwoot/embed`:**
  - Si `scope` se envía con valor distinto de `"workspace"` o `"admin"`, responde `400 BAD_REQUEST` (RFC 9457) sin invocar Chatwoot.
  - En `scope=workspace`, el destino oficial se construye estrictamente desde `admin.chatwoot_accounts` filtrando por `session.clientId` hacia `{NEXT_PUBLIC_CHATWOOT_URL}/app/login?...&redirect_to=/app/accounts/{accountId}/dashboard&sso_account_id={accountId}` mediante **redirección HTTP 307** (preservando el flujo iframe existente y la compatibilidad con `SPEC-12`).
  - Si la petición `scope=workspace` incluye `?accountId=...` distinto al `chatwootAccountId` del comercio, rechaza con `403 CHATWOOT_ACCOUNT_MISMATCH`.
  - Si el usuario no es propietario (`tenant_owner`), exige membresía en `cell_tenant_users` con `status = 'active'` y `grantChatwootAccess = true`; en caso contrario responde `403`.
  - Sincroniza al operador vía `ensureMemberUserInAccount` y persiste `chatwootAgentId` en `cell_tenant_users` cuando falte (best-effort), traduciendo fallos de red/SSO hacia Chatwoot en `502 CHATWOOT_SSO_UNAVAILABLE` con trazabilidad `requestId`.
- **Endpoint idempotente de reintento para propietario (`POST /api/tenant/conversations/retry`):** Permite al `tenant_owner` con capacidad `chatwoot_inboxes` reintentar idempotentemente `provisionTenantChatwootAccount` cuando su cuenta en `admin.chatwoot_accounts` está en estado `failed` o inexistente (`not_provisioned`).
- **Wrapper cliente `WorkspaceConversationsView` (`apps/admin/app/workspace/conversations/conversations-view.tsx`) y Server Component `page.tsx`:**
  - Preflight server-side de estados (`ready | no_capability | access_denied | provisioning | not_provisioned | suspended | failed`) antes de montar el `<iframe>`, evitando errores JSON crudos embebidos.
  - Estado `ready`: cabecera discreta con título, indicador de conexión y botón «Recargar Bandeja»; overlay de carga mientras el `<iframe>` completa `onLoad`; aviso amigable con botón «Reintentar Conexión» y `requestId` si supera el timeout (>12s), conservando el `<iframe>` operativo sin atributos `sandbox` restrictivos y sin abrir en pestaña nueva (`AGENTS.md §4.10`).
  - Estados `provisioning` / `not_provisioned` / `failed`: tarjetas limpias en Title Case con soporte `es`/`en`; el `tenant_owner` dispone de botón «Reintentar Vinculación» (cuando `failed` o `not_provisioned`) además de «Actualizar Estado», mientras el `tenant_agent` solo actualiza estado.
  - Estados `no_capability`, `access_denied` y `suspended`: tarjetas limpias y accionables en `es`/`en` sin exponer jerga de infraestructura ni códigos de especificación.
- **Reordenamiento e i18n en `TenantWorkspaceShell` (`apps/admin/components/tenant-workspace-shell.tsx`):** Posición #1 «Tablero» (`/workspace`), **posición #2 «Conversaciones» / «Conversations»** (`/workspace/conversations`, clave `navConversations`), conservando el gating por `chatwoot_inboxes` (`capabilityAliases: ["conversations"]`).

### Fuera de alcance (PROHIBIDO TOCAR)
- Modificar `apps/admin/app/admin/conversations/page.tsx` ni `apps/admin/app/admin/conversations/page.test.tsx`.
- Alterar la rama `if (scope === "admin")` en `apps/admin/app/api/auth/chatwoot/embed/route.ts`.
- Alterar lógica de provisión/infraestructura global de la instancia Chatwoot de la SaaS.
- Reimplementar bandejas de mensajes personalizadas fuera de Chatwoot (`AGENTS.md §4.10`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenant_owner` | Abrir `/workspace/conversations`, acceder embebido a `.../app/accounts/{su_account_id}/dashboard` y reintentar vinculación si falló | Sí | Solo si el plan incluye `chatwoot_inboxes` y la cuenta pertenece a su `client_id` |
| `tenant_agent` | Abrir `/workspace/conversations` y operar conversaciones en Chatwoot | Sí | Usuario con `status = 'active'` y `grantChatwootAccess = true` en `cell_tenant_users` |
| `tenant_agent` sin acceso | Intentar abrir `/workspace/conversations` o `/api/auth/chatwoot/embed?scope=workspace` | No | Denegado (`403` en API y tarjeta limpia `access_denied` en UI) |
| Cualquier usuario del comercio A | Intentar solicitar embed SSO enviando `?accountId` de otro comercio B | No | Denegado (`403 CHATWOOT_ACCOUNT_MISMATCH`) |
| `platform_owner` / `platform_admin` | Operar `/admin/conversations` (`scope=admin`) | Intacto | Flujo administrativo completamente preservado |

---

## 7. Modelo de datos

Se utilizan exclusivamente las tablas existentes sin alterar la arquitectura ni generar nuevas migraciones:
- **`admin.chatwoot_accounts`** (`packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`): `client_id`, `chatwoot_account_id`, `state` (`'pending' | 'provisioning' | 'active' | 'failed' | 'suspended'`), `last_error`, `synced_at`.
- **`cell_tenant_users`** (`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`): `user_id`, `role`, `status`, `grant_chatwoot_access`, `chatwoot_agent_id`.
- **Aislamiento estricto:** La consulta que resuelve `chatwoot_account_id` siempre filtra por `admin.chatwoot_accounts.client_id = session.clientId`. Jamás acepta `accountId` arbitrario enviado desde query param para suplantar otro comercio.

---

## 8. Reglas de negocio

- **RN-SPEC-13-01 (Barrera absoluta de no-regresión administrativa SaaS):** Todo cambio técnico en esta especificación se acota estrictamente a `scope=workspace`, `TenantChatwootEmbedService` y `/workspace/conversations`. La ruta `/admin/conversations` y el comportamiento de `scope=admin` deben permanecer intactos y pasar sus pruebas de regresión (`apps/admin/app/admin/conversations/page.test.tsx` y `apps/admin/app/api/auth/chatwoot/embed/route.test.ts`).
- **RN-SPEC-13-02 (Same-site iframe vía HTTP 307 sin escape de nivel superior `AGENTS.md §4.10`):** El acceso a Chatwoot del inquilino ocurre exclusivamente embebido en un iframe same-site apuntando a `/api/auth/chatwoot/embed?scope=workspace`, el cual responde **HTTP 307** hacia `{NEXT_PUBLIC_CHATWOOT_URL}/app/login?...&redirect_to=/app/accounts/{id}/dashboard`. Nunca abre pestaña nueva ni utiliza puertos hardcoded como `localhost:3001`.
- **RN-SPEC-13-03 (Derivación server-side del `accountId` desde la sesión):** El `accountId` de Chatwoot se obtiene exclusivamente de `admin.chatwoot_accounts` usando `session.clientId` del usuario autenticado en el portal. Cualquier parámetro externo `?accountId=` enviado en la petición workspace que no coincida se rechaza con `403 CHATWOOT_ACCOUNT_MISMATCH`.
- **RN-SPEC-13-04 (Reubicación prioritaria en el menú lateral e i18n):** En `TenantWorkspaceShell`, el enlace **«Conversaciones»** / **«Conversations»** (`/workspace/conversations`, clave i18n `navConversations`) ocupa exactamente la **segunda posición** del menú de navegación principal (después de **«Tablero»** `/workspace`).
- **RN-SPEC-13-05 (Degradación controlada y reintento seguro):** Si el usuario carece de capacidad de plan (`no_capability`), tiene acceso deshabilitado (`access_denied`), la cuenta está en provisión (`provisioning` / `not_provisioned`), suspendida (`suspended`) o con fallo (`failed`), o si el SSO/iframe tarda o falla, la vista presenta tarjetas claras en `es`/`en` (sin exponer tokens, puertos ni stack traces), con botón «Reintentar Vinculación» idempotente exclusivo para `tenant_owner` cuando proceda y logging estructurado correlacionado con `requestId`.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/auth/chatwoot/embed?scope=workspace` (Refactorización aislada de la rama `workspace`)
- **Validación de entrada:**
  - `scope` (opcional, por defecto `"workspace"`): solo acepta `"workspace"` o `"admin"`. Cualquier otro valor responde **HTTP 400** `BAD_REQUEST` (RFC 9457 `application/problem+json`).
  - `accountId` (opcional en `scope=workspace`): si se envía y no coincide con el `chatwootAccountId` del comercio en sesión, responde **HTTP 403** `FORBIDDEN` (`CHATWOOT_ACCOUNT_MISMATCH`).
- **Autenticación y autorización:** Sesión activa (`401` si falta/inválida), `activeClient` asignado (`403`), capacidad `chatwoot_inboxes` habilitada (`403`), cuenta `admin.chatwoot_accounts` en estado `active` (`404` si ausente o no activa), y si el usuario no es `tenant_owner`, membresía en `cell_tenant_users` con `status = 'active'` y `grantChatwootAccess = true` (`403` si bloqueado o sin membresía).
- **Response `307 Temporary Redirect` (cuando listo):**
  - Header `Location`: `${NEXT_PUBLIC_CHATWOOT_URL}/app/login?email=...&sso_auth_token=...&redirect_to=%2Fapp%2Faccounts%2F{accountId}%2Fdashboard&sso_account_id={accountId}`.
  - Headers de marco: `X-Frame-Options: SAMEORIGIN` y `Content-Security-Policy: frame-ancestors 'self' <NEXT_PUBLIC_ADMIN_URL>`.
- **Errores RFC 9457 (`application/problem+json`):** `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `502 BAD_GATEWAY` (`CHATWOOT_SSO_UNAVAILABLE`) sin exponer tokens secretos ni contraseñas en payload ni logs.

### 9.2 `POST /api/tenant/conversations/retry`
- **Autenticación y autorización:** Sesión activa de comercio (`scope=tenant`), rol `tenant_owner` (`403` para `tenant_agent`), y capacidad `chatwoot_inboxes` activa (`403` si no la incluye su plan).
- **Comportamiento:** Si la cuenta ya está `active`, retorna `200` idempotentemente; si está `failed` o ausente (`not_provisioned`), ejecuta `provisionTenantChatwootAccount` para el `clientId` de sesión (nunca acepta `clientId` externo).
- **Response `200 OK`:** `{ ok: true, data: { state, chatwootAccountId } }`.
- **Errores RFC 9457:** `401`, `403`, `502` si el servidor de mensajería no responde.

---

## 10. Especificación de UI/UX

- **Menú lateral (`tenant-workspace-shell.tsx`):**
  1. Tablero (`/workspace`)
  2. **Conversaciones / Conversations** (`/workspace/conversations`, clave `navConversations`) *(movido desde el bloque inferior a posición 2)*
  3. Productos y Catálogo (`/workspace/products`) ... (resto del menú intacto).
- **Vista `/workspace/conversations` (`page.tsx` + `conversations-view.tsx`):**
  - Contenedor full-bleed responsivo dentro del área principal (`h-[calc(100dvh-65px)]` en desktop y adaptable Mobile First) para el estado `ready`, y contenedor estándar `p-4 md:px-8 md:py-6` (`AGENTS.md §4.19`) para tarjetas de estado.
  - Cabecera discreta en `ready` con indicador de estado de conexión y botón secundario canónico «Recargar Bandeja» (`Reload Inbox`) que refresca el `<iframe>` sin recargar la página ni abrir pestaña nueva.
  - Overlay de carga inicial hasta que el `<iframe>` dispare `onLoad`, más aviso de recuperación ante timeout (>12s) con botón «Reintentar Conexión» y `requestId` de soporte.
  - Tarjetas limpias en `es`/`en` para `no_capability`, `access_denied`, `provisioning` / `not_provisioned`, `suspended` y `failed`, con botones `--dsn-accent` / `--dsn-surface` en Title Case y cero códigos de spec.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Acceso embebido de Chatwoot para inquilino y ubicación en menú

  Escenario: Menú lateral muestra Conversaciones en segunda posición debajo de Tablero
    Dado que un propietario o colaborador activo inicia sesión en el Backoffice del comercio con capacidad "chatwoot_inboxes"
    Cuando se renderiza el menú lateral de navegación en desktop o móvil
    Entonces el primer ítem es "Tablero" ("Dashboard" en inglés) y el segundo ítem es exactamente "Conversaciones" ("Conversations" en inglés) apuntando a "/workspace/conversations"

  Escenario: Inquilino accede embebido a su dashboard de cuenta Chatwoot mediante HTTP 307 sin abrir pestaña nueva
    Dado que el comercio "Café Real" tiene "chatwoot_account_id = 42" activo y "NEXT_PUBLIC_CHATWOOT_URL" configurado en entorno
    Cuando el propietario o un agente autorizado abre "/workspace/conversations" y el iframe solicita GET "/api/auth/chatwoot/embed?scope=workspace"
    Entonces GET "/api/auth/chatwoot/embed?scope=workspace" responde HTTP 307 con "Location" hacia "{NEXT_PUBLIC_CHATWOOT_URL}/app/login" y "redirect_to=%2Fapp%2Faccounts%2F42%2Fdashboard" sin referencias hardcoded a ":3001"
    Y la vista embebe el dashboard en un iframe same-site con cabecera discreta y botón "Recargar Bandeja"
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Parámetro scope inválido rechazado con error estructurado
    Dado que un usuario invoca GET "/api/auth/chatwoot/embed?scope=invalido"
    Cuando el handler valida el parámetro de consulta
    Entonces responde HTTP 400 Problem Details ("application/problem+json") sin ejecutar llamadas a Chatwoot
```

### (c) Errores de regla de negocio y estados controlados

```gherkin
  Escenario: Degradación controlada cuando el comercio está aprovisionando, suspendido o con acceso denegado al agente
    Dado que la cuenta Chatwoot del comercio está en estado "pending", "provisioning", "suspended" o "failed", o el agente tiene "grantChatwootAccess = false"
    Cuando el usuario accede a "/workspace/conversations"
    Entonces la UI no monta el iframe roto ni muestra errores 500
    Y presenta una tarjeta clara y localizada ("es"/"en") acorde al estado, habilitando "Reintentar Vinculación" idempotente solo al "tenant_owner" cuando la cuenta está en "failed" o sin aprovisionar
```

### (d) Seguridad y autorización (incluyendo no-regresión SaaS)

```gherkin
  Escenario: Bloqueo de acceso cruzado a otra cuenta Chatwoot e intangibilidad del flujo admin SaaS
    Dado que el inquilino A pertenece a "accountId = 42" y el inquilino B pertenece a "accountId = 99"
    Cuando el inquilino A intenta forzar "?accountId=99" en el endpoint workspace
    Entonces el backend rechaza con HTTP 403 ("CHATWOOT_ACCOUNT_MISMATCH") impidiendo generar sesión sobre la cuenta 99
    Y las pruebas automatizadas de "/admin/conversations" y "scope=admin" siguen pasando al 100% sin alteración de comportamiento
```

### (e) Escenarios de borde

```gherkin
  Escenario: Recuperación ante caída temporal de generación SSO o timeout de carga del iframe
    Dado que el servidor SSO de Chatwoot falla al emitir la URL o el iframe tarda más de 12 segundos en completar carga
    Cuando el usuario entra en "/workspace/conversations"
    Entonces el endpoint retorna HTTP 502 estructurado (sin exponer tokens) o la UI muestra un aviso claro con "Reintentar Conexión" y código de referencia sin colgar el layout
```

---

## 12. Requisitos no funcionales

- **Compatibilidad Traefik (`AGENTS.md §4.16`):** Cero puertos hardcoded (`:3001`, `:3000`, `:3003`) en la lógica de negocio; resolución de URL pública leída estrictamente desde `@t3-oss/env-nextjs` (`env.NEXT_PUBLIC_CHATWOOT_URL`) documentada en `.env.example`.
- **Seguridad CSP / Same-Site:** Cabecera `Content-Security-Policy` (`frame-ancestors`) en la rama `workspace` derivada de `env.NEXT_PUBLIC_ADMIN_URL` + `'self'`.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.chatwoot.embed_resolved` y `tenant.chatwoot.embed_failed` con `requestId`, `clientId`, `chatwootAccountId`, sin loguear tokens SSO ni URLs firmadas.

---

## 13. Dependencias y riesgos

- **Dependencias:** Configuración correcta de `CHATWOOT_INTERNAL_URL` / `NEXT_PUBLIC_CHATWOOT_URL` / `NEXT_PUBLIC_ADMIN_URL` en `env.ts` y `.env.example`; cuenta Chatwoot operativa en instancia SaaS.
- **Riesgos:**
  - *Regresión accidental sobre `/admin/conversations`:* Mitigado aislando completamente la implementación en `TenantChatwootEmbedService` para `scope=workspace`, dejando intacto el bloque `scope=admin`, y ejecutando obligatoriamente las suites `apps/admin/app/admin/conversations/page.test.tsx` y `apps/admin/app/api/auth/chatwoot/embed/route.test.ts` en cada cambio.

---

## 14. Definition of Done

- [x] `TenantChatwootEmbedService` implementado y exportado en `@mocter/domain` con pruebas unitarias pasando.
- [x] `scope=workspace` en `apps/admin/app/api/auth/chatwoot/embed/route.ts` refactorizado sobre `TenantChatwootEmbedService`, validando `scope` (`400`) y `?accountId` (`403`), sin `localhost:3001`, usando `env.NEXT_PUBLIC_CHATWOOT_URL` y dejando **intacto** `scope=admin`.
- [x] Endpoint `POST /api/tenant/conversations/retry` implementado y testeado para reintento idempotente del propietario.
- [x] `apps/admin/app/workspace/conversations/page.tsx` + `conversations-view.tsx` con preflight completo de estados, wrapper cliente de carga/timeout/recarga, i18n `es`/`en` y soporte fluido del iframe `.../app/accounts/{id}/dashboard`.
- [x] «Conversaciones» / «Conversations» (`navConversations`) movido a la **2.ª posición** (debajo de «Tablero») en `apps/admin/components/tenant-workspace-shell.tsx`.
- [x] Suite completa incluyendo **pruebas de no-regresión de `/admin/conversations`**, `pnpm lint`, `pnpm test` en verde + protocolo `AGENTS.md §4.18` ejecutado.
