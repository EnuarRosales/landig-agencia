# Analysis Report: Repository Delegation, Cell Provisioning & Identity Promotion (Milestone 1 — Features 3, 4, 5)

**Subagent**: `explorer_m1_2`  
**Milestone**: M1 (Cell Isolation, Pooling & Identity Promotion)  
**Target Scope**: Features 3, 4, 5  
**Date**: 2026-11-09  

---

## 1. Executive Summary

This investigation analyzes the technical requirements and architecture for Features 3, 4, and 5 of Milestone 1 under the **Mocter Tenant Operating Environment Stabilization (`TNT-001`)**:
1. **Feature 3 — Cell Repositories Pool Delegation**: Decoupling cell repositories from the default `getDb()` (`db-portal`) and injecting the dynamic cell connection pool (`CellDatabasePoolManager.getCellDb`) and RLS transaction runner (`withTenantCellTransaction`).
2. **Feature 4 — Cell-side Tenant Provisioning**: Implementing `provisionTenantInCellDataPlane` in `admin-dashboard.service.ts` to materialize tenant owner projections in `admin.users`, `admin.tenant_users` (`role = 'tenant_owner'`), the 4 reserved lead labels in `admin.tenant_labels`, and baseline settings in `admin.client_business_info` on `pg-cell-XX`, while setting tenant `lifecycle_status = 'alta'` upon creation.
3. **Feature 5 — Identity Promotion & Credential Isolation**: Ensuring tenant credentials (Argon2id hashes) are stored strictly in `pg-cell-XX` (`admin.users`) with `password_hash = NULL` in `db-portal`, setting `users.identity_location = <cell_uuid>`, and updating password setup and reset routing.

Our live inspection confirmed that `pg-cell-01` currently has 0 rows across all 21 tenant tables, `Synergia Market` in `db-portal` has premature `lifecycle_status = 'activo'` with credentials lingering in `db-portal`, and all cell repositories default to `getDb()` against `db-portal`.

---

## 2. Investigation Findings

### 2.1 Feature 3: Updating Cell Repositories to Delegate to `CellDatabasePoolManager`

Currently, all tenant repositories have hardcoded default constructors targeting `getDb()`:

#### A. Repositories with Explicit `cellId` and `clientId` Parameters:
1. `DrizzleCellAuthRepository` (`packages/domain/src/repositories/drizzle-cell-auth.repository.ts:37`):
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = () => getDb(),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}
   ```
2. `DrizzleCrmRepository` (`packages/domain/src/repositories/drizzle-crm.repository.ts:38`):
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = () => getDb(),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}
   ```
