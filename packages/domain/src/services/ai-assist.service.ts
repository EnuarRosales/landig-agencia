import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { getDb } from "../db/client";
import { aiUsageEvents } from "../db/schemas/admin";
import type { IAiAssistRepository } from "../repositories/ai-assist.repository.interface";
import type { AiAssistPrompt } from "../db/schemas/admin/ai-assist";
import type {
  AiCredentialResolverService,
  AiCredentialSource,
  ResolvedAiCredential,
  SupportedLlmProviderCode,
} from "./ai-credential-resolver.service";
import { LlmHttpCallError, type AiApiDialect } from "./llm-http-provider.client";

/**
 * Cliente de inferencia para el asistente AI (AI-001 RF-04, SPEC-02).
 */
export interface IAiAssistModelClient {
  generateSuggestion(params: {
    systemPrompt: string;
    draft: string;
    locale: string;
    outputRules?: Record<string, unknown>;
    providerCode?: SupportedLlmProviderCode;
    apiDialect?: AiApiDialect;
    baseUrl?: string;
    verifyPath?: string;
    modelCode?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ suggestion: string; inputTokens: number; outputTokens: number }>;
}

/**
 * Datos de auditoría y consumo registrados tras cada ejecución de «Mejorar con AI».
 */
export interface RecordAiUsageEventInput {
  clientId: string | null | undefined;
  providerId: string;
  modelId: string;
  mode: "byok" | "mocter";
  purpose: "assist" | "trial" | "bot";
  inputTokens: number;
  outputTokens: number;
  fieldKey: string;
  requestId?: string;
  latencyMs?: number;
  status: "success" | "error";
  failoverUsed?: boolean;
}

/**
 * Puerto para persistir eventos append-only en `admin.ai_usage_events`.
 */
export interface IAiUsageEventRecorder {
  record(event: RecordAiUsageEventInput): Promise<void>;
}

/**
 * Implementación Drizzle ORM para registrar consumo real de tokens AI (`admin.ai_usage_events`).
 */
export class DrizzleAiUsageEventRecorder implements IAiUsageEventRecorder {
  /** @inheritdoc */
  async record(event: RecordAiUsageEventInput): Promise<void> {
    // Durante onboarding temprano el usuario prospecto aún no tiene fila en admin.clients
    if (!event.clientId) {
      return;
    }

    const db = getDb();
    await db.insert(aiUsageEvents).values({
      clientId: event.clientId,
      providerId: event.providerId,
      modelId: event.modelId,
      mode: event.mode,
      purpose: event.purpose,
      inputTokens: Math.max(0, Math.trunc(event.inputTokens)),
      outputTokens: Math.max(0, Math.trunc(event.outputTokens)),
      costUsdCents: 0,
      fieldKey: event.fieldKey,
      requestId: event.requestId ?? null,
      latencyMs: event.latencyMs !== undefined ? Math.max(0, Math.trunc(event.latencyMs)) : null,
      status: event.status,
      failoverUsed: Boolean(event.failoverUsed),
    });
  }
}

export interface EnhanceTextInput {
  clientId?: string | null;
  userId?: string | null;
  fieldKey: string;
  draft: string;
  locale?: "es" | "en";
  context?: Record<string, unknown>;
  requestId?: string;
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
  providerUsed?: SupportedLlmProviderCode;
  providerId?: string;
  modelId?: string;
  credentialSource?: AiCredentialSource;
  billingMode?: "byok" | "mocter";
  failoverUsed?: boolean;
  latencyMs?: number;
  requestId?: string;
  usageRecorded?: boolean;
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
 * Servicio transversal de Asistencia AI en Configuración («Mejorar con AI», AI-001 §4, SPEC-02).
 *
 * Principios:
 * 1. La AI propone, el inquilino acepta (RF-03.2). Nunca guarda solo.
 * 2. Un textarea sin prompt maestro activo falla explícitamente (`AI_MASTER_PROMPT_MISSING`).
 * 3. BYOK propio en primer lugar; excepción temporal durante `trialing` vigente u `onboarding`
 *    inconcluso mediante `AiCredentialResolverService`; sin ellos rechaza con `AI_BYOK_REQUIRED`.
 * 4. El consumo y latencia se auditan en `admin.ai_usage_events` sin exponer secretos.
 */
export class AiAssistService {
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private readonly rateLimitMaxPerMinute = 10;

