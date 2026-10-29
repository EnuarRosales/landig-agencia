import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRedisClient, isRedisHealthy } from "../redis/client";
import { RedisUnavailableError } from "./rate-limiter";

/**
 * Proveedores de identidad federada soportados por Mocter (AUTH-001 §5.3, §6.1).
 */
export type OAuthProvider = "google" | "facebook";

/**
 * Propósito de la interacción OAuth: autenticación normal o vinculación de cuenta (AUTH-001 §5.3, §5.4).
 */
export type OAuthAction = "login" | "link";

/**
 * Carga útil almacenada en Redis bajo la clave de estado OAuth (AUTH-001 §5.3, §7.1).
 */
export interface OAuthStatePayload {
  /** Proveedor para el cual se emitió el estado. */
  readonly provider: OAuthProvider;
  /** Verificador criptográfico PKCE en texto plano (RFC 7636). */
  readonly codeVerifier: string;
  /** Desafío criptográfico derivado mediante SHA-256 (S256). */
  readonly codeChallenge: string;
  /** Valor criptográfico aleatorio para prevención de ataques de repetición en OIDC. */
  readonly nonce?: string;
  /** Ruta relativa de retorno segura a la cual redirigir tras completar el flujo. */
  readonly returnTo: string;
  /** Acción ejecutada: inicio de sesión o vinculación a una cuenta existente. */
  readonly action: OAuthAction;
  /** Identificador del usuario autenticado si la acción corresponde a vinculación (`link`). */
  readonly userId?: string;
  /** Marca de tiempo Unix (ms) de creación del registro. */
  readonly createdAt: number;
}

/**
 * Parámetros para inicializar un nuevo estado y desafío PKCE de OAuth.
 */
export interface CreateOAuthStateParams {
  /** Proveedor de autenticación federada. */
  provider: OAuthProvider;
  /** Tipo de operación: inicio de sesión (`login`) o vinculación (`link`). Por defecto `login`. */
  action?: OAuthAction;
  /** Ruta relativa opcional solicitada para retorno (`return_to`). */
  returnTo?: string | null;
  /** Identificador del usuario actual en caso de vinculación. */
  userId?: string;
}

/**
 * Resultado de la generación y persistencia de un estado OAuth con desafío PKCE.
 */
export interface CreateOAuthStateResult {
  /** Cadena de estado aleatoria generada para enviar al proveedor y fijar en cookie. */
  state: string;
  /** Verificador de código PKCE (RFC 7636). */
  codeVerifier: string;
  /** Desafío de código PKCE derivado (S256). */
  codeChallenge: string;
  /** Nonce criptográfico generado para proveedores OIDC (Google). */
  nonce?: string;
  /** Ruta relativa sanitizada de retorno. */
  returnTo: string;
  /** Nombre canónico de la cookie de estado según el proveedor y acción. */
  cookieName: string;
  /** Opciones de seguridad para la cookie HTTP. */
  cookieOptions: OAuthCookieOptions;
}

/**
 * Opciones canónicas para la emisión de cookies de estado OAuth (AUTH-001 §6.2).
 */
export interface OAuthCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/**
 * Resultado del consumo y validación atómica del estado OAuth.
 */
export type ConsumeOAuthStateResult =
  | { readonly ok: true; readonly data: OAuthStatePayload }
  | { readonly ok: false; readonly code: "INVALID_STATE" | "STATE_EXPIRED_OR_CONSUMED" | "PROVIDER_MISMATCH"; readonly error: string };

/**
 * Tiempo de vida estándar de los estados OAuth en Redis y en cookies (10 minutos en segundos).
 */
export const OAUTH_STATE_TTL_SECONDS = 600;

/**
 * Ruta de retorno predeterminada segura ante entradas ausentes o inválidas.
 */
export const DEFAULT_SAFE_RETURN_TO = "/admin";

/**
 * Script Lua para lectura y consumo atómico de un solo uso (GET + DEL) en Redis (AUTH-001 §5.3).
 */
const GET_AND_DELETE_LUA_SCRIPT = `
local val = redis.call('GET', KEYS[1])
if val then
  redis.call('DEL', KEYS[1])
end
return val
`;

