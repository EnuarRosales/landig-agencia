# Analysis Report: Tenant Reconciliation, RBAC Role Recognition & Password Reset Routing (Milestone 1 — Features 6, 7, 8)

**Subagent**: `explorer_m1_3`  
**Milestone**: M1 (Cell Isolation, Pooling & Identity Promotion)  
**Target Scope**: Features 6, 7, 8  
**Date**: 2026-11-09  

---

## 1. Executive Summary

This report establishes the technical architecture, database contracts, and implementation strategy for Features 6, 7, and 8 of Milestone 1 under the **Mocter Tenant Operating Environment Stabilization (`TNT-001`)**:
1. **Feature 6 — Idempotent Existing Tenant Reconciliation (`reconcileProvisionedTenantsInCells`)**:
   Materializes existing tenants, specifically `Synergia Market` (`id = '01a1bc84-cc30-73b6-bc84-1f0cda5a9661'`, owner `01a1bc84-cbec-7a2c-9efe-3a3f55284113'`), in their assigned cell `pg-cell-01` (`id = '6ae5619b-7ca3-4764-baae-1b8950a8e534'`). Promotes identity by setting `identity_location = cell_id` and nulling credentials in `db-portal`. Switches `lifecycle_status` to `'alta'` to trigger the 3-step onboarding wizard.
2. **Feature 7 — Tenant Owner Role Recognition in RBAC (`fetchRbacOverview`)**:
   Eliminates the erroneous `"Sin Rol"` label in `/admin/users`. Correlates `admin.users` with `admin.clients.owner_user_id` and `admin.users.active_client_id`, dynamically tagging tenant owners as `['tenant_owner']` and agents as `['tenant_agent']`, incrementing the system role counters, and translating cell UUIDs into friendly cell codes (`cell-01`).
3. **Feature 8 — Password Setup & Reset Routing (`AuthService.resetPassword`)**:
   Updates password setup (`purpose = 'setup'`) and reset (`purpose = 'reset'`) so that users whose identity is hosted in a cell (`identity_location !== 'router'`) have their Argon2id password hash persisted in `pg-cell-XX` (`admin.users`) under RLS, while `password_hash = NULL` and `password_updated_at = NULL` in `db-portal` (`admin.users`), strictly respecting PostgreSQL check constraints.

---

## 2. Detailed Problem Breakdown & Codebase Inspection

### 2.1 Feature 6: Existing Tenant State & The Need for Reconciliation

#### A. Current State of `Synergia Market` in `db-portal`
Inspection via `psql` against container `mocter-core-pg-portal-1`:
```sql
SELECT c.id, c.slug, c.display_name, c.lifecycle_status, c.owner_user_id, u.email, u.identity_location, cr.cell_id 
FROM admin.clients c 
JOIN admin.users u ON c.owner_user_id = u.id 
LEFT JOIN admin.client_routing cr ON c.id = cr.client_id 
WHERE c.slug = 'synergia-market';
```
Result:
- `client_id`: `01a1bc84-cc30-73b6-bc84-1f0cda5a9661`
- `slug`: `synergia-market`
- `display_name`: `Synergia Market`
- `lifecycle_status`: `activo` (Premature activation; tenant has never completed onboarding)
- `owner_user_id`: `01a1bc84-cbec-7a2c-9efe-3a3f55284113`
- `email`: `synergiamarket25@gmail.com`
- `identity_location`: `router` (Credentials linger in Router Global)
- `cell_id`: `6ae5619b-7ca3-4764-baae-1b8950a8e534` (`pg-cell-01`)
- `users.password_hash`: `$argon2id$v=19$m=65536,t=3,p=4$...` (Stored in `db-portal`)

#### B. Current State of `pg-cell-01`
Inspection via `psql` against container `mocter-cell-01-pg-cell-1`:
- `admin.users`: `0` rows
- `admin.tenant_users`: `0` rows
- `admin.tenant_labels`: `0` rows
- `admin.client_business_info`: `0` rows
- `admin.products`: `0` rows

