# Handoff Report: Milestone 1 (M1) Technical Implementation Strategy (Features 6, 7, 8)

**Author**: Explorer Subagent (`explorer_m1_3`)  
**Recipient**: Orchestrator (`d9dd6187-8097-406e-a649-0b6a842d2eff`)  
**Milestone**: Milestone 1 (Reconciliation, RBAC Overview & Password Reset — Features 6, 7 & 8)  
**Date**: 2026-11-09  

---

## 1. Observation

1. **Estado en vivo de `Synergia Market` en `db-portal`**:
   - Consulta ejecutada:
     ```bash
     docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.id, c.slug, c.display_name, c.lifecycle_status, c.owner_user_id, u.email, u.identity_location, cr.cell_id FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id LEFT JOIN admin.client_routing cr ON c.id = cr.client_id WHERE c.slug = 'synergia-market';"
     ```
   - Resultado verificado:
     - `c.id`: `01a1bc84-cc30-73b6-bc84-1f0cda5a9661`
     - `c.slug`: `synergia-market`
     - `c.display_name`: `Synergia Market`
     - `c.lifecycle_status`: `activo` (prematuro; no ha realizado onboarding ni tiene productos)
     - `c.owner_user_id`: `01a1bc84-cbec-7a2c-9efe-3a3f55284113`
     - `u.email`: `synergiamarket25@gmail.com`
     - `u.identity_location`: `router`
     - `cr.cell_id`: `6ae5619b-7ca3-4764-baae-1b8950a8e534` (`pg-cell-01`)
     - `u.password_hash`: `$argon2id$v=19$m=65536,t=3,p=4$...` (alojado en `db-portal`)

2. **Ausencia total de registros en `pg-cell-01`**:
   - Consultas ejecutadas:
     ```bash
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.users;"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.tenant_users;"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.client_business_info;"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.products;"
     ```
   - Resultado: `count = 0` en todas las tablas del plano de datos celular.

3. **Restricciones de Integridad del Esquema PostgreSQL**:
   - `packages/domain/src/db/schemas/admin/users.ts:61-66`:
     ```sql
     CHECK (identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     ```
     Exige que `identity_location` sea `'router'` o el UUID de 36 caracteres de la celda (`6ae5619b-7ca3-4764-baae-1b8950a8e534`), no el slug `'cell-01'`.
   - `packages/domain/src/db/schemas/admin/users.ts:72-75` y `packages/domain/src/db/schemas/tenant/users.ts:73-76`:
     ```sql
     CHECK ((password_hash IS NULL) = (password_updated_at IS NULL))
     ```
     Exige que si `password_hash` es `NULL`, `password_updated_at` debe ser obligatoriamente `NULL`. De lo contrario, PostgreSQL rechaza la transacción.

4. **Causa de "Sin Rol" en `fetchRbacOverview`**:
   - `packages/domain/src/services/rbac.service.ts:428-452`:
     ```typescript
     const activeRoles = await db.select().from(platformUserRoles).where(sql`revoked_at IS NULL`);
     ...
     roles: userRolesMap.get(u.id) || ["Sin Rol"]
     ```
     La función solo consulta `platformUserRoles`. Los usuarios de inquilinos (`clients.owner_user_id` o `users.active_client_id`) no tienen filas en `platformUserRoles`, por lo que caen al fallback `"Sin Rol"`.
   - `apps/admin/app/admin/users/rbac-view.tsx:360`: Imprime directamente `{u.identityLocation}`, mostrando el UUID en crudo en vez del código de celda (`cell-01`).

5. **Ruta y Deficiencias en Restablecimiento de Contraseñas**:
   - `packages/domain/src/services/auth.service.ts:2171`:
     ```typescript
     if (tokenRecord.purpose === "reset" && user.passwordHash === null) {
       return err("La cuenta no cuenta con una contraseña nativa previa para recuperar.", "NO_NATIVE_PASSWORD");
     }
     ```
     Al aislar credenciales en la celda (`password_hash = NULL` en `db-portal`), un usuario de celda que intente restablecer contraseña es rechazado falsamente.
   - `packages/domain/src/repositories/drizzle-auth.repository.ts:708-722`:
     Persiste `passwordHash` incondicionalmente en `db-portal` (`admin.users`), violando el principio de aislamiento en `pg-cell-XX`.

---

