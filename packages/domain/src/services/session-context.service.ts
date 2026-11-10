import { eq, and, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import { users, clients, clientRouting, cells, plans } from "../db/schemas/admin";
import { cellTenantUsers } from "../db/schemas/tenant";
import { withTenantCellTransaction } from "../db/cell-client";
import { authService } from "./auth.service";
import { fetchUserActivePlatformRoles } from "./cell-authorization.service";
import {
  TenantCapabilityGateService,
  DrizzleTenantCapabilityGateRepository,
} from "./tenant-capability-gate.service";
import { appLogger } from "../utils/logger";

/**
 * Scopes autoritativos mutuamente excluyentes para el portal Mocter (TNT-RF-02, ADM-D-35).
 */
export type PortalScope = "platform" | "tenant" | "onboarding_prospect";

/**
 * Entidad de usuario tipada en el contexto de portal.
 */
export interface PortalContextUser {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailVerifiedAt: Date | null;
}

/**
 * Metadatos de sesión activa resuelta.
 */
export interface PortalContextSession {
  id: string;
  createdAt?: Date;
  expiresAt?: Date;
}

/**
 * Resumen del inquilino activo asociado al usuario en sesión.
 */
export interface PortalContextClient {
  id: string;
  slug: string;
  displayName: string;
  name: string;
  lifecycleStatus: string;
  planId: string;
}

/**
 * Contexto autoritativo de sesión resuelto en el servidor para layout y shells (TNT-001 R2, Feature 10).
 */
export interface PortalContext {
  user: PortalContextUser;
  session: PortalContextSession;
  scope: PortalScope;
  role: string;
  effectiveRoles: string[];
  activeClientId: string | null;
  activeClient: PortalContextClient | null;
  activeCellId: string | null;
  activeCellCode: string | null;
  planName: string | null;
  capabilities: Record<string, boolean>;
  lifecycleStatus: string | null;
}

/**
 * Alias de tipo para el contexto autoritativo de sesión.
 */
export type AuthenticatedPortalContext = PortalContext;

/**
 * Resuelve de manera autoritativa el contexto y alcance de un usuario a partir de su sesión HTTP (AUTH-001, TNT-001).
 *
 * Reglas de negocio:
 * 1. Valida criptográfica y temporalmente la cookie `sid` contra Redis y `admin.sessions`.
 *    Si no es válida, está expirada o revocada, retorna `null` (Fail-Closed).
 * 2. Si el usuario posee roles activos en `admin.platform_user_roles`, resuelve `scope = 'platform'`.
 *    El rol asignado corresponde al rol de plataforma de mayor jerarquía (`platform_owner` > `platform_admin` > `platform_sales`).
 * 3. Si el usuario NO posee roles de plataforma:
 *    - NUNCA asigna `platform_owner` por omisión (eliminación de vulnerabilidad Feature 9).
 *    - Si no posee inquilino asignado o su estado es `alta`, resuelve `scope = 'onboarding_prospect'`.
 *    - Si posee inquilino asignado y su estado es `activo`, resuelve `scope = 'tenant'`.
 *    - Resuelve `activeCellId` y `activeCellCode` desde `admin.client_routing` y `admin.cells`.
 *    - Resuelve `planName` y capacidades efectivas vía `TenantCapabilityGateService`.
 *    - Resuelve el rol de inquilino (`tenant_owner` si es el propietario registrado, `tenant_agent` si es miembro).
 *
 * @param sessionId - Token opaco de sesión obtenido de la cookie `mocter_sid` o `__Host-mocter_sid`.
 * @returns Contexto autoritativo de portal, o `null` si la sesión no es válida.
 */
export async function resolveAuthenticatedPortalContext(
  sessionId: string,
): Promise<PortalContext | null> {
  const cleanSid = sessionId?.trim();
  if (!cleanSid) {
    return null;
  }

  try {
    // 1. Validar la sesión con el servicio central de autenticación
    const validation = await authService.validateSession(cleanSid);
    if (!validation.ok || !validation.data?.user) {
      return null;
    }

    const { user, session } = validation.data;
    if (user.status === "disabled") {
      return null;
    }

    const portalUser: PortalContextUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName || null,
      status: user.status || "active",
      emailVerifiedAt: user.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null,
    };

    const portalSession: PortalContextSession = {
      id: session.id,
      createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : undefined,
    };

    // 2. Consultar roles de plataforma activos (admin.platform_user_roles)
    const platformRoles = await fetchUserActivePlatformRoles(user.id);
    if (platformRoles.length > 0) {
      const preferredRole = platformRoles.includes("platform_owner")
        ? "platform_owner"
        : (platformRoles[0] || "platform_admin");

      return {
        user: portalUser,
        session: portalSession,
        scope: "platform",
        role: preferredRole,
        effectiveRoles: platformRoles,
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: null,
      };
    }

    // 3. Usuarios no plataforma: Resolver contexto de inquilino / prospecto
    const db = getDb();
    let targetClientId: string | null = user.activeClientId ?? null;

    // Si el usuario no tiene activeClientId en users, verificar si es owner de un cliente activo/alta
    if (!targetClientId) {
      const [ownedClient] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.ownerUserId, user.id),
            ne(clients.lifecycleStatus, "baja"),
          ),
        )
        .limit(1);

      if (ownedClient) {
        targetClientId = ownedClient.id;
      }
    }

    // Si no existe ningún cliente asociado -> Prospecto sin registro de empresa
    if (!targetClientId) {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: "alta",
      };
    }

    // Consultar registro del cliente en admin.clients
    const [clientRecord] = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        ownerUserId: clients.ownerUserId,
        lifecycleStatus: clients.lifecycleStatus,
        planId: clients.planId,
      })
      .from(clients)
      .where(eq(clients.id, targetClientId))
      .limit(1);

    if (!clientRecord || clientRecord.lifecycleStatus === "baja") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: "onboarding_prospect",
        effectiveRoles: ["onboarding_prospect"],
        activeClientId: null,
        activeClient: null,
        activeCellId: null,
        activeCellCode: null,
        planName: null,
        capabilities: {},
        lifecycleStatus: clientRecord?.lifecycleStatus ?? "alta",
      };
    }

    // Consultar asignación celular en admin.client_routing
    const [routingRecord] = await db
      .select({
        cellId: clientRouting.cellId,
        routingStatus: clientRouting.routingStatus,
      })
      .from(clientRouting)
      .where(eq(clientRouting.clientId, clientRecord.id))
      .limit(1);

    const activeCellId = routingRecord?.cellId ?? null;
    let activeCellCode: string | null = null;

    if (activeCellId) {
      const [cellRow] = await db
        .select({ code: cells.code })
        .from(cells)
        .where(eq(cells.id, activeCellId))
        .limit(1);
      activeCellCode = cellRow?.code ?? null;
    }

    // Consultar plan canónico
    let planName: string | null = null;
    if (clientRecord.planId) {
      const [planRow] = await db
        .select({ name: plans.name, code: plans.code })
        .from(plans)
        .where(eq(plans.id, clientRecord.planId))
        .limit(1);
      if (planRow) {
        if (typeof planRow.name === "object" && planRow.name !== null) {
          const locName = planRow.name as { es?: string; en?: string };
          planName = locName.es || locName.en || planRow.code;
        } else {
          planName = planRow.code || "Plan Pro";
        }
      }
    }

    // Consultar mapa de capacidades efectivas
    let capabilities: Record<string, boolean> = {};
    try {
      const gateRepo = new DrizzleTenantCapabilityGateRepository(() => db);
      const gateService = new TenantCapabilityGateService(gateRepo);
      capabilities = await gateService.getEffectiveCapabilities(clientRecord.id);
    } catch (capErr) {
      const capMsg = capErr instanceof Error ? capErr.message : String(capErr);
      appLogger.warn(`[resolveAuthenticatedPortalContext] Falló carga de capacidades para ${clientRecord.id}: ${capMsg}`);
    }

    const isOwner = clientRecord.ownerUserId === user.id;
    let resolvedRole = isOwner ? "tenant_owner" : "tenant_agent";
    if (!isOwner) {
      try {
        const membership = await withTenantCellTransaction(clientRecord.id, async (tx) => {
          const [m] = await tx
            .select({ role: cellTenantUsers.role, status: cellTenantUsers.status })
            .from(cellTenantUsers)
            .where(and(eq(cellTenantUsers.clientId, clientRecord.id), eq(cellTenantUsers.userId, user.id)))
            .limit(1);
          return m;
        });
        if (membership && membership.status === "active") {
          resolvedRole = membership.role || "tenant_agent";
        } else if (membership && membership.status !== "active") {
          appLogger.warn(`[resolveAuthenticatedPortalContext] Usuario ${user.id} con membresía inactiva en cliente ${clientRecord.id}`);
          return null;
        }
      } catch (err) {
        appLogger.warn(`[resolveAuthenticatedPortalContext] Verificación de membresía celular omitida por fallo de red transitorio`, { err });
      }
    }

    const portalClient: PortalContextClient = {
      id: clientRecord.id,
      slug: clientRecord.slug,
      displayName: clientRecord.displayName,
      name: clientRecord.displayName,
      lifecycleStatus: clientRecord.lifecycleStatus,
      planId: clientRecord.planId,
    };

    // Caso A: Inquilino en estado 'alta' (onboarding pendiente)
    if (clientRecord.lifecycleStatus === "alta") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "onboarding_prospect",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        activeCellCode,
        planName,
        capabilities,
        lifecycleStatus: "alta",
      };
    }

    // Caso B: Inquilino en estado 'activo' (operación completa en /workspace)
    if (clientRecord.lifecycleStatus === "activo") {
      return {
        user: portalUser,
        session: portalSession,
        scope: "tenant",
        role: resolvedRole,
        effectiveRoles: [resolvedRole],
        activeClientId: clientRecord.id,
        activeClient: portalClient,
        activeCellId,
        activeCellCode,
        planName,
        capabilities,
        lifecycleStatus: "activo",
      };
    }

    // Caso C: Otros estados operativos (ej. 'suspendido', 'bloqueado')
    return {
      user: portalUser,
      session: portalSession,
      scope: "tenant",
      role: resolvedRole,
      effectiveRoles: [resolvedRole],
      activeClientId: clientRecord.id,
      activeClient: portalClient,
      activeCellId,
      activeCellCode,
      planName,
      capabilities,
      lifecycleStatus: clientRecord.lifecycleStatus,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[resolveAuthenticatedPortalContext Failed] ${msg}`, error);
    return null;
  }
}

/**
 * Consulta de forma ligera el estado de ciclo de vida de un inquilino por su ID en el Router Global.
 */
export async function getClientLifecycleStatus(clientId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ lifecycleStatus: clients.lifecycleStatus })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row?.lifecycleStatus ?? null;
}

