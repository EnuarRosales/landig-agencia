import { sql, desc, asc, eq, and } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  clients,
  leads,
  cellHosts,
  cells,
  plans,
  users,
  clientRouting,
  clientPlans,
  subscriptions,
  emailProviderConfigs,
  emailSenders,
  emailEvents,
  emailTemplates,
  emailDeliveries,
  aiProviders,
  aiModels,
  botTones,
  botPresets,
  botDefaults,
  botPromptBlocks,
  aiAssistFields,
  aiAssistPrompts,
  referralPrograms,
  referralCodes,
  referrals,
  referralRewards,
  mediaCatalog,
  mediaVariants,
  aiUsageEvents,
  clientBrandings,
  planLimits,
  planDimensions,
  chatwootCapabilities,
  planCapabilityValues,
  PLAN_DIMENSION_KEYS,
  type PlanLimitDimensionKey,
  COMMERCIAL_CHATWOOT_CAPABILITY_CODES,
  CHATWOOT_CAPABILITY_CODES,
  chatwootCapabilityDefinitions,
  type ChatwootCapability,
  type Lead,
  type CellHost,
  type CellHostDeploymentProfile,
  type CellHostStatus,
  type Cell,
  type Plan,
  type BrandingPaletteTokens,
} from "../db/schemas";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { CANONICAL_EMAIL_SENDERS, CANONICAL_EMAIL_EVENTS } from "./notifications-and-leads.service";
import { WhiteLabelService } from "./white-label.service";
import { INITIAL_AI_PROVIDERS, INITIAL_BOT_DEFAULTS } from "./bot-catalog.seed";
import { INITIAL_PROMPT_BLOCKS } from "./prompt-blocks.seed";
import { INITIAL_AI_ASSIST_FIELDS, INITIAL_AI_ASSIST_PROMPTS } from "./ai-assist-catalog.seed";
import { createCipheriv, createDecipheriv, randomBytes, createHash, randomUUID } from "node:crypto";
import { cellSecretsCryptoService } from "./cell-secrets.service";
import { authorizeCellProvision } from "./cell-authorization.service";
import { provisionTenantChatwootAccount, syncAllAccountsForPlan } from "./chatwoot-provisioning.service";

export interface ControlPlaneMetricsDto {
  tenants: number;
  leads: number;
  cells: number;
  dbStatus: string;
}

export interface CreateAdminCellInput {
  code: string;
  hostId?: string | null;
  tier?: "standard" | "dedicated";
  topologyType?: "remote_vps" | "local_compose";
  pgbouncerHost: string;
  pgbouncerPort?: number;
  databaseName: string;
  appUrl: string;
  privateIp?: string;
  publicIp?: string;
  workingDir?: string;
  deployUser?: string;
  maxClients?: number;
  region?: string;
  /** Identificador del actor autenticado; nunca se toma del cuerpo JSON sin validar. */
  actorUserId: string;
}

/**
 * DTO de salida para listados y registro de celdas.
 * Nunca expone el ciphertext ni secretos en claro (DAT-001 §3.6.2).
 */
export type AdminCellDto = Omit<Cell, "cellSecretsCiphertext" | "cellSecretsKeyId">;

/**
 * Configuración de un límite estructurado de plan comercial (S2, S3, S4).
 * mode LIMITED exige un valor entero no negativo; UNLIMITED exige null.
 */
export interface PlanLimitConfigItem {
  mode: "LIMITED" | "UNLIMITED";
  value: number | null;
}

export type PlanLimitsConfig = Partial<Record<PlanLimitDimensionKey, PlanLimitConfigItem>>;

/**
 * Nombres amigables en español para las dimensiones canónicas de límites de plan.
 */
export const PLAN_DIMENSION_NAMES_ES: Record<PlanLimitDimensionKey, string> = {
  products: "Productos",
  images_per_product: "Imágenes por producto",
  videos_per_product: "Videos por producto",
  pdfs_per_product: "Archivos PDF por producto",
  contacts: "Contactos",
  tenant_users: "Usuarios por inquilino",
  storage_bytes: "Almacenamiento por inquilino",
  chat_retention_days: "Retención de conversaciones",
  chatwoot_agents: "Agentes de atención",
  chatwoot_inboxes: "Bandejas de entrada",
  chatwoot_outbound_emails: "Correos salientes",
};

/**
 * Detalle completo de un plan comercial con sus límites y capacidades (S1–S6).
 */
export interface AdminPlanDetails extends Plan {
  limits: Record<PlanLimitDimensionKey, PlanLimitConfigItem>;
  capabilities: Record<string, boolean>;
  chatwootEnabled: boolean;
}

export interface CreateAdminPlanInput {
  code: string;
  nameEs: string;
  nameEn?: string;
  descriptionEs?: string;
  descriptionEn?: string;
  priceMonthlyCop: number;
  priceAnnualCop?: number;
  currency?: "COP" | "USD";
  billingCycles?: ("monthly" | "annual")[];
  trialDays?: number;
  graceDays?: number;
  isPublic?: boolean;
  isPopular?: boolean;
  status?: "draft" | "active" | "retired";
  marketingFeaturesEs?: string[];
  marketingFeaturesEn?: string[];
  createdBy?: string;
  limits?: PlanLimitsConfig;
  capabilities?: Record<string, boolean>;
  chatwootEnabled?: boolean;
}

/**
 * Consulta en caliente las métricas reales del plano de control corporativo (ADM-001, DAT-001).
 * Encapsula Drizzle ORM dentro del dominio sin exponer sql ni dependencias internas a la capa UI.
 */
export async function fetchControlPlaneMetrics(): Promise<ControlPlaneMetricsDto> {
  try {
    const db = getDb();
    const [clientsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients);
    const [leadsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads);
    const [cellsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cells);

    return {
      tenants: clientsCount?.count ?? 0,
      leads: leadsCount?.count ?? 0,
      cells: cellsCount?.count ?? 0,
      dbStatus: "Operativo",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchControlPlaneMetrics Failed] ${msg}`, error);
    return {
      tenants: 0,
      leads: 0,
      cells: 0,
      dbStatus: "Error Conexión",
    };
  }
}

/**
 * Consulta la lista de prospectos reales registrados desde la landing page ordenados por fecha descendente.
 */
export async function fetchAdminLeads(limit = 100): Promise<Lead[]> {
  try {
    const db = getDb();
    return await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminLeads Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Consulta la lista de celdas de datos desplegadas en el plano de control (DAT-001 §3.3).
 * No expone el paquete de secretos cifrado ni el identificador de clave.
 */
export async function fetchAdminCells(): Promise<AdminCellDto[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: cells.id,
        code: cells.code,
        hostId: cells.hostId,
        tier: cells.tier,
        status: cells.status,
        topologyType: cells.topologyType,
        pgbouncerHost: cells.pgbouncerHost,
        pgbouncerPort: cells.pgbouncerPort,
        databaseName: cells.databaseName,
        appUrl: cells.appUrl,
        privateIp: cells.privateIp,
        publicIp: cells.publicIp,
        workingDir: cells.workingDir,
        deployUser: cells.deployUser,
        maxClients: cells.maxClients,
        currentClients: cells.currentClients,
        region: cells.region,
        healthStatus: cells.healthStatus,
        lastHealthCheckAt: cells.lastHealthCheckAt,
        createdAt: cells.createdAt,
        updatedAt: cells.updatedAt,
        createdBy: cells.createdBy,
        updatedBy: cells.updatedBy,
      })
      .from(cells)
      .orderBy(asc(cells.code));
    return rows as AdminCellDto[];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminCells Failed] ${msg}`, error);
    return [];
  }
}

function toAdminCellDto(row: Cell): AdminCellDto {
  const { cellSecretsCiphertext: _c, cellSecretsKeyId: _k, ...dto } = row;
  return dto;
}

/**
 * Registra una nueva célula de datos en el Router Global (`admin.cells`, DAT-001).
 * - Requiere autoridad de Platform Owner y permiso `cells.provision`.
 * - Genera el paquete de secretos con CSPRNG y lo cifra con AES-256-GCM.
 * - La celda se crea siempre en estado `draft`.
 * - Nunca confía en un actor o rol suministrado en JSON.
 */
export async function createAdminCell(input: CreateAdminCellInput): Promise<Result<AdminCellDto>> {
  try {
    const code = input.code.trim().toLowerCase();
    const pgbouncerHost = input.pgbouncerHost.trim();
    const databaseName = input.databaseName.trim();
    const appUrl = (input.appUrl || "").trim();

    if (!code || !pgbouncerHost || !databaseName || !appUrl) {
      return err(
        "Código, host de PgBouncer, nombre de base de datos y URL de la aplicación celular son obligatorios.",
        "VALIDATION_ERROR",
      );
    }

    const authz = await authorizeCellProvision(input.actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const db = getDb();
    const operator = input.actorUserId;
    const cellId = randomUUID();

    let hostId: string | null = null;
    if (input.hostId) {
      const [host] = await db
        .select()
        .from(cellHosts)
        .where(eq(cellHosts.id, input.hostId))
        .limit(1);

      if (!host) {
        return err(`Host de despliegue con id "${input.hostId}" no encontrado.`, "HOST_NOT_FOUND");
      }

      if (host.status !== "ready") {
        return err(
          `El host "${host.code}" está en estado "${host.status}". Solo hosts en estado "ready" pueden recibir celdas (CEL-RF-001).`,
          "HOST_NOT_READY",
        );
      }

      const topology = input.topologyType || "remote_vps";
      if (topology === "local_compose" && host.deploymentProfile !== "local_development") {
        return err(
          `Incompatibilidad de perfil: la topología "local_compose" requiere un host con perfil "local_development", pero "${host.code}" tiene "${host.deploymentProfile}" (CEL-RF-026).`,
          "PROFILE_MISMATCH",
        );
      }
      if (topology === "remote_vps" && host.deploymentProfile === "local_development") {
        return err(
          `Incompatibilidad de perfil: la topología "remote_vps" no admite hosts con perfil "local_development" (CEL-RF-026).`,
          "PROFILE_MISMATCH",
        );
      }
      hostId = host.id;
    }

    const payload = cellSecretsCryptoService.generateAndEncrypt(cellId);

    const [row] = await db
      .insert(cells)
      .values({
        id: cellId,
        code,
        hostId,
        tier: input.tier || "standard",
        topologyType: input.topologyType || "remote_vps",
        status: "draft",
        pgbouncerHost,
        pgbouncerPort: input.pgbouncerPort || 6432,
        databaseName,
        appUrl: (input.appUrl || "").trim(),
        privateIp: input.privateIp || null,
        publicIp: input.publicIp || null,
        workingDir: (input.workingDir || `/opt/${code}`).trim(),
        deployUser: input.deployUser || "deploy:1000",
        cellSecretsCiphertext: payload.ciphertext,
        cellSecretsKeyId: payload.keyId,
        maxClients: input.maxClients || 100,
        currentClients: 0,
        region: input.region || "us-east-1",
        createdBy: operator,
        updatedBy: operator,
      })
      .returning();

    if (!row) {
      return err("No se pudo registrar la célula de datos", "CELL_INSERT_FAILED");
    }
    return ok(toAdminCellDto(row));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminCell Failed] ${msg}`, error);
    return err(`Error al registrar celda: ${msg}`, "CELL_ERROR");
  }
}

/**
 * Actualiza el estado del ciclo de vida de una célula de datos (DAT-001 §3.6.1).
 */
export async function updateCellStatus(
  cellId: string,
  targetStatus: "draft" | "draining" | "maintenance" | "active",
): Promise<Result<AdminCellDto>> {
  try {
    const db = getDb();
    const [existing] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);

    if (!existing) {
      return err(`Célula de datos con id "${cellId}" no encontrada.`, "NOT_FOUND");
    }

    const [updated] = await db
      .update(cells)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(eq(cells.id, cellId))
      .returning();

    return ok(toAdminCellDto(updated));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateCellStatus Failed] ${msg}`, error);
    return err(`Error al actualizar estado de la celda: ${msg}`, "CELL_ERROR");
  }
}

export interface UpdateAdminCellInput {
  hostId?: string | null;
  tier?: "standard" | "dedicated";
  topologyType?: "remote_vps" | "local_compose";
  pgbouncerHost?: string;
  pgbouncerPort?: number;
  databaseName?: string;
  appUrl?: string;
  privateIp?: string | null;
  publicIp?: string | null;
  workingDir?: string;
  deployUser?: string;
  maxClients?: number;
  region?: string;
  status?: "draft" | "provisioning" | "verifying" | "active" | "draining" | "readonly" | "maintenance" | "error_connection";
  actorUserId?: string;
}

/**
 * Modifica los atributos de configuración de una célula de datos existente (DAT-001 §3.3).
 * Requiere autorización con permiso `cells.provision`.
 */
