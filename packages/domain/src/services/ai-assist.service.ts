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
  constructor(
    private readonly repository: IAiAssistRepository,
    private readonly modelClient: IAiAssistModelClient,
    private readonly defaultModel: string = "gemini-1.5-flash",
  ) {}

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

    // 3. Buscar campo y prompt maestro activo
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
}

