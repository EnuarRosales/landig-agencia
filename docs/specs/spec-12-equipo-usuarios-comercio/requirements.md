# SPEC-12 · Gestión Completa del Equipo del Comercio: Invitaciones, Roles, Cuotas y Estado Operativo

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-12` |
| **Nombre** | Gestión Completa del Equipo del Comercio: Invitaciones, Edición, Activación/Suspensión y Cuotas |
| **Tipo de intervención** | Nuevo desarrollo de CRUD operativo sobre esquema parcial existente |
| **Prioridad** | P1 — Alta (colaboración multiusuario `tenancy_users` y agentes Chatwoot) |
| **Versión** | 1.0.0 |
| **Estado** | Aprobada para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **IDs de observaciones cubiertos** | `EQU-02` |
| **Specs previas relacionadas** | `ADM-001` (D-15, D-31), `TNT-001`, `CHW-002` |
| **Specs integradas / dependientes** | `SPEC-01` (terminología «Equipo De Trabajo» sin «Celular»), `SPEC-03` (validación estricta de cuotas `tenant_users` y `chatwoot_agents` de `SPEC-03`), `SPEC-13` (acceso de colaboradores al inbox Chatwoot del comercio), `SPEC-14` (plantilla email `team.member_invited`), `SPEC-17` (tabla paginada/ordenable/filtrable estándar) |
| **Wave de ejecución sugerida** | Wave 3 — Refactorización de Módulos Operativos |

---

## 3. Problema / Situación actual

Aunque existen las tablas `admin.tenant_invitations`, `pg-cell-XX.cell_tenant_users` y `pg-cell-XX.cell_users`, la revisión de `apps/admin/app/api/tenant/team/route.ts` (apenas 28 líneas con un único `GET`) y `apps/admin/app/workspace/team/team-view.tsx` evidencia que la pantalla de Equipo es prácticamente de solo lectura:

1. No existe endpoint ni UI para **invitar nuevos colaboradores** por correo electrónico (`POST /api/tenant/team/invite`) con token seguro y expiración.
2. No existe mecanismo para **reenviar o revocar** una invitación pendiente.
3. No existe flujo para **editar perfil/acceso Chatwoot** (`displayName`, `grantChatwootAccess` en `tenant_agent`) ni **suspender / reactivar / retirar (`left`)** un miembro existente del equipo.
4. No se valida el límite real de usuarios del plan (`tenant_users` ni `chatwoot_agents` definidos en `SPEC-03`) al enviar invitaciones o reactivar miembros suspendidos, ni se sincroniza su estado con el acceso en Chatwoot (`SPEC-13`).

---

## 4. Objetivo y valor de negocio

Entregar al `tenancy_owner` el **control completo del ciclo de vida de sus colaboradores (`tenancy_users`)**: invitar miembros dentro de las cuotas de su plan, asignar roles operativos, suspender/reactivar accesos al instante y mantener sincronía limpia con la atención en Chatwoot sin intervención manual de soporte SaaS.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Refactorización y ampliación de `TenantContactsAndUsersService` (`packages/domain/src/services/tenant-contacts-and-users.service.ts`) para cubrir ciclo completo:
  - Listado unificado de **miembros activos/suspendidos** (`cell_tenant_users` + `cell_users`) e **invitaciones pendientes/expiradas** (`admin.tenant_invitations`), con consumo `used / limit` real (`SPEC-03`).
  - Creación de invitación con token criptográfico (`SHA-256` almacenado en `admin.tenant_invitations`), caducidad a `72 horas`, validación de membresía `1:0..1` (`ADM-001 D-15`), flag `grantChatwootAccess` y envío de email vía `SPEC-14`.
  - Aceptación de invitación (`/invite/[token]` en `apps/admin`, exento en `proxy.ts`) con flujo diferenciado: usuario nuevo define nombre y contraseña creando identidad en Router + Celda + sesión; usuario ya existente en `admin.users` sin comercio activo confirma su contraseña actual (o sesión activa coincidente) sin sobrescribir su credencial previa.
  - Reenvío (soportando invitaciones vigentes o expiradas) y revocación de invitaciones pendientes.
  - Edición de perfil operativo y acceso Chatwoot del miembro (`PATCH /api/tenant/team/[id]`).
  - Suspensión / Reactivación (`suspended` ↔ `active`) y Retiro definitivo (`left`) con modal `--dsn-*` y revocación inmediata de sesiones activas en el portal.
  - Desacople/sincronización no bloqueante (`after()`) con agente correspondiente en la cuenta Chatwoot del comercio si el plan habilita `chatwoot_agents` y el colaborador tiene `grantChatwootAccess = true`.
- Nuevos endpoints REST en `apps/admin/app/api/tenant/team/`:
  - `GET /api/tenant/team`
  - `POST /api/tenant/team/invite`
  - `POST /api/tenant/team/invitations/[id]/resend` y `DELETE /api/tenant/team/invitations/[id]`
  - `PATCH /api/tenant/team/[id]` y `PATCH /api/tenant/team/[id]/status` y `DELETE /api/tenant/team/[id]`
  - `GET /api/tenant/team/accept-invite` y `POST /api/tenant/team/accept-invite`
- Rediseño Mobile First de `apps/admin/app/workspace/team/team-view.tsx`.

### Fuera de alcance
- Modificación de roles administrativos internos de la SaaS (`/admin/users` RBAC).
- Múltiples co-propietarios (`tenant_owner` sigue siendo único por comercio según `ADM-001 D-31`, `admin.clients.owner_user_id` y `tenant_users_one_owner`) o creación de múltiples roles jerárquicos personalizados con matriz de permisos por campo granular en esta fase.

---

## 6. Actores y permisos

| Actor / Rol | Operación | Permitido | Condición |
| --- | --- | --- | --- |
| `tenancy_owner` | Listar equipo, invitar, reenviar/revocar invitaciones, editar, suspender/reactivar y retirar miembros | Sí | Solo en su `client_id` y nunca retirarse ni degradarse a sí mismo si es el único `tenant_owner` activo |
| `tenancy_users` (`tenant_agent`) | Ver lista básica de compañeros activos del comercio | Sí | Solo lectura no sensible (oculta tokens o acciones de gestión) |
| `tenancy_users` (`tenant_agent`) | Invitar, suspender, editar roles o revocar invitaciones | No | `403 Forbidden` |

---

## 7. Modelo de datos

### 7.1 `admin.tenant_invitations` (existente en `chatwoot-media-onboarding.ts`)
- `id`: `UUID` PK.
- `client_id`: `UUID` FK → `admin.clients.id`, `NOT NULL`, indexado.
- `email`: `TEXT` `NOT NULL` (normalizado `trim().toLowerCase()`).
- `display_name`: `TEXT` nullable **[Nuevo: para personalizar saludo de invitación y nombre inicial sugerido]**.
- `role`: `TEXT` (`'tenant_agent'`), `NOT NULL`, default `'tenant_agent'` (mantiene invariante `tenant_invitations_role_check` de `ADM-001 D-31`).
- `grant_chatwoot_access`: `BOOLEAN` `NOT NULL`, default `true` **[Nuevo: define si el colaborador consumirá cupo `chatwoot_agents` y accederá a `/workspace/conversations`]**.
- `token_hash`: `BYTEA` `NOT NULL` (hash SHA-256 del token enviado por correo — nunca se guarda el token plano).
- `status`: `TEXT` (`'pending' | 'accepted' | 'revoked' | 'expired'`), `NOT NULL`, default `'pending'`.
- `invited_by_user_id`: `UUID` `NOT NULL`.
- `expires_at`: `TIMESTAMPTZ` `NOT NULL` (`NOW() + 72h`).
- `accepted_at`: `TIMESTAMPTZ` nullable.
- Índice único parcial: máximo 1 invitación `pending` para un mismo `(client_id, email)` (`tenant_invitations_client_email_pending_unique`).

### 7.2 `cell_tenant_users` y `cell_users` (existentes en `pg-cell-XX`)
- `role`: `'tenant_owner' | 'tenant_agent'` (invariante `tenant_users_one_owner` único propietario activo por comercio).
- `status`: `'active' | 'suspended' | 'left'`.
- `grant_chatwoot_access`: `BOOLEAN` `NOT NULL`, default `true` **[Nuevo: habilita o revoca el acceso a la bandeja Chatwoot del comercio]**.
- `chatwoot_agent_id`: `INTEGER` nullable **[Nuevo: para correlacionar el usuario de celda con su agente en Chatwoot del comercio sin perder trazabilidad]**.
- **Estrategia de eliminación y re-invitación:** El retiro de un colaborador marca `cell_tenant_users.status = 'left'`, desactiva su acceso (`cell_users.status = 'disabled'`) y limpia `admin.users.active_client_id`, conservando trazabilidad de pedidos creados, calificaciones CRM (`cell_contact_ratings`) y auditoría histórica. Si el mismo correo vuelve a ser invitado al mismo comercio, se reactiva su fila en `cell_users` (`status = 'active'`) y se crea su nueva membresía activa.

---

## 8. Reglas de negocio

- **RN-SPEC-12-01 (Cuota unificada `tenant_users` y `chatwoot_agents`):** Al crear una invitación, reenviar una invitación expirada o reactivar un miembro `suspended`, el sistema verifica que `(miembros active + invitaciones pending vigentes) < limite(tenant_users)` del plan vigente (`SPEC-03`). Si además tiene `grantChatwootAccess = true`, verifica que `(miembros active con grantChatwootAccess + invitaciones pending vigentes con grantChatwootAccess) < limite(chatwoot_agents)` (rechazando con `422 TEAM_QUOTA_EXCEEDED` o `422 CHATWOOT_AGENTS_QUOTA_EXCEEDED`).
- **RN-SPEC-12-02 (Invariante de propietario único `ADM-001 D-31`):** El sistema mantiene un único `tenant_owner` titular (`admin.clients.owner_user_id` e índice `tenant_users_one_owner`). No se permite invitar nuevos `tenant_owner`, ni degradar, suspender o retirar al `tenant_owner` (`422 LAST_OWNER_CANNOT_BE_REMOVED`).
- **RN-SPEC-12-03 (Membresía exclusiva `ADM-001 D-15` e invitaciones duplicadas/expiradas):** Si un correo ya pertenece como miembro activo o pendiente a **otro comercio** (o tiene rol de plataforma), se rechaza la invitación (`409 EMAIL_BELONGS_TO_ANOTHER_TENANT`); si ya es miembro `active` o `suspended` del mismo comercio, se rechaza (`409 ALREADY_TEAM_MEMBER`); si ya existe una invitación `pending` vigente para el mismo correo en el mismo comercio, se rechaza (`409 INVITATION_ALREADY_PENDING`, sugiriendo reenvío). Si la invitación previa ya superó `expires_at`, se marca automáticamente como `expired` para permitir emitir una nueva sin colisionar con el índice único parcial.
- **RN-SPEC-12-04 (Seguridad de token, reenvío y aceptación diferenciada):** El enlace enviado por email (`/invite/{token}`) contiene token aleatorio de 32 bytes CSPRNG; en base de datos solo se almacena su `SHA-256`. Al reenviar una invitación (vigente o expirada, validando cuota en este último caso), se invalida el token previo generando uno nuevo, se restaura `status = 'pending'` y se reinicia `expires_at = NOW() + 72h`. En la aceptación: si el correo es nuevo, se crea `admin.users` (con `emailVerifiedAt` confirmado por posesión del correo invitado), `cell_users` y `cell_tenant_users`; si el correo ya existe en `admin.users` con `active_client_id IS NULL`, debe validar su contraseña actual (o sesión activa coincidente) para vincularse sin sobrescribir su contraseña previa.
- **RN-SPEC-12-05 (Suspensión inmediata con revocación de sesión y desacople Chatwoot):** Al suspender, retirar o desactivar `grantChatwootAccess` de un colaborador, se actualiza su estado en celda, se invalidan de inmediato sus sesiones activas del portal (`authService.revokeUserSessions`, cortando el acceso en `resolveAuthenticatedPortalContext`) cuando corresponda (`suspended`/`left`), y se programa la remoción del agente en la cuenta Chatwoot del comercio (`after()`) más bloqueo en `/api/auth/chatwoot/embed`.

---

## 9. Contratos de interfaz

- `GET /api/tenant/team`: Lista paginada/filtrable de miembros (`active`/`suspended`) + invitaciones (solo para `tenancy_owner`) + objeto `quota: { usedActive, pendingInvitations, limit, mode, chatwootUsed, chatwootPending, chatwootLimit, chatwootMode }`.
- `POST /api/tenant/team/invite`: `{ email, displayName?, role?: 'tenant_agent', grantChatwootAccess?: boolean }`.
- `POST /api/tenant/team/invitations/[id]/resend` y `DELETE /api/tenant/team/invitations/[id]`.
- `PATCH /api/tenant/team/[id]`: `{ displayName?, grantChatwootAccess? }`.
- `PATCH /api/tenant/team/[id]/status`: `{ status: 'active' | 'suspended' }`.
- `DELETE /api/tenant/team/[id]`: Retiro lógico definitivo (`status = 'left'`).
- `GET /api/tenant/team/accept-invite?token=...`: Consulta metadatos no sensibles de la invitación (`valid`, `expired`, `tenantName`, `emailHint`, `displayName`, `existingAccount`, `matchesActiveSession`).
- `POST /api/tenant/team/accept-invite`: `{ token, displayName?, password?, currentPassword? }` (para pantalla pública `/invite/[token]`, creando cookie de sesión en el portal al completar).
- Todos protegidos con `handle()` RFC 9457 (eliminando `detail: msg` del archivo actual).

---

## 10. Especificación de UI/UX

- **Vista `/workspace/team` (`team-view.tsx`):**
  - Banner superior con cuota clara del plan: *«Miembros Del Equipo: 2 de 5 disponibles»* (sin códigos internos ni `pg-cell-01`).
  - Botón primario «Invitar Colaborador» (deshabilitado con aviso amigable si cuota llena + link a `/workspace/billing`).
  - Dos pestañas claras: **Miembros Del Equipo** (tabla paginada/filtrable con Nombre, Correo, Rol, Estado `Activo`/`Suspendido`, Último Acceso, Acciones: **Editar**, **Suspender/Reactivar**, **Retirar**) e **Invitaciones Pendientes** (Correo, Rol, Estado `Pendiente`/`Expirada`, Expiración, Acciones: **Reenviar**, **Revocar**).
  - Toda suspensión, retiro o revocación exige confirmación en modal accesible `--dsn-*` (cero `window.confirm`), labels en Title Case, Mobile First e i18n `es`/`en`.

---

## 11. Criterios de aceptación (Gherkin)

### (a) Escenarios satisfactorios

```gherkin
Característica: Gestión completa del equipo e invitaciones del comercio

  Escenario: Propietario invita colaborador dentro de cuota y este acepta con enlace único
    Dado que el plan permite 5 usuarios y el comercio "Tienda Sol" tiene 1 propietario activo
    Cuando el propietario envía invitación para "andrea@tiendasol.co" con rol "tenant_agent"
    Entonces se crea la invitación con "token_hash" SHA-256 (sin token plano), expiración 72h y se encola correo en "SPEC-14"
    Cuando Andrea abre el enlace de invitación y define su contraseña mediante POST "/api/tenant/team/accept-invite"
    Entonces su usuario queda activo en la celda y pasa a aparecer en la pestaña "Miembros Del Equipo"

  Escenario: Suspensión de colaborador revoca su sesión inmediatamente
    Dado que Andrea es "tenant_agent" activa con sesión iniciada
    Cuando el propietario confirma suspenderla mediante modal "--dsn-*" (PATCH "/api/tenant/team/[id]/status")
    Entonces su estado pasa a "suspended" y cualquier petición posterior de Andrea retorna HTTP 401/403