/**
 * Genera un valor aleatorio criptográficamente seguro para el parámetro `state` de OAuth (32 bytes).
 *
 * @returns Cadena codificada en `base64url` de 32 bytes de entropía.
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Genera un verificador de código (code_verifier) PKCE según RFC 7636.
 *
 * Emplea 32 bytes de entropía produciendo una cadena `base64url` de 43 caracteres,
 * cumpliendo con la especificación de longitud permitida (43 a 128 caracteres).
 *
 * @returns Verificador PKCE aleatorio en `base64url`.
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Deriva el desafío de código (code_challenge) mediante el método S256 (SHA-256 en base64url).
 *
 * @param verifier - Verificador de código en texto plano.
 * @returns Desafío de código transformado en `base64url`.
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Genera un valor criptográfico aleatorio `nonce` para prevención de ataques de repetición en OIDC.
 *
 * @returns Cadena codificada en `base64url` de 32 bytes de entropía.
 */
export function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Sanitiza y restringe estrictamente una ruta de retorno para prevenir ataques de Redirección Abierta (Open Redirect).
 *
 * Solo permite rutas relativas que inicien con un único `/`. Rechaza rutas absolutas (`https://`),
 * esquemas (`javascript:`, `data:`) y rutas relativas al protocolo (`//evil.com`).
 *
 * @param returnTo - Valor suministrado externamente en la solicitud.
 * @param fallback - Ruta predeterminada en caso de no superar la validación (por defecto `/admin`).
 * @returns Ruta relativa segura garantizada.
 */
export function sanitizeReturnTo(
  returnTo?: string | null,
  fallback = DEFAULT_SAFE_RETURN_TO,
): string {
  if (!returnTo || typeof returnTo !== "string") {
    return fallback;
  }

  const trimmed = returnTo.trim();

  // Debe iniciar con '/' pero no con '//' ni '/\' (evita bypass de protocolo o barras inversas de Windows)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Prevenir esquemas incrustados antes del primer slash o en la ruta
  if (trimmed.includes(":") || trimmed.includes("\\")) {
    return fallback;
  }

  return trimmed;
}

/**
 * Construye la clave de Redis normalizada para el estado de OAuth (AUTH-001 §5.3).
 *
 * Formato canónico: `auth:oauth:<provider>:<sha256(state)>`
 *
 * @param provider - Proveedor de autenticación (`google` | `facebook`).
 * @param state - Estado aleatorio en texto plano.
 * @returns Clave calculada para el almacenamiento en Redis.
 */
export function buildOAuthRedisKey(provider: OAuthProvider, state: string): string {
  const stateHash = createHash("sha256").update(state).digest("hex");
  return `auth:oauth:${provider}:${stateHash}`;
}

/**
 * Obtiene el nombre canónico de la cookie de estado según el proveedor y la acción (AUTH-001 §6.2).
 *
 * - Login Google: `mocter_oauth_state_google`
 * - Login Facebook: `mocter_oauth_state_facebook`
 * - Vinculación Google: `mocter_oauth_link_state_google`
 * - Vinculación Facebook: `mocter_oauth_link_state_facebook`
 *
 * @param provider - Proveedor federado.
 * @param action - Operación solicitada (`login` o `link`).
 * @returns Nombre exacto de la cookie.
 */
export function getOAuthCookieName(provider: OAuthProvider, action: OAuthAction): string {
  if (action === "link") {
    return `mocter_oauth_link_state_${provider}`;
  }
  return `mocter_oauth_state_${provider}`;
}

/**
 * Retorna las opciones de seguridad y alcance de ruta para la cookie de estado (AUTH-001 §6.2).
 *
 * Aplica `Path=/auth/<provider>` para login, o `Path=/auth/link` para vinculación.
 * En Next.js App Router, para compatibilidad con rutas API tanto en `/api/auth/` como en `/auth/`,
 * se define el path apropiado.
 *
 * @param provider - Proveedor federado.
 * @param action - Operación solicitada (`login` o `link`).
 * @param isProduction - Indica si el entorno activo requiere banderas estrictas de producción (`Secure`).
 * @returns Objeto {@link OAuthCookieOptions}.
 */
export function getOAuthCookieOptions(
  provider: OAuthProvider,
  action: OAuthAction,
  isProduction: boolean,
): OAuthCookieOptions {
  // Path acotado al proveedor o al flujo de vinculación según especificación §6.2
  const path = action === "link" ? "/auth/link" : `/auth/${provider}`;

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path,
    maxAge: OAUTH_STATE_TTL_SECONDS,
  };
}

/**
 * Compara dos cadenas de texto de estado en tiempo constante.
 *
 * Previene ataques de canal lateral (timing attacks) durante la validación del state.
 *
 * @param stateA - Primer estado.
 * @param stateB - Segundo estado.
 * @returns `true` si ambas cadenas son idénticas en longitud y contenido; `false` en caso contrario.
 */
