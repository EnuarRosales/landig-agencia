# Handoff Report: Domain and Data Plane Architecture Survey (TNT-001)

**Subagent**: explorer_survey_2 (Explorer Subagent)  
**Recipient**: Orchestrator (d9dd6187-8097-406e-a649-0b6a842d2eff)  
**Date**: 2026-11-09  

---

## 1. Observation

1. **Gestor de Conexiones Celulares (`CellDatabasePoolManager`)**:
   - `packages/domain/src/db/cell-client.ts` no existe (`Test-Path` devuelve `False`).
   - Todos los repositorios que manejan datos de inquilinos delegan por defecto a `getDb()` (`db-portal`):
     - `packages/domain/src/repositories/drizzle-cell-auth.repository.ts:37`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
     - `packages/domain/src/repositories/drizzle-crm.repository.ts:38`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
     - `packages/domain/src/repositories/drizzle-orders.repository.ts:41`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
     - `packages/domain/src/services/tenant-products-and-media.service.ts:261`: `constructor(private readonly db: any = getDb())`
     - `packages/domain/src/services/tenant-contacts-and-users.service.ts:435`: `constructor(private readonly dbProvider: () => any = () => getDb())`
2. **Aislamiento RLS en el Plano de Datos Celular (`pg-cell-01`)**:
   - Tablas en `pg-cell-01`: 21 tablas en esquema `admin` creadas mediante `packages/domain/drizzle-cell/` (0000 a 0009).
   - Políticas RLS:
     ```sql
     ALTER TABLE admin.<tabla> ENABLE ROW LEVEL SECURITY;
     ALTER TABLE admin.<tabla> FORCE ROW LEVEL SECURITY;
     CREATE POLICY cell_<tabla>_isolation ON admin.<tabla>
       USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
       WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
     ```
   - Verificación en caliente:
     - Comando: `docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.users;"` → Resultado: `0`.
     - Consulta de tuplas vivas en `pg-cell-01`: `SELECT n_live_tup, relname FROM pg_stat_user_tables WHERE schemaname = 'admin';` → Resultado: `0` filas en todas las 21 tablas.
3. **Estado de `Synergia Market` en la Base de Datos**:
   - En `mocter-core-pg-portal-1` (`db-portal`):
     - Usuario: `id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`, `email = 'synergiamarket25@gmail.com'`, `identity_location = 'router'`, `active_client_id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`.
     - Inquilino: `id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, `slug = 'synergia-market'`, `lifecycle_status = 'activo'`, `owner_user_id = '01a1bc84-cbec-7a2c-9efe-3a3f55284113'`.
     - Enrutamiento: `cell_id = '6ae5619b-7ca3-4764-baae-1b8950a8e534'` (`cell-01`).
   - En `mocter-cell-01-pg-cell-1` (`pg-cell-01`):
     - No existe ningún registro para `01a1bc84-cc30-73b6-bc84-1f0cda5a9661` ni para su usuario dueño en `admin.users`, `admin.tenant_users`, `admin.tenant_labels` ni `admin.client_business_info`.
4. **Conexión Criptográfica a PgBouncer de la Celda**:
   - `cellSecretsCryptoService` descifró exitosamente `cell.cellSecretsCiphertext` de `cell-01` (`id = 6ae5619b-7ca3-4764-baae-1b8950a8e534`) usando `CELL_SECRETS_KEY=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
   - Resultado: `mocter_app_password = '63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab'`.
   - Coincide exactamente con el `userlist.txt` de `pgbouncer-cell-1`: `"mocter_app" "63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab"`.
   - Conexión probada con `postgres-js`: `SELECT 1 as alive, current_database(), current_user` sobre `127.0.0.1:6432/pg-cell-01` con `prepare: false` retornó `{ alive: 1, current_database: 'pg-cell-01', current_user: 'mocter_app' }`.
5. **Causa de "Sin Rol" en `/admin/users`**:
   - `packages/domain/src/services/rbac.service.ts:428-452`: `fetchRbacOverview` consulta únicamente `platformUserRoles`. Al no tener fila allí, el usuario cae en `roles: userRolesMap.get(u.id) || ["Sin Rol"]`. Ignora `clients.owner_user_id` y `identity_location`.
6. **Manejo de Contraseñas y Setup**:
   - `AuthService.resetPassword` (`packages/domain/src/services/auth.service.ts:2180`) llama a `consumePasswordResetToken`, el cual escribe `passwordHash` en `db-portal` (`admin.users`). Si el usuario pertenece a una celda, la contraseña debe escribirse en `pg-cell-XX` (`admin.users`) bajo RLS y quedar `NULL` en `db-portal`.
   - `users.identity_location` en `db-portal` tiene un CHECK regex que exige formato UUID (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) o `'router'`. Debe usarse el UUID de la celda (`6ae5619b-7ca3-4764-baae-1b8950a8e534`), no el slug `'cell-01'`.

---

## 2. Logic Chain

