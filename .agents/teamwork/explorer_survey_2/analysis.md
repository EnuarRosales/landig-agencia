# Análisis Técnico: Arquitectura de Dominio y Plano de Datos (TNT-001)

**Fecha**: 2026-11-08 / 2026-11-09  
**Investigador**: Explorer Subagent (explorer_survey_2)  
**Alcance**: `packages/domain/`, esquemas `db-portal` vs `pg-cell-XX`, `CellDatabasePoolManager`, RLS, migraciones Drizzle, manejo de credenciales y reconciliación de inquilinos.

---

## 1. Resumen Ejecutivo de Hallazgos

1. **Gestor de Conexiones Celulares Inexistente (`CellDatabasePoolManager`)**:
   Actualmente no existe implementación en `packages/domain/src/db/cell-client.ts`. Todas las implementaciones de repositorios celulares (`DrizzleCellAuthRepository`, `DrizzleCrmRepository`, `DrizzleOrdersRepository`, `DrizzleTenantProductsRepository`, `DrizzleTenantContactsAndUsersRepository`) tienen por defecto `dbProvider = () => getDb()`, el cual se conecta erróneamente a `db-portal` (Control Plane) en vez de al PgBouncer de la celda de datos asignada (`pg-cell-XX`).
2. **Aislamiento Físico y RLS en Celdas (`pg-cell-XX`)**:
   Las 21 tablas del esquema `admin` en `pg-cell-01` están completamente migradas (migraciones 0 a 9 en `packages/domain/drizzle-cell/`) con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`.
   La política `USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)` funciona estrictamente bajo principio *Fail-Closed*: consultas sin contexto devuelven `0 rows`.
   Se verificó en vivo que la conexión directa por PgBouncer (`127.0.0.1:6432` en host / `host.docker.internal:6432` en contenedor) con el usuario `mocter_app` y la contraseña descifrada con AES-256-GCM (`cellSecretsCryptoService`) es 100% exitosa (`alive = 1`, `db = pg-cell-01`, `user = mocter_app`).
3. **Estado Real de Inquilinos y Caso `Synergia Market`**:
   En `db-portal`:
   - Inquilino: `id = 01a1bc84-cc30-73b6-bc84-1f0cda5a9661`, `slug = synergia-market`, `lifecycle_status = activo`, `owner_user_id = 01a1bc84-cbec-7a2c-9efe-3a3f55284113`.
   - Dueño: `email = synergiamarket25@gmail.com`, `identity_location = router`, `active_client_id = 01a1bc84-cc30-73b6-bc84-1f0cda5a9661`.
   - Enrutamiento: `cell_id = 6ae5619b-7ca3-4764-baae-1b8950a8e534` (`cell-01`).
   En `pg-cell-01`:
   - **Existen 0 filas en todas las tablas** (`admin.users`, `admin.tenant_users`, `admin.products`, `admin.tenant_labels`, `admin.client_business_info`). `Synergia Market` no ha sido materializado en el Plano de Datos.
4. **Manejo de Credenciales y Promoción de Identidad**:
   - `users.identity_location` en `db-portal` tiene un CHECK regex estricto que solo admite `'router'` o un UUID v4/v7 (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Por ende, debe recibir el `cell.id` (UUID), no el código slug (`cell-01`).
   - `AuthService.promoteStagingIdentityToCell` ya existe en `src/services/auth.service.ts:4195`, pero actualmente `createAdminTenant` no lo invoca, ni aprovisiona registros en la celda.
   - `AuthService.resetPassword` (`src/services/auth.service.ts:2180`) invoca `consumePasswordResetToken`, el cual escribe `passwordHash` incondicionalmente en `db-portal` y no en la celda bajo RLS cuando el usuario ya pertenece a una celda.
5. **Causa Raíz de "Sin Rol" en `/admin/users` (`fetchRbacOverview`)**:
   En `packages/domain/src/services/rbac.service.ts:428-452`, `fetchRbacOverview` consulta exclusivamente la tabla `admin.platform_user_roles`. Al no existir roles de plataforma para dueños de inquilinos, asigna `roles: ["Sin Rol"]`. Debe cruzar con `clients.owner_user_id` o `active_client_id` para emitir `["tenant_owner"]` y reportar la celda correspondiente (`identity_location`).

---

## 2. Inventario Detallado de Esquemas Drizzle

### 2.1 Control Plane (`db-portal`) — `./drizzle.config.ts` → `./drizzle/`
- **Configuración**: `drizzle.config.ts` incluye `./src/db/schemas/admin/index.ts` y `./src/db/schemas/public/index.ts`.
- **Salida**: `./drizzle/` (28 migraciones al momento, última `0028_cell_hosts_and_placement.sql`).
- **Tablas Clave**:
  - `admin.users`: almacena usuarios canónicos globales.
    - `identity_location`: default `'router'`. CHECK constraint `identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`.
    - `active_client_id`: FK hacia `admin.clients(id)`.
    - `password_hash`: nulo para cuentas en celdas o federadas.
  - `admin.clients`: tabla global de inquilinos (`slug`, `lifecycle_status` (`'alta' | 'activo' | 'baja' | 'bloqueado'`), `owner_user_id`, `plan_id`).
  - `admin.cells`: catálogo de celdas (`code`, `topology_type`, `pgbouncer_host`, `pgbouncer_port`, `database_name`, `cell_secrets_ciphertext`, `cell_secrets_key_id`, `max_clients`, `current_clients`).
  - `admin.client_routing`: enrutamiento de inquilinos a celdas (`client_id`, `cell_id`, `routing_status`, `routing_version`).
  - `admin.platform_user_roles`: asignación de roles de plataforma (`platform_owner`, `platform_admin`, `platform_sales`).

### 2.2 Cell Data Plane (`pg-cell-XX`) — `./drizzle.cell.config.ts` → `./drizzle-cell/`
- **Configuración**: `drizzle.cell.config.ts` apunta exclusivamente a `./src/db/schemas/tenant/index.ts`.
- **Salida**: `./drizzle-cell/` (10 migraciones independientes en `_journal.json`, idx 0 a 9).
- **Esquema**: Todas las tablas viven en el esquema PostgreSQL `"admin"` en la base de la celda (definido vía `cellAdminSchema = pgSchema("admin")` en `namespace.ts`).
- **Convención de Llave Primaria y Aislamiento**:
  - Toda tabla tiene `client_id uuid NOT NULL` como líder de su llave primaria:
    - Compuesta `(client_id, id)` en tablas de entidad (`admin.users`, `admin.tenant_users`, `admin.tenant_labels`, `admin.products`, `admin.product_media`, `admin.contacts`, `admin.orders`, etc.).
    - Unitaria `client_id` como PK en `admin.client_business_info`.
  - Sin llaves foráneas cruzadas hacia `db-portal`.
  - Todas las tablas tienen:
    ```sql
    ALTER TABLE admin.<table> ENABLE ROW LEVEL SECURITY;
    ALTER TABLE admin.<table> FORCE ROW LEVEL SECURITY;
    CREATE POLICY cell_<table>_isolation ON admin.<table>
      USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
      WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
    ```

---

## 3. Arquitectura del Gestor de Conexiones Celulares (`CellDatabasePoolManager`)

### 3.1 Especificación de Diseño (`packages/domain/src/db/cell-client.ts`)
Para implementar `CellDatabasePoolManager` conforme a TNT-001 §2.1 y D-37:
1. **Mapa de Conexiones en Memoria**:
   - `Map<string, { db: PostgresJsDatabase<typeof cellSchema>, sql: postgres.Sql }>` indexado por `cellId`.
2. **Método `getCellDb(cellId: string)`**:
   - Consulta `admin.cells` en `db-portal` por `cellId`.
   - Descifra `cell.cellSecretsCiphertext` con `cellSecretsCryptoService.decryptBundle(cell.cellSecretsCiphertext, cell.id, cell.cellSecretsKeyId, cell.code)`.
   - Obtiene `bundle.mocter_app_password`.
   - Resuelve el endpoint accesible usando `resolveLocalProbeTarget`:
     ```ts
     const { probeHost } = resolveLocalProbeTarget({
       topologyType: cell.topologyType,
       host: cell.pgbouncerHost,
       appUrl: cell.appUrl || "",
     });
     ```
   - Configura el cliente postgres con:
     ```ts
     const sqlClient = postgres(`postgres://mocter_app:${encodeURIComponent(bundle.mocter_app_password)}@${probeHost}:${cell.pgbouncerPort}/${cell.databaseName}`, {
       prepare: false, // OBLIGATORIO por PgBouncer transaction pooling
       max: 10,
       idle_timeout: 20,
       connect_timeout: 10,
       onnotice: () => {},
     });
     ```
   - Retorna la instancia tipada de Drizzle instanciada sobre `cellTenantSchemas`.
3. **Método `withTenantCellTransaction<T>(clientId: string, callback: (tx, cell) => Promise<T>): Promise<T>`**:
   - Resuelve `cell_id` desde `admin.client_routing` en `db-portal`.
   - Obtiene `cellDb = await getCellDb(cell_id)`.
   - Abre la transacción Drizzle:
     ```ts
     return await cellDb.transaction(async (tx) => {
       await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
       return await callback(tx, cell);
     });
     ```
   - El parámetro `true` (is_local) garantiza que la variable solo viva durante esa transacción en el socket de PgBouncer.

---

## 4. Estado de Reconciliación de Inquilinos (`Synergia Market`)

### 4.1 Evidencia Observada en PostgreSQL
Ejecutado sobre contenedores en caliente:
- **`mocter-core-pg-portal-1` (`db-portal`)**:
  ```sql
  SELECT id, email, identity_location, active_client_id FROM admin.users WHERE email = 'synergiamarket25@gmail.com';
  -- id: 01a1bc84-cbec-7a2c-9efe-3a3f55284113 | identity_location: router | active_client_id: 01a1bc84-cc30-73b6-bc84-1f0cda5a9661

  SELECT id, slug, lifecycle_status, owner_user_id FROM admin.clients WHERE id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661';
  -- slug: synergia-market | lifecycle_status: activo | owner_user_id: 01a1bc84-cbec-7a2c-9efe-3a3f55284113

  SELECT cell_id FROM admin.client_routing WHERE client_id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661';
  -- cell_id: 6ae5619b-7ca3-4764-baae-1b8950a8e534 (cell-01)
  ```
- **`mocter-cell-01-pg-cell-1` (`pg-cell-01`)**:
  ```sql
  SELECT count(*) FROM admin.users; -- 0 rows
  SELECT n_live_tup, relname FROM pg_stat_user_tables WHERE schemaname = 'admin'; -- 0 filas en todas las 21 tablas
  ```

### 4.2 Pasos Exactos para la Rutina de Reconciliación
La función `reconcileProvisionedTenantsInCells` en `admin-dashboard.service.ts` debe:
1. Recorrer inquilinos activos o en alta en `admin.clients` que tengan enrutamiento en `admin.client_routing`.
2. Para cada inquilino (`clientId`, `ownerUserId`, `cellId`):
   - Ejecutar dentro de `withTenantCellTransaction(clientId, async (tx) => ...)`:
     - Upsert en `admin.users`: `(client_id, id, email, display_name, status = 'active', email_verified_at, created_by, updated_by)`.
     - Upsert en `admin.tenant_users`: `(client_id, user_id, role = 'tenant_owner', status = 'active', created_by, updated_by)`.
     - Insert de las 4 etiquetas base en `admin.tenant_labels`: `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada` con `origin = 'mocter_default'` (`ON CONFLICT (client_id, title) DO NOTHING`).
     - Insert en `admin.client_business_info` con defaults (`payment_methods`, `shipping_policy`, etc.) (`ON CONFLICT (client_id) DO NOTHING`).
   - Si el usuario tenía contraseña en `db-portal`, copiar `password_hash` a `admin.users` de la celda y limpiar en el Router Global (`clearRouterUserCredentials`).
   - Actualizar en `db-portal`: `users.identity_location = cellId`.
   - Si el comercio no tiene productos creados en `pg-cell-XX`, fijar `clients.lifecycle_status = 'alta'` para exigir que el dueño complete el Onboarding de 3 pasos.

---

## 5. Detección y Ejecución de Migraciones Celulares (R5 / CA-TNT-05)

### 5.1 Mecanismo de Inspección
- El diario local vive en `packages/domain/drizzle-cell/meta/_journal.json`.
- En cada celda de datos, la tabla `drizzle.__drizzle_migrations` almacena los registros de migraciones ejecutadas (`id`, `hash`, `created_at`).
- La inspección compara la cantidad de entradas del diario local con `SELECT count(*) FROM drizzle.__drizzle_migrations` en la base de la celda:
  - Si `cellMigrationsCount < localJournalEntriesCount` → **Migraciones pendientes**.
  - Si coinciden → **Celda al día (up to date)**.
- Para la ejecución manual: invocar `migrate(drizzle(cellSqlClient), { migrationsFolder: path_to_drizzle_cell })` contra la cadena de conexión de la celda seleccionada.
