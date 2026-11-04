import { and, asc, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import { plans, type Plan } from "../db/schemas";
import type { IPlansRepository, PublicPlanDto } from "./plans.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Implementación del repositorio de planes comerciales utilizando Drizzle ORM sobre PostgreSQL.
 *
 * Consulta el catálogo canónico en el Router Global (`admin.plans`).
 */
export class DrizzlePlansRepository implements IPlansRepository {
  /**
   * Inicializa una nueva instancia de {@link DrizzlePlansRepository}.
   *
   * @param dbProvider - Función proveedora de la instancia de base de datos Drizzle (por defecto {@link getDb}).
   */
  constructor(
    private readonly dbProvider: () => PostgresJsDatabase<typeof schema> = getDb,
  ) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbProvider();
  }

  /**
   * Obtiene la lista de planes comerciales activos y públicos para la landing page.
   *
   * Aplica el filtro `status = 'active' AND is_public = true` ordenado por `sort_order ASC`.
   *
   * @returns Lista de planes públicos vigentes.
   * @throws {Error} Si ocurre una falla durante la consulta en base de datos.
   */
  async getPublicPlans(): Promise<PublicPlanDto[]> {
    try {
      const planRows = await this.db
        .select()
        .from(plans)
        .where(and(eq(plans.status, "active"), eq(plans.isPublic, true)))
        .orderBy(asc(plans.sortOrder));

      if (planRows.length === 0) return [];

      try {
        const planIds = planRows.map((p) => p.id);
        const limitsRows = await this.db
          .select()
          .from(schema.planLimits)
          .where(inArray(schema.planLimits.planId, planIds));

        const capsRows = await this.db
          .select()
          .from(schema.planCapabilityValues)
          .where(inArray(schema.planCapabilityValues.planId, planIds));

        return planRows.map((p) => {
          const limits: Record<string, { mode: "LIMITED" | "UNLIMITED"; value: number | null }> = {};
          for (const l of (limitsRows || []).filter((row) => row.planId === p.id)) {
            limits[l.dimension] = {
              mode: l.mode as "LIMITED" | "UNLIMITED",
              value: l.value !== null ? Number(l.value) : null,
            };
          }

          const capabilities: Record<string, boolean> = {};
          for (const c of (capsRows || []).filter((row) => row.planId === p.id)) {
            capabilities[c.capabilityCode] = c.enabled;
          }

          return {
            ...p,
            limits,
            capabilities,
          };
        });
      } catch {
        return planRows.map((p) => ({ ...p, limits: {}, capabilities: {} }));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[PlansRepository.getPublicPlans Failed] ${msg}`, error);
      throw error;
    }
  }

  /**
   * Busca un plan por su código slug público único.
   *
   * @param code - Código único del plan (ej. 'starter', 'growth', 'scale').
   * @returns El plan correspondiente o `null` si no existe.
   * @throws {Error} Si ocurre una falla durante la consulta en base de datos.
   */
  async findByCode(code: string): Promise<Plan | null> {
    try {
      const rows = await this.db
        .select()
        .from(plans)
        .where(eq(plans.code, code))
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[PlansRepository.findByCode Failed] ${msg}`, error, { code });
      throw error;
    }
  }

  /**
   * Busca un plan por su identificador UUID canónico.
   *
   * @param id - Identificador UUID del plan.
   * @returns El plan correspondiente o `null` si no existe.
   * @throws {Error} Si ocurre una falla durante la consulta en base de datos.
   */
  async findById(id: string): Promise<Plan | null> {
    try {
      const rows = await this.db
        .select()
        .from(plans)
        .where(eq(plans.id, id))
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[PlansRepository.findById Failed] ${msg}`, error, { id });
      throw error;
    }
  }
}

/** Instancia por defecto del repositorio de planes Drizzle para consumo directo. */
const defaultPlansRepository = new DrizzlePlansRepository();

/**
 * Función utilitaria independiente para consultar los planes públicos activos.
 *
 * Utilizada directamente por Server Components en `apps/web` (LND-001 §4.2).
 *
 * @returns Lista de planes con `status = 'active'` y `is_public = true` ordenados por `sort_order`.
 */
export async function getPublicPlans(): Promise<PublicPlanDto[]> {
  return defaultPlansRepository.getPublicPlans();
}

/**
 * Función utilitaria independiente para resolver un plan mediante su `plan_code`.
 *
 * Utilizada para validar y mostrar detalles del plan en las pantallas de registro y checkout.
 *
 * @param code - Código alfanumérico o slug del plan.
 * @returns El plan correspondiente o `null` si no existe.
 */
export async function getPlanByCode(code: string): Promise<Plan | null> {
  return defaultPlansRepository.findByCode(code);
}