export async function updateAdminCell(
  cellId: string,
  input: UpdateAdminCellInput,
): Promise<Result<AdminCellDto>> {
  try {
    if (!input.actorUserId) {
      return err("Identificador de usuario actor requerido.", "UNAUTHORIZED");
    }
    const authz = await authorizeCellProvision(input.actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const db = getDb();
    const [existing] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);

    if (!existing) {
      return err(`Célula de datos con id "${cellId}" no encontrada.`, "NOT_FOUND");
    }

    if (input.maxClients !== undefined && input.maxClients < existing.currentClients) {
      return err(
        `La capacidad máxima (${input.maxClients}) no puede ser menor a los inquilinos actuales (${existing.currentClients}).`,
        "VALIDATION_ERROR",
      );
    }

    const operator = input.actorUserId || existing.updatedBy;
    const updateValues: Partial<typeof cells.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: operator,
    };

    if (input.hostId !== undefined) {
      if (input.hostId === null) {
        if (existing.status !== "draft") {
          return err("Solo una celda en estado 'draft' puede tener host_id nulo (CEL-RF-001).", "VALIDATION_ERROR");
        }
        updateValues.hostId = null;
      } else {
        const [host] = await db
          .select()
          .from(cellHosts)
          .where(eq(cellHosts.id, input.hostId))
          .limit(1);

        if (!host) {
          return err(`Host de despliegue con id "${input.hostId}" no encontrado.`, "HOST_NOT_FOUND");
        }

        if (host.status !== "ready" && host.id !== existing.hostId) {
          return err(
            `El host "${host.code}" está en estado "${host.status}". Solo hosts en estado "ready" pueden recibir celdas (CEL-RF-001).`,
            "HOST_NOT_READY",
          );
        }

        const topology = input.topologyType ?? existing.topologyType;
        if (topology === "local_compose" && host.deploymentProfile !== "local_development") {
          return err(
            `Incompatibilidad de perfil: la topología "local_compose" requiere un host con perfil "local_development", pero "${host.code}" tiene "${host.deploymentProfile}" (CEL-RF-026).`,
            "PROFILE_MISMATCH",
          );
        }
        if (topology === "remote_vps" && host.deploymentProfile === "local_development") {
          return err(
            `Incompatibilidad de perfil: la topología "remote_vps" no admite hosts con perfil "local_development" (CEL-RF-026).`,
            "PROFILE_MISMATCH",
          );
        }

        updateValues.hostId = input.hostId;
      }
    }

    if (input.tier !== undefined) updateValues.tier = input.tier;
    if (input.topologyType !== undefined) updateValues.topologyType = input.topologyType;
    if (input.pgbouncerHost !== undefined) updateValues.pgbouncerHost = input.pgbouncerHost.trim();
    if (input.pgbouncerPort !== undefined) updateValues.pgbouncerPort = input.pgbouncerPort;
    if (input.databaseName !== undefined) updateValues.databaseName = input.databaseName.trim();
    if (input.appUrl !== undefined) updateValues.appUrl = input.appUrl.trim();
    if (input.privateIp !== undefined) updateValues.privateIp = input.privateIp ? input.privateIp.trim() : null;
    if (input.publicIp !== undefined) updateValues.publicIp = input.publicIp ? input.publicIp.trim() : null;
    if (input.workingDir !== undefined) updateValues.workingDir = input.workingDir.trim();
    if (input.deployUser !== undefined) updateValues.deployUser = input.deployUser.trim();
    if (input.maxClients !== undefined) updateValues.maxClients = input.maxClients;
    if (input.region !== undefined) updateValues.region = input.region.trim();
    if (input.status !== undefined) updateValues.status = input.status;

    const [updated] = await db
      .update(cells)
      .set(updateValues)
      .where(eq(cells.id, cellId))
      .returning();

    if (!updated) {
      return err("No se pudo actualizar la célula de datos.", "CELL_UPDATE_FAILED");
    }

    return ok(toAdminCellDto(updated));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminCell Failed] ${msg}`, error);
    return err(`Error al modificar la celda: ${msg}`, "CELL_ERROR");
  }
}

/**
 * Elimina de forma segura una célula de datos si no tiene inquilinos asignados (DAT-001 §3.3).
 * Requiere autorización con permiso `cells.provision`.
 */
export async function deleteAdminCell(
  cellId: string,
  actorUserId?: string,
): Promise<Result<{ success: boolean; code: string }>> {
  try {
    if (!actorUserId) {
      return err("Identificador de usuario actor requerido.", "UNAUTHORIZED");
    }
    const authz = await authorizeCellProvision(actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const db = getDb();
    const [existing] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);

    if (!existing) {
      return err(`Célula de datos con id "${cellId}" no encontrada.`, "NOT_FOUND");
    }

    if (existing.currentClients > 0) {
      return err(
        `No es posible eliminar la célula "${existing.code}" porque tiene ${existing.currentClients} inquilino(s) activo(s). Drene o migre los inquilinos primero.`,
        "CELL_HAS_CLIENTS",
      );
    }

    // Validar integridad referencial en client_routing
    const routingRefs = await db
      .select({ id: clientRouting.id })
      .from(clientRouting)
      .where(eq(clientRouting.cellId, cellId))
      .limit(1);

    if (routingRefs.length > 0) {
      return err(
        `No es posible eliminar la célula "${existing.code}" porque tiene rutas registradas en el Router Global.`,
        "CELL_HAS_ROUTING_REFS",
      );
    }

    await db.delete(cells).where(eq(cells.id, cellId));

    return ok({ success: true, code: existing.code });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[deleteAdminCell Failed] ${msg}`, error);
    return err(`Error al eliminar la célula: ${msg}`, "CELL_ERROR");
  }
}

/**
 * DTO para la visualización y gestión de hosts de celdas en el Plano de Control (CEL-RF-001, DAT-001 §3.3).
 */
export interface CellHostDto {
  id: string;
  code: string;
  deploymentProfile: CellHostDeploymentProfile;
  status: CellHostStatus;
  connectivityConfigRef: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

/**
 * Parámetros para el registro de un nuevo host en el Plano de Control.
 */
export interface CreateCellHostInput {
  code: string;
  deploymentProfile: CellHostDeploymentProfile;
  status?: CellHostStatus;
  connectivityConfigRef: string;
  actorUserId: string;
}

/**
 * Parámetros para la actualización de un host existente.
 */
export interface UpdateCellHostInput {
  status?: CellHostStatus;
  connectivityConfigRef?: string;
  actorUserId: string;
}

/**
 * Consulta la lista de hosts registrados en el Plano de Control (CEL-RF-001).
 *
 * @returns Lista ordenada de hosts según su código.
 */
export async function fetchAdminCellHosts(): Promise<CellHostDto[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: cellHosts.id,
        code: cellHosts.code,
        deploymentProfile: cellHosts.deploymentProfile,
        status: cellHosts.status,
        connectivityConfigRef: cellHosts.connectivityConfigRef,
        createdAt: cellHosts.createdAt,
        updatedAt: cellHosts.updatedAt,
        createdBy: cellHosts.createdBy,
        updatedBy: cellHosts.updatedBy,
      })
      .from(cellHosts)
      .orderBy(asc(cellHosts.code));
    return rows;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminCellHosts Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Registra un nuevo host en el Plano de Control para el placement explícito de celdas (CEL-RF-001).
 *
 * Requiere autorización con permiso `cells.provision`.
 *
 * @param input - Datos validados del host y usuario operador.
 * @returns Registro del host creado o error de validación/autorización.
 */
export async function createAdminCellHost(input: CreateCellHostInput): Promise<Result<CellHostDto>> {
  try {
    if (!input.actorUserId) {
      return err("Identificador de usuario actor requerido.", "UNAUTHORIZED");
    }
    const authz = await authorizeCellProvision(input.actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const code = input.code.trim().toLowerCase();
    const connectivityConfigRef = input.connectivityConfigRef.trim();
    if (!code || !connectivityConfigRef) {
      return err("Código y referencia de configuración de conectividad son obligatorios.", "VALIDATION_ERROR");
    }

    const validProfiles: CellHostDeploymentProfile[] = ["local_development", "control_plane_vps", "external_vps"];
    if (!validProfiles.includes(input.deploymentProfile)) {
      return err(`Perfil de despliegue "${input.deploymentProfile}" no válido.`, "VALIDATION_ERROR");
    }

    const status = input.status ?? "ready";
    const validStatuses: CellHostStatus[] = ["ready", "maintenance", "disabled"];
    if (!validStatuses.includes(status)) {
      return err(`Estado de host "${status}" no válido.`, "VALIDATION_ERROR");
    }

    const db = getDb();
    const hostId = randomUUID();
    const [row] = await db
      .insert(cellHosts)
      .values({
        id: hostId,
        code,
        deploymentProfile: input.deploymentProfile,
        status,
        connectivityConfigRef,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      })
      .returning();

    if (!row) {
      return err("No se pudo crear el registro del host.", "HOST_CREATE_FAILED");
    }

    return ok(row);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminCellHost Failed] ${msg}`, error);
    if (msg.includes("unique") || msg.includes("duplicate key")) {
      return err(`Ya existe un host registrado con el código "${input.code}".`, "DUPLICATE_CODE");
    }
    return err(`Error al registrar host: ${msg}`, "HOST_ERROR");
  }
}

/**
 * Modifica el estado o referencia de conectividad de un host existente (CEL-RF-001).
 *
 * La transición a `ready` es una declaración manual y auditada del operador tras preflight de capacidad.
 *
 * @param hostId - Identificador UUID del host.
 * @param input - Datos de actualización y usuario operador.
 * @returns Registro actualizado del host.
 */
export async function updateAdminCellHost(
  hostId: string,
  input: UpdateCellHostInput,
): Promise<Result<CellHostDto>> {
  try {
    if (!input.actorUserId) {
      return err("Identificador de usuario actor requerido.", "UNAUTHORIZED");
    }
    const authz = await authorizeCellProvision(input.actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const db = getDb();
    const [existing] = await db.select().from(cellHosts).where(eq(cellHosts.id, hostId)).limit(1);
    if (!existing) {
      return err(`Host con id "${hostId}" no encontrado.`, "NOT_FOUND");
    }

    const updateValues: Partial<typeof cellHosts.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: input.actorUserId,
    };

    if (input.status !== undefined) {
      const validStatuses: CellHostStatus[] = ["ready", "maintenance", "disabled"];
      if (!validStatuses.includes(input.status)) {
        return err(`Estado de host "${input.status}" no válido.`, "VALIDATION_ERROR");
      }
      updateValues.status = input.status;
    }

    if (input.connectivityConfigRef !== undefined) {
      const ref = input.connectivityConfigRef.trim();
      if (!ref) {
        return err("La referencia de conectividad no puede estar vacía.", "VALIDATION_ERROR");
      }
      updateValues.connectivityConfigRef = ref;
    }

    const [updated] = await db
      .update(cellHosts)
      .set(updateValues)
      .where(eq(cellHosts.id, hostId))
      .returning();

    if (!updated) {
      return err("No se pudo actualizar el host.", "HOST_UPDATE_FAILED");
    }

    return ok(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminCellHost Failed] ${msg}`, error);
    return err(`Error al actualizar host: ${msg}`, "HOST_ERROR");
  }
}

/**
 * Elimina un host si no tiene celdas de datos asignadas (CEL-RF-001).
 *
 * @param hostId - Identificador UUID del host.
 * @param actorUserId - Identificador del operador autorizado.
 * @returns Confirmación con el id del host eliminado.
 */
