import { env } from "./env";

/**
 * Niveles de severidad admitidos por el sistema de logging estructurado.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Diccionario de pares clave-valor para adjuntar metadatos contextuales al evento de log.
 */
export interface LogContext {
  [key: string]: unknown;
}

const SENSITIVE_PATTERNS = [
  {
    regex: /((?:postgres|postgresql):\/\/[^:]+:)([^@]+)(@)/gi,
    replacement: "$1[REDACTED]$3",
  },
  {
    regex: /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    replacement: "Bearer [REDACTED]",
  },
];

/**
 * Censa y enmascara de manera automática datos sensibles en cadenas de texto.
 *
 * Busca y reemplaza contraseñas en URLs de base de datos (`postgresql://user:pass@host`)
 * y tokens de autenticación Bearer antes de que sean emitidos a los flujos de salida del sistema.
 *
 * @param input - Cadena de texto original susceptible de contener secretos.
 * @returns La cadena de texto saneada con valores reemplazados por `[REDACTED]`.
 *
 * @example
 * ```typescript
 * const seguro = redactSensitiveData("postgresql://admin:12345@localhost/db");
 * // -> "postgresql://admin:[REDACTED]@localhost/db"
 * ```
 */
export function redactSensitiveData(input: string): string {
  let redacted = input;
  for (const item of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(item.regex, item.replacement);
  }
  return redacted;
}

/**
 * Sanitiza recursivamente objetos, arreglos y errores para eliminar claves sensibles.
 *
 * @param obj - Elemento a transformar.
 * @returns Copia sanitizada y segura para ser serializada a formato JSON.
 */
function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return redactSensitiveData(obj);
  }
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactSensitiveData(obj.message),
      stack: obj.stack ? redactSensitiveData(obj.stack) : undefined,
    };
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (/password|secret|token|credential|authorization/i.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeObject(val);
      }
    }
    return sanitized;
  }
  return obj;
}

/**
 * Servicio de logging estructurado ligero y agnóstico del entorno.
 *
 * - En producción emite registros en formato JSON estandarizado para agregadores de logs.
 * - En entornos de desarrollo y pruebas emite salidas legibles con timestamps y etiquetas de color/nivel.
 * - Aplica saneamiento automático sobre cadenas de conexión y secretos.
 */
export class Logger {
  /**
   * Crea una nueva instancia de logger con un espacio de nombres específico.
   *
   * @param namespace - Identificador del módulo o componente emisor (por defecto `"Mocter"`).
   */
  constructor(private readonly namespace: string = "Mocter") {}

  private log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
    const isProd = env.NODE_ENV === "production";
    const timestamp = new Date().toISOString();
    const cleanMessage = redactSensitiveData(message);
    const cleanContext = context ? (sanitizeObject(context) as LogContext) : undefined;
    const cleanError = error ? sanitizeObject(error) : undefined;

    if (isProd) {
      const payload = {
        timestamp,
        level,
        namespace: this.namespace,
        message: cleanMessage,
        ...(cleanContext ? { context: cleanContext } : {}),
        ...(cleanError ? { error: cleanError } : {}),
      };
      if (level === "error") {
        console.error(JSON.stringify(payload));
      } else if (level === "warn") {
        console.warn(JSON.stringify(payload));
      } else {
        console.log(JSON.stringify(payload));
      }
    } else {
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.namespace}]`;
      if (level === "error") {
        console.error(`${prefix} ${cleanMessage}`, cleanContext ?? "", cleanError ?? "");
      } else if (level === "warn") {
        console.warn(`${prefix} ${cleanMessage}`, cleanContext ?? "");
      } else {
        console.log(`${prefix} ${cleanMessage}`, cleanContext ?? "");
      }
    }
  }

  /**
   * Emite un mensaje con nivel de depuración (DEBUG).
   *
   * Solo visible en desarrollo o cuando la variable `DEBUG="true"` está activa.
   *
   * @param message - Descripción del evento interno.
   * @param context - Metadatos adicionales para depuración.
   */
  debug(message: string, context?: LogContext): void {
    if (env.NODE_ENV !== "production" || env.DEBUG === "true") {
      this.log("debug", message, context);
    }
  }

  /**
   * Emite un mensaje informativo de operación regular (INFO).
   *
   * @param message - Resumen del hito o evento exitoso.
   * @param context - Datos contextuales asociados al evento.
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Emite una advertencia sobre una condición inesperada pero recuperable (WARN).
   *
   * @param message - Descripción de la advertencia.
   * @param context - Parámetros de la solicitud que detonó la advertencia.
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Emite un mensaje de error crítico o excepción capturada (ERROR).
   *
   * @param message - Descripción del fallo.
   * @param error - Objeto de error o excepción capturada para extraer mensaje y stack trace.
   * @param context - Contexto en el momento del fallo.
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    this.log("error", message, context, error);
  }
}

/**
 * Instancia singleton de logging preconfigurada para el paquete de dominio {@link @mocter/domain}.
 */
export const appLogger = new Logger("MocterDomain");