#### C. Root Cause & Architectural Risk
Because `Synergia Market` was created before physical cell provisioning was implemented:
1. When the owner logs in, session context resolution cannot find tenant records in the cell data plane.
2. Because `lifecycle_status` was prematurely marked `activo`, the router would skip `/onboarding` and attempt to render `/workspace/*`, which fails due to missing client settings and labels in `pg-cell-01`.
3. The owner's password hash resides in `db-portal` instead of `pg-cell-01`, violating the physical credential isolation contract (AUTH-001 §4.2, TNT-RF-01.4).

---

### 2.2 Feature 7: Tenant Owner Role Recognition in RBAC

#### A. Code Inspection: `packages/domain/src/services/rbac.service.ts`
Lines 416–452 of `packages/domain/src/services/rbac.service.ts`:
```typescript
    // 4. Consultar Usuarios con sus Roles
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        identityLocation: users.identityLocation,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.email));

    const activeRoles = await db
      .select()
      .from(platformUserRoles)
      .where(sql`revoked_at IS NULL`);

    const userRolesMap = new Map<string, string[]>();
    const roleUserCountMap = new Map<string, number>();

    for (const ur of activeRoles) {
      const current = userRolesMap.get(ur.userId) || [];
      current.push(ur.role);
      userRolesMap.set(ur.userId, current);

      roleUserCountMap.set(ur.role, (roleUserCountMap.get(ur.role) || 0) + 1);
    }

    const usersDto: UserWithRolesDto[] = allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      identityLocation: u.identityLocation,
      roles: userRolesMap.get(u.id) || ["Sin Rol"],
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split("T")[0] : "—",
    }));
```

#### B. Deficiencies Identified:
1. **Exclusive Platform Roles Query**: The function queries only `platformUserRoles` (`admin.platform_user_roles`). Since tenant users do not hold platform roles (`platform_owner`, `platform_admin`, `platform_sales`), `userRolesMap.get(u.id)` evaluates to `undefined`, falling back to `["Sin Rol"]`.
2. **Missing Membership Awareness**: The query ignores `clients.owner_user_id` and `users.active_client_id`.
3. **Raw Cell UUID Display**: In `apps/admin/app/admin/users/rbac-view.tsx:360`, the column displays `{u.identityLocation}`. When an identity is promoted to a cell, `users.identityLocation` stores the 36-character UUID (`6ae5619b-7ca3-4764-baae-1b8950a8e534`). The UI displays an unformatted raw UUID instead of the human-readable cell code (`cell-01`).
4. **Incorrect Role Counts**: In `systemRoles`, the row for `tenant_owner` shows `assignedUsersCount: 0` because `roleUserCountMap` never tallies tenant owners.

---

### 2.3 Feature 8: Password Setup & Reset Routing

#### A. Code Inspection: `packages/domain/src/services/auth.service.ts`
Lines 2159–2186 of `packages/domain/src/services/auth.service.ts`:
```typescript
      const user = await this.authRepo.findUserById(tokenRecord.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (tokenRecord.purpose === "setup" && user.passwordHash !== null) {
        return err(
          "La cuenta ya cuenta con una contraseña establecida.",
          "PASSWORD_ALREADY_EXISTS",
        );
      }

      if (tokenRecord.purpose === "reset" && user.passwordHash === null) {
        return err(
          "La cuenta no cuenta con una contraseña nativa previa para recuperar.",
          "NO_NATIVE_PASSWORD",
        );
      }

      const newPasswordHash = await hashPassword(password);

      await this.authRepo.consumePasswordResetToken(
        tokenRecord.id,
        user.id,
        newPasswordHash,
        tokenRecord.purpose as "reset" | "setup",
      );
```

