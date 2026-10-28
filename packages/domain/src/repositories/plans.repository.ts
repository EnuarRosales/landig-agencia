import { and, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import { plans, type Plan } from "../db/schemas";
import type { IPlansRepository } from "./plans.repository.interface";
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
  async getPublicPlans(): Promise<Plan[]> {
    try {
      return await this.db
        .select()
        .from(plans)
        .where(and(eq(plans.status, "active"), eq(plans.isPublic, true)))
        .orderBy(asc(plans.sortOrder));
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
export async function getPublicPlans(): Promise<Plan[]> {
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
