import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { IAiAssistRepository } from "../repositories/ai-assist.repository.interface";
import type { AiAssistField, AiAssistPrompt } from "../db/schemas/admin/ai-assist";

/**
 * Cliente de inferencia para el asistente AI (AI-001 RF-04).
 */
export interface IAiAssistModelClient {
  generateSuggestion(params: {
    systemPrompt: string;
    draft: string;
    locale: string;
    outputRules?: Record<string, unknown>;
  }): Promise<{ suggestion: string; inputTokens: number; outputTokens: number }>;
}

export interface EnhanceTextInput {
  clientId: string;
  fieldKey: string;
  draft: string;
  locale?: "es" | "en";
  hasByokConfigured?: boolean;
  walletBalanceCents?: number;
}

export interface EnhanceTextResult {
  fieldKey: string;
  promptVersion: number;
  draft: string;
  suggestion: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
}

export interface CreatePromptVersionInput {
  fieldKey: string;
  masterPrompt: string;
  inputHint: string;
  outputRules?: {
    maxLength?: number;
    minLength?: number;
    format?: "plain" | "markdown" | "bullet_list";
    tone?: string;
    disallowedTerms?: string[];
  };
  examples?: Array<{ input: string; output: string; notes?: string }>;
  status?: "draft" | "active";
  userRole: string;
  executedBy: string;
}

export interface PromptLibraryFieldSummary {
  fieldKey: string;
  entity: string;
  columnName: string;
  labels: { es: string; en: string };
  isActive: boolean;
  activePrompt?: AiAssistPrompt | null;
  totalVersions: number;
}

/**
 * Servicio transversal de Asistencia AI en Configuración («Mejorar con AI», AI-001 §4).
 *
 * Principios:
 * 1. La AI propone, el inquilino acepta (RF-03.2). Nunca guarda solo.
 * 2. Un textarea sin prompt maestro activo es un defecto (RF-01.1).
 * 3. Día uno con BYOK; sin proveedor ni saldo, rechaza con aviso explícito (RF-04.1).
 * 4. El consumo se audita con propósito 'assist'.
 */
export class AiAssistService {
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private readonly rateLimitMaxPerMinute = 10;

  constructor(
    private readonly repository: IAiAssistRepository,
    private readonly modelClient: IAiAssistModelClient,
    private readonly defaultModel: string = "gemini-1.5-flash",
  ) {}

