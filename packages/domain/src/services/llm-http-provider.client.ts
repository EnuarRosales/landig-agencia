import { env } from "../utils/env";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Protocolos HTTP soportados por el motor de inferencia desacoplado (SPEC-02 Fase 2).
 */
export type AiApiDialect = "openai_compatible" | "anthropic" | "google_gemini";

/**
 * Códigos de error normalizados para llamadas HTTP hacia proveedores LLM externos.
 */
export type LlmProviderErrorCode =
  | "AI_KEY_INVALID"
  | "AI_PROVIDER_RATE_LIMIT"
  | "AI_UPSTREAM_ERROR";

/**
 * Error tipado lanzado por `generateSuggestion` cuando el proveedor externo falla.
 */
export class LlmHttpCallError extends Error {
  /**
   * Inicializa el error HTTP del cliente LLM sin incluir credenciales en el mensaje.
   *
   * @param message - Mensaje seguro apto para trazabilidad y manejo superior.
   * @param code - Código de error normalizado de dominio.
   * @param statusCode - Código de estado HTTP devuelto por el proveedor externo, si aplica.
   */
  constructor(
    message: string,
    public readonly code: LlmProviderErrorCode,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LlmHttpCallError";
  }
}

/**
 * Parámetros requeridos para ejecutar una generación de texto con credencial resuelta.
 */
export interface GenerateWithCredentialParams {
  providerCode: string;
  apiDialect?: AiApiDialect;
  baseUrl?: string;
  modelCode: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Resultado exitoso de generación devuelto por el proveedor HTTP externo.
 */
export interface LlmGenerationOutput {
  suggestion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * Parámetros requeridos para verificar activamente una API Key contra el proveedor.
 */
export interface VerifyProviderApiKeyParams {
  providerCode: string;
  apiDialect?: AiApiDialect;
  baseUrl?: string;
  verifyPath?: string;
  apiKey: string;
  timeoutMs?: number;
}

/**
 * Resultado exitoso de verificación de conectividad y validez de API Key.
 */
export interface VerifyProviderApiKeyResult {
  valid: true;
  providerCode: string;
  latencyMs: number;
}

interface ProviderTransportConfig {
  baseUrl: string;
  apiDialect: AiApiDialect;
  verifyPath: string;
}

/**
 * Defaults de compatibilidad para invocaciones legadas sin metadatos de BD explícitos.
 */
export const DEFAULT_PROVIDER_TRANSPORTS: Record<string, ProviderTransportConfig> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiDialect: "openai_compatible",
    verifyPath: "/models",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    apiDialect: "openai_compatible",
    verifyPath: "/models",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiDialect: "openai_compatible",
    verifyPath: "/auth/key",
  },
  together_ai: {
    baseUrl: "https://api.together.xyz/v1",
    apiDialect: "openai_compatible",
    verifyPath: "/models",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    apiDialect: "anthropic",
    verifyPath: "/models",
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiDialect: "google_gemini",
    verifyPath: "/models",
  },
};

/**
 * Resuelve la configuración de transporte HTTP combinando parámetros de base de datos y fallbacks conocidos.
 *
 * @param params - Slug del proveedor y metadatos opcionales (`apiDialect`, `baseUrl`, `verifyPath`).
 * @returns Configuración normalizada o `null` si no existe URL base válida.
 */
export function resolveProviderTransport(params: {
  providerCode: string;
  apiDialect?: AiApiDialect;
  baseUrl?: string;
  verifyPath?: string;
}): ProviderTransportConfig | null {
  const legacy = DEFAULT_PROVIDER_TRANSPORTS[params.providerCode];
  const rawBaseUrl = (params.baseUrl ?? legacy?.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!rawBaseUrl) {
    return null;
  }

  const rawVerifyPath = (params.verifyPath ?? legacy?.verifyPath ?? "/models").trim();
  const verifyPath = rawVerifyPath.startsWith("/") ? rawVerifyPath : `/${rawVerifyPath}`;
  const apiDialect: AiApiDialect =
    params.apiDialect ?? legacy?.apiDialect ?? "openai_compatible";

  return {
    baseUrl: rawBaseUrl,
    apiDialect,
    verifyPath,
  };
}

function mapHttpStatusToErrorCode(status: number): {
  code: LlmProviderErrorCode;
  message: string;
} {
  if (status === 401 || status === 403) {
    return {
      code: "AI_KEY_INVALID",
      message: "La API Key fue rechazada por el proveedor de IA (autenticación inválida o revocada).",
    };
  }
  if (status === 429) {
    return {
      code: "AI_PROVIDER_RATE_LIMIT",
      message: "El proveedor de IA devolvió límite de tasa o cuota excedida (HTTP 429).",
    };
  }
  return {
    code: "AI_UPSTREAM_ERROR",
    message: `El proveedor de IA respondió con un error operativo (HTTP ${status}).`,
  };
}

