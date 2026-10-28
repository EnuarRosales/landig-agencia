import type { Plan } from "../db/schemas/admin/plans";

/**
 * Contrato de persistencia para la entidad de planes comerciales canónicos.
 *
 * Desacopla la lógica de negocio y las consultas de la landing / backoffice
 * del motor de base de datos subyacente.
 */
export interface IPlansRepository {
  /**
   * Obtiene todos los planes comerciales activos y públicos para la landing page.
   *
   * Filtra estrictamente por `status = 'active'` e `is_public = true`,
   * ordenados ascendentemente por `sort_order`.
   *
   * @returns Lista de planes públicos vigentes listos para ser presentados en la landing.
   */
  getPublicPlans(): Promise<Plan[]>;

  /**
   * Busca un plan por su código slug público (ej. 'starter', 'growth', 'scale').
   *
   * Utilizado en la resolución de parámetros de URL (`/register?plan_code=...`)
   * para obtener el UUID canónico del plan.
   *
   * @param code - Identificador alfanumérico o slug del plan.
   * @returns El plan encontrado o `null` si no existe coincidencia.
   */
  findByCode(code: string): Promise<Plan | null>;

  /**
   * Busca un plan por su identificador UUID canónico.
   *
   * @param id - Identificador UUID del plan.
   * @returns El plan encontrado o `null` si no existe coincidencia.
   */
  findById(id: string): Promise<Plan | null>;
}