export function compareOAuthStates(stateA: string, stateB: string): boolean {
  const bufA = Buffer.from(stateA);
  const bufB = Buffer.from(stateB);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Gestor de Estado y Desafíos Criptográficos PKCE de OAuth en Redis (AUTH-001 T-13, design §5.3, §6.2).
 */
export class OAuthStateManager {
  /**
   * Genera un nuevo estado criptográfico, verificador PKCE (S256), nonce y persiste el registro en Redis.
   *
   * @param params - Opciones de configuración del estado {@link CreateOAuthStateParams}.
   * @param isProduction - Bandera para configuración de cookies seguras.
   * @returns Datos generados {@link CreateOAuthStateResult}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (política Fail-Closed).
   */
  async createState(
    params: CreateOAuthStateParams,
    isProduction = false,
  ): Promise<CreateOAuthStateResult> {
    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError(
        "No fue posible conectar con el servidor Redis de control para persistir el estado OAuth.",
      );
    }

    const provider = params.provider;
    const action = params.action ?? "login";
    const state = generateOAuthState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce = provider === "google" ? generateNonce() : undefined;
    const returnTo = sanitizeReturnTo(params.returnTo);

    const payload: OAuthStatePayload = {
      provider,
      codeVerifier,
      codeChallenge,
      nonce,
      returnTo,
      action,
      userId: action === "link" ? params.userId : undefined,
      createdAt: Date.now(),
    };

    const redisKey = buildOAuthRedisKey(provider, state);

    try {
      await redis.set(redisKey, JSON.stringify(payload), "EX", OAUTH_STATE_TTL_SECONDS);
    } catch (err: unknown) {
      throw new RedisUnavailableError(
        "Fallo de comunicación con Redis al almacenar el estado de OAuth.",
        err,
      );
    }

    const cookieName = getOAuthCookieName(provider, action);
    const cookieOptions = getOAuthCookieOptions(provider, action, isProduction);

    return {
      state,
      codeVerifier,
      codeChallenge,
      nonce,
      returnTo,
      cookieName,
      cookieOptions,
    };
  }

  /**
   * Valida y consume de forma atómica (un solo uso) el estado de OAuth recibido en el callback.
   *
   * 1. Verifica que el parámetro `state` coincida exactamente con la cookie de navegación en tiempo constante.
   * 2. Recupera y elimina atómicamente la entrada de Redis mediante script Lua (evita replay attacks).
   * 3. Comprueba que el proveedor coincida con el esperado.
   *
   * @param params - Parámetros de validación recibidos en el callback.
   * @returns Resultado tipado {@link ConsumeOAuthStateResult}.
   * @throws {@link RedisUnavailableError} Si Redis no está disponible (Fail-Closed).
   */
  async consumeState(params: {
    provider: OAuthProvider;
    state: string;
    cookieState?: string | null;
  }): Promise<ConsumeOAuthStateResult> {
    const { provider, state, cookieState } = params;

    // 1. Validar presencia y coincidencia estricta con la cookie de navegación
    if (!state || !cookieState || !compareOAuthStates(state, cookieState)) {
      return {
        ok: false,
        code: "INVALID_STATE",
        error: "El estado de autorización OAuth no coincide con la cookie de navegación.",
      };
    }

    const redis = getRedisClient();
    if (!redis) {
      throw new RedisUnavailableError(
        "No fue posible conectar con el servidor Redis de control para consumir el estado OAuth.",
      );
    }

    const redisKey = buildOAuthRedisKey(provider, state);
    let rawPayload: unknown;

    try {
      rawPayload = await redis.eval(GET_AND_DELETE_LUA_SCRIPT, 1, redisKey);
    } catch (err: unknown) {
      throw new RedisUnavailableError(
        "Fallo de comunicación con Redis al consumir atómicamente el estado OAuth.",
        err,
      );
    }

    if (!rawPayload || typeof rawPayload !== "string") {
      return {
        ok: false,
        code: "STATE_EXPIRED_OR_CONSUMED",
        error: "El estado de autorización ha expirado o ya fue consumido.",
      };
    }

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(rawPayload) as OAuthStatePayload;
    } catch {
      return {
        ok: false,
        code: "STATE_EXPIRED_OR_CONSUMED",
        error: "Carga de estado corrupta o no parseable.",
      };
    }

    // 2. Verificar que el proveedor corresponda al solicitado
    if (payload.provider !== provider) {
      return {
        ok: false,
        code: "PROVIDER_MISMATCH",
        error: "El estado de autorización no corresponde al proveedor solicitado.",
      };
    }

    return {
      ok: true,
      data: payload,
    };
  }
}

/**
 * Instancia singleton exportada para la gestión de estados OAuth en el dominio.
 */
export const oauthStateManager = new OAuthStateManager();