export async function deleteAdminCellHost(
  hostId: string,
  actorUserId: string,
): Promise<Result<{ id: string }>> {
  try {
    if (!actorUserId) {
      return err("Identificador de usuario actor requerido.", "UNAUTHORIZED");
    }
    const authz = await authorizeCellProvision(actorUserId);
    if (!authz.ok) {
      return err(authz.error, "FORBIDDEN");
    }

    const db = getDb();
    const [existing] = await db.select().from(cellHosts).where(eq(cellHosts.id, hostId)).limit(1);
    if (!existing) {
      return err(`Host con id "${hostId}" no encontrado.`, "NOT_FOUND");
    }

    const assignedCells = await db.select({ id: cells.id }).from(cells).where(eq(cells.hostId, hostId)).limit(1);
    if (assignedCells.length > 0) {
      return err("No se puede eliminar el host porque tiene celdas de datos asignadas.", "HOST_HAS_CELLS");
    }

    await db.delete(cellHosts).where(eq(cellHosts.id, hostId));
    return ok({ id: hostId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[deleteAdminCellHost Failed] ${msg}`, error);
    return err(`Error al eliminar host: ${msg}`, "HOST_ERROR");
  }
}

export interface AdminPlanWithMetrics extends Plan {
  activeTenantsCount: number;
}

export interface UpdateAdminPlanInput {
  id: string;
  nameEs: string;
  nameEn?: string;
  descriptionEs?: string;
  descriptionEn?: string;
  priceMonthlyCop: number;
  priceAnnualCop?: number;
  currency?: "COP" | "USD";
  billingCycles?: ("monthly" | "annual")[];
  trialDays?: number;
  graceDays?: number;
  isPublic?: boolean;
  isPopular?: boolean;
  status?: "draft" | "active" | "retired";
  marketingFeaturesEs?: string[];
  marketingFeaturesEn?: string[];
  updatedBy?: string;
  limits?: PlanLimitsConfig;
  capabilities?: Record<string, boolean>;
  chatwootEnabled?: boolean;
}

export interface DeleteAdminPlanResult {
  action: "deleted" | "retired";
  planId: string;
  planCode: string;
  activeReferencesCount: number;
}

/**
 * Consulta el catálogo completo de planes comerciales y privados para administración (ADM-001, DAT-001).
 * Incluye el conteo de inquilinos asignados a cada plan para auditar dependencias.
 */
export async function fetchAdminPlans(): Promise<AdminPlanWithMetrics[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        plan: plans,
        clientsCount: sql<number>`count(${clients.id})::int`,
      })
      .from(plans)
      .leftJoin(clients, eq(clients.planId, plans.id))
      .groupBy(plans.id)
      .orderBy(asc(plans.sortOrder), asc(plans.code));

    return rows.map((r) => ({
      ...r.plan,
      activeTenantsCount: r.clientsCount ?? 0,
    }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminPlans Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Valida la configuración estructurada de límites de un plan comercial (S2, S3, S4, S10).
 */
export function validatePlanLimits(
  limits?: PlanLimitsConfig,
  chatwootEnabled: boolean = false,
): Result<void> {
  if (!limits) return ok(undefined);

  for (const [dimKey, item] of Object.entries(limits)) {
    const key = dimKey as PlanLimitDimensionKey;
    const name = PLAN_DIMENSION_NAMES_ES[key] || key;
    if (!item || !item.mode) {
      return err(
        `Configuración incompleta para ${name}, no equivale a ilimitado.`,
        "INVALID_LIMIT_CONFIG",
      );
    }
    if (item.mode !== "LIMITED" && item.mode !== "UNLIMITED") {
      return err(
        `Modo inválido para ${name}: debe ser LIMITED o UNLIMITED.`,
        "INVALID_LIMIT_MODE",
      );
    }
    if (item.mode === "LIMITED") {
      if (item.value === null || item.value === undefined) {
        return err(
          `Ingresa la cantidad permitida para ${name} o selecciona Ilimitado.`,
          "LIMIT_VALUE_REQUIRED",
        );
      }
      if (typeof item.value !== "number" || Number.isNaN(item.value)) {
        return err(
          `La cantidad de ${name} debe ser un número entero.`,
          "INVALID_LIMIT_NUMBER",
        );
      }
      if (item.value < 0) {
        return err(
          `La cantidad de ${name} debe ser mayor o igual a cero.`,
          "NEGATIVE_LIMIT_VALUE",
        );
      }
      if (!Number.isInteger(item.value)) {
        return err(
          `La cantidad de ${name} debe ser un número entero.`,
          "DECIMAL_LIMIT_VALUE",
        );
      }
    } else if (item.mode === "UNLIMITED") {
      if (item.value !== null && item.value !== undefined) {
        return err(
          `Revisa la configuración de ${name}: un límite ilimitado no debe tener una cantidad.`,
          "UNLIMITED_WITH_VALUE",
        );
      }
    }
  }

  // Validación de piso legal para retención de conversaciones (mínimo 30 días si es limitado, ADM-001 RF-04.5)
  const retentionLimit = limits.chat_retention_days;
  if (
    retentionLimit?.mode === "LIMITED" &&
    typeof retentionLimit.value === "number" &&
    retentionLimit.value < 30
  ) {
    return err(
      "La retención de conversaciones debe ser de al menos 30 días conforme a la normativa legal.",
      "CHAT_RETENTION_BELOW_LEGAL_FLOOR",
    );
  }

  // Validación cruzada S4: el límite de agentes no podrá superar el de usuarios cuando ambos sean finitos
  const agentsLimit = limits.chatwoot_agents;
  const usersLimit = limits.tenant_users;
  if (
    agentsLimit?.mode === "LIMITED" &&
    usersLimit?.mode === "LIMITED" &&
    typeof agentsLimit.value === "number" &&
    typeof usersLimit.value === "number" &&
    agentsLimit.value > usersLimit.value
  ) {
    return err(
      "El límite de agentes no podrá superar el de usuarios cuando ambos sean finitos.",
      "AGENTS_EXCEED_USERS",
    );
  }

  return ok(undefined);
}

/**
 * Valida la habilitación de capacidades opcionales contra el catálogo v4.19.1 y restricciones (S5, S10).
 */
export function validatePlanCapabilities(
  capabilities?: Record<string, boolean>,
): Result<void> {
  if (!capabilities) return ok(undefined);

  for (const [code, enabled] of Object.entries(capabilities)) {
    if (!enabled) continue;
    if (!(CHATWOOT_CAPABILITY_CODES as readonly string[]).includes(code)) {
      return err(
        `La capacidad ${code} no está disponible en la edición o versión instalada.`,
        "CAPABILITY_UNSUPPORTED",
      );
    }
    if (code === "captain_classifier") {
      return err(
        "La capacidad Captain Classifier no está disponible en la edición o versión instalada.",
        "CAPABILITY_CAPTAIN_CLASSIFIER_DISABLED",
      );
    }
    if (code === "chatwoot_v4") {
      return err(
        "Chatwoot V4 es una configuración técnica de la instalación, no un beneficio comercial del plan.",
        "CAPABILITY_CHATWOOT_V4_TECHNICAL",
      );
    }
    if (code === "captain_tasks") {
      return err(
        "La capacidad Captain Tasks permanece pendiente de validación funcional en Community.",
        "CAPABILITY_CAPTAIN_TASKS_UNVALIDATED",
      );
    }
    if (!(COMMERCIAL_CHATWOOT_CAPABILITY_CODES as readonly string[]).includes(code)) {
      return err(
        `La capacidad ${code} no está disponible comercialmente en esta versión.`,
        "CAPABILITY_NON_COMMERCIAL",
      );
    }
  }

  return ok(undefined);
}

/**
 * Registra o actualiza un plan comercial o plan VIP privado (`admin.plans`)
 * junto con sus límites estructurados y capacidades opcionales (S1–S6).
 */
export async function createAdminPlan(input: CreateAdminPlanInput): Promise<Result<Plan>> {
  try {
    const limitsValidation = validatePlanLimits(input.limits, input.chatwootEnabled);
    if (!limitsValidation.ok) {
      return limitsValidation;
    }

    const capsValidation = validatePlanCapabilities(input.capabilities);
    if (!capsValidation.ok) {
      return capsValidation;
    }

    const db = getDb();
    const operator = input.createdBy || "01a19874-1077-744c-8514-d4c990cd7259";
    const priceMonthlyCents = Math.round(input.priceMonthlyCop * 100);
    const priceAnnualCents = input.priceAnnualCop
      ? Math.round(input.priceAnnualCop * 100)
      : priceMonthlyCents * 10;

    const txResult = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(plans)
        .values({
          code: input.code.trim().toLowerCase(),
          name: {
            es: input.nameEs.trim(),
            en: input.nameEn?.trim() || input.nameEs.trim(),
          },
          description: {
            es: input.descriptionEs?.trim() || "",
            en: input.descriptionEn?.trim() || input.descriptionEs?.trim() || "",
          },
          status: input.status || "active",
          isPublic: input.isPublic ?? false,
          isPopular: input.isPopular ?? false,
          sortOrder: 10,
          trialDays: input.trialDays ?? 14,
          graceDays: input.graceDays ?? 7,
          billingCycles: input.billingCycles || ["monthly", "annual"],
          priceMonthlyCents,
          priceAnnualCents,
          currency: input.currency || "COP",
          marketingFeatures: {
            es: input.marketingFeaturesEs || [],
            en:
              input.marketingFeaturesEn && input.marketingFeaturesEn.length > 0
                ? input.marketingFeaturesEn
                : input.marketingFeaturesEs || [],
          },
          createdBy: operator,
          updatedBy: operator,
        })
        .returning();

      if (!row) {
        throw new Error("No se pudo registrar el plan comercial");
      }

      // Persistir límites del plan (S2, S3, S4)
      for (const dim of PLAN_DIMENSION_KEYS) {
        const item = input.limits?.[dim];
        const mode = item?.mode || "LIMITED";
        const value = mode === "UNLIMITED" ? null : (item?.value ?? 0);

        await tx.insert(planLimits).values({
          planId: row.id,
          dimension: dim,
          mode,
          value,
          createdBy: operator,
          updatedBy: operator,
        });
      }

      // Persistir capacidades de Chatwoot v4.19.1 (S5) - Deshabilitadas por defecto
      for (const def of chatwootCapabilityDefinitions) {
        const enabled = Boolean(input.capabilities?.[def.code] ?? false);
        await tx.insert(planCapabilityValues).values({
          planId: row.id,
          capabilityCode: def.code,
          enabled,
          createdBy: operator,
          updatedBy: operator,
        });
      }

      return ok(row);
    });

    return txResult;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminPlan Failed] ${msg}`, error);
    return err(`Error al registrar plan: ${msg}`, "PLAN_ERROR");
  }
}

/**
 * Actualiza los parámetros comerciales de un plan existente (`admin.plans`).
 * El código slug se preserva inmutable para proteger contratos y enlaces públicos (S1).
 * Actualiza límites y capacidades según se suministren (S2–S5).
 */
export async function updateAdminPlan(input: UpdateAdminPlanInput): Promise<Result<Plan>> {
  try {
    if (input.limits) {
      const limitsValidation = validatePlanLimits(input.limits, input.chatwootEnabled);
      if (!limitsValidation.ok) {
        return limitsValidation;
      }
    }

    if (input.capabilities) {
      const capsValidation = validatePlanCapabilities(input.capabilities);
      if (!capsValidation.ok) {
        return capsValidation;
      }
    }

    const db = getDb();
    const operator = input.updatedBy || "01a19874-1077-744c-8514-d4c990cd7259";
    const priceMonthlyCents = Math.round(input.priceMonthlyCop * 100);
    const priceAnnualCents = input.priceAnnualCop
      ? Math.round(input.priceAnnualCop * 100)
      : priceMonthlyCents * 10;

    const txResult = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(plans)
        .set({
          name: {
            es: input.nameEs.trim(),
            en: input.nameEn?.trim() || input.nameEs.trim(),
          },
          description: {
            es: input.descriptionEs?.trim() || "",
            en: input.descriptionEn?.trim() || input.descriptionEs?.trim() || "",
          },
          status: input.status || "active",
          isPublic: input.isPublic ?? false,
          isPopular: input.isPopular ?? false,
          trialDays: input.trialDays ?? 14,
          graceDays: input.graceDays ?? 7,
          billingCycles: input.billingCycles || ["monthly", "annual"],
          priceMonthlyCents,
          priceAnnualCents,
          currency: input.currency || "COP",
          marketingFeatures: {
            es: input.marketingFeaturesEs || [],
            en:
              input.marketingFeaturesEn && input.marketingFeaturesEn.length > 0
                ? input.marketingFeaturesEn
                : input.marketingFeaturesEs || [],
          },
          updatedAt: new Date(),
          updatedBy: operator,
        })
        .where(eq(plans.id, input.id))
        .returning();

      if (!row) {
        return err("No se encontró el plan especificado para actualizar", "PLAN_NOT_FOUND");
      }

      // Upsert de límites si se incluyeron
      if (input.limits) {
        for (const [dimKey, item] of Object.entries(input.limits)) {
          if (!item) continue;
          const dim = dimKey as PlanLimitDimensionKey;
          const mode = item.mode;
          const value = mode === "UNLIMITED" ? null : item.value;

          await tx
            .insert(planLimits)
            .values({
              planId: row.id,
              dimension: dim,
              mode,
              value,
              createdBy: operator,
              updatedBy: operator,
            })
            .onConflictDoUpdate({
              target: [planLimits.planId, planLimits.dimension],
              set: {
                mode,
                value,
                updatedAt: new Date(),
                updatedBy: operator,
              },
            });
        }
      }

      // Upsert de capacidades si se incluyeron
      if (input.capabilities) {
        for (const [code, enabled] of Object.entries(input.capabilities)) {
          await tx
            .insert(planCapabilityValues)
            .values({
              planId: row.id,
              capabilityCode: code,
              enabled: Boolean(enabled),
              createdBy: operator,
              updatedBy: operator,
            })
            .onConflictDoUpdate({
              target: [planCapabilityValues.planId, planCapabilityValues.capabilityCode],
              set: {
                enabled: Boolean(enabled),
                updatedAt: new Date(),
                updatedBy: operator,
              },
            });
        }
      }

      return ok(row);
    });

    if (txResult.ok && input.chatwootEnabled) {
      try {
        await syncAllAccountsForPlan({
          planId: txResult.data.id,
          actor: operator,
          db,
        });
      } catch (syncErr: unknown) {
        appLogger.warn("[updateAdminPlan] Error al sincronizar cuentas de Chatwoot", {
          planId: txResult.data.id,
          error: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    return txResult;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminPlan Failed] ${msg}`, error);
    return err(`Error al actualizar plan: ${msg}`, "PLAN_UPDATE_ERROR");
  }
}

/**
 * Consulta el detalle integral de un plan con sus límites estructurados y capacidades (S1–S6).
 */
export async function fetchAdminPlanDetails(planId: string): Promise<Result<AdminPlanDetails>> {
  try {
    const db = getDb();
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) {
      return err("El plan comercial especificado no existe", "PLAN_NOT_FOUND");
    }

    const limitsRows = await db
      .select()
      .from(planLimits)
      .where(eq(planLimits.planId, planId));

    const capRows = await db
      .select()
      .from(planCapabilityValues)
      .where(eq(planCapabilityValues.planId, planId));

    const limitsMap: Record<PlanLimitDimensionKey, PlanLimitConfigItem> = {
      products: { mode: "LIMITED", value: 0 },
      images_per_product: { mode: "LIMITED", value: 0 },
      videos_per_product: { mode: "LIMITED", value: 0 },
      pdfs_per_product: { mode: "LIMITED", value: 0 },
      contacts: { mode: "LIMITED", value: 0 },
      tenant_users: { mode: "LIMITED", value: 0 },
      storage_bytes: { mode: "LIMITED", value: 0 },
      chat_retention_days: { mode: "LIMITED", value: 30 },
      chatwoot_agents: { mode: "LIMITED", value: 0 },
      chatwoot_inboxes: { mode: "LIMITED", value: 0 },
      chatwoot_outbound_emails: { mode: "LIMITED", value: 0 },
    };

    for (const r of limitsRows) {
      if (r.dimension in limitsMap) {
        limitsMap[r.dimension as PlanLimitDimensionKey] = {
          mode: r.mode as "LIMITED" | "UNLIMITED",
          value: r.value !== null ? Number(r.value) : null,
        };
      }
    }

    const capabilitiesMap: Record<string, boolean> = {};
    for (const def of chatwootCapabilityDefinitions) {
      capabilitiesMap[def.code] = false;
    }
    for (const c of capRows) {
      capabilitiesMap[c.capabilityCode] = c.enabled;
    }

    const hasChatwootLimits =
      limitsMap.chatwoot_agents.mode === "UNLIMITED" ||
      (limitsMap.chatwoot_agents.value ?? 0) > 0 ||
      limitsMap.chatwoot_inboxes.mode === "UNLIMITED" ||
      (limitsMap.chatwoot_inboxes.value ?? 0) > 0;

    const hasAnyActiveCap = Object.values(capabilitiesMap).some(Boolean);
    const chatwootEnabled = hasChatwootLimits || hasAnyActiveCap;

    return ok({
      ...plan,
      limits: limitsMap,
      capabilities: capabilitiesMap,
      chatwootEnabled,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminPlanDetails Failed] ${msg}`, error, { planId });
    return err(`Error al consultar detalle del plan: ${msg}`, "PLAN_DETAILS_ERROR");
  }
}

/**
 * Consulta el catálogo canónico de capacidades de Chatwoot Community v4.19.1 (`admin.chatwoot_capabilities`).
 */
export async function fetchChatwootCapabilitiesCatalog(): Promise<ChatwootCapability[]> {
  try {
    const db = getDb();
    return await db.select().from(chatwootCapabilities).orderBy(asc(chatwootCapabilities.code));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchChatwootCapabilitiesCatalog Failed] ${msg}`, error);
    return [];
  }
}

/**
 * Elimina o retira un plan comercial aplicando la política híbrida de integridad referencial.
 * - Si no tiene inquilinos ni suscripciones vinculadas: HARD DELETE físico.
 * - Si tiene inquilinos vinculados: SOFT DELETE pasando el estado a 'retired' y ocultándolo de la venta pública.
 */
export async function deleteAdminPlan(planId: string, operator?: string): Promise<Result<DeleteAdminPlanResult>> {
  try {
    const db = getDb();
    const op = operator || "01a19874-1077-744c-8514-d4c990cd7259";

    const [existing] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!existing) {
      return err("El plan especificado no existe", "PLAN_NOT_FOUND");
    }

    const [clientCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.planId, planId));

    const [subCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.planId, planId));

    const activeReferencesCount = (clientCountRow?.count ?? 0) + (subCountRow?.count ?? 0);

    if (activeReferencesCount > 0) {
      await db
        .update(plans)
        .set({
          status: "retired",
          isPublic: false,
          updatedAt: new Date(),
          updatedBy: op,
        })
        .where(eq(plans.id, planId));

      return ok({
        action: "retired",
        planId: existing.id,
        planCode: existing.code,
        activeReferencesCount,
      });
    } else {
      await db.delete(plans).where(eq(plans.id, planId));

      return ok({
        action: "deleted",
        planId: existing.id,
        planCode: existing.code,
        activeReferencesCount: 0,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[deleteAdminPlan Failed] ${msg}`, error);
    return err(`Error al eliminar o retirar plan: ${msg}`, "PLAN_DELETE_ERROR");
  }
}

export interface TenantSubscriptionDto {
  [key: string]: unknown;
  id: string;
  clientName: string;
  clientSlug: string;
  contactEmail: string;
  planCode: string;
  planName: string;
  status: string;
  cycle: string;
  priceCop: number;
  priceFormatted: string;
  gateway: string;
  renewalDate: string;
  createdAt: string;
}

export interface PlanBreakdownDto {
  code: string;
  name: string;
  priceCop: number;
  priceFormatted: string;
  subscribersCount: number;
  totalMrrCop: number;
  totalMrrFormatted: string;
}