/**
 * Cliente HTTP ligero basado en `fetch` nativo y `AbortSignal.timeout` para ejecutar inferencia
 * real y verificación activa de API Keys sobre cualquier proveedor LLM configurado en base de datos
 * mediante su dialecto HTTP (`openai_compatible`, `anthropic`, `google_gemini`), `baseUrl` y `verifyPath`.
 */
export class LlmHttpProviderClient {
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number;

  /**
   * Construye una instancia del adaptador HTTP multi-proveedor.
   *
   * @param options - Implementación inyectable de `fetch` y timeout predeterminado para pruebas o ajustes.
   */
  constructor(options?: { fetchFn?: typeof fetch; timeoutMs?: number }) {
    this.fetchImpl = options?.fetchFn ?? fetch;
    const rawTimeout = Number(options?.timeoutMs ?? env.AI_HTTP_TIMEOUT_MS ?? 15000);
    this.defaultTimeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 15000;
  }

  /**
   * Verifica de forma activa si una API Key es válida realizando una lectura ligera de modelos/llave.
   *
   * @param params - Código del proveedor, transporte HTTP opcional y secreto en texto plano a validar.
   * @returns `Result` con éxito y latencia medida, o error normalizado (`AI_KEY_INVALID`, etc.).
   */
  async verifyApiKey(
    params: VerifyProviderApiKeyParams,
  ): Promise<Result<VerifyProviderApiKeyResult>> {
    const config = resolveProviderTransport(params);
    if (!config) {
      return err("Proveedor LLM sin URL base configurada.", "AI_UPSTREAM_ERROR");
    }

    const timeoutMs = Math.min(params.timeoutMs ?? this.defaultTimeoutMs, 8_000);
    const url = `${config.baseUrl}${config.verifyPath}`;
    const headers = this.buildAuthHeaders(
      params.providerCode,
      config.apiDialect,
      config.baseUrl,
      params.apiKey,
    );
    const startedAt = Date.now();

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const mapped = mapHttpStatusToErrorCode(response.status);
        return err(mapped.message, mapped.code);
      }

