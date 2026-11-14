# SPEC-13 · Estabilización del Acceso Integrado de Chatwoot del Inquilino y Reubicación en Menú Lateral

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-13` |
| **Nombre** | Estabilización del Acceso Integrado de Chatwoot del Inquilino y Reubicación en Navegación |
| **Tipo de intervención** | Estabilización focalizada + Corrección de enrutamiento/navegación (con barrera de no-regresión SaaS) |
| **Prioridad** | P0 — Crítica (bandeja omnicanal operativa para atención diaria del comercio) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `GEN-04` |
| **Specs previas relacionadas** | `ADM-001` (D-32), `CHW-001` (§6.2), `CHW-002` |
| **Specs integradas / dependientes** | `SPEC-03` (capacidad de agentes/canales Chatwoot según plan), `SPEC-07` (layout y shell), `SPEC-09` (webhooks de mensajes entrantes refrescan ventana 24h), `SPEC-10` (etiquetas predeterminadas) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

1. **Bloqueo y fragilidad en el acceso embebido del inquilino (`GEN-04`):**
   - Mientras la integración administrativa de Chatwoot a nivel SaaS (`/admin/conversations` y rama `scope=admin` de `/api/auth/chatwoot/embed`) **opera correctamente en producción y desarrollo**, la ruta operativa del inquilino (`apps/admin/app/workspace/conversations/page.tsx` y rama `scope=workspace` en `apps/admin/app/api/auth/chatwoot/embed/route.ts`, líneas 94–159) presenta inestabilidad para conectar al usuario del comercio directamente con su instancia `.../app/accounts/{id}/dashboard`:
     - Incluye fallback hardcoded acoplado a puerto local (`localhost:3001`, línea 38 de `embed/route.ts`), violando `AGENTS.md §4.16` y generando desfasajes frente a Traefik / entornos reales donde Chatwoot corre bajo dominio/subruta same-site.
     - No resuelve de manera robusta todos los estados posibles entre la sesión del inquilino, `admin.chatwoot_accounts` y el SSO/token de agente, produciendo pantallas de error o bloqueos cuando falta vincular el agente del comercio, cuando la cuenta Chatwoot sigue aprovisionándose o cuando el proxy/SSO falla temporalmente.
2. **Ubicación incorrecta en la navegación lateral del comercio (`GEN-04`):**
   - En `apps/admin/components/tenant-workspace-shell.tsx` (líneas 151–223), «Conversaciones Omnicanal» aparece en la **posición 8** del menú lateral, relegando la herramienta de trabajo más usada del día a día en lugar de posicionarla inmediatamente después de **«Tablero»**.
3. **Restricción absoluta de no-regresión (mandato explícito del producto):**
   - Queda **terminantemente prohibido** modificar o poner en riesgo la integración funcional de Chatwoot en el Backoffice administrativo de la SaaS (`/admin/conversations`, rama `scope=admin` y provisión administrativa base ya operativa).

---

## 4. Objetivo y valor de negocio

Estabilizar únicamente la **zona operativa de Chatwoot del inquilino** (`/workspace/conversations` → iframe same-site hacia `.../app/accounts/{id}/dashboard`) garantizando:
1. Acceso fluido y agnóstico de entorno (compatible 100% con Traefik/HTTPS producción y desarrollo local sin puertos hardcoded en UI/handlers).
2. Reubicación prioritaria de **«Conversaciones»** en el **segundo lugar del menú del Backoffice** (debajo de **«Tablero»**).
3. Cero impacto o regresión sobre el módulo administrativo funcional `/admin/conversations` de la SaaS.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- **Aislamiento de rama `scope=workspace`** en `apps/admin/app/api/auth/chatwoot/embed/route.ts` (o extracción a helper dedicado `resolveTenantChatwootEmbedUrl()` dejando intacta la rama `scope=admin` de las líneas 43–89).
- Eliminación del fallback `localhost:3001` en `embed/route.ts` reemplazándolo por configuración validada en `@t3-oss/env-nextjs` (`CHATWOOT_BASE_URL` / `NEXT_PUBLIC_CHATWOOT_URL` documentada en `.env.example`, `AGENTS.md §4.12` y `§4.16`).
- Verificación y corrección de la construcción del path destino oficial para el comercio: `{CHATWOOT_PUBLIC_BASE}/app/accounts/{accountId}/dashboard` (con autenticación SSO/token same-site según contrato de `CHW-002` y cabecera CSP `frame-ancestors` verificada).
- Manejo elegante de estados en `apps/admin/app/workspace/conversations/page.tsx`:
  - `ready`: renderiza iframe full-height (`100%`) sin barra lateral duplicada de Mocter cuando corresponda, con botón auxiliar de recarga del frame si la red falla (prohibido abrir fuera en pestaña nueva `AGENTS.md §4.10`).
  - `provisioning` / `not_provisioned`: pantalla limpia explicando que su bandeja omnicanal se está preparando (o botón «Reintentar Vinculación» idempotente si el owner tiene derecho y falló en alta previa).
  - `agent_not_linked`: si el usuario autenticado (`tenancy_owner` o `tenant_agent`) aún no tiene mapeado agente dentro del `accountId` del comercio (y está dentro del cupo `chatwoot_agents` del plan), ejecuta sincronización segura hacia esa cuenta específica o muestra aviso accionable sin error 500.
  - `error`: banner RFC 9457 amigable con botón «Reintentar Conexión» y trazabilidad `requestId`.
- Reordenamiento de `navItems` en `apps/admin/components/tenant-workspace-shell.tsx`: posición #1 «Tablero» (`/workspace`), **posición #2 «Conversaciones»** (`/workspace/conversations`).

### Fuera de alcance (PROHIBIDO TOCAR)
- Modificar `apps/admin/app/admin/conversations/page.tsx` ni `apps/admin/app/admin/conversations/page.test.tsx`.
- Alterar la rama `scope === "admin"` en `apps/admin/app/api/auth/chatwoot/embed/route.ts`.
- Alterar lógica de provisión/infraestructura global de la instancia Chatwoot de la SaaS salvo correcciones puntuales aisladas requeridas exclusivamente para el enlace del usuario del comercio tras pruebas de no-regresión.
- Reimplementar bandejas de mensajes personalizadas fuera de Chatwoot (`AGENTS.md §4.10`).

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Abrir `/workspace/conversations` y acceder embebido a `.../app/accounts/{su_account_id}/dashboard` | Sí | Solo si el comercio tiene cuenta Chatwoot vinculada y pertenece a su `client_id` |
| `tenancy_users` (`tenant_agent`) | Abrir `/workspace/conversations` y operar conversaciones asignadas en Chatwoot | Sí | Usuario con estado `active` y agente vinculado dentro del cupo `chatwoot_agents` |
| Cualquier usuario del comercio A | Intentar solicitar embed SSO para un `accountId` perteneciente al comercio B | No | Denegado (`403 Forbidden`) |
| `platform_owner` / `platform_admin` | Operar `/admin/conversations` (`scope=admin`) | Intacto | Flujo administrativo completamente preservado |

---

## 7. Modelo de datos

Se utilizan exclusivamente las tablas existentes sin alterar la arquitectura administrativa:
- **`admin.chatwoot_accounts`** (`packages/domain/src/db/schemas/admin/chatwoot-capabilities.ts`): `client_id`, `chatwoot_account_id`, `status` (`'pending' | 'active' | 'suspended' | 'error'`), `sso_user_id` / credenciales cifradas de acceso de la cuenta.
- **`cell_tenant_users`** (`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`): `user_id`, `role`, `status`, `chatwoot_agent_id` (opcional añadido en `SPEC-12` para correlación directa de cada colaborador con su agente dentro de la cuenta Chatwoot del comercio).
- **Aislamiento estricto:** La consulta que resuelve `chatwoot_account_id` siempre filtra por `admin.chatwoot_accounts.client_id = session.clientId`. Jamás acepta `accountId` arbitrario enviado desde query param o body por un cliente del workspace.

---

## 8. Reglas de negocio

- **RN-SPEC-13-01 (Barrera absoluta de no-regresión administrativa SaaS):** Todo cambio técnico en esta especificación se acota estrictamente a la ruta `scope=workspace` y `/workspace/conversations`. La ruta `/admin/conversations` y el comportamiento de `scope=admin` deben permanecer intactos y pasar sus pruebas de regresión (`apps/admin/app/admin/conversations/page.test.tsx` y `apps/admin/app/api/auth/chatwoot/embed/route.test.ts`).
- **RN-SPEC-13-02 (Same-site iframe sin escape de nivel superior `AGENTS.md §4.10`):** El acceso a Chatwoot del inquilino ocurre exclusivamente embebido en un iframe same-site apuntando al path `.../app/accounts/{id}/dashboard` derivado de `CHATWOOT_PUBLIC_URL` en `env.ts`. Nunca redirige el navegador de nivel superior ni abre pestaña nueva por defecto, ni utiliza puertos hardcoded como `localhost:3001`.
- **RN-SPEC-13-03 (Derivación server-side del `accountId` desde la sesión):** El `accountId` de Chatwoot se obtiene exclusivamente de `admin.chatwoot_accounts` usando `session.clientId` del usuario autenticado en el portal. Cualquier parámetro externo `accountId` enviado en la petición workspace se ignora o rechaza si no coincide (`403 CHATWOOT_ACCOUNT_MISMATCH`).
- **RN-SPEC-13-04 (Reubicación prioritaria en el menú lateral):** En `TenantWorkspaceShell`, el enlace **«Conversaciones»** (ruta `/workspace/conversations`) ocupa exactamente la **segunda posición** del menú de navegación principal (después de **«Tablero»** `/workspace`).
- **RN-SPEC-13-05 (Degradación controlada ante errores de SSO o aprovisionamiento):** Si la cuenta Chatwoot aún está aprovisionándose, fue suspendida por inactividad de suscripción, o el token SSO expira en tránsito, la pantalla presenta mensaje claro en lenguaje comercial (sin stack traces ni mensajes técnicos crudos) con acción de «Reintentar Conexión» y logging correlacionado con `requestId`.

---

## 9. Contratos de interfaz

### 9.1 `GET /api/auth/chatwoot/embed?scope=workspace` (Refactorización aislada de la rama `workspace`)
- **Autenticación:** Sesión activa de `tenancy_owner` o `tenant_agent` (`status = 'active'`).
- **Response `200 OK` (cuando listo):**
  ```json
  {
    "ok": true,
    "data": {
      "state": "ready",
      "embedUrl": "https://chat.mocter.co/sso/login?...",
      "targetPath": "/app/accounts/42/dashboard",
      "accountId": 42
    }
  }
  ```
- **Response `200 OK` / `202` (estados no fatales de UI):**
  - `state: "not_provisioned" | "provisioning" | "agent_sync_required"` para mostrar estado guiado en la página sin romper el shell.
- **Errores RFC 9457:** `401 unauthorized`, `403 CHATWOOT_ACCOUNT_MISMATCH | TENANT_SUSPENDED`, `502 CHATWOOT_SSO_UNAVAILABLE` (nunca expone tokens secretos ni contraseñas en payload ni logs).

---

## 10. Especificación de UI/UX

- **Menú lateral (`tenant-workspace-shell.tsx`):**
  1. Tablero (`/workspace`)
  2. **Conversaciones** (`/workspace/conversations`) *(movido desde posición 8 a posición 2)*
  3. Productos (`/workspace/products`) ... (resto ordenado funcionalmente).
- **Vista `/workspace/conversations`:**
  - Contenedor full-bleed responsivo dentro del área principal (`h-[calc(100vh-theme(...))]` en desktop, adaptable Mobile First sin doble scroll incómodo).
  - Cabecera discreta con estado de conexión y botón «Recargar Bandeja» en caso de expiración de cookie/sesión del iframe tras horas inactivo.
  - Pantalla de espera o error amigable en `es`/`en` (sin mencionar puertos, contenedores ni tokens SSO) con botón «Reintentar Conexión».
  - Todas las etiquetas en Title Case, cero códigos de spec.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Acceso embebido de Chatwoot para inquilino y ubicación en menú

  Escenario: Menú lateral muestra Conversaciones en segunda posición debajo de Tablero
    Dado que un propietario o colaborador activo inicia sesión en el Backoffice del comercio
    Cuando se renderiza el menú lateral de navegación en desktop o móvil
    Entonces el primer ítem es "Tablero" y el segundo ítem es exactamente "Conversaciones" apuntando a "/workspace/conversations"

  Escenario: Inquilino accede embebido a su dashboard de cuenta Chatwoot sin abrir pestaña nueva
    Dado que el comercio "Café Real" tiene "chatwoot_account_id = 42" activo y "CHATWOOT_PUBLIC_URL" configurado en entorno
    Cuando el propietario o un agente activo abre "/workspace/conversations"
    Entonces GET "/api/auth/chatwoot/embed?scope=workspace" devuelve estado "ready" y URL SSO válida hacia "/app/accounts/42/dashboard" sin referencias hardcoded a ":3001"
    Y la vista embebe el dashboard de Chatwoot dentro de un iframe same-site operativo
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Parámetro scope inválido rechazado con error estructurado
    Dado que un usuario invoca GET "/api/auth/chatwoot/embed?scope=invalido"
    Cuando el handler valida el parámetro de consulta
    Entonces responde HTTP 400 Problem Details sin ejecutar llamadas a Chatwoot
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Degradación controlada cuando el comercio aún está aprovisionando Chatwoot
    Dado que el comercio tiene su registro de "admin.chatwoot_accounts" en estado "pending"
    Cuando el usuario accede a "/workspace/conversations"
    Entonces la UI no muestra errores 500 ni pantallas rotas
    Y muestra un estado amigable indicando que su bandeja omnicanal está terminando de activarse con botón de recarga
```