export interface AdminSubscriptionsOverviewDto {
  kpis: {
    totalSubscribers: number;
    activeSubscribers: number;
    trialSubscribers: number;
    pastDueSubscribers: number;
    totalMrrCop: number;
    totalMrrFormatted: string;
    projectedArrFormatted: string;
  };
  planBreakdown: PlanBreakdownDto[];
  tenants: TenantSubscriptionDto[];
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Consulta en caliente el resumen de inquilinos suscritos por plan para la supervisión
 * comercial del Platform Owner (BILL-001, ADM-001). Cero datos semilla en código duro.
 */
export async function fetchAdminSubscriptionsOverview(): Promise<AdminSubscriptionsOverviewDto> {
  try {
    const db = getDb();
    const allPlans = await db
      .select()
      .from(plans)
      .orderBy(asc(plans.sortOrder), asc(plans.code));

    const clientRows = await db
      .select({
        clientId: clients.id,
        displayName: clients.displayName,
        slug: clients.slug,
        contactEmail: clients.contactEmail,
        lifecycleStatus: clients.lifecycleStatus,
        createdAt: clients.createdAt,
        planId: plans.id,
        planCode: plans.code,
        planNameJson: plans.name,
        priceMonthlyCents: plans.priceMonthlyCents,
        priceAnnualCents: plans.priceAnnualCents,
        subscriptionStatus: subscriptions.status,
        subscriptionCycle: subscriptions.cycle,
        gateway: subscriptions.gateway,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id))
      .leftJoin(subscriptions, eq(clients.id, subscriptions.clientId))
      .orderBy(desc(clients.createdAt));

    let activeCount = 0;
    let trialCount = 0;
    let pastDueCount = 0;
    let totalMrrCop = 0;

    const planCountMap = new Map<string, number>();
    const planMrrMap = new Map<string, number>();

    const tenants: TenantSubscriptionDto[] = clientRows.map((r) => {
      const priceMonthlyCop = Math.round(Number(r.priceMonthlyCents) / 100);
      const isAnnual = r.subscriptionCycle === "annual";
      const feeCop = isAnnual
        ? Math.round(Number(r.priceAnnualCents) / 100)
        : priceMonthlyCop;

      const subStatus =
        r.subscriptionStatus ||
        (r.lifecycleStatus === "alta" ? "trialing" : "active");

      if (subStatus === "active") activeCount++;
      else if (subStatus === "trialing") trialCount++;
      else if (subStatus === "past_due") pastDueCount++;

      if (subStatus === "active" || subStatus === "trialing") {
        totalMrrCop += priceMonthlyCop;
        planCountMap.set(r.planCode, (planCountMap.get(r.planCode) || 0) + 1);
        planMrrMap.set(
          r.planCode,
          (planMrrMap.get(r.planCode) || 0) + priceMonthlyCop,
        );
      }

      const planNameObj = r.planNameJson as { es?: string; en?: string } | null;
      const planName = planNameObj?.es || r.planCode;

      return {
        id: r.clientId,
        clientName: r.displayName,
        clientSlug: r.slug,
        contactEmail: r.contactEmail,
        planCode: r.planCode,
        planName,
        status: subStatus,
        cycle: isAnnual ? "Anual" : "Mensual",
        priceCop: feeCop,
        priceFormatted: formatCop(feeCop),
        gateway: r.gateway ? r.gateway.toUpperCase() : "Wompi / Directo",
        renewalDate: r.currentPeriodEnd
          ? new Date(r.currentPeriodEnd).toISOString().split("T")[0]
          : "En Proceso",
        createdAt: r.createdAt
          ? new Date(r.createdAt).toISOString().split("T")[0]
          : "—",
      };
    });

    const planBreakdown: PlanBreakdownDto[] = allPlans.map((p) => {
      const priceMonthlyCop = Math.round(Number(p.priceMonthlyCents) / 100);
      const subscribersCount = planCountMap.get(p.code) || 0;
      const mrrCop = planMrrMap.get(p.code) || 0;
      const pNameObj = p.name as { es?: string; en?: string } | null;
      return {
        code: p.code,
        name: pNameObj?.es || p.code,
        priceCop: priceMonthlyCop,
        priceFormatted: formatCop(priceMonthlyCop),
        subscribersCount,
        totalMrrCop: mrrCop,
        totalMrrFormatted: formatCop(mrrCop),
      };
    });

    return {
      kpis: {
        totalSubscribers: clientRows.length,
        activeSubscribers: activeCount,
        trialSubscribers: trialCount,
        pastDueSubscribers: pastDueCount,
        totalMrrCop,
        totalMrrFormatted: formatCop(totalMrrCop),
        projectedArrFormatted: formatCop(totalMrrCop * 12),
      },
      planBreakdown,
      tenants,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminSubscriptionsOverview Failed] ${msg}`, error);
    return {
      kpis: {
        totalSubscribers: 0,
        activeSubscribers: 0,
        trialSubscribers: 0,
        pastDueSubscribers: 0,
        totalMrrCop: 0,
        totalMrrFormatted: "$0 COP",
        projectedArrFormatted: "$0 COP",
      },
      planBreakdown: [],
      tenants: [],
    };
  }
}

export interface AdminEmailSettingsDto {
  provider: {
    id: string;
    name: string;
    driver: string;
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    hasPassword: boolean;
    maskedSecret: string;
    status: string;
  } | null;
  senders: Array<{
    id: string;
    key: string;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    providerId: string;
    providerName: string;
    isDefault: boolean;
    status: string;
  }>;
  events: Array<{
    id: string;
    key: string;
    category: string;
    description: string;
    variablesSchema: string[];
    defaultSenderKey: string | null;
    isEnabled: boolean;
    isSystem: boolean;
  }>;
  templates: Array<{
    id: string;
    eventKey: string;
    locale: string;
    senderId: string | null;
    senderName?: string;
    senderEmail?: string;
    subject: string;
    bodyHtml: string;
    version: number;
    status: string;
    isLocked: boolean;
  }>;
}

export interface SaveAdminSmtpProviderInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  secure?: boolean;
  username?: string;
  password?: string;
  status?: "active" | "disabled";
  createdBy?: string;
}

export interface SaveAdminEmailSenderInput {
  id?: string;
  key: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  providerId: string;
  isDefault?: boolean;
  status?: "active" | "disabled";
  createdBy?: string;
}

export interface SaveAdminEmailTemplateInput {
  id?: string;
  eventKey: string;
  locale?: string;
  senderId: string;
  subject: string;
  bodyHtml: string;
  status?: "draft" | "published" | "archived";
  createdBy?: string;
}

function encryptSmtpSecret(providerName: string, plainSecret: string): { ciphertext: Buffer; keyId: string } {
  const masterKey = createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || process.env.CHATWOOT_SSO_SECRET || "mocter-saas-platform-secure-key-32b")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  cipher.setAAD(Buffer.from("smtp_provider:k1", "utf8"));
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([iv, tag, encrypted]),
    keyId: "k1",
  };
}

function decryptSmtpSecret(providerName: string, ciphertext: Buffer, keyId: string): string {
  const masterKey = createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || process.env.CHATWOOT_SSO_SECRET || "mocter-saas-platform-secure-key-32b")
    .digest();
  const iv = ciphertext.subarray(0, 12);
  const tag = ciphertext.subarray(12, 28);
  const enc = ciphertext.subarray(28);
  const aads = [
    Buffer.from("smtp_provider:k1", "utf8"),
    Buffer.from(`smtp_provider:${providerName}:k1`, "utf8"),
    Buffer.from(`smtp_provider:${providerName}:${keyId}`, "utf8"),
  ];
  for (const aad of aads) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    } catch {
      // try next
    }
  }
  throw new Error("No se pudo descifrar la contraseña SMTP");
}

export interface ActiveSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/**
 * Obtiene la configuración SMTP activa desde la base de datos (admin.email_provider_configs).
 * No usa variables de entorno para host/user/password.
 */
export async function processPendingEmailDeliveries(limit: number = 50): Promise<{ processed: number; sent: number; failed: number }> {
  const db = getDb();
  const cfg = await getActiveSmtpConfig();
  if (!cfg || !cfg.host || !cfg.user) {
    return { processed: 0, sent: 0, failed: 0 };
  }
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure || cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
  });

  const pending = await db
    .select()
    .from(emailDeliveries)
    .where(
      // status in queued/published/failed and attempts < 3
      sql`${emailDeliveries.status} IN ('queued','published','failed') AND ${emailDeliveries.attempts} < 3`
    )
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const d of pending) {
    try {
      await db.update(emailDeliveries).set({ status: "sending", attempts: d.attempts + 1 }).where(eq(emailDeliveries.id, d.id));
      const senderRows = await db.select().from(emailSenders).where(eq(emailSenders.id, d.senderId));
      const sender = senderRows[0];
      const fromEmail = sender?.fromEmail || cfg.from;
      const fromName = sender?.fromName || "Mocter";
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: d.recipient,
        subject: d.renderedSubject,
        html: d.renderedHtml,
      });
      await db.update(emailDeliveries).set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: info.messageId || null,
        lastError: null,
      }).where(eq(emailDeliveries.id, d.id));
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(emailDeliveries).set({
        status: d.attempts + 1 >= 3 ? "dead" : "failed",
        lastError: msg,
      }).where(eq(emailDeliveries.id, d.id));
      failed++;
    }
  }
  return { processed: pending.length, sent, failed };
}

export async function sendTestEmail(to: string): Promise<{ messageId: string | null }> {
  const cfg = await getActiveSmtpConfig();
  if (!cfg || !cfg.host || !cfg.user) {
    throw new Error("SMTP no configurado en BD (host/usuario vacíos)");
  }
  if (!cfg.password) {
    throw new Error("La contraseña SMTP no está configurada o no pudo descifrarse. Re-guardá el proveedor con la contraseña en /admin/settings/notifications.");
  }
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure || cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
  });
  const info = await transporter.sendMail({
    from: `"Mocter" <${cfg.from || cfg.user}>`,
    to,
    subject: "Prueba de envío de correo - Mocter",
    text: "Este es un correo de prueba enviado desde el backoffice de Mocter.",
    html: "<p>Este es un correo de prueba enviado desde el backoffice de Mocter.</p>",
  });
  return { messageId: info.messageId || null };
}

export async function getActiveSmtpConfig(): Promise<ActiveSmtpConfig | null> {
  try {
    const db = getDb();
    const providers = await db.select().from(emailProviderConfigs);
    const active = providers.find((p) => p.status === "active") || providers[0];
    if (!active) return null;
    let password = "";
    if (active.passwordCiphertext && active.keyId) {
      try {
        password = decryptSmtpSecret(active.name, Buffer.from(active.passwordCiphertext), active.keyId);
      } catch (e) {
        // fallback: maybe stored as buffer already
        try {
          password = decryptSmtpSecret(active.name, active.passwordCiphertext as unknown as Buffer, active.keyId);
        } catch {
          password = "";
        }
      }
    }
    const senders = await db.select().from(emailSenders);
    const defaultSender = senders.find((s) => s.isDefault && s.status === "active") || senders.find((s) => s.status === "active");
    const from = defaultSender?.fromEmail || active.username || "";
    return {
      host: active.host,
      port: active.port,
      secure: active.secure,
      user: active.username || "",
      password,
      from,
    };
  } catch (error) {
    return null;
  }
}

const CANONICAL_TEMPLATES_SEED = [
  {
    eventKey: "auth.verify_email",
    locale: "es",
    senderKey: "no-reply",
    subject: "Verifica tu correo electrónico en Mocter",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Gracias por unirte a Mocter. Haz clic en el enlace para verificar tu correo:</p><p><a href=\"{{verify_url}}\">Verificar mi cuenta</a> (expira en {{expires_minutes}} minutos).</p>",
  },
  {
    eventKey: "auth.reset_password",
    locale: "es",
    senderKey: "no-reply",
    subject: "Restablece tu contraseña de Mocter",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Recibimos una solicitud para restablecer tu contraseña:</p><p><a href=\"{{reset_url}}\">Restablecer contraseña</a> (expira en {{expires_minutes}} minutos).</p>",
  },
  {
    eventKey: "tenant.welcome",
    locale: "es",
    senderKey: "no-reply",
    subject: "¡Bienvenido a Mocter! Tu organización está lista",
    bodyHtml: "<p>Estimado/a {{owner_name}},</p><p>Felicitaciones. Tu organización <strong>{{tenant_name}}</strong> está lista para operar en Mocter.</p><p>Ingresa a tu consola administrativa aquí: <a href=\"{{login_url}}\">{{login_url}}</a>.</p>",
  },
  {
    eventKey: "billing.payment_succeeded",
    locale: "es",
    senderKey: "billing",
    subject: "Pago confirmado · Plan {{plan_name}}",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>Tu pago de {{amount}} {{currency}} ha sido confirmado. Tu suscripción está activa hasta el {{period_end}}.</p>",
  },
  {
    eventKey: "billing.payment_failed",
    locale: "es",
    senderKey: "billing",
    subject: "Problema con tu pago en Mocter",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>No hemos podido procesar tu pago de {{amount}} para el plan {{plan_name}}.</p><p>Por favor reintenta en: <a href=\"{{retry_url}}\">{{retry_url}}</a>.</p>",
  },
  {
    eventKey: "billing.renewal",
    locale: "es",
    senderKey: "billing",
    subject: "Aviso de próxima renovación · Plan {{plan_name}}",
    bodyHtml: "<p>Hola {{tenant_name}},</p><p>Te informamos que el próximo {{renewal_date}} se renovará tu suscripción por {{amount}} {{currency}}.</p>",
  },
  {
    eventKey: "referral.registered",
    locale: "es",
    senderKey: "referidos",
    subject: "¡Un nuevo usuario se registró con tu enlace de referidos!",
    bodyHtml: "<p>Hola {{referrer_name}},</p><p><strong>{{referred_name}}</strong> se ha registrado con tu enlace de referidos. Tu beneficio acumulado es: {{reward_summary}}.</p>",
  },
  {
    eventKey: "community.role_promoted",
    locale: "es",
    senderKey: "comunidad",
    subject: "Nuevo rol en la comunidad {{community_name}}",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Has sido promovido al rol <strong>{{role}}</strong> en la comunidad <strong>{{community_name}}</strong>.</p><p><a href=\"{{community_url}}\">Ver comunidad</a></p>",
  },
  {
    eventKey: "community.join_accepted",
    locale: "es",
    senderKey: "comunidad",
    subject: "Solicitud aceptada en {{community_name}}",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Tu solicitud para unirte a <strong>{{community_name}}</strong> ha sido aceptada.</p><p><a href=\"{{community_url}}\">Ingresar a la comunidad</a></p>",
  },
  {
    eventKey: "community.digest",
    locale: "es",
    senderKey: "comunidad",
    subject: "Resumen semanal de {{community_name}}",
    bodyHtml: "<p>Hola {{user_name}},</p><p>Aquí tienes las novedades más destacadas de la semana en {{community_name}}.</p>",
  },
  {
    eventKey: "landing.lead_received",
    locale: "es",
    senderKey: "soporte",
    subject: "Nuevo prospecto recibido desde la landing: {{lead_name}}",
    bodyHtml: "<p>Nuevo contacto recibido:</p><ul><li>Nombre: {{lead_name}}</li><li>Correo: {{lead_email}}</li><li>Teléfono: {{lead_phone}}</li></ul><p>Mensaje: {{message}}</p>",
  },
];

/**
 * Consulta la configuración real de pasarela SMTP, remitentes y plantillas transaccionales de Mocter (NTF-001).
 * Si las tablas están vacías, se inicializan con la pasarela institucional y remitentes oficiales en PostgreSQL.
 */
export async function fetchAdminEmailSettings(): Promise<AdminEmailSettingsDto> {
  const db = getDb();

  try {
    let providersList = await db.select().from(emailProviderConfigs);
    let sendersList = await db.select().from(emailSenders);
    let eventsList = await db.select().from(emailEvents);
    let templatesList = await db.select().from(emailTemplates);

    // 1. Inicialización idempotente de Proveedor SMTP si no existe
    if (providersList.length === 0) {
      const { ciphertext, keyId } = encryptSmtpSecret(
        "Pasarela SMTP Hostinger Mocter",
        process.env.SMTP_PASSWORD || "MocterSmtpSecret2026!"
      );
      const [newProv] = await db
        .insert(emailProviderConfigs)
        .values({
          name: "Pasarela SMTP Hostinger Mocter",
          driver: "smtp",
          host: process.env.SMTP_HOST || "smtp.hostinger.com",
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
          username: process.env.SMTP_USER || "soporte@mocter.co",
          passwordCiphertext: ciphertext,
          keyId,
          status: "active",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        })
        .returning();
      providersList = [newProv];
    }

    const defaultProvider = providersList[0];

    // 2. Inicialización idempotente de Remitentes Canónicos vinculados al proveedor
    if (sendersList.length === 0 && defaultProvider) {
      for (const s of CANONICAL_EMAIL_SENDERS) {
        await db.insert(emailSenders).values({
          key: s.key.toLowerCase(),
          fromName: s.fromName,
          fromEmail: s.fromEmail.toLowerCase(),
          replyTo: s.replyTo,
          providerId: defaultProvider.id,
          isDefault: s.isDefault,
          status: "active",
          createdBy: "platform_owner",
          updatedBy: "platform_owner",
        });
      }
      sendersList = await db.select().from(emailSenders);
    }

    // 3. Inicialización idempotente de Eventos Transaccionales del Sistema
    const existingEventKeys = new Set(eventsList.map((ev) => ev.key.toLowerCase()));
    for (const ev of CANONICAL_EMAIL_EVENTS) {
      if (!existingEventKeys.has(ev.key.toLowerCase())) {
        try {
          await db.insert(emailEvents).values({
            key: ev.key.toLowerCase(),
            category: ev.category,
            description: ev.description,
            variablesSchema: [...ev.variablesSchema],
            defaultSenderKey: ev.defaultSenderKey,
            isEnabled: ev.isEnabled,
            isSystem: ev.isSystem,
            createdBy: "platform_owner",
            updatedBy: "platform_owner",
          });
          existingEventKeys.add(ev.key.toLowerCase());
        } catch (e) {
          appLogger.warn(`[fetchAdminEmailSettings] No se pudo inicializar evento ${ev.key}`, { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    eventsList = await db.select().from(emailEvents);

    // 4. Inicialización idempotente de Plantillas Vinculadas a Remitente y Evento
    if (sendersList.length > 0) {
      const senderKeyMap = new Map(sendersList.map((s) => [s.key, s.id]));
      const defaultSenderId = sendersList.find((s) => s.isDefault)?.id || sendersList[0].id;
      const validEventKeys = new Set(eventsList.map((e) => e.key));
      const existingTemplateKeys = new Set(
        templatesList.map((t) => `${t.eventKey}:${t.locale}:${t.version}`)
      );

      for (const t of CANONICAL_TEMPLATES_SEED) {
        if (!validEventKeys.has(t.eventKey)) {
          continue;
        }
        const templateKey = `${t.eventKey}:${t.locale}:1`;
        if (existingTemplateKeys.has(templateKey)) {
          continue;
        }

        const targetSenderId = senderKeyMap.get(t.senderKey) || defaultSenderId;
        try {
          await db.insert(emailTemplates).values({
            eventKey: t.eventKey,
            locale: t.locale,
            senderId: targetSenderId,
            subject: t.subject,
            bodyJson: { type: "doc", content: [{ type: "paragraph", text: t.bodyHtml }] },
            bodyHtml: t.bodyHtml,
            version: 1,
            status: "published",
            isLocked: t.eventKey.startsWith("auth."),
            publishedAt: new Date(),
            createdBy: "platform_owner",
            updatedBy: "platform_owner",
          });
          existingTemplateKeys.add(templateKey);
        } catch (e) {
          appLogger.warn(
            `[fetchAdminEmailSettings] No se pudo inicializar plantilla ${t.eventKey}:${t.locale}`,
            { error: e instanceof Error ? e.message : String(e) }
          );
        }
      }
      templatesList = await db.select().from(emailTemplates);
    }

    // Re-consultar ordenado para la respuesta
    const refreshedSenders = await db
      .select()
      .from(emailSenders)
      .orderBy(desc(emailSenders.isDefault), asc(emailSenders.key));

    const refreshedEvents = await db
      .select()
      .from(emailEvents)
      .orderBy(asc(emailEvents.category), asc(emailEvents.key));

    const refreshedTemplates = await db
      .select()
      .from(emailTemplates)
      .orderBy(asc(emailTemplates.eventKey), desc(emailTemplates.version));

    const providerMap = new Map(providersList.map((p) => [p.id, p.name]));
    const senderMap = new Map(
      refreshedSenders.map((s) => [s.id, { name: s.fromName, email: s.fromEmail }])
    );

    const activeProvider = providersList[0] || null;

    return {
      provider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
            driver: activeProvider.driver,
            host: activeProvider.host,
            port: activeProvider.port,
            secure: activeProvider.secure,
            username: activeProvider.username,
            hasPassword: Boolean(activeProvider.passwordCiphertext),
            maskedSecret: "••••••••",
            status: activeProvider.status,
          }
        : null,
      senders: refreshedSenders.map((s) => ({
        id: s.id,
        key: s.key,
        fromName: s.fromName,
        fromEmail: s.fromEmail,
        replyTo: s.replyTo,
        providerId: s.providerId,
        providerName: providerMap.get(s.providerId) || "Pasarela SMTP",
        isDefault: s.isDefault,
        status: s.status,
      })),
      events: refreshedEvents.map((ev) => ({
        id: ev.id,
        key: ev.key,
        category: ev.category,
        description: ev.description,
        variablesSchema: Array.isArray(ev.variablesSchema) ? ev.variablesSchema : [],
        defaultSenderKey: ev.defaultSenderKey,
        isEnabled: ev.isEnabled,
        isSystem: ev.isSystem,
      })),
      templates: refreshedTemplates.map((t) => {
        const sInfo = t.senderId ? senderMap.get(t.senderId) : undefined;
        return {
          id: t.id,
          eventKey: t.eventKey,
          locale: t.locale,
          senderId: t.senderId,
          senderName: sInfo?.name,
          senderEmail: sInfo?.email,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          version: t.version,
          status: t.status,
          isLocked: t.isLocked,
        };
      }),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminEmailSettings Failed] ${msg}`, error);
    return {
      provider: null,
      senders: [],
      events: [],
      templates: [],
    };
  }
}

