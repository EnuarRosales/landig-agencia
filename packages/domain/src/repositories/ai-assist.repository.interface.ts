import type { Result } from "../types/result";
import type { AiAssistField, AiAssistPrompt } from "../db/schemas/admin/ai-assist";

/**
 * Contrato de repositorio para el catálogo y prompts maestros del asistente AI (AI-001 RF-02).
 */
export interface IAiAssistRepository {
  /**
   * Obtiene todos los campos asistidos (activos e inactivos).
   */
  getAllFields(): Promise<AiAssistField[]>;

  /**
   * Obtiene todos los campos asistidos activos.
   */
  getActiveFields(): Promise<AiAssistField[]>;

  /**
   * Obtiene todas las versiones de prompts maestros para un campo asistido.
   */
  listPromptsByFieldKey(fieldKey: string): Promise<AiAssistPrompt[]>;

  /**
   * Obtiene el siguiente número de versión disponible para un campo.
   */
  getNextVersionForField(fieldKey: string): Promise<number>;

  /**
   * Obtiene la definición de un campo asistido por su clave.
   */
  getFieldByKey(fieldKey: string): Promise<AiAssistField | null>;

  /**
   * Obtiene el prompt maestro activo correspondiente a un campo asistido.
   */
  getActivePromptByFieldKey(fieldKey: string): Promise<AiAssistPrompt | null>;

  /**
   * Obtiene una versión específica de un prompt maestro.
   */
  getPromptByVersion(fieldKey: string, version: number): Promise<AiAssistPrompt | null>;

  /**
   * Registra o actualiza un campo asistido.
   */
  saveField(field: Omit<AiAssistField, "createdAt" | "updatedAt">): Promise<AiAssistField>;

  /**
   * Guarda una nueva versión de prompt maestro.
   */
  savePrompt(prompt: Omit<AiAssistPrompt, "id" | "createdAt" | "updatedAt">): Promise<AiAssistPrompt>;

  /**
   * Promueve una versión específica a 'active', pasando las versiones previas a 'retired' (RF-02.2).
   */
  promotePromptToActive(fieldKey: string, version: number, updatedBy: string): Promise<Result<AiAssistPrompt>>;
}