```

### (b) Validaciones de entrada

```gherkin
  Escenario: Rechazo de invitación con correo mal formado o contraseña débil al aceptar
    Dado que se envía POST "/api/tenant/team/invite" con "email = no-valido"
    Cuando el servidor valida el payload
    Entonces responde HTTP 400 Problem Details sin generar fila ni enviar correo
```

### (c) Errores de regla de negocio

```gherkin
  Escenario: Bloqueo por cuota alcanzada incluyendo invitaciones pendientes
    Dado que el plan permite "tenant_users = 3", hay 2 miembros activos y 1 invitación pendiente vigente
    Cuando el propietario intenta invitar a una cuarta persona
    Entonces el backend rechaza con HTTP 422 "TEAM_QUOTA_EXCEEDED"

  Escenario: Imposibilidad de suspender o retirar al único propietario activo del comercio
    Dado que "Carlos" es el único usuario con rol "tenant_owner" activo en el comercio
    Cuando intenta degradarse a "tenant_agent" o retirarse del equipo
    Entonces el backend responde HTTP 422 "LAST_OWNER_CANNOT_BE_REMOVED"
```

### (d) Seguridad y autorización

```gherkin
  Escenario: Un agente no puede invitar, suspender ni revocar miembros del equipo
    Dado que un usuario "tenant_agent" está autenticado
    Cuando invoca POST "/api/tenant/team/invite" o DELETE "/api/tenant/team/[id]"
    Entonces recibe HTTP 403 Forbidden
