# Handoff Report: Milestone 1 (M1) Technical Implementation Strategy

**Author**: Explorer Subagent (`explorer_m1_1`)  
**Recipient**: Orchestrator (`d9dd6187-8097-406e-a649-0b6a842d2eff`)  
**Milestone**: Milestone 1 (Physical Cell Data Plane Isolation & Connection Pool — Features 1 & 2)  
**Date**: 2026-11-09  

---

## 1. Observation

1. **Estado de `packages/domain/src/db/`**:
   - `packages/domain/src/db/cell-client.ts` no existe en el repositorio.
   - `packages/domain/src/db/client.ts` implementa la conexión única hacia el Control Plane (`db-portal`) exportando `getDb()` y `db`.
   - `packages/domain/src/db/schemas/index.ts` centraliza los esquemas `admin`, `public` y `tenant`.

2. **Infraestructura de Celdas Activa**:
   - `mocter-cell-01-pgbouncer-cell-1` (puerto host `127.0.0.1:6432`, `pool_mode = transaction`).
   - `mocter-cell-01-pg-cell-1` (PostgreSQL 18, puerto host `127.0.0.1:5433`).
   - `admin.cells` en `db-portal`:
     - `id`: `6ae5619b-7ca3-4764-baae-1b8950a8e534`
     - `code`: `cell-01`
     - `status`: `active`
     - `topology_type`: `local_compose`
     - `pgbouncer_host`: `pgbouncer-cell-01`
     - `pgbouncer_port`: `6432`
     - `database_name`: `pg-cell-01`
     - `cell_secrets_key_id`: `k1`

3. **Mecánica de Resolución de Red (`local_compose`)**:
   - Dentro del contenedor `mocter-core-admin-portal-1`:
     - `nc -zv host.docker.internal 6432` reportó: `host.docker.internal (192.168.65.254:6432) open`.
     - Script Node.js con `postgres-js` conectando a `postgres://mocter_app:...@host.docker.internal:6432/pg-cell-01` con `prepare: false` retornó:
       `CONTAINER SUCCESS: Result(1) [ { alive: 1, current_database: 'pg-cell-01', current_user: 'mocter_app' } ]`.
   - En el host anfitrión (Windows):
     - `Test-NetConnection -ComputerName 127.0.0.1 -Port 6432` reportó: `TcpTestSucceeded: True`.
     - `postgres-js` conectando a `127.0.0.1:6432` retornó: `Host 127.0.0.1 OK: Result(1) [ { alive: 1 } ]`.
     - `host.docker.internal` en Windows resolvió a la IP de la tarjeta Wi-Fi (`192.168.22.20`), retornando `ECONNREFUSED` porque PgBouncer solo escucha en `127.0.0.1:6432` del host.

4. **Políticas y Comportamiento RLS en `pg-cell-01`**:
   - Las 21 tablas en `pg-cell-01` (`admin.users`, `admin.identities`, `admin.products`, `admin.contacts`, `admin.orders`, etc.) tienen `relrowsecurity = true` y `relforcerowsecurity = true`.
   - Las políticas imponen:
     `USING (client_id = (NULLIF(current_setting('app.current_client_id', true), ''))::uuid)`
     `WITH CHECK (client_id = (NULLIF(current_setting('app.current_client_id', true), ''))::uuid)`.
   - En prueba controlada con rol no superusuario (`test_app_role NOSUPERUSER NOBYPASSRLS`):
     - `INSERT` sin `app.current_client_id`: falló con `ERROR: new row violates row-level security policy for table "users"`.
     - `SELECT set_config('app.current_client_id', '01a1bc84-cc30-73b6-bc84-1f0cda5a9661', true);` seguido de `INSERT`: exitoso (`INSERT 0 1`).
     - Consulta con el mismo `client_id`: retornó `1` fila.
     - Consulta con otro `client_id` (`00000000-0000-0000-0000-000000000000`): retornó `0` filas.
   - **Hallazgo Crítico de Inicialización en Docker**:
     El contenedor `mocter-cell-01-pg-cell-1` se inicializó con `POSTGRES_USER: mocter_app`. En PostgreSQL, el usuario inicial de `initdb` recibe automáticamente `rolsuper = true` y `rolbypassrls = true`. Los superusuarios en PostgreSQL omiten todas las políticas RLS independientemente de `FORCE ROW LEVEL SECURITY`. Por tanto, para cumplir `DAT-001 design.md:501` (`mocter_app sin BYPASSRLS`), el rol debe tener `ALTER ROLE mocter_app NOSUPERUSER NOBYPASSRLS;`.

5. **Contrato de Enrutamiento en `db-portal`**:
   - `admin.client_routing` contiene:
     - `client_id`: `01a1bc84-cc30-73b6-bc84-1f0cda5a9661` (`Synergia Market`)
     - `cell_id`: `6ae5619b-7ca3-4764-baae-1b8950a8e534` (`cell-01`)
     - `routing_status`: `active`

---

## 2. Logic Chain

1. **Aislamiento Físico y PgBouncer (`prepare: false`)**:
   - A partir de la Obs. 2, las conexiones a datos de clientes deben pasar por PgBouncer (`pgbouncer-cell-01` en el puerto 6432) en modo transacción.
   - Debido al modo de transacción de PgBouncer, el uso de sentencias preparadas genera errores `42P05` por colisión de conexiones físicas backend. Por tanto, `CellDatabasePoolManager` debe configurar obligatoriamente `prepare: false` en `postgres-js`.