/**
 * Guarda o actualiza un servidor de envío SMTP en PostgreSQL (`admin.email_provider_configs`).
 */
export async function saveAdminSmtpProvider(
  input: SaveAdminSmtpProviderInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.name || !input.host || !input.port) {
      return err("Nombre, Host y Puerto del servidor SMTP son obligatorios");
    }

    let passwordCiphertext: Buffer | null = null;
    let keyId: string | null = null;

    if (input.password && input.password.trim() !== "" && input.password !== "••••••••") {
      const encrypted = encryptSmtpSecret(input.name, input.password);
      passwordCiphertext = encrypted.ciphertext;
      keyId = encrypted.keyId;
    }

    if (input.id) {
      const updateData: Record<string, unknown> = {
        name: input.name,
        host: input.host,
        port: input.port,
        secure: Boolean(input.secure),
        username: input.username || null,
        status: input.status || "active",
        updatedBy: actor,
        updatedAt: new Date(),
      };

      if (passwordCiphertext && keyId) {
        updateData.passwordCiphertext = passwordCiphertext;
        updateData.keyId = keyId;
      }

      await db
        .update(emailProviderConfigs)
        .set(updateData)
        .where(eq(emailProviderConfigs.id, input.id));

      return ok({ id: input.id });
    } else {
      const [created] = await db
        .insert(emailProviderConfigs)
        .values({
          name: input.name,
          driver: "smtp",
          host: input.host,
          port: input.port,
          secure: Boolean(input.secure),
          username: input.username || null,
          passwordCiphertext,
          keyId,
          status: input.status || "active",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminSmtpProvider Failed] ${msg}`, error);
    return err(`Error al guardar proveedor SMTP: ${msg}`);
  }
}

/**
 * Guarda o actualiza una dirección remitente institucional (`admin.email_senders`).
 */
export async function saveAdminEmailSender(
  input: SaveAdminEmailSenderInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.key || !input.fromName || !input.fromEmail || !input.providerId) {
      return err("Identificador, Nombre, Correo y Servidor SMTP son obligatorios");
    }

    const cleanKey = input.key.trim().toLowerCase();
    const cleanEmail = input.fromEmail.trim().toLowerCase();

    // Si se marca como predeterminado, desmarcar los anteriores para respetar índice único
    if (input.isDefault) {
      await db
        .update(emailSenders)
        .set({ isDefault: false, updatedBy: actor, updatedAt: new Date() })
        .where(eq(emailSenders.isDefault, true));
    }

    if (input.id) {
      await db
        .update(emailSenders)
        .set({
          key: cleanKey,
          fromName: input.fromName,
          fromEmail: cleanEmail,
          replyTo: input.replyTo || null,
          providerId: input.providerId,
          isDefault: Boolean(input.isDefault),
          status: input.status || "active",
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(emailSenders.id, input.id));

      return ok({ id: input.id });
    } else {
      const [created] = await db
        .insert(emailSenders)
        .values({
          key: cleanKey,
          fromName: input.fromName,
          fromEmail: cleanEmail,
          replyTo: input.replyTo || null,
          providerId: input.providerId,
          isDefault: Boolean(input.isDefault),
          status: input.status || "active",
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminEmailSender Failed] ${msg}`, error);
    return err(`Error al guardar remitente: ${msg}`);
  }
}

/**
 * Guarda o actualiza una plantilla de correo vinculada a un remitente y a un evento del sistema (`admin.email_templates`).
 * REGLA ESTRICTA: El remitente y el evento funcional son obligatorios.
 */
