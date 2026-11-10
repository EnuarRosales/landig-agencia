# Handoff Report: Repository Delegation, Cell Provisioning & Identity Promotion (Milestone 1 — Features 3, 4, 5)

**Subagent**: `explorer_m1_2` (Teamwork Explorer)  
**Milestone**: M1 (Cell Isolation, Pooling & Identity Promotion)  
**Target Scope**: Features 3, 4, and 5 (`TNT-001`)  
**Recipient**: Orchestrator (`d9dd6187-8097-406e-a649-0b6a842d2eff`)  
**Date**: 2026-11-09  

---

## 1. Observation

1. **Cell Repositories Hardcoded to `getDb()`**:
   - `packages/domain/src/repositories/drizzle-cell-auth.repository.ts:37`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
   - `packages/domain/src/repositories/drizzle-crm.repository.ts:38`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
   - `packages/domain/src/repositories/drizzle-orders.repository.ts:41`: `constructor(private readonly dbProvider: CellDatabaseProvider = () => getDb(), ...)`
   - `packages/domain/src/services/tenant-products-and-media.service.ts:261`: `constructor(private readonly db: any = getDb())`
   - `packages/domain/src/services/tenant-contacts-and-users.service.ts:435`: `constructor(private readonly dbProvider: () => any = () => getDb())`
   - In all 5 repositories, calls default to `getDb()` targeting `db-portal`. None connects dynamically to the PgBouncer pool of `pg-cell-XX`.

2. **Mixed Control Plane vs. Cell Data Plane Responsibilities**:
   - In `DrizzleTenantProductsRepository` (`tenant-products-and-media.service.ts:263-512`):
     - `getPlanQuota` queries `clientPlanOverrides`, `clients`, and `planLimits` (strictly `db-portal`).
     - Products and media methods (`countActiveProducts`, `createProduct`, `updateProduct`, `deleteProduct`, `listProducts`, `getProductById`, `importProducts`, `attachMedia`, `detachMedia`, `getTenantStorageUsage`) query `cellProducts`, `cellProductMedia`, and `cellClientUsage` (strictly `pg-cell-XX` under `FORCE ROW LEVEL SECURITY`). Currently, these queries lack `SET LOCAL app.current_client_id` and query `db-portal`.
   - In `DrizzleTenantContactsAndUsersRepository` (`tenant-contacts-and-users.service.ts:437-892`):
     - `getPlanQuota`, `createInvitation`, `listInvitations`, `findInvitationByTokenHash`, `revokeInvitation`, `acceptInvitation`, `getUserActiveClientId`, `setUserActiveClientId` operate on `db-portal` (`clients`, `plans`, `planLimits`, `clientPlanOverrides`, `tenantInvitations`, and `users.activeClientId`).
     - `countActiveContacts`, `findExistingContact`, `createContact`, `updateContact`, `deleteContact`, `listContacts`, `getContactById`, `createTenantMembership`, `listTenantMembers`, `removeTenantMember` operate on `cellContacts` and `cellTenantUsers` in `pg-cell-XX` under RLS.

3. **Absence of Cell-side Tenant Provisioning & Premature Activation in `admin-dashboard.service.ts`**:
   - `packages/domain/src/services/admin-dashboard.service.ts:2673`: `lifecycleStatus: "activo"` is assigned directly upon tenant creation in `createAdminTenant()`.
   - `packages/domain/src/services/admin-dashboard.service.ts:2783`: Returned client payload also reports `lifecycleStatus: "activo"`.
   - `createAdminTenant()` creates records only in `db-portal` (`clients`, `clientRouting`, `clientPlans`, `users.activeClientId`, `cells.currentClients`), never calling `pg-cell-XX`.
   - Hot database verification in Docker:
     - Command: `docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.users;"` -> Result: `0`.
     - Live row check across all 21 tables in `pg-cell-01`: `SELECT n_live_tup, relname FROM pg_stat_user_tables WHERE schemaname = 'admin';` -> Result: `0` rows in all tables.

4. **Database Schema Constraints on Identity & Credentials**:
   - `packages/domain/src/db/schemas/admin/users.ts:61-66`:
     ```sql
     CHECK (identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     ```
     Verbatim check requires `identity_location` to be `'router'` OR a valid 36-char UUID. Using cell code `'cell-01'` fails constraint check 23514.
   - `packages/domain/src/db/schemas/tenant/users.ts:48`:
     ```sql
     CHECK ((password_hash IS NULL) = (password_updated_at IS NULL))
     ```
     `password_updated_at` must be NULL if and only if `password_hash` is NULL.
   - `packages/domain/src/db/schemas/tenant/users.ts:47`:
     ```sql
     CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%')
     ```