#### B. Deficiencies Identified:
1. **False Rejection on Password Reset**:
   For a tenant user promoted to a cell, `user.passwordHash` in `db-portal` is `NULL`.
   When `tokenRecord.purpose === "reset"`, line 2171 tests `user.passwordHash === null` against `db-portal` and rejects the operation with `NO_NATIVE_PASSWORD`, even though the user has a valid password stored in `pg-cell-XX`.
2. **Credential Leakage to Control Plane**:
   `this.authRepo.consumePasswordResetToken` persists `newPasswordHash` directly into `db-portal` (`admin.users`). For tenant users, this breaks physical isolation: passwords end up stored in `db-portal` while `pg-cell-XX` receives nothing.
3. **Database Check Constraint Violation Risk**:
   In `packages/domain/src/db/schemas/admin/users.ts:72-75`:
   ```typescript
   check(
     "users_password_updated_check",
     sql.raw("(password_hash IS NULL) = (password_updated_at IS NULL)")
   )
   ```
   If a routine sets `password_hash = NULL` but omits `password_updated_at = NULL`, PostgreSQL throws a check constraint violation. Both fields must be cleared together.

---

## 3. Technical Design & Architecture Blueprint

### 3.1 Blueprint for Feature 6: `reconcileProvisionedTenantsInCells`

#### Location
`packages/domain/src/services/admin-dashboard.service.ts`

#### Signature
```typescript
export interface ReconcileTenantDetail {
  clientId: string;
  slug: string;
  cellId: string;
  cellCode: string;
  ownerUserId: string;
  ownerEmail: string;
  credentialsPromoted: boolean;
  lifecycleStatus: string;
}

export interface ReconcileResult {
  reconciledCount: number;
  tenants: ReconcileTenantDetail[];
}

export async function reconcileProvisionedTenantsInCells(
  options?: { clientId?: string; actor?: string },
): Promise<Result<ReconcileResult>>;
```

#### Detailed Logic Flow:
```
[Start reconcileProvisionedTenantsInCells]
  │
  ├─ 1. Query db-portal:
  │     SELECT clients JOIN client_routing JOIN cells JOIN users (owner)
  │     WHERE client_routing.routing_status = 'active'
  │     (filter by clientId if options.clientId is provided)
  │
  ├─ 2. For each routed tenant:
  │     │
  │     ├─ a. Validate cell status == 'active'. If inactive, log warning and skip.
  │     │
  │     ├─ b. Call provisionTenantInCellDataPlane({
  │     │       cellId: tenant.cellId,
  │     │       clientId: tenant.clientId,
  │     │       ownerUser: {
  │     │         id: tenant.ownerUserId,
  │     │         email: tenant.ownerEmail,
  │     │         displayName: tenant.ownerDisplayName,
  │     │         passwordHash: tenant.ownerPasswordHash,
  │     │         passwordUpdatedAt: tenant.ownerPasswordUpdatedAt,
  │     │         emailVerifiedAt: tenant.ownerEmailVerifiedAt,
  │     │       },
  │     │       actor
  │     │     })
  │     │     --> Executes in pg-cell-XX under withTenantCellTransaction:
  │     │         - admin.users (ON CONFLICT (client_id, id) DO UPDATE)
  │     │         - admin.tenant_users (role = 'tenant_owner' IF NOT EXISTS)
  │     │         - admin.tenant_labels (4 reserved lead labels IF NOT EXISTS)
  │     │         - admin.client_business_info (defaults IF NOT EXISTS)
  │     │
  │     ├─ c. Promote credentials in db-portal:
  │     │     If owner.identityLocation != cellId OR owner.passwordHash IS NOT NULL:
  │     │       UPDATE admin.users
  │     │       SET identity_location = tenant.cellId,
  │     │           password_hash = NULL,
  │     │           password_updated_at = NULL,
  │     │           updated_at = now(),
  │     │           updated_by = actor
  │     │       WHERE id = tenant.ownerUserId;
  │     │
  │     ├─ d. Check products count in pg-cell-XX:
  │     │     SELECT count(*) FROM admin.products WHERE client_id = tenant.clientId
  │     │
  │     ├─ e. Align lifecycle_status in db-portal:
  │     │     If productsCount === 0 AND tenant.lifecycleStatus != 'alta':
  │     │       UPDATE admin.clients
  │     │       SET lifecycle_status = 'alta',
  │     │           updated_at = now(),
  │     │           updated_by = actor
  │     │       WHERE id = tenant.clientId;
  │     │
  │     └─ f. Record tenant details in output list.
  │
  └─ 3. Return ok({ reconciledCount: list.length, tenants: list })
```

