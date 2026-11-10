import { sql, eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  users,
  platformUserRoles,
  systemRoles,
  systemPermissions,
  rolePermissions,
  clients,
  cells,
  type User,
  type SystemRole,
  type SystemPermission,
  type RolePermission,
} from "../db/schemas";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

export interface UserWithRolesDto {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  identityLocation: string;
  roles: string[];
  createdAt: string;
}

export interface PermissionDto {
  key: string;
  module: string;
  name: string;
  description: string;
  isCritical: boolean;
}

export interface RoleWithPermissionsDto {
  key: string;
  name: string;
  description: string;
  scope: string;
  isSystem: boolean;
  status: string;
  assignedUsersCount: number;
  permissions: string[];
}

export interface RbacOverviewDto {
  kpis: {
    totalUsers: number;
    activeUsers: number;
    totalRoles: number;
    totalPermissions: number;
  };
  users: UserWithRolesDto[];
  roles: RoleWithPermissionsDto[];
  permissionModules: Array<{
    module: string;
    permissions: PermissionDto[];
  }>;
}

export interface SaveUserInput {
  id?: string;
  email: string;
  displayName: string;
  role: string;
  status?: "active" | "disabled";
  actorUserId?: string;
}

export interface SaveRoleInput {
  id?: string;
  key: string;
  name: string;
  description: string;
  scope?: "platform" | "tenant" | "community";
  status?: "active" | "disabled";
  actorUserId?: string;
}

export interface TogglePermissionInput {
  roleKey: string;
  permissionKey: string;
  granted: boolean;
  actorUserId?: string;
}

export const CANONICAL_ROLES_SEED = [
  {
    key: "platform_owner",
    name: "Platform Owner",
    description: "Propietario supremo de la SaaS. Control total de gobernanza, celdas de datos, cuotas y RBAC.",
    scope: "platform",
    isSystem: true,
  },
  {
    key: "platform_admin",
    name: "Platform Admin",
    description: "Administrador de operaciones. Gestión de inquilinos, soporte, auditoría y atención Chatwoot.",
    scope: "platform",
    isSystem: true,
  },
  {
    key: "platform_sales",
    name: "Platform Sales",
    description: "Ejecutivo comercial. Alta manual de inquilinos, asignación de planes y gestión de prospectos.",
    scope: "platform",
    isSystem: true,
  },
  {
    key: "tenant_owner",
    name: "Tenant Owner",
    description: "Propietario de inquilino. Control administrativo completo de su espacio de trabajo y agentes.",
    scope: "tenant",
    isSystem: true,
  },
  {
    key: "tenant_agent",
    name: "Tenant Agent",
    description: "Agente operativo del inquilino. Atención de clientes en Chatwoot y captura de pedidos.",
    scope: "tenant",
    isSystem: true,
  },
] as const;

