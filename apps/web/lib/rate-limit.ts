/**
 * Opciones de configuración para el limitador de tasa en memoria.
 */
export interface RateLimitOptions {
  /** Cantidad máxima de peticiones permitidas dentro de la ventana de tiempo. Por defecto 10. */
  maxRequests?: number;
  /** Duración de la ventana de tiempo en milisegundos. Por defecto 60,000 (1 minuto). */
  windowMs?: number;
}

/**
 * Resultado de la verificación de límite de tasa para un cliente.
 */
export interface RateLimitResult {
  /** Indica si la petición actual tiene permitido proceder. */
  allowed: boolean;
  /** Cantidad de peticiones restantes antes de ser bloqueado. */
  remaining: number;
  /** Marca de tiempo Unix (ms) en la que se reinicia el cupo disponible. */
  resetAt: number;
}

interface ClientRecord {
  timestamps: number[];
}

/**
 * Limitador de tasa en memoria basado en el algoritmo de ventana deslizante (Sliding Window).
 *
 * Registra marcas de tiempo por identificador (dirección IP) y purga automáticamente registros
 * obsoletos para prevenir fugas de memoria en procesos de Node.js de larga duración.
 */
export class MemoryRateLimiter {
  private clients = new Map<string, ClientRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private lastCleanup: number;

  /**
   * Inicializa una nueva instancia de `MemoryRateLimiter`.
   *
   * @param options - Parámetros de configuración del límite de tasa.
   */
  constructor(options: RateLimitOptions = {}) {
    this.maxRequests = options.maxRequests ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.lastCleanup = Date.now();
  }

  /**
   * Evalúa si una petición proveniente de una clave (IP) está dentro de los límites permitidos.
   *
   * @param key - Identificador del cliente (habitualmente la dirección IP del visitante).
   * @returns Un objeto {@link RateLimitResult} con la decisión y cuota restante.
   *
   * @example
   * ```typescript
   * const decision = limiter.check("192.168.1.1");
   * if (!decision.allowed) {
   *   return new Response("Too Many Requests", { status: 429 });
   * }
   * ```
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    this.cleanupIfNeeded(now);

    let record = this.clients.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.clients.set(key, record);
    }

    // Filtrar timestamps fuera de la ventana activa
    const windowStart = now - this.windowMs;
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0] ?? now;
      const resetAt = oldestInWindow + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    record.timestamps.push(now);
    const remaining = this.maxRequests - record.timestamps.length;
    const resetAt = now + this.windowMs;

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  /**
   * Purga periódicamente los registros de clientes inactivos para evitar crecimiento indebido de memoria.
   */
  private cleanupIfNeeded(now: number): void {
    if (now - this.lastCleanup > 60_000) {
      const windowStart = now - this.windowMs;
      for (const [key, record] of this.clients.entries()) {
        const active = record.timestamps.filter((t) => t > windowStart);
        if (active.length === 0) {
          this.clients.delete(key);
        } else {
          record.timestamps = active;
        }
      }
      this.lastCleanup = now;
    }
  }

  /**
   * Limpia todos los registros y contadores almacenados (útil en pruebas unitarias).
   */
  reset(): void {
    this.clients.clear();
  }
}

/**
 * Instancia singleton predeterminada para limitar peticiones públicas en el formulario y API de leads.
 * Configuración: 10 peticiones por minuto.
 */
export const publicLeadRateLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

/**
 * Función helper conveniente para evaluar el límite de peticiones de una dirección IP.
 *
 * @param ip - Dirección IP del cliente remitente.
 * @returns Resultado {@link RateLimitResult} con autorización y saldo restante.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  return publicLeadRateLimiter.check(ip);
}