```

### (e) Escenarios de borde

```gherkin
  Escenario: Reenvío de invitación regenera token dejando obsoleto el enlace anterior
    Dado que existía una invitación pendiente T1 enviada a "luis@tienda.co"
    Cuando el propietario pulsa "Reenviar Invitación" generando el nuevo enlace T2
    Y alguien intenta aceptar usando el token anterior T1
    Entonces POST "/api/tenant/team/accept-invite" rechaza T1 con HTTP 422 "INVITATION_TOKEN_INVALID_OR_EXPIRED" mientras T2 funciona correctamente
```

---

## 12. Requisitos no funcionales

- **Seguridad:** Tokens aleatorios CSPRNG 32 bytes almacenados únicamente como hash SHA-256; invalidación inmediata de sesiones en revocación/suspensión.
- **Observabilidad (`AGENTS.md §4.13`):** Eventos Pino `tenant.team.invited`, `tenant.team.invite_accepted`, `tenant.team.member_status_changed` con `requestId`, `clientId`, sin exponer tokens ni contraseñas en logs.

---

## 13. Dependencias y riesgos

- **Dependencias:** `SPEC-03` (`tenant_users` y `chatwoot_agents` en `TenantCapabilityGateService`), `SPEC-13` (sincronización de agente en Chatwoot), `SPEC-14` (plantilla email de invitación).
- **Riesgos:**
  - *Desincronización de sesiones en caché tras suspender usuario:* Mitigado verificando `status === 'active'` en `resolveAuthenticatedPortalContext`.

---

## 14. Definition of Done

- [x] Servicio `TenantContactsAndUsersService` extendido con invitaciones seguras, aceptación, reenvío, revocación, edición y suspensión/reactivación/retiro.
- [x] Rutas `/api/tenant/team*` completas + página `/invite/[token]` + tests de integración y aislamiento.
- [x] UI `/workspace/team` rediseñada (`es`/`en`, Title Case, tabla estándar, modales `--dsn-*`, sin jerga interna).
- [x] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx) — Decisiones Resueltas

- **PV-01 (Invariante de propietario único):** Se mantiene `tenant_owner` único por comercio (`admin.clients.owner_user_id` + `tenant_users_one_owner`). Las invitaciones y ediciones aplican sobre `tenant_agent`.
- **PV-02 (Ruta pública `/invite/[token]` y cuentas existentes):** `/invite/[token]` y `/api/tenant/team/accept-invite` se hospedan en `apps/admin` (exentos en `apps/admin/proxy.ts`). Usuarios nuevos definen contraseña y obtienen sesión directa; usuarios existentes en `admin.users` sin comercio activo confirman su contraseña actual (o sesión activa coincidente) sin sobrescribir credenciales.
- **PV-03 (Acceso y cuota Chatwoot por colaborador):** Se persiste `grant_chatwoot_access` (default `true`) junto con `chatwoot_agent_id`; se valida `chatwoot_agents` (`SPEC-03`), se sincroniza/remueve el agente vía Platform API en `after()` y se valida el flag en `/api/auth/chatwoot/embed`.
- **PV-04 (Invitaciones duplicadas/expiradas y re-invitación tras retiro):** `POST /invite` responde `409 INVITATION_ALREADY_PENDING` ante invitación vigente, expira automáticamente filas vencidas antes de crear una nueva, `resend` soporta vigentes y expiradas validando cuota, y aceptar tras un retiro previo (`left`) reactiva `cell_users` y crea nueva membresía activa.

