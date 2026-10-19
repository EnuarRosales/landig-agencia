import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { leads, type Lead } from "../db/schema";
import type { LeadInput } from "../validation";
import type { ILeadRepository } from "./lead.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Implementación concreta del repositorio de prospectos utilizando Drizzle ORM sobre PostgreSQL.
 *
 * Soporta inyección de dependencias para permitir el paso de transacciones o instancias simuladas
 * de base de datos durante pruebas de integración y unitarias.
 */
export class DrizzleLeadRepository implements ILeadRepository {
  /**
   * Crea una instancia del repositorio Drizzle para leads.
   *
   * @param dbProvider - Función proveedora que retorna la instancia de Drizzle ORM (por defecto {@link getDb}).
   */
  constructor(
    private readonly dbProvider: () => PostgresJsDatabase<typeof schema> = getDb,
  ) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbProvider();
  }

  /**
   * Inserta un nuevo lead en la base de datos PostgreSQL utilizando la cláusula `RETURNING *`.
   *
   * @param input - Datos validados del lead a insertar.
   * @returns El registro recién creado con identificador generado y marca de tiempo.
   * @throws {Error} Si la consulta falla o no retorna filas afectadas.
   */
  async create(input: LeadInput): Promise<Lead> {
    try {
      const rows = await this.db.insert(leads).values(input).returning();
      const row = rows[0];
      if (!row) {
        throw new Error("DrizzleLeadRepository.create: insert returned no rows");
      }
      return row;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[LeadRepository.create Failed] ${msg}`, error, {
        email: input.email,
      });
      throw error;
    }
  }

  /**
   * Busca un lead por su UUID en la tabla {@link leads}.
   *
   * @param id - Identificador UUID del lead.
   * @returns El lead encontrado o `null` si no existe coincidencia.
   */
  async findById(id: string): Promise<Lead | null> {
    try {
      const rows = await this.db.select().from(leads).where(eq(leads.id, id)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[LeadRepository.findById Failed] ${msg}`, error, { id });
      throw error;
    }
  }

  /**
   * Busca un lead por su dirección de correo electrónico en la tabla {@link leads}.
   *
   * @param email - Correo electrónico a buscar.
   * @returns El lead encontrado o `null` si no existe coincidencia.
   */
  async findByEmail(email: string): Promise<Lead | null> {
    try {
      const rows = await this.db.select().from(leads).where(eq(leads.email, email)).limit(1);
      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[LeadRepository.findByEmail Failed] ${msg}`, error, { email });
      throw error;
    }
  }
}

/**
 * Instancia singleton predeterminada de {@link DrizzleLeadRepository}.
 */
export const defaultLeadRepository = new DrizzleLeadRepository();
