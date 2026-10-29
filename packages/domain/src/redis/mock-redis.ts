import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";

interface MockEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Cliente Redis simulado en memoria para pruebas unitarias e integración (AUTH-001 T-12).
 *
 * Implementa el subconjunto de operaciones requeridas por el limitador de tasa:
 * evaluación de scripts Lua atómicos (`eval`), consultas (`get`), borrado (`del`),
 * y simulación controlada de fallos de red (`simulateFailure`).
 */
export class MockRedisClient extends EventEmitter {
  private store = new Map<string, MockEntry>();
  private shouldFail = false;

  constructor() {
    super();
  }

  /**
   * Configura si el cliente debe simular una falla de conexión o caída de Redis.
   *
   * @param fail - `true` para simular indisponibilidad (Fail-Closed); `false` para operación normal.
   */
  simulateFailure(fail: boolean): void {
    this.shouldFail = fail;
  }

  private checkFailure(): void {
    if (this.shouldFail) {
      throw new Error("ECONNREFUSED: Connection refused to redis-control:6379");
    }
  }

  /**
   * Simula el comando PING de Redis.
   */
  async ping(): Promise<string> {
    this.checkFailure();
    return "PONG";
  }

  /**
   * Simula la evaluación atómica de scripts Lua de limitación de tasa.
   */
  async eval(
    script: string,
    numkeys: number,
    ...keysAndArgs: (string | number)[]
  ): Promise<unknown> {
    this.checkFailure();

    const keys = keysAndArgs.slice(0, numkeys).map(String);
    const args = keysAndArgs.slice(numkeys).map(String);
    const key = keys[0] ?? "";
    const now = Date.now();

    // Limpiar expirados
    const existing = this.store.get(key);
    if (existing && existing.expiresAt !== null && existing.expiresAt <= now) {
      this.store.delete(key);
    }

    // 1. Script de pre-verificación (check sin consumir / GET)
    if (script.includes("GET") && !script.includes("INCR") && !script.includes("DEL")) {
      const limit = Number(args[0] ?? 0);
      const entry = this.store.get(key);
      const current = entry ? Number(entry.value) : 0;
      let ttl = 0;
      if (entry && entry.expiresAt !== null) {
        ttl = Math.max(0, Math.ceil((entry.expiresAt - now) / 1000));
      }
      const allowed = current < limit;
      const remaining = Math.max(0, limit - current);
      return [allowed ? 1 : 0, remaining, ttl];
    }

    // 2. Script de incremento de fallos (INCR con TTL)
    if (script.includes("INCR") && !script.includes("limit")) {
      const windowSeconds = Number(args[0] ?? 900);
      let entry = this.store.get(key);
      if (!entry) {
        entry = { value: "1", expiresAt: now + windowSeconds * 1000 };
        this.store.set(key, entry);
      } else {
        const nextVal = Number(entry.value) + 1;
        entry.value = String(nextVal);
        if (entry.expiresAt === null) {
          entry.expiresAt = now + windowSeconds * 1000;
        }
      }
      const ttl = entry.expiresAt
        ? Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))
        : windowSeconds;
      return [Number(entry.value), ttl];
    }

    // 3. Script de consumo estándar (consume / INCR con límite y TTL)
    if (script.includes("INCR") && script.includes("limit")) {
      const limit = Number(args[0] ?? 0);
      const windowSeconds = Number(args[1] ?? 900);
      let entry = this.store.get(key);
      if (!entry) {
        entry = { value: "1", expiresAt: now + windowSeconds * 1000 };
        this.store.set(key, entry);
      } else {
        const nextVal = Number(entry.value) + 1;
        entry.value = String(nextVal);
        if (entry.expiresAt === null) {
          entry.expiresAt = now + windowSeconds * 1000;
        }
      }

      const current = Number(entry.value);
      const ttl = entry.expiresAt
        ? Math.max(0, Math.ceil((entry.expiresAt - now) / 1000))
        : windowSeconds;
      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);
      return [allowed ? 1 : 0, remaining, ttl];
    }

    // 4. Script de eliminación (DEL)
    if (script.includes("DEL") && !script.includes("GET")) {
      const deleted = this.store.delete(key) ? 1 : 0;
      return deleted;
    }

    // 5. Script de lectura y consumo atómico (GET + DEL)
    if (script.includes("GET") && script.includes("DEL")) {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.store.delete(key);
        return null;
      }
      this.store.delete(key);
      return entry.value;
    }

    return [1, 0, 0];
  }

  /**
   * Almacena una clave con valor y opción de expiración TTL.
   */
  async set(key: string, value: string, ...args: unknown[]): Promise<string> {
    this.checkFailure();
    let ttlSeconds: number | null = null;
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === "string" && (args[i] as string).toUpperCase() === "EX") {
        ttlSeconds = Number(args[i + 1]);
      }
    }
    const expiresAt = ttlSeconds !== null ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  /**
   * Elimina una o más claves del almacén.
   */
  async del(...keys: string[]): Promise<number> {
    this.checkFailure();
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Obtiene el valor de una clave.
   */
  async get(key: string): Promise<string | null> {
    this.checkFailure();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Limpia todo el almacén en memoria.
   */
  async flushall(): Promise<string> {
    this.checkFailure();
    this.store.clear();
    return "OK";
  }

  /**
   * Cierra la conexión simulada.
   */
  async quit(): Promise<string> {
    return "OK";
  }

  /**
   * Desconecta el cliente simulado.
   */
  disconnect(): void {}

  /**
   * Retorna todas las claves actualmente almacenadas (útil para verificar que no haya datos en claro).
   */
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Retorna una entrada directa para aserciones de pruebas.
   */
  getEntry(key: string): { value: number; ttl: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = Date.now();
    const ttl = entry.expiresAt ? Math.max(0, Math.ceil((entry.expiresAt - now) / 1000)) : 0;
    return { value: Number(entry.value), ttl };
  }
}

/**
 * Crea una instancia de `MockRedisClient` convertida al tipo `Redis` de ioredis.
 */
export function createMockRedisClient(): Redis {
  return new MockRedisClient() as unknown as Redis;
}
