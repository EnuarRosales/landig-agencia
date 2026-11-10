# TNT-001 · Requisitos · Estabilización del Entorno Operativo del Inquilino, Onboarding Unificado y Backoffice Celular

| Atributo | Valor |
|---|---|
| ID | TNT-001 |
| Versión | 1.0 |
| Estado | Aprobada · v1.0 |
| Fecha | 2026-11-08 |
| Documentos | `requirements.md` (este) · `design.md` · `tasks.md` |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) · [CEL-001](../cel-001-despliegue-celdas/requirements.md) · [AI-001](../ai-001-asistente-ai-configuracion/requirements.md) · [DSN-001](../dsn-001-sistema-diseno/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |

## 1. Propósito y Motivación

Durante las pruebas funcionales sobre la celda activa `cell-01` (`pg-cell-01`), se identificaron cinco brechas estructurales entre el Plano de Control (`db-portal`) y el Plano de Datos Celular (`pg-cell-XX`):

1. **Redirección sin control al Backoffice SaaS:** El layout raíz de `apps/admin` asignaba por defecto `role = "platform_owner"` cuando `fetchUserActivePlatformRoles()` no devolvía filas en `admin.platform_user_roles`, provocando que cualquier propietario de inquilino ingresara a `AdminShell.tsx` y `AdminHomePage.tsx`.
2. **Separación inexistente de árboles `.tsx`:** El Backoffice Corporativo de la SaaS y el Backoffice del Inquilino compartían el mismo cascarón y vista raíz en lugar de contar con archivos `.tsx` y rutas completamente independientes.
3. **Ausencia de aprovisionamiento físico y pool celular (`pg-cell-01`):** `createAdminTenant()` solo insertaba registros en `db-portal` dejando `pg-cell-01` con `0 filas` en `admin.users`, `admin.tenant_users`, `admin.tenant_labels` y `admin.client_business_info`, mientras que los repositorios de dominio conectaban por defecto a `getDb()` (`db-portal`) en lugar del PgBouncer celular.
4. **Asistente de Onboarding desconectado:** El servicio de onboarding operaba en memoria sin ruta `/onboarding` ni persistencia en PostgreSQL, y el alta manual marcaba al comercio como `activo` en lugar de `alta`, omitiendo el asistente en el primer ingreso.
5. **Alta autónoma (`/register`) inconclusa:** Los usuarios auto-registrados quedaban con `active_client_id = NULL` sin ruta de onboarding que aprovisionara su comercio en `cell-01` ni promoviera su identidad a la celda.

Esta especificación define los requisitos, criterios de aceptación y decisiones aprobadas en la sesión `/grill-me` del `2026-11-08` para estabilizar de extremo a extremo el entorno operativo del inquilino.

## 2. Alcance

### Incluye

- Gestor de conexiones celulares (`CellDatabasePoolManager`) con descifrado en memoria de `cell_secrets_ciphertext` y ejecución obligatoria de `SET LOCAL app.current_client_id` bajo `FORCE ROW LEVEL SECURITY`.
- Aprovisionamiento físico en `pg-cell-XX` (`admin.users`, `admin.tenant_users`, `admin.tenant_labels`, `admin.client_business_info`) y promoción de credenciales tanto en **Alta Manual** como en **Alta Autónoma**, incluyendo reconciliación idempotente de inquilinos existentes (`Synergia Market`).
- Separación física de árboles de rutas y archivos `.tsx` dentro de `mocter-admin`: `/admin/*` (`AdminShell.tsx`) para operadores SaaS, `/onboarding` (`TenantOnboardingWizard.tsx`) para puesta en marcha, y `/workspace/*` (`TenantWorkspaceShell.tsx`) para la operación del inquilino.
- Asistente de Onboarding unificado en 3 pasos (`/onboarding`) con soporte para Alta Manual (Paso 1 pre-cargado en estado `alta`) y Alta Autónoma (Paso 1 desde cero con `active_client_id = NULL`).
- Gating dinámico de capacidades del plan en `/workspace/*` mediante `TenantCapabilityGateService` y control de cuotas numéricas (`plan_limits`).
- Flujo multimedia privado/público en `/workspace/products` integrando subida S3 a **SeaweedFS** (`bucket: media`), registro en `media_catalog` + `product_media` + `client_media` + `client_usage`, y entrega firmada con HMAC-SHA256 vía **imgproxy**.

### Excluye

- Modificación del esquema interno de Chatwoot (`CHW-001`).
- Alteración de routers de Traefik o nombres de imágenes de producción (`AGENTS.md` R-03).

## 3. Requisitos Funcionales

### TNT-RF-01 · Aislamiento físico celular y promoción de identidad

| ID | Requisito |
|---|---|
| TNT-RF-01.1 | Toda consulta o escritura de datos operativos de un inquilino resuelve primero su celda activa en el Router Global (`admin.client_routing` → `admin.cells`), descifra `cell_secrets_ciphertext` y se conecta al PgBouncer de la celda (`pg-cell-XX`) mediante `CellDatabasePoolManager`. |
| TNT-RF-01.2 | Toda transacción sobre `pg-cell-XX` fija obligatoriamente `SELECT set_config('app.current_client_id', clientId, true)` antes de ejecutar sentencias DML o consultas, garantizando el cumplimiento de `FORCE ROW LEVEL SECURITY`. |
| TNT-RF-01.3 | En **Alta Manual (`/admin/tenants`)**, `createAdminTenant` crea el comercio en estado `lifecycle_status = 'alta'`, aprovisiona en la misma operación sus registros base en `pg-cell-XX` (`admin.users`, `admin.tenant_users` con `role = 'tenant_owner'`, `admin.tenant_labels` con las 4 etiquetas reservadas y `admin.client_business_info`) y actualiza `users.identity_location = '<cell_id>'`. |
| TNT-RF-01.4 | Cuando un usuario de inquilino establece su primera contraseña en `/[locale]/password/setup` (`purpose = 'setup'`) o la restablece (`purpose = 'reset'`), el hash Argon2id se persiste en `pg-cell-XX` (`admin.users`) bajo RLS y `password_hash` permanece `NULL` en el Router Global. |
| TNT-RF-01.5 | El listado de usuarios y roles en `/admin/users` (`fetchRbacOverview`) refleja el rol `tenant_owner` y el identificador de la celda asignada (`cell-01`) para propietarios de inquilinos, eliminando la etiqueta errónea `Sin Rol`. |
| TNT-RF-01.6 | Una rutina de reconciliación idempotente (`reconcileProvisionedTenantsInCells`) garantiza que cualquier inquilino previamente registrado en el Router Global (como `Synergia Market`) quede materializado en su celda asignada (`pg-cell-01`) con su membresía `tenant_owner` y estado `alta` si aún no posee productos ni onboarding completado. |

### TNT-RF-02 · Separación estricta de árboles `.tsx` y despacho por rol

| ID | Requisito |
|---|---|
| TNT-RF-02.1 | El servicio server-side `resolveAuthenticatedPortalContext(sid)` resuelve de forma autoritativa el scope del usuario autenticado: `platform` (`platform_owner`, `platform_admin`, `platform_sales`), `onboarding_prospect` (`active_client_id IS NULL`) o `tenant` (`tenant_owner`, `tenant_agent`). |
| TNT-RF-02.2 | Queda prohibido cualquier fallback que asigne `platform_owner` ante ausencia de filas en `admin.platform_user_roles`. |
| TNT-RF-02.3 | Los árboles de componentes `.tsx` del Backoffice SaaS y del Backoffice del Inquilino están físicamente separados: `AdminShell.tsx` + `AdminHomePage.tsx` sirven únicamente a `scope = 'platform'` en `/` y `/admin/*`, mientras que `TenantWorkspaceShell.tsx` + las páginas bajo `apps/admin/app/workspace/*` sirven únicamente a `scope = 'tenant'` con `lifecycle_status = 'activo'`. |
| TNT-RF-02.4 | Si un usuario con `scope = 'onboarding_prospect'` o un inquilino con `lifecycle_status = 'alta'` accede a cualquier ruta de `mocter-admin` distinta de `/onboarding`, el guard server-side lo redirige a `/onboarding`. Si un inquilino con `lifecycle_status = 'activo'` intenta acceder a `/` o `/admin/*`, es redirigido a `/workspace`. |

### TNT-RF-03 · Asistente de Onboarding unificado en 3 pasos (`/onboarding`)

| ID | Requisito |
|---|---|
| TNT-RF-03.1 | La ruta `/onboarding` (`TenantOnboardingWizard.tsx`) implementa un asistente Mobile First de 3 pasos: (1) Negocio, Slug, Plan y Celda; (2) Primer Producto con «Mejorar con AI»; (3) Preset del Bot y Activación de Canal. |
| TNT-RF-03.2 | En **Alta Autónoma (`/register` → `/verify-email` → `/login`)**, el usuario ingresa al Paso 1 con `active_client_id = NULL`. Al confirmar el Paso 1, el sistema crea `admin.clients` (`lifecycle_status = 'alta'`), asigna una celda activa con capacidad (`cell-01`), registra `admin.client_routing` y `admin.client_plans` (`source = 'self_service'`), aprovisiona `pg-cell-01` bajo RLS y promueve atómicamente sus credenciales desde el Router Global a `pg-cell-01`. |
| TNT-RF-03.3 | En **Alta Manual (`/admin/tenants` → `/password/setup` → `/login`)**, el propietario ingresa a `/onboarding` con el Paso 1 pre-cargado con los datos registrados en el alta manual (`displayName`, `slug`, `plan`, `cellCode`), pudiendo confirmar o ajustar moneda/teléfono/zona horaria para avanzar al Paso 2. |
| TNT-RF-03.4 | El Paso 2 crea el primer producto real en `pg-cell-XX` (`admin.products`) bajo RLS, ofrece el botón «Mejorar con AI» en la descripción (`textarea`) y actualiza `admin.client_usage` (`dimension = 'products'`). |
| TNT-RF-03.5 | El Paso 3 persiste el contexto de atención en `pg-cell-XX` (`admin.client_business_info`), actualiza `admin.clients.lifecycle_status` de `'alta'` a `'activo'` en el Router Global y redirige a `/workspace`. |

### TNT-RF-04 · Backoffice del Inquilino (`/workspace/*`), capacidades por plan y multimedia

| ID | Requisito |
|---|---|
| TNT-RF-04.1 | `TenantWorkspaceShell.tsx` expone para todos los planes los 7 módulos operativos base (sujetos a los límites numéricos de `plan_limits`): `/workspace` (Tablero), `/workspace/products` (Catálogo y Multimedia), `/workspace/contacts` (Contactos CRM), `/workspace/orders` (Pedidos), `/workspace/bot` (Asistente AI y Contexto), `/workspace/team` (Equipo y Agentes) y `/workspace/billing` (Mi Plan y Cuotas). |
| TNT-RF-04.2 | `TenantCapabilityGateService` filtra dinámicamente en el menú lateral y protege en servidor los 4 módulos sujetos a capacidades del plan (`plan_feature_values` / `client_feature_overrides`): `/workspace/conversations` (Bandeja Chatwoot), `/workspace/branding` (Marca Blanca), `/workspace/community` (Comunidad) y `/workspace/reports` (Informes). |
| TNT-RF-04.3 | Desde `/workspace/products`, el inquilino puede subir archivos multimedia validados por magic bytes al bucket privado `media` de **SeaweedFS**, registrar la ficha en `admin.media_catalog` (`db-portal`) y el vínculo en `admin.product_media` / `admin.client_media` / `admin.client_usage` (`pg-cell-XX`), y visualizar las imágenes mediante URLs públicas firmadas con HMAC-SHA256 servidas por **imgproxy**. |

## 4. Criterios de Aceptación

1. **CA-TNT-01 (Separación de Backoffices):** Al iniciar sesión como propietario de inquilino, nunca se renderiza `AdminShell.tsx` ni `AdminHomePage.tsx`; cualquier navegación a `/admin/*` redirige a `/onboarding` o `/workspace`.
2. **CA-TNT-02 (Onboarding en Alta Manual y Autónoma):** Un inquilino creado en `/admin/tenants` (`lifecycle_status = 'alta'`) y un usuario registrado en `/es/register` (`active_client_id = NULL`) son conducidos en su primer ingreso a `/onboarding`, completan los 3 pasos, persisten su primer producto y contexto de bot en `pg-cell-01`, y pasan a `lifecycle_status = 'activo'`.
3. **CA-TNT-03 (Aislamiento Físico RLS en `pg-cell-01`):** Las tablas `admin.users`, `admin.tenant_users`, `admin.products`, `admin.contacts` y `admin.orders` en `pg-cell-01` almacenan los registros del inquilino y devuelven `0 rows` cuando se consultan sin `SET LOCAL app.current_client_id` o con el `client_id` de otro inquilino.
4. **CA-TNT-04 (Flujo Multimedia SeaweedFS + imgproxy):** Al subir una imagen de producto en `/workspace/products`, el objeto se almacena en el bucket privado `media` de SeaweedFS, se registra en `media_catalog` y `product_media`, incrementa `client_usage` y se visualiza en el navegador con una URL firmada por `imgproxy` (`HTTP 200`).
5. **CA-TNT-05 (Gating por Plan):** El menú lateral de `TenantWorkspaceShell.tsx` y los guards de ruta muestran u ocultan los módulos opcionales en función de las capacidades reales del plan contratado por el inquilino.

## 5. Decisiones Aprobadas (`/grill-me` · 2026-11-08)

| ID | Decisión | Referencia cruzada |
|---|---|---|
| TNT-D-01 | Portal único en `mocter-admin` con árboles de rutas y archivos `.tsx` **100% separados**: `/admin/*` usa `AdminShell.tsx` + `AdminHomePage.tsx` para operadores SaaS; `/onboarding` usa `TenantOnboardingWizard.tsx`; `/workspace/*` usa `TenantWorkspaceShell.tsx` + vistas exclusivas para inquilinos. | `ADM-001 D-35`, `AUTH-001 AUTH-D-09` |
| TNT-D-02 | Asistente de Onboarding unificado en 3 pasos (`/onboarding`) obligatorio tanto para **Alta Manual** (creada en `lifecycle_status = 'alta'` con Paso 1 pre-cargado y provisión inmediata en `pg-cell-XX`) como para **Alta Autónoma** (iniciando en Paso 1 con `active_client_id = NULL` y aprovisionando cliente + celda al completar el Paso 1). | `ADM-001 D-36`, `AUTH-001 AUTH-D-01` |
| TNT-D-03 | Pool celular dinámico (`CellDatabasePoolManager`) con `SET LOCAL app.current_client_id` hacia `pg-cell-XX`, 7 módulos base en `/workspace/*` gobernados por `plan_limits` y 4 módulos opcionales filtrados dinámicamente por `TenantCapabilityGateService`. | `ADM-001 D-37`, `DAT-001`, `CEL-001` |

