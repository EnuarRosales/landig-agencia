import {
  boolean,
  check,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Catálogo de roles gobernables de la plataforma y del sistema (`admin.system_roles`, ADM-001 D-31).
 *
 * El rol `platform_owner` es inmutable y core del sistema: gobierna RBAC, celdas y cuotas.
 */
export const systemRoles = adminSchema.table(
  "system_roles",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    scope: text("scope").notNull().default("platform"),
    isSystem: boolean("is_system").notNull().default(false),
    status: text("status").notNull().default("active"),
    ...auditColumns(),
  },
  () => [
    check("system_roles_key_check", sql.raw("key = lower(key)")),
    check("system_roles_status_check", sql.raw("status IN ('active', 'disabled')")),
    check("system_roles_scope_check", sql.raw("scope IN ('platform', 'tenant', 'community')")),
  ],
);

/**
 * Catálogo granular de permisos del sistema (`admin.system_permissions`, ADM-001 D-31).
 */
export const systemPermissions = adminSchema.table(
  "system_permissions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    key: text("key").notNull().unique(),
    module: text("module").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    isCritical: boolean("is_critical").notNull().default(false),
    ...auditColumns(),
  },
  () => [
    check("system_permissions_key_check", sql.raw("key = lower(key)")),
  ],
);

/**
 * Asignación de permisos a roles gobernables (`admin.role_permissions`, ADM-001 D-31).
 *
 * Permite al `platform_owner` activar o desactivar capacidades específicas por cada rol.
 */
export const rolePermissions = adminSchema.table(
  "role_permissions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    roleKey: text("role_key")
      .notNull()
      .references(() => systemRoles.key, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => systemPermissions.key, { onDelete: "cascade" }),
    granted: boolean("granted").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_unique").on(
      table.roleKey,
      table.permissionKey,
    ),
  ],
);

export type SystemRole = typeof systemRoles.$inferSelect;
export type NewSystemRole = typeof systemRoles.$inferInsert;

export type SystemPermission = typeof systemPermissions.$inferSelect;
export type NewSystemPermission = typeof systemPermissions.$inferInsert;

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