  constructor(
    private readonly repository: IAiAssistRepository,
    private readonly modelClient: IAiAssistModelClient,
    private readonly defaultModel: string = "gemini-1.5-flash",
    private readonly credentialResolver?: AiCredentialResolverService,
    private readonly usageRecorder?: IAiUsageEventRecorder,
  ) {}

  /**
   * Verifica el límite de peticiones por inquilino o prospecto para el botón 'Mejorar con AI'.
   *
   * @param rateKey - Identificador del cliente o usuario solicitante.
   * @returns Resultado de admisión con segundos de espera si excedió la ventana por minuto.
   */
  checkRateLimit(rateKey: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(rateKey);

    if (!entry || now - entry.windowStart > 60000) {
      this.rateLimits.set(rateKey, { count: 1, windowStart: now });
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

  private isRetryableFailoverError(error: unknown): boolean {
    if (error instanceof LlmHttpCallError) {
      return (
        error.code === "AI_PROVIDER_RATE_LIMIT" ||
        error.code === "AI_UPSTREAM_ERROR"
      );
    }
    return true;
  }

  /**
   * Ejecuta la mejora asistida («Mejorar con AI») sobre un borrador usando la credencial autorizada.
   * Cuando existen credenciales `[primary, secondary]` del mismo modo (`byok` o `mocter`), ejecuta
   * un único failover automático ante timeout, error de red, HTTP 429 o HTTP 5xx del proveedor primario.
   *
   * @param input - Borrador, `fieldKey`, contexto del formulario e identidad de sesión.
   * @returns `Result` con la sugerencia propuesta, métricas reales de tokens y metadatos de modelo.
   */
  async enhanceText(input: EnhanceTextInput): Promise<Result<EnhanceTextResult>> {
    const trimmedDraft = input.draft.trim();
    if (trimmedDraft.length === 0) {
      return err("El borrador no puede estar vacío para mejorar con AI.", "EMPTY_DRAFT");
    }

    let credentialCandidates: Array<ResolvedAiCredential | undefined> = [undefined];

    if (this.credentialResolver) {
      const resolved = this.credentialResolver.resolveCredentialCandidates
        ? await this.credentialResolver.resolveCredentialCandidates({
            clientId: input.clientId,
            userId: input.userId,
          })
        : await this.credentialResolver
            .resolveCredential({
              clientId: input.clientId,
              userId: input.userId,
            })
            .then((r) => (r.ok ? ok([r.data]) : r));

      if (!resolved.ok) {
        return err(resolved.error, resolved.code);
      }
      credentialCandidates = resolved.data.slice(0, 2);
    } else {
      const hasByok = input.hasByokConfigured ?? false;
      const walletBalance = input.walletBalanceCents ?? 0;
      if (!hasByok && walletBalance <= 0) {
        return err(
          "Para usar 'Mejorar con AI' debes configurar tu proveedor de inferencia (BYOK) o recargar tu billetera Mocter.",
          "NO_INFERENCE_CREDENTIALS",
        );
      }
    }

    const rateKey = input.clientId ?? input.userId ?? "anonymous";
    const rateCheck = this.checkRateLimit(rateKey);
    if (!rateCheck.allowed) {
      return err(
        `Límite de peticiones excedido. Por favor intenta de nuevo en ${rateCheck.retryAfterSeconds} segundos.`,
        "RATE_LIMIT_EXCEEDED",
      );
    }

    const field = await this.repository.getFieldByKey(input.fieldKey);
    if (!field || !field.isActive) {
      return err(
        `El campo '${input.fieldKey}' no está registrado o está inactivo.`,
        "FIELD_NOT_ASSISTED",
      );
    }

    const activePrompt = await this.repository.getActivePromptByFieldKey(input.fieldKey);
    if (!activePrompt) {
      return err(
        `No existe un prompt maestro activo para el campo '${input.fieldKey}'.`,
        "AI_MASTER_PROMPT_MISSING",
      );
    }

    const locale = input.locale ?? "es";
    const contextSection =
      input.context && Object.keys(input.context).length > 0
        ? [
            "",
            "### CONTEXTO DEL NEGOCIO / FORMULARIO:",
            JSON.stringify(input.context, null, 2),
          ].join("\n")
        : "";

    const systemPrompt = [
      activePrompt.masterPrompt,
      "",
      `### IDIOMA REQUERIDO: ${locale.toUpperCase()}`,
      `Debes generar la sugerencia estrictamente en el idioma del usuario (${locale === "es" ? "Español" : "English"}).`,
      contextSection,
      "",
      "### REGLAS DE FORMATO Y SALIDA:",
      JSON.stringify(activePrompt.outputRules, null, 2),
      "",
      "Devuelve ÚNICAMENTE la versión mejorada, sin preámbulos, explicaciones ni saludos meta.",
    ]
      .filter((line) => line !== undefined)
      .join("\n");

    for (let attemptIndex = 0; attemptIndex < credentialCandidates.length; attemptIndex += 1) {
      const resolvedCredential = credentialCandidates[attemptIndex];
      const failoverUsed = attemptIndex > 0;
      const attemptStartedAt = Date.now();

      try {
        const { suggestion, inputTokens, outputTokens } =
          await this.modelClient.generateSuggestion({
            systemPrompt,
            draft: trimmedDraft,
            locale,
            outputRules: activePrompt.outputRules,
            providerCode: resolvedCredential?.providerCode,
            apiDialect: resolvedCredential?.apiDialect,
            baseUrl: resolvedCredential?.baseUrl ?? undefined,
            verifyPath: resolvedCredential?.verifyPath ?? undefined,
            modelCode: resolvedCredential?.modelCode,
            apiKey: resolvedCredential?.apiKey,
            temperature: resolvedCredential?.temperature,
            maxTokens: resolvedCredential?.maxTokens,
          });

        const latencyMs = Date.now() - attemptStartedAt;
        const finalSuggestion = suggestion.trim();
        const minLength = activePrompt.outputRules.minLength ?? 5;
        if (finalSuggestion.length < minLength) {
          appLogger.warn("[AiAssistService] Sugerencia generada por debajo de la longitud mínima", {
            fieldKey: input.fieldKey,
            length: finalSuggestion.length,
            minLength,
            requestId: input.requestId,
          });
        }

        if (this.usageRecorder && resolvedCredential) {
          await this.usageRecorder.record({
            clientId: input.clientId,
            providerId: resolvedCredential.providerId,
            modelId: resolvedCredential.modelId,
            mode: resolvedCredential.mode,
            purpose: resolvedCredential.source === "platform_trial" ? "trial" : "assist",
            inputTokens,
            outputTokens,
            fieldKey: input.fieldKey,
            requestId: input.requestId,
            latencyMs,
            status: "success",
            failoverUsed,
          });
        }

        appLogger.info("[AiAssistService] Texto mejorado exitosamente", {
          clientId: input.clientId ?? null,
          fieldKey: input.fieldKey,
          promptVersion: activePrompt.version,
          provider: resolvedCredential?.providerCode ?? "mock",
          model: resolvedCredential?.modelCode ?? this.defaultModel,
          credentialSource: resolvedCredential?.source ?? "legacy",
          failoverUsed,
          inputTokens,
          outputTokens,
          latencyMs,
          requestId: input.requestId,
        });

        return ok({
          fieldKey: input.fieldKey,
          promptVersion: activePrompt.version,
          draft: trimmedDraft,
          suggestion: finalSuggestion,
          inputTokens,
          outputTokens,
          modelUsed: resolvedCredential?.modelCode ?? this.defaultModel,
          providerUsed: resolvedCredential?.providerCode,
          providerId: resolvedCredential?.providerId,
          modelId: resolvedCredential?.modelId,
          credentialSource: resolvedCredential?.source,
          billingMode: resolvedCredential?.mode,
          failoverUsed,
          latencyMs,
          requestId: input.requestId,
          usageRecorded: Boolean(this.usageRecorder && resolvedCredential),
        });
      } catch (error: unknown) {
        const latencyMs = Date.now() - attemptStartedAt;
        const msg = error instanceof Error ? error.message : String(error);
        const errorCode =
          error instanceof LlmHttpCallError ? error.code : "INFERENCE_ERROR";

        if (this.usageRecorder && resolvedCredential) {
          await this.usageRecorder.record({
            clientId: input.clientId,
            providerId: resolvedCredential.providerId,
            modelId: resolvedCredential.modelId,
            mode: resolvedCredential.mode,
            purpose: resolvedCredential.source === "platform_trial" ? "trial" : "assist",
            inputTokens: 0,
            outputTokens: 0,
            fieldKey: input.fieldKey,
            requestId: input.requestId,
            latencyMs,
            status: "error",
            failoverUsed,
          });
        }

        const hasSecondaryCandidate = attemptIndex + 1 < credentialCandidates.length;
        if (hasSecondaryCandidate && this.isRetryableFailoverError(error)) {
          appLogger.warn(
            `[AiAssistService] Fallo en proveedor primario (${errorCode}); ejecutando failover a proveedor secundario`,
            {
              errorCode,
              failedProvider: resolvedCredential?.providerCode ?? "unknown",
              nextProvider: credentialCandidates[attemptIndex + 1]?.providerCode ?? "unknown",
              fieldKey: input.fieldKey,
              clientId: input.clientId ?? null,
              requestId: input.requestId,
            },
          );
          continue;
        }

        appLogger.error(`[AiAssistService] Error en inferencia de mejora de texto: ${msg}`, {
          errorCode,
          provider: resolvedCredential?.providerCode ?? "unknown",
          failoverUsed,
          fieldKey: input.fieldKey,
          clientId: input.clientId ?? null,
          requestId: input.requestId,
        });

        return err(msg, errorCode);
      }
    }

    return err(
      "No fue posible completar la inferencia con los proveedores disponibles.",
      "INFERENCE_ERROR",
    );
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al listar biblioteca de prompts: ${msg}`, {
        error: msg,
      });
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al obtener versiones de prompt: ${msg}`, {
        error: msg,
      });
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
      const allowedRoles = ["platform_owner", "platform_admin"];
      if (!allowedRoles.includes(input.userRole)) {
        return err(
          "Permiso denegado: solo platform_owner y platform_admin pueden registrar versiones de prompts maestros.",
          "FORBIDDEN_INSUFFICIENT_PERMISSIONS",
        );
      }

      const trimmedPrompt = input.masterPrompt.trim();
      if (trimmedPrompt.length === 0) {
        return err("El prompt maestro no puede estar vacío.", "INVALID_MASTER_PROMPT");
      }

      const field = await this.repository.getFieldByKey(input.fieldKey);
      if (!field) {
        return err(
          `El campo asistido '${input.fieldKey}' no existe en el catálogo.`,
          "FIELD_NOT_FOUND",
        );
      }

      const nextVersion = await this.repository.getNextVersionForField(input.fieldKey);

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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al crear versión de prompt: ${msg}`, {
        error: msg,
      });
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AiAssistService] Error al promover prompt: ${msg}`, {
        error: msg,
      });
      return err(msg, "PROMOTE_PROMPT_ERROR");
    }
  }
}
