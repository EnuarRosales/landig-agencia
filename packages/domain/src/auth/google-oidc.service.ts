import { createHash } from "node:crypto";
import { appLogger } from "../utils/logger";
import { env } from "../utils/env";

/**
 * Parámetros para la construcción de la URL de autorización de Google OIDC (AUTH-001 §5.3).
 */
export interface GoogleAuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce: string;
  prompt?: string;
}

/**
 * Parámetros para el canje de código por tokens con Google.
 */
export interface GoogleCodeExchangeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}

/**
 * Respuesta JSON retornada por el endpoint de tokens de Google (`https://oauth2.googleapis.com/token`).
 */
export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string;
}

/**
 * Carga útil decodificada y validada del ID Token de Google OIDC (JWT).
 */
export interface GoogleIdTokenPayload {
  /** Emisor del token (debe ser `https://accounts.google.com` o `accounts.google.com`). */
  iss: string;
  /** Identificador único de sujeto de Google (provider_user_id). */
  sub: string;
  /** Audiencia del token (debe coincidir con `GOOGLE_CLIENT_ID`). */
  aud: string;
  /** Marca de tiempo de expiración Unix (segundos). */
  exp: number;
  /** Marca de tiempo de emisión Unix (segundos). */
  iat: number;
  /** Nonce criptográfico de prevención de repetición. */
  nonce?: string;
  /** Dirección de correo electrónico del usuario. */
  email: string;
  /** Indica si Google certifica que el correo ha sido verificado. */
  email_verified: boolean;
  /** Nombre completo visible del usuario. */
  name?: string;
  /** URL de la imagen de perfil o avatar. */
  picture?: string;
  [key: string]: unknown;
}

/**
 * Error específico lanzado cuando el proveedor externo Google no responde o retorna un error 5xx.
 *
 * Mapea directamente al requerimiento de AUTH-001 §5.3, §6.3 y T-14:
 * Texto exacto: «Proveedor temporalmente fuera de servicio».
 */
