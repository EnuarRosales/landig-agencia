import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { platformUserRoles, rolePermissions } from "../db/schemas";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Resultado de autorización para operaciones de aprovisionamiento de celdas.
 */
export type CellAuthorizationResult =
  | { ok: true; data?: void }
  | { ok: false; error: string; code?: string };

/**
 * Evaluación pura de autorización: requiere autoridad de Platform Owner y permiso `cells.provision`.
 *
 * - `userRoles`: roles activos del usuario según la base de datos.
 * - `rolePermissions`: mapa rol → conjunto de permisos concedidos.
 *
 * Nunca confía en un `actor` o rol suministrado en JSON.
 */
export function evaluateCellProvisionAuthorization(
  userRoles: string[],
  rolePermissions: Map<string, Set<string>>,
): CellAuthorizationResult {
  const hasOwnerAuthority = userRoles.includes("platform_owner");
  if (!hasOwnerAuthority) {
    return err("No autorizado: se requiere autoridad de Platform Owner.", "FORBIDDEN");
  }

  const hasPermission = userRoles.some((role) =>
    rolePermissions.get(role)?.has("cells.provision"),
  );
  if (!hasPermission) {
    return err("No autorizado: falta el permiso cells.provision.", "FORBIDDEN");
  }

  return ok(undefined);
}

/**
 * Devuelve los roles activos de un usuario de plataforma (`revoked_at IS NULL`).
 */
export async function fetchUserActivePlatformRoles(userId: string): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({ role: platformUserRoles.role })
      .from(platformUserRoles)
      .where(
        and(
          eq(platformUserRoles.userId, userId),
          sql`${platformUserRoles.revokedAt} IS NULL`,
        ),
      );
    return rows.map((r) => r.role);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchUserActivePlatformRoles Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Devuelve un mapa rol → conjunto de permisos concedidos para todos los roles activos
 * que tenga el usuario. Si `userRoles` se omite, se consultan desde la base de datos.
 */
export async function fetchRolePermissionsForUser(
  userId: string,
  userRoles?: string[],
): Promise<Map<string, Set<string>>> {
  try {
    const roles = userRoles ?? (await fetchUserActivePlatformRoles(userId));
    if (roles.length === 0) return new Map();

    const db = getDb();
    const rows = await db
      .select({ roleKey: rolePermissions.roleKey, permissionKey: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.granted, true), sql`${rolePermissions.roleKey} IN (${roles.map((r) => `'${r}'`).join(", ")})`));

    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = map.get(row.roleKey) ?? new Set<string>();
      set.add(row.permissionKey);
      map.set(row.roleKey, set);
    }
    return map;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchRolePermissionsForUser Failed] ${msg}`, error);
    return new Map();
  }
}

/**
 * Autoriza el aprovisionamiento de una celda (operación `cells.provision`).
 *
 * Requisitos:
 * - El usuario debe tener un rol `platform_owner` activo (autoridad de Platform Owner).
 * - El rol activo del usuario debe tener concedido el permiso `cells.provision`.
 */
export async function authorizeCellProvision(userId: string): Promise<CellAuthorizationResult> {
  try {
    const [userRoles, permissionsMap] = await Promise.all([
      fetchUserActivePlatformRoles(userId),
      fetchRolePermissionsForUser(userId),
    ]);

    return evaluateCellProvisionAuthorization(userRoles, permissionsMap);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[authorizeCellProvision Failed] ${msg}`, error);
    return err("Error al verificar autorización.", "AUTHZ_ERROR");
  }
}

/**
 * Alias canónico para verificaciones de autorización de aprovisionamiento de celdas.
 */
export const assertCellProvisionAuthorization = authorizeCellProvision;