export async function saveAdminEmailTemplate(
  input: SaveAdminEmailTemplateInput
): Promise<Result<{ id: string }, string>> {
  try {
    const db = getDb();
    const actor = input.createdBy || "platform_owner";

    if (!input.eventKey || !input.senderId || !input.subject || !input.bodyHtml) {
      return err("El Evento de funcionalidad, el Remitente vinculado, el Asunto y el Cuerpo HTML son obligatorios.");
    }

    // Validar que el remitente exista en admin.email_senders
    const [senderExists] = await db
      .select({ id: emailSenders.id })
      .from(emailSenders)
      .where(eq(emailSenders.id, input.senderId))
      .limit(1);

    if (!senderExists) {
      return err("El remitente seleccionado no existe en el catálogo de direcciones registradas.");
    }

    // Validar que el evento exista en admin.email_events
    const [eventExists] = await db
      .select({ key: emailEvents.key })
      .from(emailEvents)
      .where(eq(emailEvents.key, input.eventKey))
      .limit(1);

    if (!eventExists) {
      return err("El evento de funcionalidad seleccionado no existe en el catálogo de eventos.");
    }

    const locale = input.locale || "es";
    const status = input.status || "published";

    if (input.id) {
      await db
        .update(emailTemplates)
        .set({
          eventKey: input.eventKey,
          locale,
          senderId: input.senderId,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyJson: { type: "doc", content: [{ type: "paragraph", text: input.bodyHtml }] },
          status,
          publishedAt: status === "published" ? new Date() : null,
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, input.id));

      return ok({ id: input.id });
    } else {
      // Determinar la última versión para la dupla (eventKey, locale)
      const existing = await db
        .select({ version: emailTemplates.version })
        .from(emailTemplates)
        .where(and(eq(emailTemplates.eventKey, input.eventKey), eq(emailTemplates.locale, locale)))
        .orderBy(desc(emailTemplates.version))
        .limit(1);

      const nextVersion = (existing[0]?.version ?? 0) + 1;

      // Si la nueva versión se publica, despublicar las versiones anteriores
      if (status === "published") {
        await db
          .update(emailTemplates)
          .set({ status: "archived", updatedBy: actor, updatedAt: new Date() })
          .where(and(eq(emailTemplates.eventKey, input.eventKey), eq(emailTemplates.locale, locale), eq(emailTemplates.status, "published")));
      }

      const [created] = await db
        .insert(emailTemplates)
        .values({
          eventKey: input.eventKey,
          locale,
          senderId: input.senderId,
          subject: input.subject,
          bodyJson: { type: "doc", content: [{ type: "paragraph", text: input.bodyHtml }] },
          bodyHtml: input.bodyHtml,
          version: nextVersion,
          status,
          isLocked: input.eventKey.startsWith("auth."),
          publishedAt: status === "published" ? new Date() : null,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();

      return ok({ id: created.id });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminEmailTemplate Failed] ${msg}`, error);
    return err(`Error al guardar plantilla de correo: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTORIO Y GESTIÓN DE INQUILINOS Y COMERCIOS (ADM-001, DAT-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminTenantItemDto {
  id: string;
  slug: string;
  displayName: string;
  contactEmail: string;
  phone: string | null;
  lifecycleStatus: "alta" | "activo" | "suspendido" | "baja";
  locale: string;
  currency: string;
  planId: string;
  planCode: string;
  planName: string;
  cellId: string;
  cellCode: string;
  cellTier: string;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTenantsOverviewDto {
  kpis: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    onboardingTenants: number;
  };
  tenants: AdminTenantItemDto[];
  availablePlans: Array<{ id: string; code: string; name: string }>;
  availableCells: Array<{ id: string; code: string; currentClients: number; maxClients: number }>;
}

export interface CreateAdminTenantInput {
  displayName: string;
  slug: string;
  ownerEmail: string;
  ownerDisplayName?: string;
  planId: string;
  cellId?: string;
  phone?: string;
  locale?: "es" | "en";
  actorUserId?: string;
}

export interface UpdateAdminTenantLifecycleInput {
  clientId: string;
  lifecycleStatus: "activo" | "suspendido" | "baja";
  actorUserId?: string;
}

/**
 * Consulta el directorio integral de inquilinos y comercios registrados en el plano de control (ADM-001, DAT-001).
 * Correlaciona cliente, propietario, plan asignado y enrutamiento a la célula PostgreSQL.
 */
export async function fetchAdminTenantsOverview(): Promise<AdminTenantsOverviewDto> {
  const db = getDb();
  try {
    const rows = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        contactEmail: clients.contactEmail,
        phone: clients.phone,
        lifecycleStatus: clients.lifecycleStatus,
        locale: clients.locale,
        currency: clients.currency,
        planId: clients.planId,
        planCode: plans.code,
        planNameJson: plans.name,
        cellId: clientRouting.cellId,
        cellCode: cells.code,
        cellTier: cells.tier,
        ownerUserId: users.id,
        ownerDisplayName: users.displayName,
        ownerEmail: users.email,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .innerJoin(users, eq(clients.ownerUserId, users.id))
      .innerJoin(plans, eq(clients.planId, plans.id))
      .leftJoin(clientRouting, eq(clients.id, clientRouting.clientId))
      .leftJoin(cells, eq(clientRouting.cellId, cells.id))
      .orderBy(desc(clients.createdAt));

    let activeTenants = 0;
    let suspendedTenants = 0;
    let onboardingTenants = 0;

    const tenants: AdminTenantItemDto[] = rows.map((r) => {
      const status = (r.lifecycleStatus || "activo") as "alta" | "activo" | "suspendido" | "baja";
      if (status === "activo") activeTenants++;
      else if (status === "suspendido") suspendedTenants++;
      else if (status === "alta") onboardingTenants++;

      const nameObj = r.planNameJson as { es?: string; en?: string } | null;
      const planName = nameObj?.es || r.planCode;

      return {
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        contactEmail: r.contactEmail,
        phone: r.phone,
        lifecycleStatus: status,
        locale: r.locale,
        currency: r.currency,
        planId: r.planId,
        planCode: r.planCode,
        planName,
        cellId: r.cellId || "",
        cellCode: r.cellCode || "cell-default",
        cellTier: r.cellTier || "standard",
        ownerUserId: r.ownerUserId,
        ownerName: r.ownerDisplayName,
        ownerEmail: r.ownerEmail,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      };
    });

    const activePlans = await db
      .select({ id: plans.id, code: plans.code, nameJson: plans.name })
      .from(plans)
      .where(eq(plans.status, "active"))
      .orderBy(asc(plans.code));

    const activeCells = await db
      .select({
        id: cells.id,
        code: cells.code,
        currentClients: cells.currentClients,
        maxClients: cells.maxClients,
      })
      .from(cells)
      .where(eq(cells.status, "active"))
      .orderBy(asc(cells.code));

    return {
      kpis: {
        totalTenants: tenants.length,
        activeTenants,
        suspendedTenants,
        onboardingTenants,
      },
      tenants,
      availablePlans: activePlans.map((p) => {
        const pObj = p.nameJson as { es?: string; en?: string } | null;
        return { id: p.id, code: p.code, name: pObj?.es || p.code };
      }),
      availableCells: activeCells,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminTenantsOverview Failed] ${msg}`, error);
    return {
      kpis: { totalTenants: 0, activeTenants: 0, suspendedTenants: 0, onboardingTenants: 0 },
      tenants: [],
      availablePlans: [],
      availableCells: [],
    };
  }
}

/**
 * Aprovisiona manualmente un nuevo comercio/inquilino coordinando usuario dueño, celda y plan (ADM-001 §6.3, T-06).
 */
export async function createAdminTenant(input: CreateAdminTenantInput): Promise<Result<AdminTenantItemDto>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  const slug = input.slug.trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return err("El identificador (slug) debe contener solo minúsculas y guiones sin espacios.", "INVALID_SLUG");
  }

  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return err("El correo del propietario debe ser un email válido.", "INVALID_EMAIL");
  }

  try {
    // 1. Verificar unicidad de slug
    const existingClient = await db.select({ id: clients.id }).from(clients).where(eq(clients.slug, slug)).limit(1);
    if (existingClient.length > 0) {
      return err("El slug ingresado ya está en uso por otro comercio.", "SLUG_ALREADY_TAKEN");
    }

    // 2. Verificar o crear el usuario dueño en admin.users
    let ownerId: string;
    let ownerDisplayName = input.ownerDisplayName || input.displayName;
    const existingUser = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);

    if (existingUser.length > 0) {
      const u = existingUser[0];
      if (u.activeClientId) {
        const liveOwned = await db
          .select({ id: clients.id, status: clients.lifecycleStatus })
          .from(clients)
          .where(and(eq(clients.ownerUserId, u.id), sql`lifecycle_status <> 'baja'`))
          .limit(1);
        if (liveOwned.length > 0) {
          return err("El propietario especificado ya posee un comercio activo o en alta.", "OWNER_ALREADY_OWNS_LIVE_TENANT");
        }
      }
      ownerId = u.id;
      ownerDisplayName = u.displayName || ownerDisplayName;
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          email: ownerEmail,
          displayName: ownerDisplayName,
          status: "active",
          emailVerifiedAt: new Date(),
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
      ownerId = newUser.id;
    }

    // 3. Resolver plan
    const planRows = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (planRows.length === 0) {
      return err("El plan seleccionado no existe en el catálogo.", "PLAN_NOT_FOUND");
    }
    const selectedPlan = planRows[0];

    // 4. Resolver celda
    let assignedCellId = input.cellId;
    if (!assignedCellId) {
      const availableCell = await db
        .select()
        .from(cells)
        .where(and(eq(cells.status, "active"), sql`${cells.currentClients} < ${cells.maxClients}`))
        .orderBy(asc(cells.currentClients))
        .limit(1);
      if (availableCell.length === 0) {
        return err("No hay celdas de base de datos activas con capacidad disponible.", "NO_AVAILABLE_CELL");
      }
      assignedCellId = availableCell[0].id;
    }

    const assignedCell = (await db.select().from(cells).where(eq(cells.id, assignedCellId)).limit(1))[0];

    // 5. Insertar cliente
    const [newClient] = await db
      .insert(clients)
      .values({
        displayName: input.displayName.trim(),
        slug,
        contactEmail: ownerEmail,
        phone: input.phone?.trim() || null,
        ownerUserId: ownerId,
        planId: selectedPlan.id,
        lifecycleStatus: "activo",
        locale: input.locale || "es",
        currency: "COP",
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    // 6. Actualizar active_client_id del dueño
    await db
      .update(users)
      .set({ activeClientId: newClient.id, updatedBy: actor, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    // 7. Insertar enrutamiento en admin.client_routing
    await db
      .insert(clientRouting)
      .values({
        clientId: newClient.id,
        cellId: assignedCell.id,
        routingStatus: "active",
        routingVersion: 1,
        createdBy: actor,
        updatedBy: actor,
      });

    // 8. Incrementar current_clients en la celda
    await db
      .update(cells)
      .set({
        currentClients: sql`${cells.currentClients} + 1`,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(cells.id, assignedCell.id));

    // 9. Registrar historial de asignación de plan en admin.client_plans
    await db
      .insert(clientPlans)
      .values({
        clientId: newClient.id,
        planId: selectedPlan.id,
        source: "manual",
        assignedByUserId: actor,
        createdBy: actor,
        updatedBy: actor,
      });

    // 10. Aprovisionar automáticamente cuenta en Chatwoot (S9, T4)
    const cwLimits = await db
      .select()
      .from(planLimits)
      .where(and(eq(planLimits.planId, selectedPlan.id), eq(planLimits.dimension, "chatwoot_agents")))
      .limit(1);
    const chatwootEnabled = cwLimits.length > 0 && (cwLimits[0].mode === "UNLIMITED" || (cwLimits[0].value ?? 0) > 0);
    if (chatwootEnabled) {
      try {
        const provRes = await provisionTenantChatwootAccount({
          clientId: newClient.id,
          planId: selectedPlan.id,
          actor,
          db,
        });
        if (!provRes.ok) {
          appLogger.warn("[createAdminTenant] Falla al aprovisionar cuenta en Chatwoot", {
            clientId: newClient.id,
            error: provRes.error,
          });
        }
      } catch (cwErr) {
        appLogger.warn("[createAdminTenant] Error inesperado en aprovisionamiento Chatwoot", {
          clientId: newClient.id,
          error: cwErr instanceof Error ? cwErr.message : String(cwErr),
        });
      }
    }

    const pObj = selectedPlan.name as { es?: string; en?: string } | null;
    const planName = pObj?.es || selectedPlan.code;

    appLogger.info("[createAdminTenant] Inquilino aprovisionado con éxito", {
      clientId: newClient.id,
      slug: newClient.slug,
      cellId: assignedCell.id,
      ownerEmail,
    });

    return ok({
      id: newClient.id,
      slug: newClient.slug,
      displayName: newClient.displayName,
      contactEmail: newClient.contactEmail,
      phone: newClient.phone,
      lifecycleStatus: "activo",
      locale: newClient.locale,
      currency: newClient.currency,
      planId: selectedPlan.id,
      planCode: selectedPlan.code,
      planName,
      cellId: assignedCell.id,
      cellCode: assignedCell.code,
      cellTier: assignedCell.tier,
      ownerUserId: ownerId,
      ownerName: ownerDisplayName,
      ownerEmail,
      createdAt: newClient.createdAt ? new Date(newClient.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: newClient.updatedAt ? new Date(newClient.updatedAt).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[createAdminTenant Failed] ${msg}`, error);
    return err(`Error al registrar el inquilino: ${msg}`);
  }
}

/**
 * Actualiza el estado de ciclo de vida de un inquilino (activo, suspendido o baja) (ADM-001 T-06).
 */
export async function updateAdminTenantLifecycle(
  input: UpdateAdminTenantLifecycleInput,
): Promise<Result<{ success: boolean; lifecycleStatus: string }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const existing = await db
      .select({ id: clients.id, ownerUserId: clients.ownerUserId })
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);

    if (existing.length === 0) {
      return err("El inquilino especificado no existe.", "TENANT_NOT_FOUND");
    }

    await db
      .update(clients)
      .set({
        lifecycleStatus: input.lifecycleStatus,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, input.clientId));

    // Si se da de baja, desasociar active_client_id
    if (input.lifecycleStatus === "baja") {
      await db
        .update(users)
        .set({ activeClientId: null, updatedBy: actor, updatedAt: new Date() })
        .where(eq(users.id, existing[0].ownerUserId));
    }

    appLogger.info("[updateAdminTenantLifecycle] Estado de ciclo de vida actualizado", {
      clientId: input.clientId,
      status: input.lifecycleStatus,
      actor,
    });

    return ok({ success: true, lifecycleStatus: input.lifecycleStatus });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminTenantLifecycle Failed] ${msg}`, error);
    return err(`Error al actualizar estado del inquilino: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOBERNANZA DE INTELIGENCIA ARTIFICIAL, PROVEEDORES LLM Y PROMPTS (BOT-001, BOT-002, AI-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminAiProviderDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  supportedModes: { byok: boolean; mocter: boolean };
  modelsCount: number;
}

export interface AdminAiModelDto {
  id: string;
  providerId: string;
  providerCode: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  spreadPercent: number;
  costInputMtokUsdCents: number;
  costOutputMtokUsdCents: number;
  retailInputMtokUsdCents: number;
  retailOutputMtokUsdCents: number;
  isActive: boolean;
}

export interface AdminPromptBlockDto {
  id: string;
  blockKey: string;
  version: number;
  contentEs: string;
  contentEn: string;
  status: string;
}

export interface AdminAiAssistPromptDto {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  version: number;
  masterPrompt: string;
  inputHint: string;
  status: string;
}

export interface AdminAiGovernanceOverviewDto {
  kpis: {
    totalProviders: number;
    totalModels: number;
    activePrompts: number;
    defaultSpreadPercent: number;
  };
  providers: AdminAiProviderDto[];
  models: AdminAiModelDto[];
  promptBlocks: AdminPromptBlockDto[];
  aiAssistPrompts: AdminAiAssistPromptDto[];
  defaults: {
    defaultMaxTurns: number;
    defaultAnswerPolicy: string;
    defaultHandoffTriggers: string[];
    defaultMaxMessagesPerContact: number;
  };
}

export interface UpdateAdminModelSpreadInput {
  modelId: string;
  spreadPercent: number;
  isActive?: boolean;
  actorUserId?: string;
}

export interface UpdateAdminPromptBlockInput {
  blockKey: string;
  contentEs: string;
  contentEn: string;
  actorUserId?: string;
}

export interface UpdateAdminBotDefaultsInput {
  defaultMaxTurns?: number;
  defaultAnswerPolicy?: string;
  defaultHandoffTriggers?: string[];
  defaultMaxMessagesPerContact?: number;
  actorUserId?: string;
}

const CANONICAL_INITIAL_MODELS = [
  {
    providerCode: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costInput: 15,
    costOutput: 60,
    spreadPercent: 30,
    recommendedUse: { es: "Atención ágil, respuestas rápidas y bajo costo", en: "Fast customer responses at low cost" },
  },
  {
    providerCode: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o Multimodal",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costInput: 250,
    costOutput: 1000,
    spreadPercent: 30,
    recommendedUse: { es: "Negociaciones complejas y análisis de catálogo denso", en: "Complex sales and heavy catalog parsing" },
  },
  {
    providerCode: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costInput: 300,
    costOutput: 1500,
    spreadPercent: 30,
    recommendedUse: { es: "Máxima adherencia a instrucciones y empatía consultiva", en: "Highest adherence and consultative empathy" },
  },
  {
    providerCode: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    displayName: "Claude 3.5 Haiku",
    contextWindow: 200000,
    maxOutputTokens: 8192,
    costInput: 80,
    costOutput: 400,
    spreadPercent: 30,
    recommendedUse: { es: "Clasificación de prospectos y respuestas en tiempo real", en: "Lead triage and instant replies" },
  },
  {
    providerCode: "google",
    modelId: "gemini-1.5-flash",
    displayName: "Gemini 1.5 Flash",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costInput: 7,
    costOutput: 30,
    spreadPercent: 30,
    recommendedUse: { es: "Gran ventana de contexto para catálogos masivos y alta velocidad", en: "Huge context window for large catalogs" },
  },
  {
    providerCode: "deepseek",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat",
    contextWindow: 64000,
    maxOutputTokens: 4096,
    costInput: 14,
    costOutput: 28,
    spreadPercent: 30,
    recommendedUse: { es: "Excelente costo-beneficio para alta concurrencia", en: "Cost-effective high concurrency" },
  },
];

/**
 * Consulta y auto-inicializa idempotentemente el ecosistema de IA, modelos LLM y prompts maestros (BOT-001, BOT-002, AI-001).
 */
export async function fetchAdminAiGovernanceOverview(): Promise<AdminAiGovernanceOverviewDto> {
  const db = getDb();
  const operator = "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    // 1. Auto-inicialización de Proveedores y Modelos si está vacía
    const existingProviders = await db.select().from(aiProviders);
    if (existingProviders.length === 0) {
      for (const p of INITIAL_AI_PROVIDERS) {
        const [insertedProvider] = await db
          .insert(aiProviders)
          .values({
            code: p.code,
            name: p.name,
            isActive: p.isActive,
            docsUrl: p.docsUrl,
            supportedModes: p.supportedModes,
            sortOrder: p.sortOrder,
            createdBy: operator,
            updatedBy: operator,
          })
          .returning();

        // Modelos canónicos correspondientes a este proveedor
        const modelsToInsert = CANONICAL_INITIAL_MODELS.filter((m) => m.providerCode === p.code);
        for (const m of modelsToInsert) {
          const retailInput = Math.round(m.costInput * (1 + m.spreadPercent / 100));
          const retailOutput = Math.round(m.costOutput * (1 + m.spreadPercent / 100));

          await db.insert(aiModels).values({
            providerId: insertedProvider.id,
            modelId: m.modelId,
            displayName: m.displayName,
            contextWindow: m.contextWindow,
            maxOutputTokens: m.maxOutputTokens,
            recommendedUse: m.recommendedUse,
            spreadPercent: m.spreadPercent,
            costInputMtokUsdCents: m.costInput,
            costOutputMtokUsdCents: m.costOutput,
            retailInputMtokUsdCents: retailInput,
            retailOutputMtokUsdCents: retailOutput,
            isActive: true,
            createdBy: operator,
            updatedBy: operator,
          });
        }
      }
    }

    // 2. Auto-inicialización de Bloques de Prompt de BOT-002
    const existingBlocks = await db.select().from(botPromptBlocks);
    if (existingBlocks.length === 0) {
      for (const b of INITIAL_PROMPT_BLOCKS) {
        await db.insert(botPromptBlocks).values({
          blockKey: b.blockKey,
          version: b.version,
          content: b.content,
          status: "active",
          createdBy: operator,
          updatedBy: operator,
        });
      }
    }

    // 3. Auto-inicialización de Parámetros Globales (botDefaults)
    const existingDefaults = await db.select().from(botDefaults);
    if (existingDefaults.length === 0) {
      await db.insert(botDefaults).values({
        defaultMaxTurns: INITIAL_BOT_DEFAULTS.defaultMaxTurns,
        defaultAnswerPolicy: INITIAL_BOT_DEFAULTS.defaultAnswerPolicy,
        defaultHandoffTriggers: [...INITIAL_BOT_DEFAULTS.defaultHandoffTriggers],
        defaultResponseLanguageBehavior: INITIAL_BOT_DEFAULTS.defaultResponseLanguageBehavior,
        greetingMessageKey: INITIAL_BOT_DEFAULTS.greetingMessageKey,
        fallbackMessageKey: INITIAL_BOT_DEFAULTS.fallbackMessageKey,
        defaultMaxMessagesPerContact: INITIAL_BOT_DEFAULTS.defaultMaxMessagesPerContact,
        version: 1,
        createdBy: operator,
        updatedBy: operator,
      });
    }

    // 4. Auto-inicialización de Campos y Prompts de AI-001 (AiAssist)
    const existingFields = await db.select().from(aiAssistFields);
    if (existingFields.length === 0) {
      for (const f of INITIAL_AI_ASSIST_FIELDS) {
        await db.insert(aiAssistFields).values({
          fieldKey: f.fieldKey,
          entity: f.entity,
          columnName: f.columnName,
          labels: f.labels,
          isActive: f.isActive,
          createdBy: operator,
          updatedBy: operator,
        });
      }
      for (const ap of INITIAL_AI_ASSIST_PROMPTS) {
        await db.insert(aiAssistPrompts).values({
          fieldKey: ap.fieldKey,
          version: ap.version,
          status: ap.status,
          masterPrompt: ap.masterPrompt,
          inputHint: ap.inputHint,
          outputRules: ap.outputRules,
          examples: ap.examples,
          createdBy: operator,
          updatedBy: operator,
        });
      }
    }

    // 5. Cargar datos consolidados
    const providerRows = await db.select().from(aiProviders).orderBy(asc(aiProviders.sortOrder));
    const modelRows = await db
      .select({
        id: aiModels.id,
        providerId: aiModels.providerId,
        providerCode: aiProviders.code,
        modelId: aiModels.modelId,
        displayName: aiModels.displayName,
        contextWindow: aiModels.contextWindow,
        maxOutputTokens: aiModels.maxOutputTokens,
        spreadPercent: aiModels.spreadPercent,
        costInputMtokUsdCents: aiModels.costInputMtokUsdCents,
        costOutputMtokUsdCents: aiModels.costOutputMtokUsdCents,
        retailInputMtokUsdCents: aiModels.retailInputMtokUsdCents,
        retailOutputMtokUsdCents: aiModels.retailOutputMtokUsdCents,
        isActive: aiModels.isActive,
      })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
      .orderBy(asc(aiProviders.sortOrder), asc(aiModels.displayName));

    const blockRows = await db
      .select()
      .from(botPromptBlocks)
      .where(eq(botPromptBlocks.status, "active"))
      .orderBy(asc(botPromptBlocks.blockKey));

    const assistPromptRows = await db
      .select({
        id: aiAssistPrompts.id,
        fieldKey: aiAssistPrompts.fieldKey,
        fieldLabel: aiAssistFields.labels,
        version: aiAssistPrompts.version,
        masterPrompt: aiAssistPrompts.masterPrompt,
        inputHint: aiAssistPrompts.inputHint,
        status: aiAssistPrompts.status,
      })
      .from(aiAssistPrompts)
      .innerJoin(aiAssistFields, eq(aiAssistPrompts.fieldKey, aiAssistFields.fieldKey))
      .where(eq(aiAssistPrompts.status, "active"))
      .orderBy(asc(aiAssistPrompts.fieldKey));

    const currentDefaults = (await db.select().from(botDefaults).limit(1))[0] || {
      defaultMaxTurns: 10,
      defaultAnswerPolicy: "solo_conocimiento",
      defaultHandoffTriggers: ["asesor", "humano"],
      defaultMaxMessagesPerContact: 50,
    };

    const providers: AdminAiProviderDto[] = providerRows.map((p) => {
      const pModels = modelRows.filter((m) => m.providerId === p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        isActive: p.isActive,
        supportedModes: p.supportedModes,
        modelsCount: pModels.length,
      };
    });

    const models: AdminAiModelDto[] = modelRows.map((m) => ({
      id: m.id,
      providerId: m.providerId,
      providerCode: m.providerCode,
      modelId: m.modelId,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      spreadPercent: m.spreadPercent,
      costInputMtokUsdCents: Number(m.costInputMtokUsdCents || 0),
      costOutputMtokUsdCents: Number(m.costOutputMtokUsdCents || 0),
      retailInputMtokUsdCents: Number(m.retailInputMtokUsdCents || 0),
      retailOutputMtokUsdCents: Number(m.retailOutputMtokUsdCents || 0),
      isActive: m.isActive,
    }));

    const promptBlocks: AdminPromptBlockDto[] = blockRows.map((b) => ({
      id: b.id,
      blockKey: b.blockKey,
      version: b.version,
      contentEs: b.content.es,
      contentEn: b.content.en,
      status: b.status,
    }));

    const aiAssistPromptsList: AdminAiAssistPromptDto[] = assistPromptRows.map((ap) => {
      const labels = ap.fieldLabel as { es?: string; en?: string } | null;
      return {
        id: ap.id,
        fieldKey: ap.fieldKey,
        fieldLabel: labels?.es || ap.fieldKey,
        version: ap.version,
        masterPrompt: ap.masterPrompt,
        inputHint: ap.inputHint,
        status: ap.status,
      };
    });

    return {
      kpis: {
        totalProviders: providers.filter((p) => p.isActive).length,
        totalModels: models.filter((m) => m.isActive).length,
        activePrompts: promptBlocks.length + aiAssistPromptsList.length,
        defaultSpreadPercent: 30,
      },
      providers,
      models,
      promptBlocks,
      aiAssistPrompts: aiAssistPromptsList,
      defaults: {
        defaultMaxTurns: currentDefaults.defaultMaxTurns,
        defaultAnswerPolicy: currentDefaults.defaultAnswerPolicy,
        defaultHandoffTriggers: currentDefaults.defaultHandoffTriggers,
        defaultMaxMessagesPerContact: currentDefaults.defaultMaxMessagesPerContact,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminAiGovernanceOverview Failed] ${msg}`, error);
    return {
      kpis: { totalProviders: 0, totalModels: 0, activePrompts: 0, defaultSpreadPercent: 30 },
      providers: [],
      models: [],
      promptBlocks: [],
      aiAssistPrompts: [],
      defaults: {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor", "humano"],
        defaultMaxMessagesPerContact: 50,
      },
    };
  }
}

/**
 * Actualiza el spread porcentual y activación de un modelo LLM en el plano de control (BOT-001 §4.1).
 */
export async function updateAdminModelSpread(
  input: UpdateAdminModelSpreadInput,
): Promise<Result<{ modelId: string; spreadPercent: number; isActive: boolean }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const existing = await db.select().from(aiModels).where(eq(aiModels.id, input.modelId)).limit(1);
    if (existing.length === 0) {
      return err("El modelo especificado no existe en el catálogo de IA.", "MODEL_NOT_FOUND");
    }

    const current = existing[0];
    const spread = Math.max(0, input.spreadPercent);
    const active = input.isActive !== undefined ? input.isActive : current.isActive;

    const retailInput = Math.round(Number(current.costInputMtokUsdCents || 0) * (1 + spread / 100));
    const retailOutput = Math.round(Number(current.costOutputMtokUsdCents || 0) * (1 + spread / 100));

    await db
      .update(aiModels)
      .set({
        spreadPercent: spread,
        retailInputMtokUsdCents: retailInput,
        retailOutputMtokUsdCents: retailOutput,
        isActive: active,
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(aiModels.id, input.modelId));

    appLogger.info("[updateAdminModelSpread] Spread de modelo actualizado", {
      modelId: input.modelId,
      spreadPercent: spread,
      isActive: active,
      actor,
    });

    return ok({ modelId: input.modelId, spreadPercent: spread, isActive: active });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminModelSpread Failed] ${msg}`, error);
    return err(`Error al actualizar el modelo: ${msg}`);
  }
}

/**
 * Versiona y actualiza un bloque modular de prompt de bot (BOT-002 §3, T-02).
 */
export async function updateAdminPromptBlock(
  input: UpdateAdminPromptBlockInput,
): Promise<Result<{ blockKey: string; version: number }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const currentActive = await db
      .select()
      .from(botPromptBlocks)
      .where(and(eq(botPromptBlocks.blockKey, input.blockKey), eq(botPromptBlocks.status, "active")))
      .limit(1);

    const nextVersion = currentActive.length > 0 ? currentActive[0].version + 1 : 1;

    // Desactivar versión anterior
    if (currentActive.length > 0) {
      await db
        .update(botPromptBlocks)
        .set({ status: "retired", updatedBy: actor, updatedAt: new Date() })
        .where(eq(botPromptBlocks.id, currentActive[0].id));
    }

    // Insertar nueva versión activa
    const [newBlock] = await db
      .insert(botPromptBlocks)
      .values({
        blockKey: input.blockKey,
        version: nextVersion,
        content: {
          es: input.contentEs.trim(),
          en: input.contentEn.trim(),
        },
        status: "active",
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    appLogger.info("[updateAdminPromptBlock] Bloque de prompt versionado con éxito", {
      blockKey: input.blockKey,
      version: nextVersion,
      actor,
    });

    return ok({ blockKey: newBlock.blockKey, version: newBlock.version });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminPromptBlock Failed] ${msg}`, error);
    return err(`Error al versionar bloque de prompt: ${msg}`);
  }
}

/**
 * Actualiza los parámetros globales por defecto para bots y guardrails (BOT-001 RF-03.3).
 */
export async function updateAdminBotDefaults(
  input: UpdateAdminBotDefaultsInput,
): Promise<Result<{ success: boolean }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const existing = await db.select().from(botDefaults).limit(1);
    if (existing.length === 0) {
      await db.insert(botDefaults).values({
        defaultMaxTurns: input.defaultMaxTurns || 10,
        defaultAnswerPolicy: input.defaultAnswerPolicy || "solo_conocimiento",
        defaultHandoffTriggers: input.defaultHandoffTriggers || ["asesor", "humano"],
        defaultMaxMessagesPerContact: input.defaultMaxMessagesPerContact || 50,
        version: 1,
        createdBy: actor,
        updatedBy: actor,
      });
    } else {
      await db
        .update(botDefaults)
        .set({
          defaultMaxTurns: input.defaultMaxTurns ?? existing[0].defaultMaxTurns,
          defaultAnswerPolicy: input.defaultAnswerPolicy ?? existing[0].defaultAnswerPolicy,
          defaultHandoffTriggers: input.defaultHandoffTriggers ?? existing[0].defaultHandoffTriggers,
          defaultMaxMessagesPerContact: input.defaultMaxMessagesPerContact ?? existing[0].defaultMaxMessagesPerContact,
          updatedBy: actor,
          updatedAt: new Date(),
        })
        .where(eq(botDefaults.id, existing[0].id));
    }

    return ok({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminBotDefaults Failed] ${msg}`, error);
    return err(`Error al actualizar parámetros globales de bots: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA DE REFERIDOS Y AFILIADOS (REF-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminReferralProgramOverviewDto {
  program: {
    id: string;
    name: string;
    model: string;
    rewardType: string;
    rewardValue: number;
    currency: string;
    attributionDays: number;
    creditValidityDays: number;
    status: string;
  };
  metrics: {
    totalReferrals: number;
    pendingCount: number;
    qualifiedCount: number;
    rewardedCount: number;
    rejectedCount: number;
    totalRewardsIssuedCents: number;
    totalCreditsRedeemedCents: number;
    totalCreditsAvailableCents: number;
  };
  topReferrers: Array<{
    clientId: string;
    clientName: string;
    clientSlug: string;
    code: string;
    conversionsCount: number;
    earnedCents: number;
  }>;
}

export interface UpdateAdminReferralProgramInput {
  programId: string;
  status?: "active" | "paused" | "ended";
  rewardType?: "fixed" | "percent";
  rewardValue?: number;
  attributionDays?: number;
  creditValidityDays?: number;
  actorUserId?: string;
}

/**
 * Consulta y auto-inicializa el programa de referidos de la SaaS (REF-001 §3, RF-06).
 */
export async function fetchAdminReferralsOverview(): Promise<AdminReferralProgramOverviewDto> {
  const db = getDb();
  const operator = "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    let programRows = await db.select().from(referralPrograms).limit(1);

    if (programRows.length === 0) {
      const [newProg] = await db
        .insert(referralPrograms)
        .values({
          name: "Programa Oficial De Créditos De Referidos Mocter",
          model: "credit",
          rewardType: "fixed",
          rewardValue: 5000000, // $50.000 COP en centavos
          currency: "COP",
          trigger: "first_paid_invoice",
          attributionDays: 60,
          creditValidityDays: 365,
          status: "active",
          createdBy: operator,
          updatedBy: operator,
        })
        .returning();
      programRows = [newProg];
    }

    const currentProgram = programRows[0];

    // Métricas de referidos
    const refCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        qualified: sql<number>`count(*) filter (where status = 'qualified')::int`,
        rewarded: sql<number>`count(*) filter (where status = 'rewarded')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      })
      .from(referrals);

    const rewSums = await db
      .select({
        totalIssued: sql<number>`coalesce(sum(amount_cents), 0)::bigint`,
        totalAvailable: sql<number>`coalesce(sum(remaining_cents) filter (where status in ('available', 'partially_redeemed')), 0)::bigint`,
      })
      .from(referralRewards);

    const totalIssued = Number(rewSums[0]?.totalIssued ?? 0);
    const totalAvailable = Number(rewSums[0]?.totalAvailable ?? 0);
    const totalRedeemed = Math.max(0, totalIssued - totalAvailable);

    // Top referentes (inquilinos con códigos y conversiones)
    const codeRows = await db
      .select({
        clientId: referralCodes.clientId,
        code: referralCodes.code,
        clientName: clients.displayName,
        clientSlug: clients.slug,
      })
      .from(referralCodes)
      .innerJoin(clients, eq(referralCodes.clientId, clients.id))
      .limit(10);

    const topReferrers = codeRows.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      clientSlug: c.clientSlug,
      code: c.code,
      conversionsCount: 0,
      earnedCents: 0,
    }));

    return {
      program: {
        id: currentProgram.id,
        name: currentProgram.name,
        model: currentProgram.model,
        rewardType: currentProgram.rewardType,
        rewardValue: Number(currentProgram.rewardValue),
        currency: currentProgram.currency,
        attributionDays: currentProgram.attributionDays,
        creditValidityDays: currentProgram.creditValidityDays,
        status: currentProgram.status,
      },
      metrics: {
        totalReferrals: Number(refCounts[0]?.total ?? 0),
        pendingCount: Number(refCounts[0]?.pending ?? 0),
        qualifiedCount: Number(refCounts[0]?.qualified ?? 0),
        rewardedCount: Number(refCounts[0]?.rewarded ?? 0),
        rejectedCount: Number(refCounts[0]?.rejected ?? 0),
        totalRewardsIssuedCents: totalIssued,
        totalCreditsRedeemedCents: totalRedeemed,
        totalCreditsAvailableCents: totalAvailable,
      },
      topReferrers,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminReferralsOverview Failed] ${msg}`, error);
    return {
      program: {
        id: "",
        name: "Programa Oficial",
        model: "credit",
        rewardType: "fixed",
        rewardValue: 5000000,
        currency: "COP",
        attributionDays: 60,
        creditValidityDays: 365,
        status: "active",
      },
      metrics: {
        totalReferrals: 0,
        pendingCount: 0,
        qualifiedCount: 0,
        rewardedCount: 0,
        rejectedCount: 0,
        totalRewardsIssuedCents: 0,
        totalCreditsRedeemedCents: 0,
        totalCreditsAvailableCents: 0,
      },
      topReferrers: [],
    };
  }
}

/**
 * Actualiza la configuración comercial o el estado del programa de referidos (REF-001 RF-06.1).
 */
export async function updateAdminReferralProgram(
  input: UpdateAdminReferralProgramInput,
): Promise<Result<{ success: boolean; status: string }>> {
  const db = getDb();
  const actor = input.actorUserId || "01a19874-1077-744c-8514-d4c990cd7259";

  try {
    const existing = await db
      .select()
      .from(referralPrograms)
      .where(eq(referralPrograms.id, input.programId))
      .limit(1);

    if (existing.length === 0) {
      return err("El programa de referidos especificado no existe.", "PROGRAM_NOT_FOUND");
    }

    const updates: Record<string, unknown> = {
      updatedBy: actor,
      updatedAt: new Date(),
    };

    if (input.status) updates.status = input.status;
    if (input.rewardType) updates.rewardType = input.rewardType;
    if (input.rewardValue !== undefined) updates.rewardValue = input.rewardValue;
    if (input.attributionDays !== undefined) updates.attributionDays = input.attributionDays;
    if (input.creditValidityDays !== undefined) updates.creditValidityDays = input.creditValidityDays;

    await db.update(referralPrograms).set(updates).where(eq(referralPrograms.id, input.programId));

    appLogger.info("[updateAdminReferralProgram] Programa de referidos actualizado", {
      programId: input.programId,
      updates,
      actor,
    });

    return ok({ success: true, status: (input.status || existing[0].status) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[updateAdminReferralProgram Failed] ${msg}`, error);
    return err(`Error al actualizar el programa de referidos: ${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INFORMES EJECUTIVOS Y ANALÍTICA GLOBAL (REP-001)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminPlatformReportsOverviewDto {
  kpis: {
    totalMrrCop: number;
    activeTenants: number;
    totalStorageMb: number;
    totalTokensConsumed: number;
  };
  tenantsByPlan: Array<{
    planCode: string;
    planName: string;
    count: number;
    mrrCop: number;
  }>;
  tenantsByStatus: Array<{
    status: string;
    count: number;
  }>;
  storage: {
    originalBytes: number;
    variantsBytes: number;
    totalBytes: number;
    filesCount: number;
  };
  aiUsage: {
    botTokens: number;
    assistTokens: number;
    totalTokens: number;
    totalCostUsdCents: number;
  };
}

/**
 * Computa las métricas analíticas globales agregadas para el plano de control (REP-001 §2, T-05).
 * Cero exposición de PII: consolidado numérico por plan, almacenamiento SeaweedFS y consumo AI.
 */
export async function fetchAdminPlatformReports(): Promise<AdminPlatformReportsOverviewDto> {
  const db = getDb();

  try {
    // 1. Clientes y suscripciones
    const clientRows = await db
      .select({
        lifecycleStatus: clients.lifecycleStatus,
        planCode: plans.code,
        planNameJson: plans.name,
        priceMonthlyCents: plans.priceMonthlyCents,
      })
      .from(clients)
      .innerJoin(plans, eq(clients.planId, plans.id));

    let activeTenants = 0;
    let totalMrrCop = 0;
    const planMap = new Map<string, { planCode: string; planName: string; count: number; mrrCop: number }>();
    const statusMap = new Map<string, number>();

    for (const r of clientRows) {
      const priceMonthlyCop = Math.round(Number(r.priceMonthlyCents || 0) / 100);
      const st = r.lifecycleStatus || "activo";

      statusMap.set(st, (statusMap.get(st) || 0) + 1);

      if (st === "activo" || st === "alta") {
        activeTenants++;
        totalMrrCop += priceMonthlyCop;
      }

      const pObj = r.planNameJson as { es?: string; en?: string } | null;
      const planName = pObj?.es || r.planCode;

      const currentPlan = planMap.get(r.planCode) || {
        planCode: r.planCode,
        planName: planName,
        count: 0,
        mrrCop: 0,
      };
      currentPlan.count++;
      currentPlan.mrrCop += priceMonthlyCop;
      planMap.set(r.planCode, currentPlan);
    }

    // 2. Almacenamiento SeaweedFS y variantes
    const mediaCatalogStats = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalSize: sql<number>`coalesce(sum(size_bytes), 0)::bigint`,
      })
      .from(mediaCatalog);

    const mediaVariantsStats = await db
      .select({
        totalSize: sql<number>`coalesce(sum(size_bytes), 0)::bigint`,
      })
      .from(mediaVariants);

    const origBytes = Number(mediaCatalogStats[0]?.totalSize || 0);
    const varBytes = Number(mediaVariantsStats[0]?.totalSize || 0);
    const totalStorageBytes = origBytes + varBytes;
    const totalStorageMb = Math.round((totalStorageBytes / (1024 * 1024)) * 100) / 100;

    // 3. Consumo de Tokens AI
    const aiStats = await db
      .select({
        botTokens: sql<number>`coalesce(sum(input_tokens + output_tokens) filter (where purpose = 'bot'), 0)::bigint`,
        assistTokens: sql<number>`coalesce(sum(input_tokens + output_tokens) filter (where purpose = 'assist'), 0)::bigint`,
        totalTokens: sql<number>`coalesce(sum(input_tokens + output_tokens), 0)::bigint`,
        totalCostUsdCents: sql<number>`coalesce(sum(cost_usd_cents), 0)::bigint`,
      })
      .from(aiUsageEvents);

    const botTokens = Number(aiStats[0]?.botTokens || 0);
    const assistTokens = Number(aiStats[0]?.assistTokens || 0);
    const totalTokens = Number(aiStats[0]?.totalTokens || 0);
    const totalCostUsdCents = Number(aiStats[0]?.totalCostUsdCents || 0);

    return {
      kpis: {
        totalMrrCop,
        activeTenants,
        totalStorageMb,
        totalTokensConsumed: totalTokens,
      },
      tenantsByPlan: Array.from(planMap.values()),
      tenantsByStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
      storage: {
        originalBytes: origBytes,
        variantsBytes: varBytes,
        totalBytes: totalStorageBytes,
        filesCount: Number(mediaCatalogStats[0]?.count || 0),
      },
      aiUsage: {
        botTokens,
        assistTokens,
        totalTokens,
        totalCostUsdCents,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminPlatformReports Failed] ${msg}`, error);
    return {
      kpis: { totalMrrCop: 0, activeTenants: 0, totalStorageMb: 0, totalTokensConsumed: 0 },
      tenantsByPlan: [],
      tenantsByStatus: [],
      storage: { originalBytes: 0, variantsBytes: 0, totalBytes: 0, filesCount: 0 },
      aiUsage: { botTokens: 0, assistTokens: 0, totalTokens: 0, totalCostUsdCents: 0 },
    };
  }
}