#### Idempotency Verification Matrix:
| Component | First Run | N-th Subsequent Run |
|---|---|---|
| `admin.users` in cell | Row inserted with owner UUID and Argon2id hash | `ON CONFLICT DO UPDATE` updates name/email; no error |
| `admin.tenant_users` in cell | Membership row inserted with `tenant_owner` | Query finds existing active membership; insert skipped |
| `admin.tenant_labels` in cell | 4 labels inserted (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`) | Each title already exists; inserts skipped |
| `admin.client_business_info` | Defaults inserted with `client_id` PK | PK already exists; insert skipped |
| `admin.users` in `db-portal` | `identity_location` set to cell UUID, password hash cleared | Already points to cell UUID and hash is NULL; clean UPDATE or no-op |
| `admin.clients` in `db-portal` | Status set to `'alta'` | Already `'alta'`; no-op |

---

### 3.2 Blueprint for Feature 7: `fetchRbacOverview` Updates

#### Location
`packages/domain/src/services/rbac.service.ts`

#### Proposed Changes:
1. **Import `clients` and `cells`**:
   ```typescript
   import {
     users,
     platformUserRoles,
     systemRoles,
     systemPermissions,
     rolePermissions,
     clients,
     cells,
   } from "../db/schemas";
   ```

2. **Select `activeClientId` from `users`**:
   ```typescript
   const allUsers = await db
     .select({
       id: users.id,
       email: users.email,
       displayName: users.displayName,
       status: users.status,
       identityLocation: users.identityLocation,
       activeClientId: users.activeClientId,
       createdAt: users.createdAt,
     })
     .from(users)
     .orderBy(asc(users.email));
   ```

3. **Query Active Clients and Cell Codes**:
   ```typescript
   const activeClients = await db
     .select({
       id: clients.id,
       ownerUserId: clients.ownerUserId,
     })
     .from(clients)
     .where(sql`${clients.lifecycleStatus} <> 'baja'`);

   const ownerUserIds = new Set(activeClients.map((c) => c.ownerUserId));

   const allCells = await db
     .select({
       id: cells.id,
       code: cells.code,
     })
     .from(cells);

   const cellCodeMap = new Map<string, string>();
   for (const c of allCells) {
     cellCodeMap.set(c.id, c.code);
   }
   ```

4. **Assign Roles and Resolve Cell Identifiers**:
   ```typescript
   const usersDto: UserWithRolesDto[] = allUsers.map((u) => {
     const platformRoles = userRolesMap.get(u.id) || [];
     const roles: string[] = [...platformRoles];

     if (ownerUserIds.has(u.id)) {
       if (!roles.includes("tenant_owner")) {
         roles.push("tenant_owner");
         roleUserCountMap.set("tenant_owner", (roleUserCountMap.get("tenant_owner") || 0) + 1);
       }
     } else if (u.activeClientId) {
       if (!roles.includes("tenant_agent")) {
         roles.push("tenant_agent");
         roleUserCountMap.set("tenant_agent", (roleUserCountMap.get("tenant_agent") || 0) + 1);
       }
     }

     if (roles.length === 0) {
       roles.push("Sin Rol");
     }

     // Traducir UUID de celda a código amigable (ej: cell-01) para la UI
     const identityLocation = cellCodeMap.get(u.identityLocation) || u.identityLocation;

     return {
       id: u.id,
       email: u.email,
       displayName: u.displayName,
       status: u.status,
       identityLocation,
       roles,
       createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split("T")[0] : "—",
     };
   });
   ```

---

### 3.3 Blueprint for Feature 8: `AuthService.resetPassword` & Repository Routing

#### Locations
- `packages/domain/src/services/auth.service.ts`
- `packages/domain/src/repositories/auth.repository.interface.ts`
- `packages/domain/src/repositories/drizzle-auth.repository.ts`

#### Changes in `auth.repository.interface.ts`:
Update `consumePasswordResetToken` to accept `null` for `newPasswordHash` when credentials are isolated to a cell:
```typescript
consumePasswordResetToken(
  tokenId: string,
  userId: string,
  newPasswordHash: string | null,
  purpose: "reset" | "setup",
): Promise<User>;
```

#### Changes in `drizzle-auth.repository.ts`:
Ensure `passwordUpdatedAt` matches `newPasswordHash` nullability to satisfy `(password_hash IS NULL) = (password_updated_at IS NULL)`:
```typescript
  async consumePasswordResetToken(
    tokenId: string,
    userId: string,
    newPasswordHash: string | null,
    purpose: "reset" | "setup",
  ): Promise<User> {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();

        // 1. Marcar el token de restablecimiento como consumido
        await tx
          .update(passwordResetTokens)
          .set({
            consumedAt: now,
            updatedAt: now,
            updatedBy: "system",
          })
          .where(eq(passwordResetTokens.id, tokenId));

        // 2. Actualizar contraseña del usuario y email_verified_at si es setup
        const userUpdateValues: Record<string, unknown> = {
          passwordHash: newPasswordHash,
          passwordUpdatedAt: newPasswordHash !== null ? now : null,
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
          
        if (!updatedUser) {
          throw new Error("DrizzleAuthRepository: user update returned no rows upon password reset");
        }

        // 3. Revocar todas las sesiones activas del usuario (AUTH-001 §5.8)
        await tx
          .update(sessions)
          .set({
            revokedAt: now,
            revokedReason: "password_reset",
            updatedAt: now,
            updatedBy: "system",
          })
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

        return updatedUser;
      });
    } catch (error) { ... }
  }