## 2. Logic Chain

1. **Materialización Celular y Reconciliación (`reconcileProvisionedTenantsInCells`)**:
   - A partir de la Obs. 1 y 2, `Synergia Market` está enrutado a `pg-cell-01` en `db-portal`, pero no existe ninguna tupla en `pg-cell-01`.
   - Cuando el dueño intente ingresar a `/workspace`, la falta de registros provocará fallas en RLS y ausencia de configuración de negocio.
   - Además, `lifecycle_status` está erróneamente en `'activo'` con 0 productos (Obs. 1 y 2). Para obligar al inquilino a completar el onboarding guiado de 3 pasos (TNT-RF-01.6), `reconcileProvisionedTenantsInCells` debe materializar al dueño en `admin.users`, `admin.tenant_users` (`role = 'tenant_owner'`), las 4 etiquetas reservadas en `admin.tenant_labels`, y la configuración por defecto en `admin.client_business_info`, actualizar `identity_location = <cell_uuid>`, mover el hash Argon2id a la celda limpiándolo en `db-portal`, y fijar `lifecycle_status = 'alta'`.
   - La rutina debe ser completamente idempotente mediante `ON CONFLICT DO UPDATE` y verificaciones de existencia para ejecutarse de forma segura en cada inicio de servidor o migración.

2. **Reconocimiento de Rol en RBAC (`fetchRbacOverview`)**:
   - A partir de la Obs. 4, el servicio RBAC ignora la propiedad y membresía de inquilinos.
   - Consultando `clients.owner_user_id` y `users.active_client_id`, los dueños reciben dinámicamente `['tenant_owner']` y los agentes `['tenant_agent']`, eliminando la etiqueta errónea `"Sin Rol"`.
   - Incrementando `roleUserCountMap` para `tenant_owner` y `tenant_agent`, el catálogo de roles refleja la cantidad exacta de usuarios en la plataforma.
   - Consultando la tabla `admin.cells` y cruzando `cells.id` con `users.identity_location`, la vista `/admin/users` presenta el identificador legible `cell-01` en vez del UUID crudo.

3. **Aislamiento y Enrutamiento de Contraseñas (`resetPassword`)**:
   - A partir de la Obs. 3 y 5, para usuarios donde `identity_location !== 'router'`, la comprobación de existencia de contraseña nativa previa (`purpose = 'reset'`) debe realizarse contra `cellAuthRepo.findUserCredentialsInCell`.
   - Al generarse el nuevo hash Argon2id, debe persistirse en `pg-cell-XX` (`cellAuthRepo.updatePasswordHashInCell`), mientras que en `db-portal` se invoca `authRepo.consumePasswordResetToken` pasando `null` como hash.
   - Para cumplir estrictamente con `users_password_updated_check` (Obs. 3), `consumePasswordResetToken` debe asignar `passwordHash = null` y `passwordUpdatedAt = null` de forma simultánea.

---

## 3. Caveats

1. **Permisos de `mocter_app` en Docker**:
   Como observó `explorer_m1_1`, el rol `mocter_app` en el contenedor `pg-cell-01` heredó privilegios de superusuario durante el `initdb`. Para garantizar que RLS se evalúe con rigor en pruebas manuales directas, el rol debe conmutarse a `NOSUPERUSER NOBYPASSRLS`.
2. **Alcance de Modificaciones**:
   Como subagente explorador de sólo lectura, no se modificó ningún archivo de código fuente de la aplicación. Todos los cambios propuestos han sido documentados en `analysis.md` y en este reporte para su aplicación directa por el subagente Worker.
3. **Migración de Contraseñas Existentes en Reconciliación**:
   Si un inquilino existente ya poseía un `password_hash` en `db-portal` (como el dueño de `Synergia Market`), la reconciliación copia dicho hash a `pg-cell-01` antes de anularlo en `db-portal`, preservando la capacidad de inicio de sesión del usuario sin requerir reseteo forzoso.

---

## 4. Conclusion

El Worker de Implementación debe aplicar los siguientes cambios estructurados:

1. **En `packages/domain/src/services/admin-dashboard.service.ts`**:
   - Implementar `reconcileProvisionedTenantsInCells(options?: { clientId?: string; actor?: string })`:
     - Utiliza `withTenantCellTransaction` para materializar `admin.users`, `admin.tenant_users` (`tenant_owner`), 4 etiquetas en `admin.tenant_labels`, y `admin.client_business_info` en `pg-cell-XX`.
     - Promueve credenciales: copia el hash Argon2id a la celda, asigna `identity_location = cellId` y fija `password_hash = NULL`, `password_updated_at = NULL` en `db-portal`.
     - Cuenta productos en la celda: si `productsCount === 0`, conmuta `clients.lifecycle_status = 'alta'` para `Synergia Market`.
     - Totalmente idempotente.
   - Re-exportar la función en `packages/domain/src/index.ts`.

2. **En `packages/domain/src/services/rbac.service.ts`**:
   - Actualizar `fetchRbacOverview`:
     - Importar `clients` y `cells`.
     - Seleccionar `users.activeClientId`.
     - Consultar `ownerUserId` de clientes activos y mapa de `cells.id -> cells.code`.
     - Asignar `tenant_owner` a propietarios y `tenant_agent` a miembros activos, actualizando `roleUserCountMap`.
     - Formatear `identityLocation` traduciendo UUIDs de celdas a sus códigos amigables (ej. `cell-01`).

3. **En `packages/domain/src/repositories/` y `auth.service.ts`**:
   - Actualizar `consumePasswordResetToken` en `auth.repository.interface.ts` y `drizzle-auth.repository.ts` para aceptar `newPasswordHash: string | null` y sincronizar `passwordUpdatedAt = newPasswordHash ? now : null`.
   - Actualizar `AuthService.resetPassword`:
     - Si `user.identityLocation !== 'router'`, consultar credenciales en la celda vía `cellAuthRepo.findUserCredentialsInCell`.
     - Validar `purpose = 'setup'` y `purpose = 'reset'` contra la celda.
     - Persistir nuevo hash en `pg-cell-XX` con `cellAuthRepo.updatePasswordHashInCell` (o `expandCellUser` si faltaba).
     - Consumir el token en `db-portal` pasando `null` como hash para mantener el aislamiento físico de credenciales.

---

## 5. Verification Method

Para verificar independientemente esta implementación una vez aplicada por el Worker:

1. **Ejecutar reconciliación en caliente**:
   ```bash
   node -e "const { reconcileProvisionedTenantsInCells } = require('D:/3. Develoment/mocter-system/mocter-core/packages/domain/dist/index.js'); reconcileProvisionedTenantsInCells().then(console.log);"
   ```

2. **Verificar estado de Synergia Market en `db-portal`**:
   ```bash
   docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT c.slug, c.lifecycle_status, u.email, u.identity_location, u.password_hash IS NULL as hash_cleared FROM admin.clients c JOIN admin.users u ON c.owner_user_id = u.id WHERE c.slug = 'synergia-market';"
   ```
   - Criterio de éxito: `lifecycle_status = 'alta'`, `identity_location = '6ae5619b-7ca3-4764-baae-1b8950a8e534'`, `hash_cleared = t`.

3. **Verificar materialización en `pg-cell-01`**:
   ```bash
   docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT email, password_hash IS NOT NULL as has_hash FROM admin.users; SELECT role, status FROM admin.tenant_users; SELECT count(*) FROM admin.tenant_labels; SELECT count(*) FROM admin.client_business_info;"
   ```
   - Criterio de éxito:
     - `admin.users`: `email = synergiamarket25@gmail.com`, `has_hash = t`
     - `admin.tenant_users`: `role = tenant_owner`, `status = active`
     - `admin.tenant_labels`: `count = 4`
     - `admin.client_business_info`: `count = 1`

4. **Verificar RBAC Overview**:
   ```bash
   node -e "const { fetchRbacOverview } = require('D:/3. Develoment/mocter-system/mocter-core/packages/domain/dist/index.js'); fetchRbacOverview().then(r => console.log(r.users.find(u => u.email === 'synergiamarket25@gmail.com')));"
   ```
   - Criterio de éxito: `roles: ['tenant_owner']` (sin "Sin Rol") y `identityLocation: 'cell-01'`.

5. **Verificar Restablecimiento de Contraseña para Usuario Celular**:
   - Ejecutar la suite de pruebas unitarias de `auth.service.test.ts`:
     ```bash
     pnpm --filter @mocter/domain test -- -t "resetPassword"
     ```
   - Criterio de éxito: 100% de pruebas pasando.
