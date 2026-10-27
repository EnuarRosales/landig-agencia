import type { Lead } from "../db/schemas";
import type { LeadInput } from "../validation";

/**
 * Contrato de persistencia para la entidad de prospectos comerciales (leads).
 *
 * Desacopla la lógica de negocio del motor de base de datos subyacente (Drizzle ORM,
 * PostgreSQL o implementaciones en memoria para pruebas unitarias).
 */
export interface ILeadRepository {
  /**
   * Persiste un nuevo lead en el almacenamiento.
   *
   * @param input - Datos de entrada previamente validados y sanitizados.
   * @returns El registro completo del lead recién creado.
   * @throws {Error} Si la operación de inserción falla en la capa de datos.
   */
  create(input: LeadInput): Promise<Lead>;

  /**
   * Recupera un lead mediante su identificador universal único (UUID).
   *
   * @param id - Identificador UUID del lead buscado.
   * @returns El registro coincidente {@link Lead} o `null` si no existe.
   */
  findById(id: string): Promise<Lead | null>;

  /**
   * Recupera el primer lead que coincida con la dirección de correo electrónico especificada.
   *
   * @param email - Dirección de correo electrónico a consultar.
   * @returns El registro coincidente {@link Lead} o `null` si no existe.
   */
  findByEmail(email: string): Promise<Lead | null>;
}
