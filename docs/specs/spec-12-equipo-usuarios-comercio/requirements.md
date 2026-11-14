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
3. No existe flujo para **editar rol/nombre** (`tenant_owner` vs `tenant_agent` con permisos granulares) ni **suspender / reactivar / retirar (`left`)** un miembro existente del equipo.
4. No se valida el límite real de usuarios del plan (`tenant_users` ni `chatwoot_agents` definidos en `SPEC-03`) al enviar invitaciones o reactivar miembros suspendidos, ni se sincroniza su estado con el acceso en Chatwoot (`SPEC-13`).

---

## 4. Objetivo y valor de negocio

Entregar al `tenancy_owner` el **control completo del ciclo de vida de sus colaboradores (`tenancy_users`)**: invitar miembros dentro de las cuotas de su plan, asignar roles operativos, suspender/reactivar accesos al instante y mantener sincronía limpia con la atención en Chatwoot sin intervención manual de soporte SaaS.

---

## 5. Alcance y Fuera de alcance

### Dentro del alcance
- Refactorización y ampliación de `TenantContactsAndUsersService` (`packages/domain/src/services/tenant-contacts-and-users.service.ts`) para cubrir ciclo completo:
  - Listado unificado de **miembros activos/suspendidos** (`cell_tenant_users` + `cell_users`) e **invitaciones pendientes/expiradas** (`admin.tenant_invitations`), con consumo `used / limit` real (`SPEC-03`).
  - Creación de invitación con token criptográfico (`SHA-256` almacenado en `admin.tenant_invitations`), caducidad a `72 horas`, validación de membresía `1:0..1` (`ADM-001 D-15`) y envío de email vía `SPEC-14`.
  - Aceptación de invitación (`/invite/[token]` o flujo de alta/contraseña para usuario nuevo en celda + usuario portal).
  - Reenvío y revocación de invitaciones pendientes.
  - Edición de perfil operativo / rol y permisos del miembro (`PATCH /api/tenant/team/[id]`).
  - Suspensión / Reactivación (`suspended` ↔ `active`) y Retiro definitivo (`left`) con modal `--dsn-*` y revocación inmediata de sesiones activas en el portal.
  - Desacople/sincronización no bloqueante (`after()`) con agente correspondiente en la cuenta Chatwoot del comercio si el plan habilita `chatwoot_agents`.
- Nuevos endpoints REST en `apps/admin/app/api/tenant/team/`:
  - `GET /api/tenant/team`
  - `POST /api/tenant/team/invite`
  - `POST /api/tenant/team/invitations/[id]/resend` y `DELETE /api/tenant/team/invitations/[id]`
  - `PATCH /api/tenant/team/[id]` y `PATCH /api/tenant/team/[id]/status` y `DELETE /api/tenant/team/[id]`
  - `POST /api/tenant/team/accept-invite`
- Rediseño Mobile First de `apps/admin/app/workspace/team/team-view.tsx`.

### Fuera de alcance
- Modificación de roles administrativos internos de la SaaS (`/admin/users` RBAC).
- Creación de múltiples roles jerárquicos personalizados con matriz de permisos por campo granular en esta fase (se mantiene el modelo de `tenant_owner` y `tenant_agent` con flags operativos claros).

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
- `email`: `VARCHAR(255)` `NOT NULL` (normalizado `trim().toLowerCase()`).
- `display_name`: `VARCHAR(160)` nullable **[Nuevo si no existe en tabla actual para personalizar saludo de invitación]**.
- `role`: `VARCHAR(32)` (`'tenant_agent' | 'tenant_owner'`), `NOT NULL`, default `'tenant_agent'`.
- `token_hash`: `VARCHAR(128)` `NOT NULL` (hash SHA-256 del token enviado por correo — nunca se guarda el token plano).
- `status`: `VARCHAR(24)` (`'pending' | 'accepted' | 'revoked' | 'expired'`), `NOT NULL`, default `'pending'`.
- `invited_by_user_id`: `UUID` `NOT NULL`.
- `expires_at`: `TIMESTAMPTZ` `NOT NULL` (`NOW() + 72h`).
- `accepted_at`: `TIMESTAMPTZ` nullable.
- Índice único parcial: máximo 1 invitación `pending` para un mismo `(client_id, email)`.