2. **Topología Dinámica y Resolución de Host**:
   - A partir de la Obs. 3, las conexiones originadas dentro de contenedores Docker (`apps/admin`) deben resolver a `host.docker.internal:6432`, mientras que las ejecuciones en el host anfitrión (pruebas automatizadas, linters y scripts locales) deben resolver a `127.0.0.1:6432`.
   - Por tanto, la función `resolvePgBouncerTarget` implementa la detección de entorno (`/.dockerenv`) con soporte para variable de entorno de sobreescritura (`CELL_PGBOUNCER_HOST_OVERRIDE`).
3. **Inyección de Contexto RLS (`withTenantCellTransaction`)**:
   - A partir de la Obs. 4, cualquier consulta sobre tablas celulares bajo RLS sin la variable de sesión configurada retorna 0 filas o falla con violación de política.
   - La inyección de `SELECT set_config('app.current_client_id', clientId, true)` con `is_local = true` (equivalente a `SET LOCAL`) garantiza que el contexto de inquilino se mantenga estrictamente dentro de la transacción actual y se limpie inmediatamente en el `COMMIT` o `ROLLBACK`, evitando fuga de contexto en el pool compartido de PgBouncer.
4. **Validación de UUID y Fail-Closed**:
   - La función `NULLIF(..., '')::uuid` en PostgreSQL genera un error de sintaxis si se suministra un identificador no UUID. Por tanto, `withTenantCellTransaction` valida el formato UUID de `clientId` en TypeScript antes de abrir la transacción, lanzando un error descriptivo si el identificador es inválido.
5. **Reutilización y Drenado de Conexiones**:
   - A partir de la Obs. 1 y 2, inicializar un nuevo cliente `postgres-js` por cada consulta provocaría agotamiento de descriptores de sockets.
   - Por tanto, `CellDatabasePoolManager` almacena las instancias en un `Map<string, CellPoolEntry>` indexado tanto por UUID de celda como por código (`cell-01`), con guardas de concurrencia (`pendingConnections`) y métodos para drenado ordenado (`closeCellPool`, `shutdown`).

---

## 3. Caveats

1. **Permisos de `mocter_app` en el contenedor local**:
   En el contenedor Docker actual de pruebas, `mocter_app` posee el atributo `SUPERUSER` heredado de la imagen base de PostgreSQL. Para verificar RLS de forma estricta contra la base de datos real, el rol debe conmutarse a `NOSUPERUSER NOBYPASSRLS`, tal como lo exige la especificación `DAT-001`.
2. **Alcance de Modificaciones**:
   Como agente explorador de sólo lectura, no se editó código fuente de la aplicación (`packages/domain/src/db/cell-client.ts` no fue creado aún). El diseño y código completo han sido documentados en `analysis.md` para su implementación por el Worker.
3. **Caché de Enrutamiento**:
   El mapeo `clientId -> cellId` se almacena con un TTL de 60 segundos en memoria. Las migraciones de inquilinos entre celdas (escenario infrecuente) invalidarán esta caché mediante el reinicio del pool o expiración del TTL.

---

## 4. Conclusion

El diseño técnico para las Características 1 y 2 de Milestone 1 está completamente definido, verificado y listo para su codificación por el Worker:
1. Implementar `packages/domain/src/db/cell-client.ts` con:
   - `resolvePgBouncerTarget` manejando la paridad de entornos Docker/Host.
   - `CellDatabasePoolManager` con cacheo por `cellId`, descifrado AES-256-GCM y `prepare: false`.
   - `withTenantCellTransaction<T>(clientId, callback, options)` ejecutando `SELECT set_config('app.current_client_id', clientId, true)` bajo RLS.
   - Métodos de drenado `closeCellPool(cellId)` y `shutdown()`.
   - Exportaciones canónicas `cellDatabasePoolManager`, `getCellDb`, `withTenantCellTransaction` y `getCellDatabaseProvider`.
2. Re-exportar las utilidades en `packages/domain/src/db/index.ts` e indexar en `packages/domain/src/index.ts`.
3. Desarrollar la suite de pruebas unitarias en `packages/domain/src/db/cell-client.test.ts`.

---

## 5. Verification Method

Para verificar independientemente estos hallazgos y validar la implementación del Worker:

1. **Verificar conectividad a PgBouncer desde el contenedor**:
   ```bash
   docker exec mocter-core-admin-portal-1 nc -zv host.docker.internal 6432
   ```
2. **Verificar conectividad a PgBouncer desde el host**:
   ```powershell
   Test-NetConnection -ComputerName 127.0.0.1 -Port 6432
   ```
3. **Verificar aislamiento RLS en PostgreSQL**:
   ```bash
   docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "
   BEGIN;
   SELECT set_config('app.current_client_id', '01a1bc84-cc30-73b6-bc84-1f0cda5a9661', true);
   SELECT count(*) FROM admin.users;
   ROLLBACK;
   "
   ```
4. **Verificar suite de pruebas unitarias una vez implementado `cell-client.ts`**:
   ```bash
   pnpm.cmd --filter @mocter/domain test -- packages/domain/src/db/cell-client.test.ts
   ```