3. `DrizzleOrdersRepository` (`packages/domain/src/repositories/drizzle-orders.repository.ts:41`):
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = () => getDb(),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}
   ```
*Finding*: These three repositories receive `cellId: string, clientId: string` explicitly in every method, but because `dbProvider` defaults to `() => getDb()`, all calls execute on `db-portal` instead of connecting to PgBouncer of `pg-cell-XX`. Furthermore, `CellDatabaseProvider` is currently typed as synchronous `(cellId?: string) => PostgresJsDatabase<typeof schema>`, whereas `CellDatabasePoolManager.getCellDb(cellId)` is an `async` function (`Promise<PostgresJsDatabase<typeof schema>>`).

#### B. Repositories Mixing Control-Plane Quotas and Data-Plane Operational Data:
4. `DrizzleTenantProductsRepository` (`packages/domain/src/services/tenant-products-and-media.service.ts:260`):
   ```ts
   export class DrizzleTenantProductsRepository implements ITenantProductsRepository {
     constructor(private readonly db: any = getDb()) {}
   ```
   *Analysis*: This repository executes two distinct categories of queries:
   - **Control-Plane Quota Queries (`db-portal`)**: `getPlanQuota` queries `clientPlanOverrides`, `clients`, and `planLimits`. These tables exist strictly in `db-portal`.
   - **Data-Plane Operational Queries (`pg-cell-XX` under RLS)**: `countActiveProducts`, `countProductMediaByKind`, `getTenantStorageUsage`, `createProduct`, `updateProduct`, `deleteProduct`, `listProducts`, `getProductById`, `importProducts`, `attachMedia`, and `detachMedia`. These tables (`cellProducts`, `cellProductMedia`, `cellClientUsage`) exist in `pg-cell-XX` under `FORCE ROW LEVEL SECURITY`.
   - *Finding*: The repository methods accept `clientId: string`, not `cellId`. Therefore, the ideal abstraction for this repository is `withTenantCellTransaction(clientId, callback)` which resolves the tenant's cell routing and injects `SET LOCAL app.current_client_id = clientId` automatically.

5. `DrizzleTenantContactsAndUsersRepository` (`packages/domain/src/services/tenant-contacts-and-users.service.ts:432`):
   ```ts
   export class DrizzleTenantContactsAndUsersRepository implements ITenantContactsAndUsersRepository {
     constructor(private readonly dbProvider: () => any = () => getDb()) {}
   ```
   *Analysis*: This repository also splits across control plane and cell data plane:
   - **Control-Plane Operations (`db-portal`)**: `getPlanQuota` (`clients`, `plans`, `planLimits`, `clientPlanOverrides`); Invitations (`tenantInvitations` in `adminSchema` on `db-portal`: `createInvitation`, `listInvitations`, `findInvitationByTokenHash`, `revokeInvitation`, `acceptInvitation`); User active client pointer (`getUserActiveClientId`, `setUserActiveClientId` on `users.activeClientId`).
   - **Data-Plane Operational Operations (`pg-cell-XX` under RLS)**: Contacts CRM (`cellContacts`: `countActiveContacts`, `findExistingContact`, `createContact`, `updateContact`, `deleteContact`, `listContacts`, `getContactById`); Tenant Memberships (`cellTenantUsers`: `countTenantUsers` active count, `createTenantMembership`, `listTenantMembers`, `removeTenantMember`).

---

### 2.2 Feature 4: Cell-side Tenant Provisioning in `admin-dashboard.service.ts`

In `packages/domain/src/services/admin-dashboard.service.ts`, `createAdminTenant()` currently executes:
1. Lookup or create owner in `users` (`db-portal`).
2. Resolve plan from `plans` (`db-portal`).
3. Resolve cell `assignedCell` (`db-portal`).
4. Insert `clients` with `lifecycleStatus: "activo"` (Line 2673: **BUG/VIOLATION**: premature activation).
5. Update `users.activeClientId` (`db-portal`).
6. Insert `clientRouting` (`db-portal`).
7. Update `cells.currentClients + 1` (`db-portal`).
8. Insert `clientPlans` (`db-portal`).
9. Provision Chatwoot account.
10. Send onboarding notification.
11. Return response with `lifecycleStatus: "activo"` (Line 2783).

*Finding*: `createAdminTenant` **never writes to `pg-cell-XX`**. As a consequence:
- `pg-cell-01` has 0 rows in `admin.users`, 0 rows in `admin.tenant_users`, 0 rows in `admin.tenant_labels`, and 0 rows in `admin.client_business_info`.
- Setting `lifecycle_status = 'activo'` bypasses the 3-step onboarding wizard at `/onboarding`.

*Requirement (TNT-RF-01.3 & ADM-001 D-36)*:
Implement `provisionTenantInCellDataPlane(clientId: string, cellId: string, ownerUserId: string, clientData?: any)`:
- Executes within `withTenantCellTransaction(clientId, ...)` or a cell connection with `set_config('app.current_client_id', clientId, true)`.
- Materializes 4 entities:
  1. `admin.users`: Owner user projection (`id = ownerUserId`, `clientId`, `email`, `status = 'active'`, `displayName`, `avatarUrl`, `passwordHash = null`, `passwordUpdatedAt = null`).
  2. `admin.tenant_users`: Owner membership (`clientId`, `userId = ownerUserId`, `role = 'tenant_owner'`, `status = 'active'`).
  3. `admin.tenant_labels`: Seeding the 4 reserved lead classification labels: `lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada` with `origin = 'mocter_default'`.
  4. `admin.client_business_info`: Baseline commercial configuration (`paymentMethods = ['transferencia', 'contraentrega']`, `shippingPolicy = { freeShipping: false, defaultCostCents: 0 }`, `botPreset = 'natural_rhythm'`, `remindersEnabled = false`).
- Tenant creation must assign `lifecycle_status = 'alta'` in `clients`.

---

### 2.3 Feature 5: Identity Promotion & Credential Isolation

#### A. Database Schema Constraints:
Inspection of `packages/domain/src/db/schemas/admin/users.ts` and `packages/domain/src/db/schemas/tenant/users.ts` reveals key constraints:
1. `users_identity_location_check`:
   ```sql
   CHECK (identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   ```
   **CRITICAL**: `identity_location` must be `'router'` OR a valid 36-character UUID string (the cell's `id`, NOT its slug `'cell-01'`).
2. `cell_users_password_updated_check`:
   ```sql
   CHECK ((password_hash IS NULL) = (password_updated_at IS NULL))
   ```
   **CRITICAL**: If `password_hash` is NULL, `password_updated_at` must be NULL. If `password_hash` is non-NULL, `password_updated_at` must NOT be NULL.
3. `cell_users_password_hash_check`:
   ```sql
   CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%')
   ```
   Hashes must be Argon2id.

#### B. Current Password Setup & Reset Routing:
In `AuthService.resetPassword` (`packages/domain/src/services/auth.service.ts:2178`):
```ts
const newPasswordHash = await hashPassword(password);
await this.authRepo.consumePasswordResetToken(
  tokenRecord.id,
  user.id,
  newPasswordHash,
  tokenRecord.purpose as "reset" | "setup",
);
```
`consumePasswordResetToken` in `drizzle-auth.repository.ts` unconditionally writes `passwordHash: newPasswordHash` to `db-portal.admin.users`.
*Finding*: For tenant users (`user.identityLocation !== 'router'` or users with an assigned `activeClientId`), writing `passwordHash` to `db-portal` directly violates credential isolation (AUTH-001 T-04 and DAT-001 §4.4).
- The hash must be written to `pg-cell-XX` (`admin.users`).
- `password_hash` and `password_updated_at` in `db-portal` must remain `NULL`.
- `users.identity_location` in `db-portal` must point to the cell's UUID.

#### C. Existing Identity Promotion Routine:
`AuthService.promoteStagingIdentityToCell` (`packages/domain/src/services/auth.service.ts:4176`) already implements the 4-phase sequence (Expand -> Copy -> Verify -> Switch & Clear) using:
- `this.cellAuthRepo.expandCellUser`
- `this.cellAuthRepo.copyCredentialsToCell`
- `this.cellAuthRepo.copyIdentitiesToCell`
- `this.cellAuthRepo.findUserCredentialsInCell`
- `this.authRepo.updateUserIdentityLocation(userId, targetCellId)`
- `this.authRepo.clearRouterUserCredentials(userId)` (which sets `password_hash = null`, `password_updated_at = null`, deletes federated identities from router).
*Finding*: When repositories delegate properly to `CellDatabasePoolManager`, `promoteStagingIdentityToCell` will function correctly against physical cells.

---

## 3. Worker Implementation Blueprint

### 3.1 Repository Delegation Blueprint

#### File 1: `packages/domain/src/repositories/drizzle-cell-auth.repository.ts`
1. Update `CellDatabaseProvider` type definition:
   ```ts
   export type CellDatabaseProvider = (
     cellId: string,
   ) => PostgresJsDatabase<typeof schema> | Promise<PostgresJsDatabase<typeof schema>>;
   ```
2. Import `getCellDb` from `../db/cell-client`:
   ```ts
   import { getCellDb } from "../db/cell-client";
   ```
3. Update constructor default and `getDbForCell`:
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = (cellId: string) => getCellDb(cellId),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}

   private async getDbForCell(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
     return await this.dbProvider(cellId);
   }
   ```
4. Await `this.getDbForCell(cellId)` in all methods (`findUserCredentialsInCell`, `updatePasswordHashInCell`, `updateTotpLastUsedStepInCell`, `listUserIdentitiesInCell`, `expandCellUser`, `copyCredentialsToCell`, `copyIdentitiesToCell`, `cleanupSourceCredentials`).

#### File 2: `packages/domain/src/repositories/drizzle-crm.repository.ts`
1. Update constructor default to use `getCellDb`:
   ```ts
   import { getCellDb } from "../db/cell-client";
   ```
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = (cellId: string) => getCellDb(cellId),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}

   private async getDbForCell(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
     return await this.dbProvider(cellId);
   }
   ```
2. Replace `const db = this.getDbForCell(cellId);` with `const db = await this.getDbForCell(cellId);` in all repository methods.

#### File 3: `packages/domain/src/repositories/drizzle-orders.repository.ts`
1. Update constructor default to use `getCellDb`:
   ```ts
   import { getCellDb } from "../db/cell-client";
   ```
   ```ts
   constructor(
     private readonly dbProvider: CellDatabaseProvider = (cellId: string) => getCellDb(cellId),
     private readonly cellHealthChecker?: CellConnectionChecker,
   ) {}

   private async getDbForCell(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
     return await this.dbProvider(cellId);
   }
   ```
2. Replace `const db = this.getDbForCell(cellId);` with `const db = await this.getDbForCell(cellId);` in all repository methods.

#### File 4: `packages/domain/src/services/tenant-products-and-media.service.ts`
1. Declare runner type and update `DrizzleTenantProductsRepository` constructor:
   ```ts
   import { withTenantCellTransaction } from "../db/cell-client";

   export type TenantCellTxRunner = <T>(
     clientId: string,
     callback: (tx: any) => Promise<T>,
   ) => Promise<T>;

   export class DrizzleTenantProductsRepository implements ITenantProductsRepository {
     constructor(
       private readonly portalDb: any = getDb(),
       private readonly cellTxRunner: TenantCellTxRunner = withTenantCellTransaction,
     ) {}
   ```
2. Keep `getPlanQuota` using `this.portalDb` (`clientPlanOverrides`, `clients`, `planLimits`).
3. Refactor all data plane methods to execute via `this.cellTxRunner(clientId, async (tx) => ...)`:
   - `countActiveProducts`: `return this.cellTxRunner(clientId, async (tx) => { const [res] = await tx.select(...)...; return res?.count ?? 0; });`
   - `countProductMediaByKind`: query `cellProductMedia` using `tx`.
   - `getTenantStorageUsage`: query `cellClientUsage` using `tx`.
   - `createProduct`: insert `cellProducts` using `tx`.
   - `updateProduct`: update `cellProducts` using `tx`.
   - `deleteProduct`: update `cellProducts.deletedAt` using `tx`.
   - `listProducts`: select from `cellProducts` using `tx`.
   - `getProductById`: select from `cellProducts` using `tx`.
   - `importProducts`: loop insert into `cellProducts` using `tx`.
   - `attachMedia`: insert `cellProductMedia` and upsert `cellClientUsage` using `tx`.
   - `detachMedia`: delete from `cellProductMedia` using `tx`.

#### File 5: `packages/domain/src/services/tenant-contacts-and-users.service.ts`
1. Update `DrizzleTenantContactsAndUsersRepository` constructor:
   ```ts
   import { withTenantCellTransaction } from "../db/cell-client";

   export class DrizzleTenantContactsAndUsersRepository
     implements ITenantContactsAndUsersRepository
   {
     constructor(
       private readonly portalDb: any = getDb(),
       private readonly cellTxRunner: TenantCellTxRunner = withTenantCellTransaction,
     ) {}
   ```
2. Route queries strictly:
   - **Control-Plane (`this.portalDb`)**:
     - `getPlanQuota`
     - `createInvitation`, `listInvitations`, `findInvitationByTokenHash`, `revokeInvitation`, `acceptInvitation` (`tenantInvitations`)
     - `getUserActiveClientId`, `setUserActiveClientId` (`users.activeClientId`)
   - **Data-Plane (`this.cellTxRunner(clientId, async (tx) => ...)`)**:
     - `countActiveContacts` (`cellContacts`)
     - `findExistingContact` (`cellContacts`)
     - `createContact` (`cellContacts`)
     - `updateContact` (`cellContacts`)
     - `deleteContact` (`cellContacts`)
     - `listContacts` (`cellContacts`)
     - `getContactById` (`cellContacts`)
     - `countTenantUsers`: active users from `tx.select().from(cellTenantUsers)...`, pending invitations from `this.portalDb.select().from(tenantInvitations)...`
     - `createTenantMembership`: `tx.insert(cellTenantUsers)...`
     - `listTenantMembers`: `tx.select().from(cellTenantUsers)...`
     - `removeTenantMember`: `tx.update(cellTenantUsers).set({ status: 'left', leftAt: new Date() })...` and if active client matched on `users`, update `this.portalDb.update(users).set({ activeClientId: null })...`

---

### 3.2 Cell-side Tenant Provisioning Blueprint

#### File: `packages/domain/src/services/admin-dashboard.service.ts`
1. Implement `provisionTenantInCellDataPlane`:
   ```ts
   import { withTenantCellTransaction } from "../db/cell-client";
   import { cellUsers, cellTenantUsers, cellTenantLabels, cellClientBusinessInfo } from "../db/schemas/tenant";

   const RESERVED_LEAD_LABELS = [
     { title: "lead-frio", description: "Prospecto con bajo interés inicial", color: "#64748B", origin: "mocter_default" },
     { title: "lead-tibio", description: "Prospecto con interés moderado", color: "#F59E0B", origin: "mocter_default" },
     { title: "lead-caliente", description: "Prospecto con alta intención de compra", color: "#EF4444", origin: "mocter_default" },
     { title: "compra-realizada", description: "Cliente que completó una transacción", color: "#10B981", origin: "mocter_default" },
   ] as const;

   export async function provisionTenantInCellDataPlane(
     clientId: string,
     cellId: string,
     ownerUserId: string,
     clientData?: {
       displayName?: string;
       contactEmail?: string;
       phone?: string;
       actor?: string;
     },
   ): Promise<Result<{ success: boolean }>> {
     const actor = clientData?.actor ?? "tenant_provisioning";
     const db = getDb();

     // 1. Obtener datos del dueño desde db-portal si faltan
     const [owner] = await db.select().from(users).where(eq(users.id, ownerUserId)).limit(1);
     if (!owner) {
       return err("Usuario dueño no encontrado en el Router Global.", "USER_NOT_FOUND");
     }

     const normalizedEmail = owner.email.trim().toLowerCase();

     try {
       await withTenantCellTransaction(clientId, async (tx) => {
         // 2. Materializar admin.users en la celda
         const passwordUpdatedAt = owner.passwordHash ? (owner.passwordUpdatedAt ?? new Date()) : null;
         await tx
           .insert(cellUsers)
           .values({
             id: ownerUserId,
             clientId,
             email: normalizedEmail,
             emailVerifiedAt: owner.emailVerifiedAt,
             passwordHash: owner.passwordHash ?? null,
             passwordUpdatedAt,
             status: "active",
             displayName: owner.displayName ?? null,
             avatarUrl: owner.avatarUrl ?? null,
             createdBy: actor,
             updatedBy: actor,
           })
           .onConflictDoUpdate({
             target: [cellUsers.clientId, cellUsers.id],
             set: {
               email: normalizedEmail,
               displayName: owner.displayName ?? null,
               avatarUrl: owner.avatarUrl ?? null,
               status: "active",
               updatedAt: new Date(),
               updatedBy: actor,
             },
           });

         // 3. Materializar membresía admin.tenant_users
         const [existingMembership] = await tx
           .select()
           .from(cellTenantUsers)
           .where(and(eq(cellTenantUsers.clientId, clientId), eq(cellTenantUsers.userId, ownerUserId)))
           .limit(1);

         if (!existingMembership) {
           await tx.insert(cellTenantUsers).values({
             clientId,
             userId: ownerUserId,
             role: "tenant_owner",
             status: "active",
             joinedAt: new Date(),
             createdBy: actor,
             updatedBy: actor,
           });
         } else if (existingMembership.role !== "tenant_owner" || existingMembership.status !== "active") {
           await tx
             .update(cellTenantUsers)
             .set({ role: "tenant_owner", status: "active", updatedAt: new Date(), updatedBy: actor })
             .where(eq(cellTenantUsers.id, existingMembership.id));
         }

         // 4. Sembrar las 4 etiquetas reservadas en admin.tenant_labels
         for (const label of RESERVED_LEAD_LABELS) {
           await tx
             .insert(cellTenantLabels)
             .values({
               clientId,
               title: label.title,
               description: label.description,
               color: label.color,
               origin: label.origin,
               showOnSidebar: true,
               state: "active",
               createdBy: actor,
               updatedBy: actor,
             })
             .onConflictDoNothing({ target: [cellTenantLabels.clientId, cellTenantLabels.title] });
         }

         // 5. Sembrar configuración comercial en admin.client_business_info
         await tx
           .insert(cellClientBusinessInfo)
           .values({
             clientId,
             paymentMethods: ["transferencia", "contraentrega"],
             shippingPolicy: { freeShipping: false, defaultCostCents: 0 },
             faqs: [],
             botPreset: "natural_rhythm",
             remindersEnabled: false,
             createdBy: actor,
             updatedBy: actor,
           })
           .onConflictDoNothing();
       });

       return ok({ success: true });
     } catch (error) {
       const msg = error instanceof Error ? error.message : String(error);
       appLogger.error(`[provisionTenantInCellDataPlane Failed] ${msg}`, error, {
         clientId,
         cellId,
         ownerUserId,
       });
       return err(`Fallo al aprovisionar inquilino en celda: ${msg}`, "CELL_PROVISION_ERROR");
     }
   }
   ```

2. Update `createAdminTenant` in `packages/domain/src/services/admin-dashboard.service.ts`:
   - Change `lifecycleStatus` on `clients.insert`:
     ```ts
     // 5. Insertar cliente con estado 'alta'
     const [newClient] = await db
       .insert(clients)
       .values({
         displayName: input.displayName.trim(),
         slug,
         contactEmail: ownerEmail,
         phone: input.phone?.trim() || null,
         ownerUserId: ownerId,
         planId: selectedPlan.id,
         lifecycleStatus: "alta", // <- CORREGIDO: 'alta' obligatorio
         locale: input.locale || "es",
         currency: "COP",
         createdBy: actor,
         updatedBy: actor,
       })
       .returning();
     ```
   - After `clientRouting` insertion (Step 7), update `users.identityLocation` and invoke provisioning:
     ```ts
     // 7.1 Actualizar identity_location del dueño a la UUID de la celda
     await db
       .update(users)
       .set({ identityLocation: assignedCell.id, updatedAt: new Date(), updatedBy: actor })
       .where(eq(users.id, ownerId));

     // 7.2 Aprovisionar registros base en pg-cell-XX
     const provRes = await provisionTenantInCellDataPlane(newClient.id, assignedCell.id, ownerId, {
       displayName: newClient.displayName,
       contactEmail: ownerEmail,
       actor,
     });
     if (!provRes.ok) {
       appLogger.warn("[createAdminTenant] Advertencia en aprovisionamiento celular inicial", {
         clientId: newClient.id,
         error: provRes.error,
       });
     }
     ```
   - In return payload:
     `lifecycleStatus: "alta"` (instead of `"activo"`).

---

### 3.3 Identity Promotion & Credential Isolation Blueprint

#### File: `packages/domain/src/services/auth.service.ts`
1. Update `resetPassword` to route password to `pg-cell-XX` when the user has an assigned cell:
   ```ts
   // In resetPassword:
   const newPasswordHash = await hashPassword(password);

   if (user.identityLocation !== "router" && user.activeClientId) {
     // Usuario de celda: guardar contraseña en pg-cell-XX bajo RLS
     await this.cellAuthRepo.updatePasswordHashInCell(
       user.identityLocation,
       user.activeClientId,
       user.id,
       newPasswordHash,
     );

     // En db-portal: consumir token y revocar sesiones manteniendo password_hash = NULL
     await this.authRepo.consumePasswordResetTokenForCellUser(
       tokenRecord.id,
       user.id,
       tokenRecord.purpose as "reset" | "setup",
     );
   } else if (user.activeClientId) {
     // Usuario en staging con activeClientId: buscar su celda asignada
     const routing = await this.authRepo.findClientRouting(user.activeClientId);
     if (routing) {
       await this.cellAuthRepo.updatePasswordHashInCell(
         routing.cellId,
         user.activeClientId,
         user.id,
         newPasswordHash,
       );
       await this.authRepo.updateUserIdentityLocation(user.id, routing.cellId);
       await this.authRepo.consumePasswordResetTokenForCellUser(
         tokenRecord.id,
         user.id,
         tokenRecord.purpose as "reset" | "setup",
       );
     } else {
       // Fallback a router si aún no tiene enrutamiento celular
       await this.authRepo.consumePasswordResetToken(
         tokenRecord.id,
         user.id,
         newPasswordHash,
         tokenRecord.purpose as "reset" | "setup",
       );
     }
   } else {
     // Operador de plataforma global: contraseña en db-portal
     await this.authRepo.consumePasswordResetToken(
       tokenRecord.id,
       user.id,
       newPasswordHash,
       tokenRecord.purpose as "reset" | "setup",
     );
   }
   ```
2. In `drizzle-auth.repository.ts`, add `consumePasswordResetTokenForCellUser`:
   ```ts
   async consumePasswordResetTokenForCellUser(
     tokenId: string,
     userId: string,
     purpose: "reset" | "setup",
   ): Promise<User> {
     return await this.db.transaction(async (tx) => {
       const now = new Date();
       await tx
         .update(passwordResetTokens)
         .set({ consumedAt: now, updatedAt: now, updatedBy: "system" })
         .where(eq(passwordResetTokens.id, tokenId));

       const userUpdateValues: Record<string, unknown> = {
         passwordHash: null,
         passwordUpdatedAt: null,
         updatedAt: now,
         updatedBy: "self",
       };
       if (purpose === "setup") {
         userUpdateValues.emailVerifiedAt = sql`COALESCE(${users.emailVerifiedAt}, now())`;
       }

       const [updatedUser] = await tx
         .update(users)
         .set(userUpdateValues)
         .where(eq(users.id, userId))
         .returning();

       await tx
         .update(sessions)
         .set({ revokedAt: now, revokedReason: "password_reset", updatedAt: now, updatedBy: "system" })
         .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

       return updatedUser;
     });
   }
   ```
3. Update `changePassword` for cell-promoted users:
   ```ts
   // In changePassword:
   if (user.identityLocation !== "router" && user.activeClientId) {
     const cellCreds = await this.cellAuthRepo.findUserCredentialsInCell(
       user.identityLocation,
       user.activeClientId,
       user.id,
     );
     if (!cellCreds || !cellCreds.passwordHash) {
       return err("No es posible cambiar la contraseña para esta cuenta.", "INVALID_REQUEST");
     }
     const isCurrentValid = await verifyPassword(currentPassword, cellCreds.passwordHash);
     if (!isCurrentValid) {
       return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
     }
     if (cellCreds.totpEnabledAt !== null && !totpCode) {
       return err("Debe proporcionar el código de autenticación de dos factores.", "MFA_REQUIRED");
     }
     const newHash = await hashPassword(newPassword);
     await this.cellAuthRepo.updatePasswordHashInCell(
       user.identityLocation,
       user.activeClientId,
       user.id,
       newHash,
     );
     // Revocar sesiones y rotar sesión en db-portal sin alterar password_hash en Router
     ...
   }
   ```

---

## 4. Edge Cases, Security Constraints & Pitfalls

1. **`users_identity_location_check`**:
   The check regex requires:
   `identity_location = 'router' OR identity_location ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`.
   Passing `'cell-01'` directly causes PostgreSQL error 23514 (`check_violation`). The Worker must always use `cell.id` (UUID) rather than `cell.code`.
2. **`cell_users_password_updated_check`**:
   `((password_hash IS NULL) = (password_updated_at IS NULL))`.
   When writing `passwordHash = null`, `passwordUpdatedAt` MUST be `null`.
   When writing `passwordHash = '<argon2id>'`, `passwordUpdatedAt` MUST be a non-null `Date`.
3. **`FORCE ROW LEVEL SECURITY` & PgBouncer Transaction Mode**:
   All transactions targeting `pg-cell-XX` must issue `SELECT set_config('app.current_client_id', clientId, true)` (or `SET LOCAL app.current_client_id = ...`) as the first statement in the transaction. Failure to do so causes all DML/selects to return 0 rows.
4. **Idempotence of `provisionTenantInCellDataPlane`**:
   If invoked repeatedly (e.g. during reconciliation or retried onboarding), all inserts must use `onConflictDoNothing()` or `onConflictDoUpdate()` so re-runs never trigger primary key or unique index violations.
5. **Membership 1:0..1 Uniqueness**:
   `tenant_users_one_active_membership` ensures a `user_id` can have at most one active membership across cells. Always verify absence of existing conflicting memberships before inserting into `cellTenantUsers`.

---

## 5. Verification Plan

1. **Unit & Repository Tests**:
   - Verify `DrizzleCellAuthRepository`, `DrizzleCrmRepository`, `DrizzleOrdersRepository` call `getCellDb` and execute `SET LOCAL app.current_client_id`.
   - Verify `DrizzleTenantProductsRepository` routes `getPlanQuota` to `portalDb` and products queries to `cellTxRunner`.
   - Verify `DrizzleTenantContactsAndUsersRepository` routes invitations and active client to `portalDb` and contacts/memberships to `cellTxRunner`.
2. **Cell Provisioning Verification**:
   - Call `createAdminTenant` with test tenant data.
   - Assert returned `lifecycle_status === 'alta'`.
   - Query `mocter-cell-01-pg-cell-1` via psql:
     - `SELECT count(*) FROM admin.users WHERE client_id = '<new_id>';` -> `1`
     - `SELECT count(*) FROM admin.tenant_users WHERE client_id = '<new_id>';` -> `1`
     - `SELECT count(*) FROM admin.tenant_labels WHERE client_id = '<new_id>';` -> `4`
     - `SELECT count(*) FROM admin.client_business_info WHERE client_id = '<new_id>';` -> `1`
3. **Identity Promotion Verification**:
   - Perform password setup/reset for a tenant owner.
   - Assert `password_hash` in `db-portal.admin.users` is `NULL`.
   - Assert `identity_location` in `db-portal.admin.users` matches `cell.id` (UUID).
   - Assert `password_hash` in `mocter-cell-01-pg-cell-1.admin.users` starts with `$argon2id$`.
