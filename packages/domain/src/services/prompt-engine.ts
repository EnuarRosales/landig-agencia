import { composePrompt, type ComposePromptInput, type ComposedPrompt } from "./prompt-composer";
import type { Result } from "../types/result";

/** Dimensiones de la clave de caché del prompt (BOT-002 §8). */
export interface PromptCacheKeyParts {
  clientId: string;
  botId: string;
  configVersion: number;
  productId: string | null;
  productRevision: number;
  policiesVersion: number;
  locale: string;
}

/** TTL de respaldo: 5 minutos. */
export const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: ComposedPrompt;
  expiresAt: number;
  clientId: string;
  botId: string;
  productId: string | null;
}

/**
 * Caché en memoria del prompt compuesto con invalidación por cambio de bot, producto, políticas
 * o bloques (BOT-002 T-05). El reloj es inyectable para pruebas.
 */
export class PromptCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = PROMPT_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Construye la clave determinista `(client, bot, config, product, rev, policies, locale)`. */
  static buildKey(p: PromptCacheKeyParts): string {
    return [
      p.clientId,
      p.botId,
      p.configVersion,
      p.productId ?? "-",
      p.productRevision,
      p.policiesVersion,
      p.locale,
    ].join("|");
  }

  get(parts: PromptCacheKeyParts): ComposedPrompt | null {
    const key = PromptCache.buildKey(parts);
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(parts: PromptCacheKeyParts, value: ComposedPrompt): void {
    this.store.set(PromptCache.buildKey(parts), {
      value,
      expiresAt: this.now() + this.ttlMs,
      clientId: parts.clientId,
      botId: parts.botId,
      productId: parts.productId,
    });
  }

  /** Invalida las entradas de un producto del inquilino. */
  invalidateProduct(clientId: string, productId: string): number {
    return this.invalidateWhere((e) => e.clientId === clientId && e.productId === productId);
  }

  /** Invalida todo el inquilino (cambio de políticas o bloques activos). */
  invalidateClient(clientId: string): number {
    return this.invalidateWhere((e) => e.clientId === clientId);
  }

  /** Invalida las entradas de un bot (cambio de configuración). */
  invalidateBot(clientId: string, botId: string): number {
    return this.invalidateWhere((e) => e.clientId === clientId && e.botId === botId);
  }

  /** Invalida todo (cambio de bloques de plataforma). */
  invalidateAll(): number {
    const size = this.store.size;
    this.store.clear();
    return size;
  }

  private invalidateWhere(predicate: (entry: CacheEntry) => boolean): number {
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (predicate(entry)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

/**
 * Motor de prompts: único punto de composición para el turno y para la vista previa, de modo
 * que el preview coincide con lo que consume el motor para la misma versión (BOT-002 T-09).
 */
export class PromptEngine {
  constructor(private readonly cache: PromptCache = new PromptCache()) {}

  /** Prompt del turno: usa caché si la clave por versiones coincide. */
  getTurnPrompt(
    parts: PromptCacheKeyParts,
    input: ComposePromptInput,
  ): Result<ComposedPrompt> {
    const cached = this.cache.get(parts);
    if (cached) return { ok: true, data: cached };
    const composed = composePrompt(input);
    if (composed.ok) this.cache.set(parts, composed.data);
    return composed;
  }

  /** Vista previa sin caché ni efectos persistentes: devuelve prompt, bloques y tokens. */
  preview(input: ComposePromptInput): Result<ComposedPrompt> {
    return composePrompt(input);
  }
}