export interface AdminPlatformBrandingDto {
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  palette: {
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    background?: string;
    foreground?: string;
  };
  customDomain: string | null;
  customFont: string | null;
  removeMocterBranding: boolean;
}

export interface AdminTenantBrandingItemDto {
  clientId: string;
  clientDisplayName: string;
  clientSlug: string;
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  customDomain: string | null;
  hasCustomBranding: boolean;
  updatedAt: Date | null;
}

export interface AdminBrandingSettingsDto {
  platformBranding: AdminPlatformBrandingDto;
  tenantsBrandings: AdminTenantBrandingItemDto[];
}

export interface SaveAdminBrandingInput {
  clientId?: string;
  brandName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string;
  primaryForeground?: string;
  accentColor?: string;
  accentForeground?: string;
  customDomain?: string | null;
  customFont?: string | null;
  removeMocterBranding?: boolean;
}

/**
 * Consulta la configuración de marca institucional y el inventario de marca blanca de inquilinos (ADM-001 T-28, DSN-001 §7).
 */
export async function fetchAdminBrandingSettings(): Promise<AdminBrandingSettingsDto> {
  const db = getDb();

  const defaultPlatform: AdminPlatformBrandingDto = {
    brandName: "Mocter",
    logoUrl: null,
    faviconUrl: null,
    palette: {
      primary: "#2F6BFF",
      primaryForeground: "#FFFFFF",
      accent: "#22D3EE",
      accentForeground: "#0F172A",
      background: "#0F172A",
      foreground: "#F8FAFC",
    },
    customDomain: "mocter.co",
    customFont: "Chakra Petch, Inter, sans-serif",
    removeMocterBranding: false,
  };

  try {
    const allClients = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        slug: clients.slug,
        lifecycleStatus: clients.lifecycleStatus,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .orderBy(asc(clients.createdAt));

    const brandings = await db.select().from(clientBrandings);
    const brandingMap = new Map<string, typeof clientBrandings.$inferSelect>();
    for (const b of brandings) {
      brandingMap.set(b.clientId, b);
    }

    const rootClient = allClients.find((c) => c.slug === "mocter") || allClients[0];
    const rootBranding = rootClient ? brandingMap.get(rootClient.id) : null;

    const platformBranding: AdminPlatformBrandingDto = rootBranding
      ? {
          brandName: rootBranding.brandName || "Mocter",
          logoUrl: rootBranding.logoUrl,
          faviconUrl: rootBranding.faviconUrl,
          palette: {
            primary: rootBranding.palette?.primary || "#2F6BFF",
            primaryForeground: rootBranding.palette?.primaryForeground || "#FFFFFF",
            accent: rootBranding.palette?.accent || "#22D3EE",
            accentForeground: rootBranding.palette?.accentForeground || "#0F172A",
            background: rootBranding.palette?.background || "#0F172A",
            foreground: rootBranding.palette?.foreground || "#F8FAFC",
          },
          customDomain: rootBranding.customDomain || "mocter.co",
          customFont: rootBranding.customFont || "Chakra Petch, Inter, sans-serif",
          removeMocterBranding: rootBranding.removeMocterBranding ?? false,
        }
      : defaultPlatform;

    const tenantsBrandings: AdminTenantBrandingItemDto[] = allClients.map((c) => {
      const b = brandingMap.get(c.id);
      return {
        clientId: c.id,
        clientDisplayName: c.displayName,
        clientSlug: c.slug,
        brandName: b?.brandName || null,
        logoUrl: b?.logoUrl || null,
        primaryColor: b?.palette?.primary || "#2F6BFF",
        customDomain: b?.customDomain || null,
        hasCustomBranding: Boolean(b && (b.brandName || b.logoUrl || b.palette?.primary)),
        updatedAt: b?.updatedAt || null,
      };
    });

    return {
      platformBranding,
      tenantsBrandings,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[fetchAdminBrandingSettings Failed] ${msg}`, error);
    return {
      platformBranding: defaultPlatform,
      tenantsBrandings: [],
    };
  }
}

/**
 * Guarda o actualiza la configuración de identidad corporativa o de marca blanca (ADM-001 RF-15, DSN-001 §7).
 * Valida ratio de contraste accesible WCAG 2.2 AA (4.5:1 para texto normal) antes de persistir.
 */
export async function saveAdminBrandingSettings(
  input: SaveAdminBrandingInput,
): Promise<Result<{ clientId: string; brandName: string; palette: BrandingPaletteTokens }>> {
  const db = getDb();

  try {
    const primary = input.primaryColor?.trim() || "#2F6BFF";
    const primaryFg = input.primaryForeground?.trim() || "#FFFFFF";

    // 1. Validar contraste accesible (WCAG 2.2 AA)
    const contrast = WhiteLabelService.validateContrast(primaryFg, primary, true);
    if (!contrast.valid) {
      return err(
        contrast.message || "Fallo de contraste accesible entre el color primario y el texto (mínimo 4.5:1).",
        "CONTRAST_RATIO_FAILED",
      );
    }

    // 2. Resolver clientId objetivo
    let targetClientId = input.clientId;
    if (!targetClientId) {
      const allClients = await db
        .select({ id: clients.id, slug: clients.slug })
        .from(clients)
        .orderBy(asc(clients.createdAt))
        .limit(1);

      if (allClients.length === 0) {
        return err(
          "No existe ningún inquilino registrado en la plataforma para asociar la identidad visual.",
          "TENANT_NOT_FOUND",
        );
      }
      targetClientId = allClients[0].id;
    } else {
      const clientExists = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, targetClientId))
        .limit(1);

      if (clientExists.length === 0) {
        return err(`El comercio con ID ${targetClientId} no existe.`, "TENANT_NOT_FOUND");
      }
    }

    const palette: BrandingPaletteTokens = {
      primary,
      primaryForeground: primaryFg,
      accent: input.accentColor?.trim() || "#22D3EE",
      accentForeground: input.accentForeground?.trim() || "#0F172A",
    };

    const existing = await db
      .select({ clientId: clientBrandings.clientId })
      .from(clientBrandings)
      .where(eq(clientBrandings.clientId, targetClientId))
      .limit(1);

    const now = new Date();
    const operator = "01a19874-1077-744c-8514-d4c990cd7259";

    if (existing.length > 0) {
      await db
        .update(clientBrandings)
        .set({
          brandName: input.brandName !== undefined ? input.brandName : undefined,
          logoUrl: input.logoUrl !== undefined ? input.logoUrl : undefined,
          faviconUrl: input.faviconUrl !== undefined ? input.faviconUrl : undefined,
          palette,
          customDomain: input.customDomain !== undefined ? input.customDomain : undefined,
          customFont: input.customFont !== undefined ? input.customFont : undefined,
          removeMocterBranding: input.removeMocterBranding !== undefined ? input.removeMocterBranding : undefined,
          updatedAt: now,
          updatedBy: operator,
        })
        .where(eq(clientBrandings.clientId, targetClientId));
    } else {
      await db.insert(clientBrandings).values({
        clientId: targetClientId,
        brandName: input.brandName || "Mocter",
        logoUrl: input.logoUrl || null,
        faviconUrl: input.faviconUrl || null,
        palette,
        customDomain: input.customDomain || null,
        customFont: input.customFont || "Chakra Petch, Inter, sans-serif",
        removeMocterBranding: input.removeMocterBranding ?? false,
        createdAt: now,
        updatedAt: now,
        createdBy: operator,
        updatedBy: operator,
      });
    }

    appLogger.info("[saveAdminBrandingSettings] Identidad visual actualizada con éxito", {
      targetClientId,
      brandName: input.brandName,
      primary,
    });

    return ok({
      clientId: targetClientId,
      brandName: input.brandName || "Mocter",
      palette,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[saveAdminBrandingSettings Failed] ${msg}`, error);
    return err(`Error interno al guardar identidad visual: ${msg}`, "SAVE_BRANDING_ERROR");
  }
}

/**
 * Restaura la identidad visual de un inquilino a los valores por defecto de la plataforma (ADM-001 RF-15.5).
 */
export async function resetAdminTenantBranding(clientId: string): Promise<Result<{ restored: boolean }>> {
  const db = getDb();
  try {
    await db.delete(clientBrandings).where(eq(clientBrandings.clientId, clientId));
    appLogger.info("[resetAdminTenantBranding] Marca blanca restaurada a defaults", { clientId });
    return ok({ restored: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[resetAdminTenantBranding Failed] ${msg}`, error);
    return err(`Error interno al restaurar marca de inquilino: ${msg}`, "RESET_BRANDING_ERROR");
  }
}