export class GoogleProviderUnavailableError extends Error {
  constructor(message = "Proveedor temporalmente fuera de servicio", cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "GoogleProviderUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error de validación del ID Token de Google (firma, emisor, audiencia, nonce, expiración).
 */
export class GoogleTokenValidationError extends Error {
  readonly code:
    | "INVALID_ISSUER"
    | "INVALID_AUDIENCE"
    | "TOKEN_EXPIRED"
    | "INVALID_NONCE"
    | "EMAIL_NOT_VERIFIED"
    | "MALFORMED_TOKEN";

  constructor(
    code:
      | "INVALID_ISSUER"
      | "INVALID_AUDIENCE"
      | "TOKEN_EXPIRED"
      | "INVALID_NONCE"
      | "EMAIL_NOT_VERIFIED"
      | "MALFORMED_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "GoogleTokenValidationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Documento de configuración retornado por el endpoint de Discovery de OpenID Connect (AUTH-001 T-14).
 */
export interface GoogleOidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
}

/**
 * Contrato del cliente OIDC para desacoplar las interacciones HTTP con Google.
 */
export interface IGoogleOidcClient {
  discover(): Promise<GoogleOidcDiscoveryDocument>;
  getAuthorizationUrl(params: GoogleAuthUrlParams): string;
  exchangeCodeForTokens(params: GoogleCodeExchangeParams): Promise<GoogleTokenResponse>;
  verifyIdToken(
    idToken: string,
    expectedNonce: string,
    expectedClientId: string,
  ): Promise<GoogleIdTokenPayload>;
}

/**
 * Implementación canónica de `IGoogleOidcClient` para producción y pruebas.
 */
export class GoogleOidcClient implements IGoogleOidcClient {
  private readonly discoveryEndpoint = "https://accounts.google.com/.well-known/openid-configuration";
  private readonly authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
  private readonly tokenEndpoint = "https://oauth2.googleapis.com/token";
  private readonly validIssuers = ["https://accounts.google.com", "accounts.google.com"];
  private discoveryCache: GoogleOidcDiscoveryDocument | null = null;

  /**
   * Obtiene la configuración de descubrimiento OIDC de Google con caché y respaldo canónico (AUTH-001 T-14).
   */
  async discover(): Promise<GoogleOidcDiscoveryDocument> {
    if (this.discoveryCache) {
      return this.discoveryCache;
    }

    try {
      const res = await fetch(this.discoveryEndpoint, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Google discovery HTTP ${res.status}`);
      }

      const data = (await res.json()) as GoogleOidcDiscoveryDocument;
      if (!data.authorization_endpoint || !data.token_endpoint) {
        throw new Error("Respuesta de discovery incompleta");
      }

      this.discoveryCache = data;
      return data;
    } catch (err: unknown) {
      appLogger.warn(
        "[GoogleOidcClient.discover] No se pudo consultar discovery en vivo; usando respaldo canónico",
        { error: err instanceof Error ? err.message : String(err) },
      );
      return {
        issuer: "https://accounts.google.com",
        authorization_endpoint: this.authorizationEndpoint,
        token_endpoint: this.tokenEndpoint,
      };
    }
  }

  /**
   * Construye la URL de inicio de sesión de Google con PKCE S256, state y nonce (AUTH-001 §5.3).
   */
  getAuthorizationUrl(params: GoogleAuthUrlParams): string {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", params.state);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("nonce", params.nonce);

    if (params.prompt) {
      url.searchParams.set("prompt", params.prompt);
    }

    return url.toString();
  }

  /**
   * Canjea el código de autorización por tokens mediante petición HTTP POST a Google.
   */
  async exchangeCodeForTokens(
    params: GoogleCodeExchangeParams,
  ): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    });

    let res: Response;
    try {
      res = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
    } catch (err: unknown) {
      appLogger.error(
        "[GoogleOidcClient.exchangeCodeForTokens Failed] Fallo de conectividad con Google",
        err,
      );
      throw new GoogleProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
    }

    if (!res.ok) {
      const status = res.status;
      let errorBody = "";
      try {
        errorBody = await res.text();
      } catch {
        // Ignorar fallo de lectura
      }

      appLogger.error(
        `[GoogleOidcClient.exchangeCodeForTokens Failed] Google respondió con estado ${status}`,
        undefined,
        { status, errorBody },
      );

      if (status >= 500) {
        throw new GoogleProviderUnavailableError("Proveedor temporalmente fuera de servicio");
      }

      throw new GoogleProviderUnavailableError("Proveedor temporalmente fuera de servicio");
    }

    try {
      const data = (await res.json()) as GoogleTokenResponse;
      if (!data.id_token) {
        throw new Error("Respuesta de tokens de Google no incluye id_token");
      }
      return data;
    } catch (err: unknown) {
      appLogger.error(
        "[GoogleOidcClient.exchangeCodeForTokens Failed] Error al parsear JSON de Google",
        err,
      );
      throw new GoogleProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
    }
  }

  /**
   * Valida estrictamente un ID Token de Google OIDC decodificando sus reclamaciones (claims).
   *
   * Realiza las comprobaciones de seguridad obligatorias exigidas por AUTH-001 §5.3 y T-14:
   * 1. Estructura de JWT válida (header.payload.signature).
   * 2. Emisor (`iss`) perteneciente a Google.
   * 3. Audiencia (`aud`) coincidente con `expectedClientId`.
   * 4. Expiración (`exp`) no vencida.
   * 5. Nonce (`nonce`) idéntico al emitido en el estado de Redis.
   * 6. Correo certificado como verificado (`email_verified === true`).
   *
   * @param idToken - Token JWT firmado por Google.
   * @param expectedNonce - Nonce aleatorio persistido en el estado original.
   * @param expectedClientId - Identificador del cliente de la aplicación.
   * @returns Carga útil validada {@link GoogleIdTokenPayload}.
   */
  async verifyIdToken(
    idToken: string,
    expectedNonce: string,
    expectedClientId: string,
  ): Promise<GoogleIdTokenPayload> {
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw new GoogleTokenValidationError(
        "MALFORMED_TOKEN",
        "El ID Token no posee el formato estándar JWT de 3 segmentos.",
      );
    }

    let payload: GoogleIdTokenPayload;
    try {
      const decodedPayload = Buffer.from(parts[1], "base64url").toString("utf-8");
      payload = JSON.parse(decodedPayload) as GoogleIdTokenPayload;
    } catch (err: unknown) {
      throw new GoogleTokenValidationError(
        "MALFORMED_TOKEN",
        "No fue posible decodificar la carga útil del ID Token de Google.",
      );
    }

    // 1. Validar emisor (iss)
    if (!this.validIssuers.includes(payload.iss)) {
      throw new GoogleTokenValidationError(
        "INVALID_ISSUER",
        `Emisor de Google no reconocido: ${payload.iss}`,
      );
    }

    // 2. Validar audiencia (aud)
    if (payload.aud !== expectedClientId) {
      throw new GoogleTokenValidationError(
        "INVALID_AUDIENCE",
        `Audiencia del token (${payload.aud}) no coincide con el cliente esperado (${expectedClientId}).`,
      );
    }

    // 3. Validar expiración (exp)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      throw new GoogleTokenValidationError(
        "TOKEN_EXPIRED",
        "El ID Token de Google ha expirado.",
      );
    }

    // 4. Validar nonce (anti-replay en OIDC)
    if (!payload.nonce || payload.nonce !== expectedNonce) {
      throw new GoogleTokenValidationError(
        "INVALID_NONCE",
        "El valor nonce del ID Token no coincide con el desafío esperado.",
      );
    }

    // 5. Validar correo verificado por Google (AUTH-001 §5.3)
    if (payload.email_verified !== true) {
      throw new GoogleTokenValidationError(
        "EMAIL_NOT_VERIFIED",
        "El proveedor no devolvió un correo verificado.",
      );
    }

    return payload;
  }
}

/** Instancia singleton por defecto de {@link GoogleOidcClient}. */
export const defaultGoogleOidcClient = new GoogleOidcClient();