### 7.2 `cell_tenant_users` y `cell_users` (existentes en `pg-cell-XX`)
- `role`: `'tenant_owner' | 'tenant_agent'`.
- `status`: `'active' | 'suspended' | 'left'`.
- `chatwoot_agent_id`: `INTEGER` nullable **[Nuevo si no existe en `cell_tenant_users`, para correlacionar el usuario de celda con su agente en Chatwoot del comercio sin perder trazabilidad]**.
- **Estrategia de eliminación:** El retiro de un colaborador marca `cell_tenant_users.status = 'left'` y desactiva su acceso (`cell_users.status = 'disabled'`), conservando trazabilidad de pedidos creados, calificaciones CRM (`cell_contact_ratings`) y auditoría histórica.

---

## 8. Reglas de negocio

- **RN-SPEC-12-01 (Cuota unificada `active + pending_invitations`):** Al crear una invitación o reactivar un miembro `suspended`, el sistema verifica que `(miembros active + invitaciones pending no expiradas) < limite(tenant_users)` del plan vigente (`SPEC-03`). Si alcanza el tope y el límite no es `UNLIMITED`, rechaza con `422 TEAM_QUOTA_EXCEEDED` sugiriendo ampliar el plan en `/workspace/billing`.
- **RN-SPEC-12-02 (Invariante de al menos un propietario activo):** El sistema impide que el último `tenant_owner` en estado `active` de un comercio sea degradado a `tenant_agent`, suspendido o marcado como `left` (`422 LAST_OWNER_CANNOT_BE_REMOVED`).
- **RN-SPEC-12-03 (Membresía exclusiva `ADM-001 D-15`):** Si un correo ya pertenece como miembro activo o pendiente a **otro comercio** de Mocter, se rechaza la invitación (`409 EMAIL_BELONGS_TO_ANOTHER_TENANT`) respetando el modelo de membresía 1:0..1 vigente, o si ya es miembro activo del mismo comercio (`409 ALREADY_TEAM_MEMBER`).
- **RN-SPEC-12-04 (Seguridad de token de invitación):** El enlace enviado por email contiene token aleatorio de 32 bytes CSPRNG; en base de datos solo se almacena su `SHA-256`. Al reenviar invitación, se invalida el token previo generando uno nuevo y reiniciando `expires_at = NOW() + 72h`.
- **RN-SPEC-12-05 (Suspensión inmediata con revocación de sesión):** Al suspender o retirar un colaborador, además de actualizar su estado en celda, se invalidan de inmediato sus sesiones activas del portal (`session_tokens`) para cortar acceso en la siguiente petición y se programa deshabilitación/desvinculación de agente en Chatwoot (`after()`).

---

## 9. Contratos de interfaz

- `GET /api/tenant/team`: Lista paginada/filtrable de miembros + pestaña/sección de invitaciones pendientes + objeto `quota: { usedActive, pendingInvitations, limit, mode }`.
- `POST /api/tenant/team/invite`: `{ email, displayName, role, grantChatwootAccess?: boolean }`.
- `POST /api/tenant/team/invitations/[id]/resend` y `DELETE /api/tenant/team/invitations/[id]`.
- `PATCH /api/tenant/team/[id]`: `{ displayName?, role?, grantChatwootAccess? }`.
- `PATCH /api/tenant/team/[id]/status`: `{ status: 'active' | 'suspended' }`.
- `DELETE /api/tenant/team/[id]`: Retiro lógico definitivo (`status = 'left'`).
- `POST /api/tenant/team/accept-invite`: `{ token, displayName, password }` (para pantalla pública `/invite/[token]`).
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

- [ ] Servicio `TenantContactsAndUsersService` extendido con invitaciones seguras, aceptación, reenvío, revocación, edición y suspensión/reactivación/retiro.
- [ ] Rutas `/api/tenant/team*` completas + página `/invite/[token]` + tests de integración y aislamiento.
- [ ] UI `/workspace/team` rediseñada (`es`/`en`, Title Case, tabla estándar, modales `--dsn-*`, sin jerga interna).
- [ ] `pnpm lint`, `pnpm test`, `drizzle-kit check` en verde + protocolo §4.18 ejecutado.

---

## 15. Propuestas a Validar (PV-xx)

Sin preguntas abiertas para esta especificación.