export const CANONICAL_PERMISSIONS_SEED = [
  // 1. Gobierno y Control Supremo
  {
    key: "platform.governance.manage",
    module: "Gobierno y Control",
    name: "Control Supremo Del Sistema",
    description: "Supervisión total del plano de control, configuración global e integridad del sistema.",
    isCritical: true,
  },
  {
    key: "platform.roles.manage",
    module: "Gobierno y Control",
    name: "Gestión De Roles y Matriz RBAC",
    description: "Crear, editar roles y activar o revocar permisos específicos en la matriz de acceso.",
    isCritical: true,
  },
  {
    key: "platform.users.manage",
    module: "Gobierno y Control",
    name: "Administración De Usuarios De Plataforma",
    description: "Crear, suspender y asignar roles a los usuarios con acceso al plano de control.",
    isCritical: true,
  },
  {
    key: "platform.audit.view",
    module: "Gobierno y Control",
    name: "Consulta De Bitácora De Auditoría",
    description: "Visualizar el registro inmutable de auditoría y acciones realizadas en el sistema.",
    isCritical: false,
  },

  // 2. Celdas de Datos
  {
    key: "cells.provision",
    module: "Celdas de Datos",
    name: "Aprovisionamiento De Celdas PostgreSQL",
    description: "Desplegar y registrar nuevos nodos celulares de base de datos con límites de cuota.",
    isCritical: true,
  },
  {
    key: "cells.view",
    module: "Celdas de Datos",
    name: "Monitoreo De Salud De Celdas",
    description: "Consultar métricas de capacidad, ocupación y latencia de los nodos celulares.",
    isCritical: false,
  },

  // 3. Catálogo de Planes
  {
    key: "plans.manage",
    module: "Planes y Cuotas",
    name: "Parametrización De Planes Comerciales",
    description: "Crear, fijar precios y configurar cuotas de almacenamiento y bots por plan.",
    isCritical: true,
  },
  {
    key: "plans.view",
    module: "Planes y Cuotas",
    name: "Consulta De Planes y Cuotas",
    description: "Ver los planes vigentes y características de suscripción.",
    isCritical: false,
  },

  // 4. Suscripciones y Facturación
  {
    key: "subscriptions.view",
    module: "Ventas y Facturación",
    name: "Tablero De Facturación y MRR",
    description: "Visualizar ingresos recurrentes mensuales, suscripciones activas y pasarelas de pago.",
    isCritical: false,
  },
  {
    key: "subscriptions.manage",
    module: "Ventas y Facturación",
    name: "Gestión De Cobros y Comprobantes",
    description: "Registrar transacciones manuales, reintentos de cobro y descarga de reportes contables.",
    isCritical: false,
  },

  // 5. Inquilinos y Clientes
  {
    key: "tenants.create",
    module: "Inquilinos y Clientes",
    name: "Alta Manual De Inquilinos",
    description: "Crear nuevos inquilinos desde el portal administrativo y generar su cuenta owner inicial.",
    isCritical: false,
  },
  {
    key: "tenants.manage",
    module: "Inquilinos y Clientes",
    name: "Gestión Del Ciclo De Vida",
    description: "Suspender, reactivar y desvincular cuentas de inquilinos de la plataforma.",
    isCritical: true,
  },
  {
    key: "tenants.view",
    module: "Inquilinos y Clientes",
    name: "Directorio De Inquilinos",
    description: "Consultar la lista de clientes registrados, estado y plan activo.",
    isCritical: false,
  },
  {
    key: "tenants.break_glass",
    module: "Inquilinos y Clientes",
    name: "Acceso Excepcional Auditado (Break-Glass)",
    description: "Acceso de emergencia justificado y auditado a datos del inquilino por soporte técnico.",
    isCritical: true,
  },

  // 6. Prospectos y CRM
  {
    key: "leads.manage",
    module: "Prospectos y CRM",
    name: "Calificación De Leads De Landing",
    description: "Revisar, calificar y dar seguimiento a los prospectos capturados en la landing.",
    isCritical: false,
  },
  {
    key: "crm.contacts.manage",
    module: "Prospectos y CRM",
    name: "Directorio Comercial y Consentimientos",
    description: "Gestionar directorio de contactos comerciales y cumplimiento de Habeas Data.",
    isCritical: false,
  },

  // 7. Correos y Pasarela SMTP
  {
    key: "notifications.smtp.manage",
    module: "Correos y SMTP",
    name: "Configuración De Servidores SMTP",
    description: "Administrar servidores de envío, credenciales cifradas AES-256-GCM y puertos.",
    isCritical: true,
  },
  {
    key: "notifications.senders.manage",
    module: "Correos y SMTP",
    name: "Gestión De Direcciones Remitentes",
    description: "Registrar y asignar casillas de correo oficiales autorizadas de la SaaS.",
    isCritical: false,
  },
  {
    key: "notifications.templates.manage",
    module: "Correos y SMTP",
    name: "Gestión De Plantillas Vinculadas",
    description: "Crear y versionar plantillas HTML obligatoriamente vinculadas a remitente y evento.",
    isCritical: false,
  },

  // 8. Atención y Chatwoot
  {
    key: "chatwoot.manage",
    module: "Chatwoot y Soporte",
    name: "Aprovisionamiento De Cuentas Chatwoot",
    description: "Vincular y parametrizar instancias e inboxes de atención de Chatwoot.",
    isCritical: false,
  },
  {
    key: "chatwoot.inbox.access",
    module: "Chatwoot y Soporte",
    name: "Acceso A Bandeja Omnicanal Embebida",
    description: "Abrir la consola operativa same-site de atención al cliente.",
    isCritical: false,
  },

  // 9. Sistema de Diseño
  {
    key: "design_system.customize",
    module: "Sistema de Diseño",
    name: "Personalización De Tokens y Temas",
    description: "Modificar en caliente tokens visuales, contraste WCAG 2.2 AA y estética corporativa.",
    isCritical: false,
  },
  {
    key: "design_system.view",
    module: "Sistema de Diseño",
    name: "Exploración Del Catálogo De Diseño",
    description: "Visualizar componentes vivos, escalas tipográficas y paletas de la SaaS.",
    isCritical: false,
  },
] as const;

/**
 * Consulta y auto-inicializa el estado completo de RBAC corporativo en PostgreSQL.
 * Cero datos quemados: Toda la información reside en `admin.users`, `admin.system_roles`,
 * `admin.system_permissions` y `admin.role_permissions`.
 */
