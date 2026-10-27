import { leadSchema, type LeadInput } from "../validation";
import type { ILeadRepository } from "../repositories/lead.repository.interface";
import { defaultLeadRepository } from "../repositories/drizzle-lead.repository";
import type { Lead } from "../db/schemas";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Tipo de resultado devuelto por {@link LeadService.registerLead}.
 * Encapsula la entidad {@link Lead} en caso de éxito o los metadatos de error ante fallos.
 */
export type RegisterLeadResult = Result<Lead>;

/**
 * Servicio de dominio responsable de la orquestación, validación y registro de prospectos (leads).
 *
 * Aplica reglas de negocio mediante {@link leadSchema}, delega la persistencia al
 * repositorio inyectado {@link ILeadRepository} y retorna objetos de resultado tipados (Result Pattern)
 * garantizando que ninguna excepción de base de datos se propague de forma imprevista hacia la interfaz o API.
 */
export class LeadService {
  /**
   * Crea una instancia de `LeadService`.
   *
   * @param leadRepo - Implementación del repositorio de persistencia (por defecto {@link defaultLeadRepository}).
   */
  constructor(
    private readonly leadRepo: ILeadRepository = defaultLeadRepository,
  ) {}

  /**
   * Valida la carga útil recibida y registra el nuevo prospecto en la plataforma.
   *
   * Flujo de ejecución:
   * 1. Valida el objeto de entrada con {@link leadSchema}. Si hay errores, retorna un fallo con código `"VALIDATION_ERROR"` y la lista de incidencias.
   * 2. Si la validación es satisfactoria, persiste los datos a través del repositorio {@link ILeadRepository}.
   * 3. Registra eventos informativos o de error en el sistema de logging estructurado.
   *
   * @param rawInput - Objeto con datos crudos provenientes de formularios web, llamadas a Server Actions o solicitudes REST.
   * @returns Un objeto {@link RegisterLeadResult} que contiene el lead creado si la operación fue exitosa, o la descripción del fallo.
   *
   * @example
   * ```typescript
   * const resultado = await leadService.registerLead({
   *   name: "Juan Pérez",
   *   email: "juan@example.com",
   *   phone: "+573001234567",
   *   message: "Solicitud de demostración"
   * });
   *
   * if (resultado.ok) {
   *   console.log("ID del lead:", resultado.data.id);
   * } else {
   *   console.error("Error al registrar:", resultado.error);
   * }
   * ```
   */
  async registerLead(rawInput: unknown): Promise<RegisterLeadResult> {
    const parseResult = leadSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const issues = parseResult.error.issues;
      appLogger.warn("[LeadService.registerLead] Datos de lead inválidos", {
        issuesCount: issues.length,
      });
      return err("Validation failed", "VALIDATION_ERROR", issues);
    }

    const validatedInput: LeadInput = parseResult.data;

    try {
      const createdLead = await this.leadRepo.create(validatedInput);
      appLogger.info("[LeadService.registerLead] Lead registrado con éxito", {
        leadId: createdLead.id,
      });
      return ok(createdLead);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[LeadService.registerLead] Error de persistencia: ${msg}`, error);
      return err("Database persistence failed", "DB_ERROR");
    }
  }

  /**
   * Recupera la información de un lead a partir de su identificador UUID.
   *
   * @param id - Identificador único universal del lead.
   * @returns Promesa que resuelve a la entidad {@link Lead} si existe, o `null` en caso contrario.
   */
  async getLeadById(id: string): Promise<Lead | null> {
    return this.leadRepo.findById(id);
  }

  /**
   * Recupera la información de un lead a partir de su dirección de correo electrónico.
   *
   * @param email - Correo electrónico exacto a buscar.
   * @returns Promesa que resuelve a la entidad {@link Lead} si existe, o `null` en caso contrario.
   */
  async getLeadByEmail(email: string): Promise<Lead | null> {
    return this.leadRepo.findByEmail(email);
  }
}

/**
 * Instancia singleton predeterminada de {@link LeadService} para uso en toda la plataforma.
 */
export const leadService = new LeadService();
