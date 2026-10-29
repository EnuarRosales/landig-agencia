import { appLogger } from "../utils/logger";

/**
 * Parámetros para construir la URL de autorización de Facebook OAuth 2.0 (AUTH-001 §5.3).
 */
export interface FacebookAuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}

/**
 * Parámetros para el intercambio del código de autorización por token de acceso en Facebook Graph API.
 */
export interface FacebookCodeExchangeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Respuesta devuelta por el endpoint de tokens de Facebook Graph API.
 */
export interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Carga útil de perfil retornada por `GET /me` de Facebook Graph API.
 */
export interface FacebookUserProfile {
  id: string;
  name?: string;
  email?: string;
  picture?: {
    data?: {
      url?: string;
      is_silhouette?: boolean;
    };
  };
}

/**
 * Error específico lanzado cuando el proveedor externo Facebook no responde o retorna error 5xx.
 *
 * Mapea directamente al requerimiento de AUTH-001 §5.3, §6.3 y T-15:
 * Texto exacto: «Proveedor temporalmente fuera de servicio».
 */
export class FacebookProviderUnavailableError extends Error {
  constructor(message = "Proveedor temporalmente fuera de servicio", cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "FacebookProviderUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error específico lanzado cuando Facebook no devuelve correo electrónico verificado.
 *
 * Mapea directamente al requerimiento de AUTH-001 §5.3, §6.3 y T-15:
 * Texto exacto: «El proveedor no devolvió un correo verificado.» (HTTP 422).
 */
export class FacebookOAuthValidationError extends Error {
  readonly code: "MISSING_OR_UNVERIFIED_EMAIL" | "MALFORMED_RESPONSE" | "INVALID_GRANT";

  constructor(
    code: "MISSING_OR_UNVERIFIED_EMAIL" | "MALFORMED_RESPONSE" | "INVALID_GRANT",
    message: string,
  ) {
    super(message);
    this.name = "FacebookOAuthValidationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Contrato del cliente OAuth 2.0 de Facebook para desacoplar las interacciones HTTP.
 */
export interface IFacebookOAuthClient {
  getAuthorizationUrl(params: FacebookAuthUrlParams): string;
  exchangeCodeForAccessToken(params: FacebookCodeExchangeParams): Promise<FacebookTokenResponse>;
  fetchUserProfile(accessToken: string): Promise<FacebookUserProfile>;
}

/**
 * Implementación canónica de `IFacebookOAuthClient` para producción y pruebas.
 */
export class FacebookOAuthClient implements IFacebookOAuthClient {
  private readonly authorizationEndpoint = "https://www.facebook.com/v19.0/dialog/oauth";
  private readonly tokenEndpoint = "https://graph.facebook.com/v19.0/oauth/access_token";
  private readonly profileEndpoint = "https://graph.facebook.com/v19.0/me";

  /**
   * Construye la URL de inicio de sesión de Facebook con OAuth 2.0 y state (AUTH-001 §5.3, T-15).
   */
  getAuthorizationUrl(params: FacebookAuthUrlParams): string {
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", params.scope || "email,public_profile");
    url.searchParams.set("state", params.state);
    return url.toString();
  }

  /**
   * Canjea el código de autorización por token de acceso mediante Facebook Graph API.
   */
  async exchangeCodeForAccessToken(
    params: FacebookCodeExchangeParams,
  ): Promise<FacebookTokenResponse> {
    const url = new URL(this.tokenEndpoint);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("client_secret", params.clientSecret);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("code", params.code);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    } catch (err: unknown) {
      appLogger.error(
        "[FacebookOAuthClient.exchangeCodeForAccessToken Failed] Fallo de conectividad con Facebook",
        err,
      );
      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
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
        `[FacebookOAuthClient.exchangeCodeForAccessToken Failed] Facebook respondió con estado ${status}`,
        undefined,
        { status, errorBody },
      );

      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio");
    }

    try {
      const data = (await res.json()) as FacebookTokenResponse;
      if (!data.access_token) {
        throw new FacebookOAuthValidationError(
          "MALFORMED_RESPONSE",
          "Respuesta de tokens de Facebook no incluye access_token",
        );
      }
      return data;
    } catch (err: unknown) {
      if (err instanceof FacebookOAuthValidationError) throw err;
      appLogger.error(
        "[FacebookOAuthClient.exchangeCodeForAccessToken Failed] Error al parsear JSON de Facebook",
        err,
      );
      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
    }
  }

  /**
   * Consulta el perfil del usuario autenticado en Facebook Graph API (`/me`) y valida estrictamente el correo electrónico.
   *
   * Cumple con la exigencia de AUTH-001 §5.3, §6.3 y T-15:
   * Solo se acepta el correo si el proveedor lo devuelve. Si no está presente, rechaza con HTTP 422:
   * «El proveedor no devolvió un correo verificado.»
   *
   * @param accessToken - Token de acceso de corta vida (en memoria, nunca persistido).
   * @returns Datos del perfil de Facebook {@link FacebookUserProfile}.
   */
  async fetchUserProfile(accessToken: string): Promise<FacebookUserProfile> {
    const url = new URL(this.profileEndpoint);
    url.searchParams.set("fields", "id,name,email,picture.type(large)");

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (err: unknown) {
      appLogger.error(
        "[FacebookOAuthClient.fetchUserProfile Failed] Fallo de conectividad con Facebook Graph API",
        err,
      );
      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
    }

    if (!res.ok) {
      const status = res.status;
      appLogger.error(
        `[FacebookOAuthClient.fetchUserProfile Failed] Facebook Graph API respondió con estado ${status}`,
        undefined,
        { status },
      );
      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio");
    }

    let profile: FacebookUserProfile;
    try {
      profile = (await res.json()) as FacebookUserProfile;
    } catch (err: unknown) {
      appLogger.error(
        "[FacebookOAuthClient.fetchUserProfile Failed] Error al parsear perfil de Facebook",
        err,
      );
      throw new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio", err);
    }

    // Validación estricta: Si Facebook no devuelve correo electrónico o viene vacío
    if (!profile.email || !profile.email.trim()) {
      appLogger.warn(
        "[FacebookOAuthClient.fetchUserProfile] Facebook no suministró correo electrónico verificado para el usuario",
        { facebookUserId: profile.id },
      );
      throw new FacebookOAuthValidationError(
        "MISSING_OR_UNVERIFIED_EMAIL",
        "El proveedor no devolvió un correo verificado.",
      );
    }

    return profile;
  }
}

/** Instancia singleton por defecto de {@link FacebookOAuthClient}. */
export const defaultFacebookOAuthClient = new FacebookOAuthClient();