  /**
   * Verifica el límite de peticiones por inquilino para el botón 'Mejorar con AI' (AI-001 T-06, RF-04.4).
   */
  checkRateLimit(clientId: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(clientId);

    if (!entry || now - entry.windowStart > 60000) {
      this.rateLimits.set(clientId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (entry.count >= this.rateLimitMaxPerMinute) {
      const remainingMs = entry.windowStart + 60000 - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    entry.count += 1;
    return { allowed: true };
  }

  /**
   * Obtiene la lista de campos asistibles y sus hints activos para la UI.
   */
  async getAssistedFieldsList(): Promise<
    Array<{ fieldKey: string; labels: { es: string; en: string }; inputHint?: string }>
  > {
    const fields = await this.repository.getActiveFields();
    const result = [];

    for (const f of fields) {
      const activePrompt = await this.repository.getActivePromptByFieldKey(f.fieldKey);
      result.push({
        fieldKey: f.fieldKey,
        labels: f.labels,
        inputHint: activePrompt?.inputHint,
      });
    }

    return result;
  }

  /**
   * Ejecuta la mejora asistida («Mejorar con AI») sobre un borrador.
   */
  async enhanceText(input: EnhanceTextInput): Promise<Result<EnhanceTextResult>> {
    // 1. Validar que el borrador tenga contenido
    const trimmedDraft = input.draft.trim();
    if (trimmedDraft.length === 0) {
      return err("El borrador no puede estar vacío para mejorar con AI.", "EMPTY_DRAFT");
    }

    // 2. Verificar disponibilidad de inferencia (BYOK o Billetera)
    const hasByok = input.hasByokConfigured ?? false;
    const walletBalance = input.walletBalanceCents ?? 0;
    if (!hasByok && walletBalance <= 0) {
      return err(
        "Para usar 'Mejorar con AI' debes configurar tu proveedor de inferencia (BYOK) o recargar tu billetera Mocter.",
        "NO_INFERENCE_CREDENTIALS",
      );
    }

    // 3. Rate limiting por cliente (T-06, RF-04.4)
    const rateCheck = this.checkRateLimit(input.clientId);
    if (!rateCheck.allowed) {
      return err(
        `Límite de peticiones excedido. Por favor intenta de nuevo en ${rateCheck.retryAfterSeconds} segundos.`,
        "RATE_LIMIT_EXCEEDED",
      );
    }

    // 4. Buscar campo y prompt maestro activo
    const field = await this.repository.getFieldByKey(input.fieldKey);
    if (!field || !field.isActive) {
      return err(`El campo '${input.fieldKey}' no está registrado o está inactivo.`, "FIELD_NOT_ASSISTED");
    }

    const activePrompt = await this.repository.getActivePromptByFieldKey(input.fieldKey);
    if (!activePrompt) {
      return err(
        `No existe un prompt maestro activo para el campo '${input.fieldKey}'.`,
        "NO_ACTIVE_PROMPT",
      );
    }

    const locale = input.locale ?? "es";

    // 4. Ensamblar directiva de sistema respetando idioma y reglas de salida
    const systemPrompt = [
      activePrompt.masterPrompt,
      "",
      `### IDIOMA REQUERIDO: ${locale.toUpperCase()}`,
      `Debes generar la sugerencia estrictamente en el idioma del usuario (${locale === "es" ? "Español" : "English"}).`,
      "",
      "### REGLAS DE FORMATO Y SALIDA:",
      JSON.stringify(activePrompt.outputRules, null, 2),
      "",
      "Devuelve ÚNICAMENTE la versión mejorada, sin preámbulos, explicaciones ni saludos meta.",
    ].join("\n");

    try {
      // 5. Inferencia
      const { suggestion, inputTokens, outputTokens } =
        await this.modelClient.generateSuggestion({
          systemPrompt,
          draft: trimmedDraft,
          locale,
          outputRules: activePrompt.outputRules,
        });

      // 6. Verificar validaciones de salida mínimas
      const finalSuggestion = suggestion.trim();
      const minLength = activePrompt.outputRules.minLength ?? 5;
      if (finalSuggestion.length < minLength) {
        appLogger.warn("[AiAssistService] Sugerencia generada por debajo de la longitud mínima", {
          fieldKey: input.fieldKey,
          length: finalSuggestion.length,
          minLength,
        });
      }

      appLogger.info("[AiAssistService] Texto mejorado exitosamente", {
        clientId: input.clientId,
        fieldKey: input.fieldKey,
        promptVersion: activePrompt.version,
        inputTokens,
        outputTokens,
      });

      return ok({
        fieldKey: input.fieldKey,
        promptVersion: activePrompt.version,
        draft: trimmedDraft,
        suggestion: finalSuggestion,
        inputTokens,
        outputTokens,
        modelUsed: this.defaultModel,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error en inferencia de mejora de texto: ${msg}`, error);
      return err(msg, "INFERENCE_ERROR");
    }
  }

  /**
   * Lista el catálogo completo de campos y sus versiones de prompts (T-03, RF-02).
   */
  async listPromptLibrary(): Promise<Result<PromptLibraryFieldSummary[]>> {
    try {
      const fields = await this.repository.getAllFields();
      const library: PromptLibraryFieldSummary[] = [];

      for (const field of fields) {
        const activePrompt = await this.repository.getActivePromptByFieldKey(field.fieldKey);
        const allVersions = await this.repository.listPromptsByFieldKey(field.fieldKey);
        library.push({
          fieldKey: field.fieldKey,
          entity: field.entity,
          columnName: field.columnName,
          labels: field.labels,
          isActive: field.isActive,
          activePrompt,
          totalVersions: allVersions.length,
        });
      }

      return ok(library);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al listar biblioteca de prompts: ${msg}`, error);
      return err(msg, "LIST_PROMPTS_ERROR");
    }
  }

  /**
   * Obtiene todas las versiones de prompts maestros de un campo (T-03).
   */
  async getPromptsForField(fieldKey: string): Promise<Result<AiAssistPrompt[]>> {
    try {
      const prompts = await this.repository.listPromptsByFieldKey(fieldKey);
      return ok(prompts);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al obtener versiones de prompt: ${msg}`, error);
      return err(msg, "GET_PROMPTS_ERROR");
    }
  }

  /**
   * Crea una nueva versión de prompt maestro para un campo asistido (T-03, RF-02).
   * Restricción RBAC: solo 'platform_owner' y 'platform_admin' pueden crear o versionar prompts.
   */
  async createPromptVersion(
    input: CreatePromptVersionInput,
  ): Promise<Result<AiAssistPrompt>> {
    try {
      // 1. RBAC
      const allowedRoles = ["platform_owner", "platform_admin"];
      if (!allowedRoles.includes(input.userRole)) {
        return err(
          "Permiso denegado: solo platform_owner y platform_admin pueden registrar versiones de prompts maestros.",
          "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
        );
      }

      // 2. Validaciones
      const trimmedPrompt = input.masterPrompt.trim();
      if (trimmedPrompt.length === 0) {
        return err("El prompt maestro no puede estar vacío.", "INVALID_MASTER_PROMPT");
      }

      const field = await this.repository.getFieldByKey(input.fieldKey);
      if (!field) {
        return err(`El campo asistido '${input.fieldKey}' no existe en el catálogo.`, "FIELD_NOT_FOUND");
      }

      // 3. Siguiente versión secuencial
      const nextVersion = await this.repository.getNextVersionForField(input.fieldKey);

      // 4. Guardar prompt
      const saved = await this.repository.savePrompt({
        fieldKey: input.fieldKey,
        version: nextVersion,
        masterPrompt: trimmedPrompt,
        inputHint: input.inputHint,
        outputRules: input.outputRules ?? {},
        examples: input.examples ?? [],
        status: input.status ?? "draft",
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // Si se especificó 'active', promoverlo (retirando versiones previas)
      if (input.status === "active") {
        const promoted = await this.repository.promotePromptToActive(
          input.fieldKey,
          nextVersion,
          input.executedBy,
        );
        return promoted;
      }

      appLogger.info("[AiAssistService] Nueva versión de prompt maestro registrada", {
        fieldKey: input.fieldKey,
        version: nextVersion,
        status: saved.status,
        executedBy: input.executedBy,
      });

      return ok(saved);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al crear versión de prompt: ${msg}`, error);
      return err(msg, "CREATE_PROMPT_ERROR");
    }
  }

  /**
   * Promueve una versión de prompt maestro a 'active', retirando automáticamente las versiones previas (T-03, RF-02.2).
   */
  async promotePromptVersion(
    fieldKey: string,
    version: number,
    userRole: string,
    executedBy: string,
  ): Promise<Result<AiAssistPrompt>> {
    try {
      const allowedRoles = ["platform_owner", "platform_admin"];
      if (!allowedRoles.includes(userRole)) {
        return err(
          "Permiso denegado: solo platform_owner y platform_admin pueden promover prompts a activos.",
          "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
        );
      }

      const result = await this.repository.promotePromptToActive(fieldKey, version, executedBy);
      if (result.ok) {
        appLogger.info("[AiAssistService] Prompt maestro promovido a activo exitosamente", {
          fieldKey,
          version,
          executedBy,
        });
      }
      return result;
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al promover prompt: ${msg}`, error);
      return err(msg, "PROMOTE_PROMPT_ERROR");
    }
  }
}