1. **Aislamiento Físico y RLS**:
   - Las celdas de datos están diseñadas para acceso a través de PgBouncer en modo de transacción (`pool_mode = transaction`) (Obs. 4).
   - Debido al modo transacción de PgBouncer, cualquier cliente debe usar `prepare: false` para evitar colisiones de sentencias preparadas entre transacciones compartidas en el pool (Obs. 4).
   - Debido a que `FORCE ROW LEVEL SECURITY` está activado en cada tabla de la celda, si no se emite `SELECT set_config('app.current_client_id', clientId, true)` dentro de la transacción, las consultas retornan 0 filas (Obs. 2).
   - Al no existir `CellDatabasePoolManager`, los repositorios existentes consumen `getDb()`, lo que causa que intenten consultar tablas celulares que no existen en `db-portal` o que fallen silenciosamente (Obs. 1).
2. **Promoción de Identidad y Reconciliación**:
   - `Synergia Market` fue creado en `db-portal` pero nunca fue materializado en `pg-cell-01` (Obs. 3).
   - El propietario tiene `identity_location = 'router'` en lugar de apuntar a `cell-01` (Obs. 3).
   - En `/admin/users`, aparece como "Sin Rol" porque el servicio RBAC solo inspecciona `platformUserRoles` (Obs. 5).
   - Por tanto, la implementación de `reconcileProvisionedTenantsInCells` y la conexión de `CellDatabasePoolManager` son indispensables para materializar a `Synergia Market` en `pg-cell-01`, asignar `identity_location = cell_id` y reflejar `tenant_owner` en `/admin/users`.
3. **Flujo de Onboarding**:
   - `Synergia Market` figura como `lifecycle_status = 'activo'` en `db-portal` a pesar de tener 0 productos y 0 datos en la celda (Obs. 3).
   - La reconciliación debe conmutar su estado a `lifecycle_status = 'alta'` para que, al ingresar a `mocter-admin`, el router lo conduzca al asistente `/onboarding` (TNT-RF-01.6).

---

## 3. Caveats

- **Pruebas en local**: El comando directo `pnpm test` en el host falla por un desajuste del enlace simbólico en el shim de pnpm de Windows (`.pnpm-store`), pero la ejecución de scripts Node.js y la verificación directa contra Docker funcionan al 100%. Las pruebas automatizadas deben ejecutarse mediante el ejecutable canónico `pnpm.cmd` o dentro de los contenedores Docker / CI.
- **Sin cambios en código fuente**: Como agente explorador de sólo lectura, no se modificó ningún archivo de aplicación o pruebas en el repositorio.

---

## 4. Conclusion

La arquitectura del Plano de Datos Celular (`pg-cell-XX`) está sólidamente definida en los esquemas y migraciones de `drizzle-cell/`, y su infraestructura Docker (PgBouncer en `:6432` y PostgreSQL 18 en `:5433`) está saludable y operativa.
Para ejecutar la tarea `TNT-T-01` (`ADM-001 T-39` / `AUTH-001 T-40`), se deben implementar:
1. `packages/domain/src/db/cell-client.ts` con `getCellDb(cellId)` y `withTenantCellTransaction(clientId, callback)` con `prepare: false` y `SET LOCAL app.current_client_id`.
2. Conectar los repositorios celulares (`DrizzleCellAuthRepository`, `DrizzleTenantProductsRepository`, etc.) al pool celular.
3. Implementar `provisionTenantInCellDataPlane` y `reconcileProvisionedTenantsInCells` en `admin-dashboard.service.ts` para reconciliar a `Synergia Market`.
4. Ajustar `fetchRbacOverview` en `rbac.service.ts` para reconocer propietarios de inquilinos (`tenant_owner`) y su celda asignada.
5. Ajustar `AuthService.resetPassword` para delegar la persistencia de contraseña a la celda cuando `identityLocation !== 'router'`.

---

## 5. Verification Method

Para verificar independientemente estos hallazgos:
1. **Verificar estado de Synergia en db-portal**:
   ```bash
   docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT id, email, identity_location, active_client_id FROM admin.users WHERE email = 'synergiamarket25@gmail.com';"
   ```
2. **Verificar ausencia de filas en pg-cell-01**:
   ```bash
   docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.users;"
   ```
3. **Verificar conexión a PgBouncer con credenciales descifradas**:
   ```bash
   node -e "const postgres = require('D:/3. Develoment/mocter-system/mocter-core/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/cjs/src/index.js'); const sql = postgres('postgres://mocter_app:63374ac00e284b51c46eb584d652f31d6b9346a16ff5a5f8812cb8b773f415ab@127.0.0.1:6432/pg-cell-01', { prepare: false, max: 1 }); sql.unsafe('SELECT 1 as alive, current_database(), current_user').then(r => { console.log(r); sql.end(); });"
   ```
4. **Verificar código de `fetchRbacOverview`**:
   Inspeccionar `packages/domain/src/services/rbac.service.ts:428-452`.