export async function fetchRbacOverview(): Promise<RbacOverviewDto> {
  const db = getDb();

  try {
    // 1. Inicialización idempotente de Roles si la tabla está vacía
    const existingRoles = await db.select().from(systemRoles);
    if (existingRoles.length === 0) {
      for (const r of CANONICAL_ROLES_SEED) {
        await db.insert(systemRoles).values({
          key: r.key,
          name: r.name,
          description: r.description,
          scope: r.scope,
          isSystem: r.isSystem,
          status: "active",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
    }

    // 2. Inicialización idempotente de Permisos si la tabla está vacía
    const existingPerms = await db.select().from(systemPermissions);
    if (existingPerms.length === 0) {
      for (const p of CANONICAL_PERMISSIONS_SEED) {
        await db.insert(systemPermissions).values({
          key: p.key,
          module: p.module,
          name: p.name,
          description: p.description,
          isCritical: p.isCritical,
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
    }

    // 3. Inicialización idempotente de la Matriz de Permisos si la tabla está vacía
    const existingMatrix = await db.select().from(rolePermissions);
    if (existingMatrix.length === 0) {
      // Regla de Asignación Inicial Canónica
      for (const p of CANONICAL_PERMISSIONS_SEED) {
        // Platform Owner: Todos los permisos concedidos
        await db.insert(rolePermissions).values({
          roleKey: "platform_owner",
          permissionKey: p.key,
          granted: true,
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });

        // Platform Admin: Permisos operativos (excluye gobernanza de roles y aprovisionamiento de celdas)
        const adminAllowed =
          !p.key.startsWith("platform.roles") &&
          !p.key.startsWith("platform.governance") &&
          p.key !== "cells.provision" &&
          p.key !== "plans.manage" &&
          p.key !== "tenants.break_glass";

        await db.insert(rolePermissions).values({
          roleKey: "platform_admin",
          permissionKey: p.key,
          granted: adminAllowed,
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });

        // Platform Sales: Permisos comerciales
        const salesAllowed =
          p.key === "subscriptions.view" ||
          p.key === "subscriptions.manage" ||
          p.key === "tenants.create" ||
          p.key === "tenants.view" ||
          p.key === "leads.manage" ||
          p.key === "crm.contacts.manage" ||
          p.key === "plans.view";

        await db.insert(rolePermissions).values({
          roleKey: "platform_sales",
          permissionKey: p.key,
          granted: salesAllowed,
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });

        // Tenant Owner y Tenant Agent
        await db.insert(rolePermissions).values({
          roleKey: "tenant_owner",
          permissionKey: p.key,
          granted: p.key === "chatwoot.inbox.access" || p.key === "crm.contacts.manage",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });

        await db.insert(rolePermissions).values({
          roleKey: "tenant_agent",
          permissionKey: p.key,
          granted: p.key === "chatwoot.inbox.access",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
    }

    // 4. Consultar Usuarios con sus Roles, Clientes y Celdas
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

    // 5. Consultar Roles y sus Permisos
    const allRoles = await db.select().from(systemRoles).orderBy(asc(systemRoles.name));
    const allRolePerms = await db.select().from(rolePermissions);

    const rolePermsMap = new Map<string, string[]>();
    for (const rp of allRolePerms) {
      if (rp.granted) {
        const current = rolePermsMap.get(rp.roleKey) || [];
        current.push(rp.permissionKey);
        rolePermsMap.set(rp.roleKey, current);
      }
    }

    const rolesDto: RoleWithPermissionsDto[] = allRoles.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      scope: r.scope,
      isSystem: r.isSystem,
      status: r.status,
      assignedUsersCount: roleUserCountMap.get(r.key) || 0,
      permissions: rolePermsMap.get(r.key) || [],
    }));

    // 6. Consultar Catálogo de Permisos Agrupados por Módulo
    const allPerms = await db.select().from(systemPermissions).orderBy(asc(systemPermissions.module), asc(systemPermissions.name));

    const moduleMap = new Map<string, PermissionDto[]>();
    for (const p of allPerms) {
      const current = moduleMap.get(p.module) || [];
      current.push({
        key: p.key,
        module: p.module,
        name: p.name,
        description: p.description,
        isCritical: p.isCritical,
      });
      moduleMap.set(p.module, current);
    }

    const permissionModules = Array.from(moduleMap.entries()).map(([module, permissions]) => ({
      module,
      permissions,
    }));

    return {
      kpis: {
        totalUsers: allUsers.length,
        activeUsers: allUsers.filter((u) => u.status === "active").length,
        totalRoles: allRoles.length,
        totalPermissions: allPerms.length,
      },
      users: usersDto,
      roles: rolesDto,
      permissionModules,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchRbacOverview Failed] ${msg}`, error);
    return {
      kpis: { totalUsers: 0, activeUsers: 0, totalRoles: 0, totalPermissions: 0 },
      users: [],
      roles: [],
      permissionModules: [],
    };
  }
}

/**
 * Crea o actualiza un usuario del sistema y le asigna su rol de plataforma (`admin.users`, `admin.platform_user_roles`).
 */
export async function saveSystemUser(
  input: SaveUserInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.actorUserId || "platform_owner";

    if (!input.email || !input.displayName || !input.role) {
      return err("Correo electrónico, Nombre completo y Rol asignado son obligatorios.");
    }

    const cleanEmail = input.email.trim().toLowerCase();

    if (input.id) {
      // 1. Actualizar usuario
      await db
        .update(users)
        .set({
          displayName: input.displayName,
          status: input.status || "active",
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.id));

      // 2. Actualizar rol en platform_user_roles
      // Revocar roles anteriores
      await db
        .update(platformUserRoles)
        .set({ revokedAt: new Date(), updatedBy: actor, updatedAt: new Date() })
        .where(and(eq(platformUserRoles.userId, input.id), sql`revoked_at IS NULL`));

      // Asignar nuevo rol
      await db.insert(platformUserRoles).values({
        userId: input.id,
        role: input.role,
        grantedByUserId: null,
        createdBy: actor,
        updatedBy: actor,
      });

      return ok({ id: input.id });
    } else {
      // Crear nuevo usuario de plataforma
      const [createdUser] = await db
        .insert(users)
        .values({
          email: cleanEmail,
          displayName: input.displayName,
          status: input.status || "active",
          identityLocation: "router",
          emailVerifiedAt: new Date(),
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      // Asignar rol inicial
      await db.insert(platformUserRoles).values({
        userId: createdUser.id,
        role: input.role,
        grantedByUserId: null,
        createdBy: actor,
        updatedBy: actor,
      });

      return ok({ id: createdUser.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveSystemUser Failed] ${msg}`, error);
    return err(`Error al guardar usuario: ${msg}`);
  }
}

/**
 * Crea o actualiza un rol en el catálogo del sistema (`admin.system_roles`).
 */
export async function saveSystemRole(
  input: SaveRoleInput
): Promise<Result<{ key: string }, string>> {
  try {
    const db = getDb();
    const actor = input.actorUserId || "platform_owner";

    if (!input.key || !input.name || !input.description) {
      return err("Clave identificadora, Nombre y Descripción del rol son obligatorios.");
    }

    const cleanKey = input.key.trim().toLowerCase();

    if (input.id) {
      const [existing] = await db
        .select()
        .from(systemRoles)
        .where(eq(systemRoles.id, input.id))
        .limit(1);

      if (existing?.isSystem && cleanKey !== existing.key) {
        return err("Los roles del sistema no permiten modificar su clave canónica.");
      }

      await db
        .update(systemRoles)
        .set({
          name: input.name,
          description: input.description,
          scope: input.scope || existing?.scope || "platform",
          status: input.status || existing?.status || "active",
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(systemRoles.id, input.id));

      return ok({ key: existing ? existing.key : cleanKey });
    } else {
      await db.insert(systemRoles).values({
        key: cleanKey,
        name: input.name,
        description: input.description,
        scope: input.scope || "platform",
        isSystem: false,
        status: input.status || "active",
        createdBy: actor,
        updatedBy: actor,
      });

      return ok({ key: cleanKey });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveSystemRole Failed] ${msg}`, error);
    return err(`Error al guardar rol: ${msg}`);
  }
}

/**
 * Activa o desactiva un permiso específico para un rol en la matriz RBAC (`admin.role_permissions`).
 * REGLA DE PROTECCIÓN SUPREMA: El `platform_owner` no puede perder permisos críticos de gobierno.
 */
export async function toggleRolePermission(
  input: TogglePermissionInput
): Promise<Result<{ granted: boolean }, string>> {
  try {
    const db = getDb();
    const actor = input.actorUserId || "platform_owner";

    // Regla de Protección del Owner: No auto-bloqueo
    if (
      input.roleKey === "platform_owner" &&
      !input.granted &&
      (input.permissionKey === "platform.governance.manage" ||
        input.permissionKey === "platform.roles.manage" ||
        input.permissionKey === "platform.users.manage")
    ) {
      return err("Operación bloqueada por seguridad: El Platform Owner no puede revocar sus propios permisos críticos de gobierno.");
    }

    // Verificar si el permiso ya está en la tabla
    const [existing] = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleKey, input.roleKey),
          eq(rolePermissions.permissionKey, input.permissionKey)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(rolePermissions)
        .set({
          granted: input.granted,
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(rolePermissions.id, existing.id));
    } else {
      await db.insert(rolePermissions).values({
        roleKey: input.roleKey,
        permissionKey: input.permissionKey,
        granted: input.granted,
        createdBy: actor,
        updatedBy: actor,
      });
    }

    return ok({ granted: input.granted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[toggleRolePermission Failed] ${msg}`, error);
    return err(`Error al modificar permiso: ${msg}`);
  }
}