### (d) Seguridad y autorización (incluyendo no-regresión SaaS)

```gherkin
  Escenario: Bloqueo de acceso cruzado a otra cuenta Chatwoot e intangibilidad del flujo admin SaaS
    Dado que el inquilino A pertenece a "accountId = 42" y el inquilino B pertenece a "accountId = 99"
    Cuando el inquilino A intenta forzar "?accountId=99" en el endpoint workspace
    Entonces el backend ignora o rechaza con HTTP 403 impidiendo generar sesión sobre la cuenta 99
    Y las pruebas automatizadas de "/admin/conversations" y "scope=admin" siguen pasando al 100% sin alteración de comportamiento
```

### (e) Escenarios de borde

```gherkin
  Escenario: Recuperación ante caída temporal o timeout de generación SSO Chatwoot
    Dado que el servidor SSO de Chatwoot tarda más del timeout permitido o responde 502
    Cuando el usuario entra en "/workspace/conversations"
    Entonces recibe un aviso claro con botón "Reintentar Conexión" sin colgar el layout principal ni perder su sesión en Mocter
```

---

## 12. Requisitos no funcionales

- **Compatibilidad Traefik (`AGENTS.md §4.16`):** Cero puertos hardcoded (`:3001`, `:3000`, `:3003`); resolución de URL Chatwoot leída estrictamente desde `@t3-oss/env-nextjs` (`env.ts`) documentada en `.env.example`.
- **Seguridad CSP / Same-Site:** Verificar cabeceras `Content-Security-Policy` (`frame-src` / `frame-ancestors`) compatibles en `@mocter/admin` y proxy Traefik para el dominio Chatwoot configurado.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.chatwoot.embed_resolved` y `tenant.chatwoot.embed_failed` con `requestId`, `clientId`, `chatwootAccountId`, sin loguear tokens SSO.

---

## 13. Dependencias y riesgos

- **Dependencias:** Configuración correcta de `CHATWOOT_BASE_URL` / `CHATWOOT_PUBLIC_URL` en `env.ts` y `.env.example`; cuenta Chatwoot operativa en instancia SaaS.
- **Riesgos:**
  - *Regresión accidental sobre `/admin/conversations`:* Mitigado aislando completamente la implementación en funciones separadas para `scope=workspace` y ejecutando obligatoriamente las suites `apps/admin/app/admin/conversations/page.test.tsx` y `apps/admin/app/api/auth/chatwoot/embed/route.test.ts` en cada cambio.

---

## 14. Definition of Done

- [ ] `scope=workspace` en `apps/admin/app/api/auth/chatwoot/embed/route.ts` estabilizado, sin `localhost:3001`, usando `env.ts`, protegiendo aislamiento por `clientId` y dejando **intacto** `scope=admin`.
- [ ] `apps/admin/app/workspace/conversations/page.tsx` con soporte fluido de iframe `.../app/accounts/{id}/dashboard` y manejo elegante de estados pendientes/error/reintento.
- [ ] «Conversaciones» movido a la **2.ª posición** (debajo de «Tablero») en `apps/admin/components/tenant-workspace-shell.tsx`.
- [ ] Suite completa incluyendo **pruebas de no-regresión de `/admin/conversations`** (`page.test.tsx`, `embed/route.test.ts`), `pnpm lint`, `pnpm test` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Requerimiento completamente acotado con la directriz explícita del usuario de no tocar ni arriesgar la integración administrativa ya funcional de Chatwoot.