5. **Current Credentials Location in `db-portal`**:
   - Hot database query on `mocter-core-pg-portal-1`:
     ```
     SELECT id, email, identity_location, active_client_id, (password_hash IS NOT NULL) as has_password FROM admin.users;
     ```
     Output:
     - `soporte@mocter.co` | `identity_location: router` | `active_client_id: null` | `has_password: true`
     - `admin@mocter.co` | `identity_location: router` | `active_client_id: null` | `has_password: true`
     - `ventas@mocter.co` | `identity_location: router` | `active_client_id: null` | `has_password: true`
     - `synergiamarket25@gmail.com` | `identity_location: router` | `active_client_id: 01a1bc84-cc30-73b6-bc84-1f0cda5a9661` | `has_password: true`
   - Synergia Market's owner has `identity_location = 'router'` and `password_hash` in `db-portal` rather than `pg-cell-01`.

6. **Password Setup and Reset Flow**:
   - `packages/domain/src/services/auth.service.ts:2180-2185`: `resetPassword` calls `this.authRepo.consumePasswordResetToken()`, which writes `passwordHash` to `db-portal.admin.users` regardless of user scope or cell assignment.
   - In `packages/domain/src/services/auth.service.ts:4176`, `promoteStagingIdentityToCell` already exists and implements the 4-phase promotion protocol: Expand (`expandCellUser`), Copy (`copyCredentialsToCell`, `copyIdentitiesToCell`), Verify (`findUserCredentialsInCell`), Switch & Clear (`updateUserIdentityLocation`, `clearRouterUserCredentials`).

---

## 2. Logic Chain

1. **Repository Delegation to `CellDatabasePoolManager`**:
   - Because `pg-cell-XX` is accessed via PgBouncer in transaction mode (`pool_mode = transaction`) under `FORCE ROW LEVEL SECURITY`, statements must be executed with `prepare: false` and must begin with `SET LOCAL app.current_client_id = <clientId>` (Obs. 1, Obs. 2).
   - `DrizzleCellAuthRepository`, `DrizzleCrmRepository`, and `DrizzleOrdersRepository` receive `cellId` and `clientId` explicitly. By changing their default `dbProvider` from `() => getDb()` to `(cellId: string) => getCellDb(cellId)` (and awaiting `this.getDbForCell(cellId)` in async methods), they seamlessly acquire the cell's PgBouncer connection (Obs. 1).
   - In `DrizzleTenantProductsRepository` and `DrizzleTenantContactsAndUsersRepository`, methods receive `clientId: string` rather than `cellId`. By injecting `withTenantCellTransaction(clientId, callback)` as `cellTxRunner`, the transaction runner looks up `clientRouting` to acquire the cell connection and sets `SET LOCAL app.current_client_id` inside the transaction automatically (Obs. 2).
   - Keeping `portalDb = getDb()` for quota/invitation/active-client queries maintains clean architectural separation between control-plane metadata and cell data plane.