```

#### Changes in `auth.service.ts`:
```typescript
      // 4. Validar existencia y estado de la cuenta
      const user = await this.authRepo.findUserById(tokenRecord.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      const isCellUser = user.identityLocation !== "router" && !!user.activeClientId;
      let cellCredentials: CellUserCredentials | null = null;

      if (isCellUser) {
        try {
          cellCredentials = await this.cellAuthRepo.findUserCredentialsInCell(
            user.identityLocation,
            user.activeClientId!,
            user.id,
          );
        } catch (cellErr) {
          appLogger.error("[AuthService.resetPassword] Fallo al consultar credenciales en celda", cellErr);
          return err("Celda temporalmente fuera de servicio.", "CELL_UNAVAILABLE");
        }
      }

      // Validar propósito contra credenciales en la ubicación autoritativa
      const hasNativePassword = isCellUser
        ? !!cellCredentials?.passwordHash
        : user.passwordHash !== null;

      if (tokenRecord.purpose === "setup" && hasNativePassword) {
        return err(
          "La cuenta ya cuenta con una contraseña establecida.",
          "PASSWORD_ALREADY_EXISTS",
        );
      }

      if (tokenRecord.purpose === "reset" && !hasNativePassword) {
        return err(
          "La cuenta no cuenta con una contraseña nativa previa para recuperar.",
          "NO_NATIVE_PASSWORD",
        );
      }

      const newPasswordHash = await hashPassword(password);

      if (isCellUser) {
        // Asegurar que el usuario existe en la celda
        if (!cellCredentials) {
          await this.cellAuthRepo.expandCellUser(user.identityLocation, {
            id: user.id,
            clientId: user.activeClientId!,
            email: user.email,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            status: user.status,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          });
        }

        // Persistir el hash Argon2id en la celda pg-cell-XX
        await this.cellAuthRepo.updatePasswordHashInCell(
          user.identityLocation,
          user.activeClientId!,
          user.id,
          newPasswordHash,
        );

        // Consumir el token en db-portal manteniendo password_hash = NULL
        await this.authRepo.consumePasswordResetToken(
          tokenRecord.id,
          user.id,
          null,
          tokenRecord.purpose as "reset" | "setup",
        );
      } else {
        // Usuario de plataforma en db-portal: persistir normalmente
        await this.authRepo.consumePasswordResetToken(
          tokenRecord.id,
          user.id,
          newPasswordHash,
          tokenRecord.purpose as "reset" | "setup",
        );
      }
```

---

## 4. Verification & Testing Plan

### 4.1 Unit Testing (`packages/domain/src/services/`)
1. **Reconciliation Tests (`admin-dashboard.service.test.ts`)**:
   - Verify `reconcileProvisionedTenantsInCells` executes without error on empty cells.
   - Verify materialization of `Synergia Market` in `pg-cell-01` produces 1 row in `admin.users`, 1 row in `admin.tenant_users` (`tenant_owner`), 4 rows in `admin.tenant_labels`, and 1 row in `admin.client_business_info`.
   - Verify repeated invocation is idempotent and produces no duplicates or constraint errors.
   - Verify `lifecycle_status` becomes `'alta'` when `productsCount === 0`.
2. **RBAC Overview Tests (`rbac.service.test.ts` or `admin-users.test.ts`)**:
   - Verify a user in `clients.owner_user_id` has `roles: ['tenant_owner']`.
   - Verify a user with `activeClientId` who is not an owner has `roles: ['tenant_agent']`.
   - Verify users with `identityLocation = <cell_uuid>` have their location formatted as `'cell-01'`.
   - Verify `roleUserCountMap` for `tenant_owner` is correctly incremented.
3. **Password Reset Tests (`auth.service.test.ts`)**:
   - Verify that for `identityLocation !== 'router'`, `resetPassword` calls `cellAuthRepo.updatePasswordHashInCell` and passes `null` to `authRepo.consumePasswordResetToken`.
   - Verify that for `purpose = 'reset'` on a cell user, it checks cell credentials instead of `user.passwordHash`.
   - Verify that for `purpose = 'setup'` on a cell user with existing password in cell, it returns `PASSWORD_ALREADY_EXISTS`.

### 4.2 Live Integration Testing against Docker
1. **Run Reconciliation**:
   ```bash
   node -e "const { reconcileProvisionedTenantsInCells } = require('@mocter/domain'); reconcileProvisionedTenantsInCells().then(console.log);"
   ```
2. **Check Database Assertions**:
   ```bash
   docker exec mocter-core-pg-portal-1 psql -U mocter -d db-portal -c "SELECT email, identity_location, password_hash FROM admin.users WHERE email = 'synergiamarket25@gmail.com';"
   # Expected: identity_location = '6ae5619b-7ca3-4764-baae-1b8950a8e534', password_hash IS NULL

   docker exec mocter-cell-01-pg-cell-1 psql -U mocter_app -d pg-cell-01 -c "SELECT email, password_hash IS NOT NULL FROM admin.users WHERE email = 'synergiamarket25@gmail.com';"
   # Expected: email = 'synergiamarket25@gmail.com', true
   ```
3. **Check `/admin/users` UI Rendering**:
   Verify that `Synergia Market`'s owner displays `tenant_owner` and `cell-01` instead of `Sin Rol` and `router`.