      return ok({
        valid: true,
        providerCode: params.providerCode,
        latencyMs,
      });
    } catch {
      return err(
        "No fue posible conectar con el proveedor de IA dentro del tiempo límite.",
        "AI_UPSTREAM_ERROR",
      );
    }
  }

  /**
   * Ejecuta una petición real de generación de texto contra el proveedor indicado usando `fetch`.
   *
   * @param params - Credencial resuelta, metadatos de transporte, prompts y parámetros de muestreo.
   * @returns `Result` con la sugerencia generada, conteo real de tokens y latencia en milisegundos.
   */
  async generateWithCredential(
    params: GenerateWithCredentialParams,
  ): Promise<Result<LlmGenerationOutput>> {
    const config = resolveProviderTransport(params);
    if (!config) {
      return err("Proveedor LLM sin URL base configurada.", "AI_UPSTREAM_ERROR");
    }

    const rawTimeoutMs = Number(params.timeoutMs ?? this.defaultTimeoutMs);
    const timeoutMs =
      Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 15000;
    const temperature = params.temperature ?? 0.7;
    const maxTokens = params.maxTokens ?? 1000;
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(
        params.providerCode,
        config.apiDialect,
        config.baseUrl,
        params.apiKey,
      ),
      "content-type": "application/json",
    };

    let url = "";
    let body: unknown;

    if (config.apiDialect === "openai_compatible") {
      url = `${config.baseUrl}/chat/completions`;
      body = {
        model: params.modelCode,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      };
    } else if (config.apiDialect === "anthropic") {
      url = `${config.baseUrl}/messages`;
      body = {
        model: params.modelCode,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
        temperature,
        max_tokens: maxTokens,
      };
    } else {
      url = `${config.baseUrl}/models/${encodeURIComponent(params.modelCode)}:generateContent`;
      body = {
        systemInstruction: {
          parts: [{ text: params.systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: params.userPrompt }],
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      };
    }

    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const mapped = mapHttpStatusToErrorCode(response.status);
        return err(mapped.message, mapped.code);
      }

      const json = (await response.json()) as Record<string, unknown>;
      const parsed = this.parseGenerationResponse(config.apiDialect, json);
      if (!parsed.suggestion) {
        return err(
          "El proveedor de IA devolvió una respuesta vacía o con formato inesperado.",
          "AI_UPSTREAM_ERROR",
        );
      }

      return ok({
        ...parsed,
        latencyMs,
      });
    } catch (error) {
      appLogger.warn("[LlmHttpProviderClient] generateWithCredential fallo", {
        providerCode: params.providerCode,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return err(
        "Tiempo de espera agotado o error de red al invocar el proveedor de IA.",
        "AI_UPSTREAM_ERROR",
      );
    }
  }

  /**
   * Implementa el contrato compatible con `IAiAssistModelClient` para `AiAssistService`.
   *
   * @param params - Parámetros de generación incluyendo credencial y transporte resueltos por la capa superior.
   * @returns Sugerencia generada y conteo real de tokens de entrada/salida.
   * @throws {LlmHttpCallError} Si la invocación HTTP falla o no se suministra credencial.
   */
  async generateSuggestion(params: {
    systemPrompt: string;
    draft: string;
    locale: string;
    outputRules?: Record<string, unknown>;
    providerCode?: string;
    apiDialect?: AiApiDialect;
    baseUrl?: string;
    modelCode?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ suggestion: string; inputTokens: number; outputTokens: number }> {
    if (!params.providerCode || !params.modelCode || !params.apiKey) {
      throw new LlmHttpCallError(
        "Faltan credenciales de proveedor para ejecutar la inferencia HTTP.",
        "AI_UPSTREAM_ERROR",
      );
    }

    const result = await this.generateWithCredential({
      providerCode: params.providerCode,
      apiDialect: params.apiDialect,
      baseUrl: params.baseUrl,
      modelCode: params.modelCode,
      apiKey: params.apiKey,
      systemPrompt: params.systemPrompt,
      userPrompt: params.draft,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });

    if (!result.ok) {
      throw new LlmHttpCallError(
        result.error,
        (result.code as LlmProviderErrorCode) ?? "AI_UPSTREAM_ERROR",
      );
    }

    return {
      suggestion: result.data.suggestion,
      inputTokens: result.data.inputTokens,
      outputTokens: result.data.outputTokens,
    };
  }

  private buildAuthHeaders(
    providerCode: string,
    dialect: AiApiDialect,
    baseUrl: string,
    apiKey: string,
  ): Record<string, string> {
    if (dialect === "anthropic") {
      return {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
    }

    if (dialect === "google_gemini") {
      return {
        "x-goog-api-key": apiKey,
      };
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
    };
    if (providerCode === "openrouter" || baseUrl.includes("openrouter.ai")) {
      headers["x-title"] = "Mocter";
    }
    return headers;
  }

  private parseGenerationResponse(
    dialect: AiApiDialect,
    json: Record<string, unknown>,
  ): { suggestion: string; inputTokens: number; outputTokens: number } {
    if (dialect === "openai_compatible") {
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const first = (choices[0] as Record<string, unknown> | undefined) ?? {};
      const message = (first.message as Record<string, unknown> | undefined) ?? {};
      const content = typeof message.content === "string" ? message.content.trim() : "";
      const usage = (json.usage as Record<string, unknown> | undefined) ?? {};
      return {
        suggestion: content,
        inputTokens: Number(usage.prompt_tokens ?? 0) || 0,
        outputTokens: Number(usage.completion_tokens ?? 0) || 0,
      };
    }

    if (dialect === "anthropic") {
      const contentBlocks = Array.isArray(json.content) ? json.content : [];
      const suggestion = contentBlocks
        .map((block) => {
          const item = block as Record<string, unknown>;
          return typeof item.text === "string" ? item.text : "";
        })
        .join("")
        .trim();
      const usage = (json.usage as Record<string, unknown> | undefined) ?? {};
      return {
        suggestion,
        inputTokens: Number(usage.input_tokens ?? 0) || 0,
        outputTokens: Number(usage.output_tokens ?? 0) || 0,
      };
    }

    // Dialecto Google Gemini
    const candidates = Array.isArray(json.candidates) ? json.candidates : [];
    const first = (candidates[0] as Record<string, unknown> | undefined) ?? {};
    const content = (first.content as Record<string, unknown> | undefined) ?? {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const suggestion = parts
      .map((part) => {
        const item = part as Record<string, unknown>;
        return typeof item.text === "string" ? item.text : "";
      })
      .join("")
      .trim();
    const usageMeta = (json.usageMetadata as Record<string, unknown> | undefined) ?? {};
    return {
      suggestion,
      inputTokens: Number(usageMeta.promptTokenCount ?? 0) || 0,
      outputTokens: Number(usageMeta.candidatesTokenCount ?? 0) || 0,
    };
  }
}