2. **Cell-side Tenant Provisioning (`provisionTenantInCellDataPlane`)**:
   - Manual tenant creation in `createAdminTenant()` currently leaves `pg-cell-XX` completely empty (Obs. 3).
   - To make the cell functional from day one, `createAdminTenant` must invoke `provisionTenantInCellDataPlane(clientId, cellId, ownerUserId, clientData)` inside `withTenantCellTransaction(clientId, ...)` (Obs. 3).
   - The provisioning routine must materialize:
     1. `admin.users`: Local projection of the owner with matching global UUID `id`, normalized lowercase email, and `password_hash = null` (with `password_updated_at = null` to satisfy `cell_users_password_updated_check`, Obs. 4).
     2. `admin.tenant_users`: Active membership linking `(client_id, user_id)` with `role = 'tenant_owner'` and `status = 'active'`.
     3. `admin.tenant_labels`: Seeding the 4 reserved classification labels (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`) with `origin = 'mocter_default'` and `onConflictDoNothing()`.
     4. `admin.client_business_info`: Baseline commercial settings (`payment_methods`, `shipping_policy`, `bot_preset = 'natural_rhythm'`).
   - Changing `lifecycle_status = 'alta'` upon creation ensures that when the tenant owner logs in for the first time, `resolveAuthenticatedPortalContext` properly routes them to `/onboarding` rather than directly to `/workspace`.

3. **Identity Promotion & Credential Isolation**:
   - Storing tenant password hashes in `db-portal` violates data plane isolation (Obs. 5, Obs. 6).
   - When a password is set or reset for a tenant user (`user.identityLocation !== 'router'` or user having `activeClientId`), `AuthService.resetPassword` must:
     1. Persist the Argon2id hash to `pg-cell-XX` (`admin.users`) via `cellAuthRepo.updatePasswordHashInCell`.
     2. Update `users.identity_location = cell.id` in `db-portal` (using the cell UUID to satisfy `users_identity_location_check`, Obs. 4).
     3. Maintain `password_hash = NULL` and `password_updated_at = NULL` in `db-portal.admin.users`.
   - `AuthService.promoteStagingIdentityToCell` already contains the correct 4-phase sequence; once `defaultCellAuthRepository` points to `getCellDb`, promotion between staging and physical cells functions as intended.

---

## 3. Caveats

- **Cell Database Client Availability**: Features 3, 4, and 5 depend on `packages/domain/src/db/cell-client.ts` (`getCellDb` and `withTenantCellTransaction`), which is being designed concurrently by `explorer_m1_1`. The blueprint provided here defines the exact interface contract matching `PROJECT.md` line 58-63.
- **Reconciliation of Existing Tenant (`Synergia Market`)**: The reconciliation routine `reconcileProvisionedTenantsInCells` is assigned to `explorer_m1_3` (Features 6, 7, 8). However, `provisionTenantInCellDataPlane` implemented in Feature 4 will be directly consumed by `explorer_m1_3`'s reconciliation routine.
- **No Application Code Was Modified**: As a Teamwork Explorer subagent, all investigations were strictly read-only.

---

## 4. Conclusion

Features 3, 4, and 5 can be implemented cleanly and modularly without breaking changes to existing callers:
1. **Feature 3**: Update `CellDatabaseProvider` in `DrizzleCellAuthRepository`, `DrizzleCrmRepository`, and `DrizzleOrdersRepository` to default to `(cellId: string) => getCellDb(cellId)`, awaiting `getDbForCell` in methods. Refactor `DrizzleTenantProductsRepository` and `DrizzleTenantContactsAndUsersRepository` to separate `portalDb` (for quotas/invitations) and `cellTxRunner = withTenantCellTransaction` (for products/contacts/memberships).
2. **Feature 4**: Implement `provisionTenantInCellDataPlane` in `packages/domain/src/services/admin-dashboard.service.ts` to materialize `admin.users`, `admin.tenant_users`, the 4 reserved `admin.tenant_labels`, and `admin.client_business_info` in `pg-cell-XX` under RLS. Correct `createAdminTenant()` to set `lifecycle_status = 'alta'` and update `users.identity_location = assignedCell.id`.
3. **Feature 5**: Update `AuthService.resetPassword` and `drizzle-auth.repository.ts` (`consumePasswordResetTokenForCellUser`) so tenant password hashes are written to `pg-cell-XX` (`admin.users`) and cleared (`NULL`) in `db-portal`, with `users.identity_location = <cell_uuid>`.

---

## 5. Verification Method

To verify these changes after implementation by the Worker:

1. **Cell Repository Pool Delegation**:
   - Query a product or contact using `DrizzleTenantProductsRepository` or `DrizzleCrmRepository` with a valid tenant `clientId`.
   - Verify that the SQL query executes against `pg-cell-01` (port 6432) with `prepare: false` and `SET LOCAL app.current_client_id = <clientId>`.

2. **Cell Provisioning Verification**:
   - Execute `createAdminTenant` with a new test tenant.
   - Assert returned object has `lifecycleStatus: "alta"`.
   - Verify in `mocter-core-pg-portal-1`:
     ```bash
     docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT id, slug, lifecycle_status FROM admin.clients WHERE id = '<new_client_id>';"
     ```
     -> `lifecycle_status = 'alta'`.
   - Verify in `mocter-cell-01-pg-cell-1`:
     ```bash
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.users WHERE client_id = '<new_client_id>';"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.tenant_users WHERE client_id = '<new_client_id>';"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.tenant_labels WHERE client_id = '<new_client_id>';"
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT count(*) FROM admin.client_business_info WHERE client_id = '<new_client_id>';"
     ```
     -> Returns 1 user, 1 tenant_user, 4 tenant_labels, 1 client_business_info.

3. **Identity Promotion & Credential Isolation Verification**:
   - Perform password setup/reset on a tenant user.
   - Check `db-portal.admin.users`:
     ```bash
     docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT id, email, identity_location, password_hash IS NULL AS pw_null FROM admin.users WHERE id = '<user_id>';"
     ```
     -> `identity_location` matches cell UUID, `pw_null = true`.
   - Check `pg-cell-01.admin.users`:
     ```bash
     docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT id, email, password_hash LIKE '\$argon2id\$%' AS pw_valid FROM admin.users WHERE id = '<user_id>';"
     ```
     -> `pw_valid = true`.
