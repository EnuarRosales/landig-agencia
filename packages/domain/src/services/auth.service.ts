import {
  registerUserSchema,
  loginUserSchema,
  authEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  type RegisterUserInput,
  type LoginUserInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type ChangePasswordInput,
} from "../auth/validation";
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  needsRehash,
} from "../auth/password-hasher";
import {
  generateSecureToken,
  hashToken,
  hashIpWithPepper,
  generateSessionId,
  generateCsrfToken,
  compareHashesConstantTime,
} from "../auth/tokens";
import type { Session, User } from "../db/schemas";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import { defaultAuthRepository } from "../repositories/drizzle-auth.repository";
import type { IAuthMailer } from "../auth/auth-mailer.interface";
import { defaultAuthMailer } from "../auth/auth-mailer.interface";
import {
  type IGoogleOidcClient,
  defaultGoogleOidcClient,
  GoogleProviderUnavailableError,
  GoogleTokenValidationError,
} from "../auth/google-oidc.service";
import {
  type IFacebookOAuthClient,
  defaultFacebookOAuthClient,
  FacebookProviderUnavailableError,
  FacebookOAuthValidationError,
} from "../auth/facebook-oauth.service";
import { OAuthStateManager, oauthStateManager } from "../auth/oauth-state";
import {
  TotpCryptoService,
  defaultTotpCryptoService,
} from "../auth/totp-crypto";
import {
  generateTotpSecret,
  verifyTotpCode,
  generateOtpauthUri,
} from "../auth/totp";
import {
  MfaChallengeManager,
  mfaChallengeManager as defaultMfaChallengeManager,
} from "../auth/mfa-challenge";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";

/**
 * Mensaje estándar anti-enumeración retornado en todas las solicitudes de registro nativo (AUTH-001 §5.1).
 */
export const GENERIC_REGISTER_SUCCESS_MESSAGE =
  "Si la cuenta existe, enviamos un correo con instrucciones.";

/**
 * Mensaje estándar retornado ante credenciales inválidas (AUTH-001 §5.2).
 *
 * No distingue correo inexistente, contraseña incorrecta, cuenta federada o cuenta deshabilitada.
 */
export const GENERIC_INVALID_CREDENTIALS_MESSAGE =
  "Correo o contraseña incorrectos.";

/**
 * Mensaje estándar retornado al solicitar recuperación de contraseña (anti-enumeración, AUTH-001 §5.8).
 */
export const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "Si la cuenta existe y tiene contraseña configurada, enviamos un enlace de recuperación.";

/**
 * Objeto de respuesta para solicitudes de recuperación de contraseña.
 */
export interface ForgotPasswordResponseData {
  message: string;
}

export type ForgotPasswordResult = Result<ForgotPasswordResponseData>;

/**
 * Objeto de respuesta para el restablecimiento de contraseña.
 */
export interface ResetPasswordResponseData {
  message: string;
}

export type ResetPasswordResult = Result<ResetPasswordResponseData>;

/**
 * Objeto de respuesta para cambio autenticado de contraseña con sesión rotada.
 */
export interface ChangePasswordResponseData {
  message: string;
  sid: string;
  csrfToken: string;
  expiresAt: string;
}

export type ChangePasswordResult = Result<ChangePasswordResponseData>;

/**
 * Contexto de sesión requerido para realizar un cambio de contraseña autenticado.
 */
export interface ChangePasswordContext {
  userId: string;
  sessionId: string;
}

/**
 * Opciones de contexto adicionales para la solicitud de inicio de sesión (AUTH-001 §5.2, §5.6).
 */
export interface LoginContextOptions {
  /** Dirección IP del cliente solicitante. */
  clientIp?: string;
  /** Encabezado User-Agent del cliente. */
  userAgent?: string;
  /** Clave pepper del sistema para HMAC de IP y User-Agent. */
  pepper?: string;
}

/**
 * Datos retornados en un inicio de sesión nativo exitoso sin doble factor.
 */
export interface LoginSuccessData {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    status: string;
  };
  emailVerified: boolean;
  clientId: string | null;
  expiresAt: string;
  sid: string;
  csrfToken: string;
}

/**
 * Datos retornados cuando la cuenta tiene 2FA activo y requiere validación de segundo factor.
 */
export interface LoginMfaChallengeData {
  mfaRequired: true;
  userId: string;
  challengeToken: string;
  expiresAt: string;
}

/**
 * Resultado retornado por {@link AuthService.login}.
 */
export type LoginResult = Result<LoginSuccessData | LoginMfaChallengeData>;

/**
 * Objeto devuelto tras el procesamiento de una solicitud de registro.
 */
export interface RegisterResponseData {
  /** Mensaje genérico de confirmación al usuario. */
  message: string;
}

/**
 * Tipo de resultado retornado por {@link AuthService.register}.
 */
export type RegisterResult = Result<RegisterResponseData>;

/**
 * Opciones contextuales adicionales para la ejecución del registro.
 */
export interface RegisterContextOptions {
  /** Dirección IP del cliente solicitante para cómputo de HMAC y auditoría. */
  clientIp?: string;
  /** Clave pepper del sistema para HMAC de la dirección IP. */
  pepper?: string;
}

/**
 * Parámetros requeridos para procesar el callback de autenticación federada con Google (AUTH-001 T-14).
 */
export interface AuthenticateWithGoogleInput {
  /** Código de autorización devuelto por Google en la redirección. */
  code: string;
  /** Estado de autorización devuelto en el parámetro de consulta `state`. */
  state: string;
  /** Valor del estado almacenado en la cookie HTTP `mocter_oauth_state_google`. */
  clientCookieState: string;
  /** Identificador de cliente de Google (`GOOGLE_CLIENT_ID`). */
  clientId: string;
  /** Secreto de cliente de Google (`GOOGLE_CLIENT_SECRET`). */
  clientSecret: string;
  /** URI de redirección exacta registrada (`GOOGLE_REDIRECT_URI`). */
  redirectUri: string;
  /** Dirección IP del cliente solicitante para cómputo de HMAC y auditoría. */
  clientIp?: string;
  /** Agente de usuario para huella criptográfica de sesión. */
  userAgent?: string;
  /** Clave pepper del sistema para HMAC. */
  pepper?: string;
}

/**
 * Parámetros requeridos para procesar el callback de autenticación federada con Facebook (AUTH-001 T-15).
 */
export interface AuthenticateWithFacebookInput {
  /** Código de autorización devuelto por Facebook en la redirección. */
  code: string;
  /** Estado de autorización devuelto en el parámetro de consulta `state`. */
  state: string;
  /** Valor del estado almacenado en la cookie HTTP `mocter_oauth_state_facebook`. */
  clientCookieState: string;
  /** Identificador de la aplicación de Facebook (`FACEBOOK_APP_ID`). */
  clientId: string;
  /** Secreto de la aplicación de Facebook (`FACEBOOK_APP_SECRET`). */
  clientSecret: string;
  /** URI de redirección exacta registrada (`FACEBOOK_REDIRECT_URI`). */
  redirectUri: string;
  /** Dirección IP del cliente solicitante para cómputo de HMAC y auditoría. */
  clientIp?: string;
  /** Agente de usuario para huella criptográfica de sesión. */
  userAgent?: string;
  /** Clave pepper del sistema para HMAC. */
  pepper?: string;
}

/**
 * Resultado de la autenticación federada con sesión creada o error descriptivo.
 */
export type FederatedLoginResult = Result<LoginSuccessData>;

/**
 * Parámetros de entrada para el callback de vinculación de identidad federada (AUTH-001 §5.4, T-16).
 */
export interface LinkIdentityCallbackInput {
  provider: "google" | "facebook";
  code: string;
  state: string;
  clientCookieState: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  clientIp?: string;
  userAgent?: string;
  pepper?: string;
}

/**
 * Resultado de la vinculación de identidad federada con sesión renovada y URL de retorno.
 */
export type LinkIdentityResult = Result<LoginSuccessData & { returnTo: string }>;

/**
 * Parámetros de entrada para la desvinculación de una identidad federada (AUTH-001 §5.4, T-16).
 */
export interface UnlinkIdentityInput {
  userId: string;
  sessionId: string;
  currentAuthMethod?: string;
  provider: "google" | "facebook";
  currentPassword?: string;
  totpCode?: string;
}

/**
 * Resultado de la desvinculación de una identidad federada.
 */
export type UnlinkIdentityResult = Result<{
  message: string;
  rotatedSession?: {
    sid: string;
    csrfToken: string;
    expiresAt: string;
  };
}>;

/**
 * Parámetros de entrada para el enrolamiento 2FA (AUTH-001 §5.5, T-18).
 */
export interface Enroll2faInput {
  userId: string;
  sessionId: string;
  reauthAt?: Date | null;
  password?: string;
}

/**
 * Datos de respuesta para enrolamiento 2FA.
 */
export interface Enroll2faResponseData {
  otpauthUri: string;
  secret: string;
  expiresAt: string;
}

export type Enroll2faResult = Result<
  Enroll2faResponseData,
  "USER_NOT_FOUND" | "MFA_NOT_AVAILABLE" | "REAUTH_REQUIRED" | "INVALID_CREDENTIALS" | "DB_ERROR"
>;

/**
 * Parámetros de entrada para confirmación y activación de 2FA (AUTH-001 §5.5, T-18).
 */
export interface Confirm2faInput {
  userId: string;
  sessionId: string;
  code: string;
}

/**
 * Datos de respuesta para confirmación 2FA con sesión rotada.
 */
export interface Confirm2faResponseData {
  message: string;
  rotatedSession: {
    sid: string;
    csrfToken: string;
    expiresAt: string;
  };
}

export type Confirm2faResult = Result<
  Confirm2faResponseData,
  "USER_NOT_FOUND" | "INVALID_TOTP_CODE" | "DB_ERROR"
>;

/**
 * Parámetros de entrada para desactivación de 2FA (AUTH-001 §5.5, T-18).
 */
export interface Disable2faInput {
  userId: string;
  sessionId: string;
  password?: string;
  code?: string;
}

/**
 * Datos de respuesta para desactivación 2FA con sesión rotada.
 */
export interface Disable2faResponseData {
  message: string;
  rotatedSession: {
    sid: string;
    csrfToken: string;
    expiresAt: string;
  };
}

export type Disable2faResult = Result<
  Disable2faResponseData,
  "USER_NOT_FOUND" | "MFA_NOT_ENABLED" | "INVALID_CREDENTIALS" | "INVALID_TOTP_CODE" | "DB_ERROR"
>;

/**
 * Parámetros de entrada para la resolución del challenge 2FA en login (AUTH-001 §5.5, T-19).
 */
export interface Verify2faChallengeInput {
  challengeToken: string;
  code: string;
  clientIp?: string;
  userAgent?: string;
  pepper?: string;
}

export type Verify2faChallengeResult = Result<
  LoginSuccessData,
  | "VALIDATION_ERROR"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_EXHAUSTED"
  | "USER_NOT_FOUND"
  | "MFA_NOT_ENABLED"
  | "INVALID_TOTP_CODE"
  | "CELL_UNAVAILABLE"
  | "DB_ERROR"
>;

/**
 * Servicio de dominio responsable de la orquestación del registro nativo de usuarios (AUTH-001 T-08).
 *
 * Implementa las políticas de seguridad:
 * - Anti-enumeración de cuentas: responde idénticamente ante correos nuevos y ya existentes.
 * - Consentimiento obligatorio de tratamiento de datos personales (Habeas Data, Ley 1581 de 2012).
 * - Encriptación de contraseñas con Argon2id.
 * - Emisión de tokens seguros de verificación (24 h) y enlace `setup` (30 min) para cuentas federadas.
 * - No creación de sesiones ni inquilinos durante el registro.
 */
export class AuthService {
  /**
   * Crea una instancia de `AuthService`.
   *
   * @param authRepo - Repositorio de persistencia de autenticación (por defecto {@link defaultAuthRepository}).
   * @param mailer - Despachador de correos transaccionales (por defecto {@link defaultAuthMailer}).
   * @param googleOidcClient - Cliente OIDC para interacción con Google (por defecto {@link defaultGoogleOidcClient}).
   * @param stateManager - Gestor atómico de estados OAuth en Redis (por defecto {@link oauthStateManager}).
   * @param facebookOAuthClient - Cliente OAuth para interacción con Facebook (por defecto {@link defaultFacebookOAuthClient}).
   * @param totpCrypto - Servicio criptográfico para cifrado de secretos TOTP (por defecto {@link defaultTotpCryptoService}).
   * @param mfaChallengeManager - Gestor de challenges 2FA en Redis (por defecto {@link defaultMfaChallengeManager}).
   */
  constructor(
    private readonly authRepo: IAuthRepository = defaultAuthRepository,
    private readonly mailer: IAuthMailer = defaultAuthMailer,
    private readonly googleOidcClient: IGoogleOidcClient = defaultGoogleOidcClient,
    private readonly stateManager: OAuthStateManager = oauthStateManager,
    private readonly facebookOAuthClient: IFacebookOAuthClient = defaultFacebookOAuthClient,
    private readonly totpCrypto: TotpCryptoService = defaultTotpCryptoService,
    private readonly mfaChallengeManager: MfaChallengeManager = defaultMfaChallengeManager,
  ) {}

  /**
   * Procesa la solicitud de registro nativo de un nuevo usuario en la plataforma.
   *
   * Flujo de ejecución:
   * 1. Valida la carga útil con {@link registerUserSchema}. Si falla (contraseña débil, falta de consentimiento, etc.), retorna `VALIDATION_ERROR`.
   * 2. Normaliza el correo electrónico a minúsculas y consulta si ya existe en la base de datos.
   * 3. Si el correo existe:
   *    - Si la cuenta es exclusivamente federada (`passwordHash === null`), genera un token de establecimiento de contraseña (`setup`, 30 min) y despacha correo sin guardar la contraseña enviada.
   *    - Si es una cuenta nativa no verificada, reenvía el enlace de verificación invalidando tokens anteriores.
   *    - Si es una cuenta ya verificada, envía correo informativo sin alterar credenciales.
   * 4. Si el correo no existe:
   *    - Genera hash Argon2id de la contraseña.
   *    - Inserta el usuario no verificado y su consentimiento de tratamiento en una transacción atómica.
   *    - Genera un token aleatorio de 32 bytes con vencimiento a 24 horas y persiste únicamente su hash SHA-256.
   *    - Despacha correo con el enlace de verificación.
   * 5. Retorna siempre una respuesta genérica uniforme para prevenir enumeración de usuarios.
   *
   * @param rawInput - Objeto con datos de registro (nombre, correo, contraseña, consentimiento).
   * @param options - Metadatos opcionales como la IP del cliente y el pepper.
   * @returns Un {@link RegisterResult} con el mensaje genérico o los errores de validación.
   */
  async register(
    rawInput: unknown,
    options?: RegisterContextOptions,
  ): Promise<RegisterResult> {
    const parseResult = registerUserSchema.safeParse(rawInput);
    if (!parseResult.success) {
      appLogger.warn("[AuthService.register] Carga de registro inválida", {
        issuesCount: parseResult.error.issues.length,
      });
      return err(
        "Los datos ingresados no cumplen con las políticas de registro.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const input: RegisterUserInput = parseResult.data;
    const normalizedEmail = input.email;

    try {
      // 1. Verificar si la identidad ya existe en la plataforma
      const existingUser = await this.authRepo.findUserByEmail(normalizedEmail);

      // Cómputo opcional de HMAC de IP solicitante
      let requestedIpHash: Buffer | null = null;
      if (options?.clientIp && options?.pepper) {
        requestedIpHash = hashIpWithPepper(options.clientIp, options.pepper);
      }

      if (existingUser) {
        appLogger.info("[AuthService.register] Solicitud para usuario existente", {
          userId: existingUser.id,
          isFederated: existingUser.passwordHash === null,
          isVerified: existingUser.emailVerifiedAt !== null,
        });

        if (existingUser.passwordHash === null) {
          // Caso cuenta federada: no persistir la contraseña del formulario; emitir token de setup (30 min)
          await this.authRepo.invalidatePendingPasswordResetTokens(existingUser.id, "setup");

          const rawToken = generateSecureToken(32);
          const tokenHash = hashToken(rawToken);
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

          await this.authRepo.createPasswordResetToken({
            userId: existingUser.id,
            tokenHash,
            purpose: "setup",
            expiresAt,
            requestedIpHash,
          });

          await this.mailer.sendPasswordSetupEmail(
            normalizedEmail,
            rawToken,
            existingUser.displayName || undefined,
          );
        } else if (existingUser.emailVerifiedAt === null) {
          // Caso cuenta nativa pendiente de verificación: reenviar enlace con nuevo token (24 horas)
          await this.authRepo.invalidatePendingEmailVerificationTokens(existingUser.id);

          const rawToken = generateSecureToken(32);
          const tokenHash = hashToken(rawToken);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

          await this.authRepo.createEmailVerificationToken({
            userId: existingUser.id,
            tokenHash,
            expiresAt,
            requestedIpHash,
          });

          await this.mailer.sendVerificationEmail(
            normalizedEmail,
            rawToken,
            existingUser.displayName || undefined,
          );
        } else {
          // Caso cuenta nativa ya verificada: enviar notificación informativa
          await this.mailer.sendAccountAlreadyExistsEmail(
            normalizedEmail,
            existingUser.displayName || undefined,
          );
        }

        // Respuesta genérica uniforme (anti-enumeración)
        return ok({ message: GENERIC_REGISTER_SUCCESS_MESSAGE });
      }

      // 2. Usuario nuevo: hashear contraseña con Argon2id
      const passwordHash = await hashPassword(input.password);

      // 3. Crear usuario y consentimiento en transacción
      const { user } = await this.authRepo.createUserWithConsent({
        email: normalizedEmail,
        passwordHash,
        displayName: input.name,
        policyVersion: input.policyVersion,
        channel: input.channel,
      });

      // 4. Generar token de verificación de correo (24 horas)
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

      await this.authRepo.createEmailVerificationToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIpHash,
      });

      // 5. Despachar correo de verificación
      await this.mailer.sendVerificationEmail(normalizedEmail, rawToken, input.name);

      appLogger.info("[AuthService.register] Usuario registrado satisfactoriamente", {
        userId: user.id,
      });

      // 6. Respuesta genérica uniforme (anti-enumeración)
      return ok({ message: GENERIC_REGISTER_SUCCESS_MESSAGE });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.register Error] ${msg}`, error);
      return err("Error interno al procesar el registro.", "DB_ERROR");
    }
  }

  /**
   * Solicita el reenvío de un token de verificación de correo (AUTH-001 §5.7).
   *
   * Responde siempre HTTP 202 con mensaje genérico uniforme (anti-enumeración).
   *
   * @param email - Correo electrónico de la cuenta.
   * @param options - Metadatos opcionales como IP del cliente y pepper.
   */
  async requestEmailVerification(
    email: string,
    options?: RegisterContextOptions,
  ): Promise<Result<{ message: string }>> {
    const parseResult = authEmailSchema.safeParse(email);
    if (!parseResult.success) {
      return err(
        "Dirección de correo electrónico inválida.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const normalizedEmail = parseResult.data;

    try {
      const user = await this.authRepo.findUserByEmail(normalizedEmail);

      // Si el usuario existe y está pendiente de verificación
      if (user && user.emailVerifiedAt === null) {
        await this.authRepo.invalidatePendingEmailVerificationTokens(user.id);

        let requestedIpHash: Buffer | null = null;
        if (options?.clientIp && options?.pepper) {
          requestedIpHash = hashIpWithPepper(options.clientIp, options.pepper);
        }

        const rawToken = generateSecureToken(32);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

        await this.authRepo.createEmailVerificationToken({
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedIpHash,
        });

        await this.mailer.sendVerificationEmail(
          normalizedEmail,
          rawToken,
          user.displayName || undefined,
        );
      }

      // Respuesta uniforme anti-enumeración
      return ok({
        message: "Si la cuenta requiere verificación, hemos enviado un enlace a su correo.",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.requestEmailVerification Error] ${msg}`, error);
      return err("Error interno al solicitar verificación.", "DB_ERROR");
    }
  }

  /**
   * Confirma la verificación de un correo electrónico canjeando el token recibido (AUTH-001 §5.7).
   *
   * Operación de un solo uso ejecutada exclusivamente mediante POST.
   *
   * @param rawToken - Token seguro en claro recibido por query param o cuerpo JSON.
   */
  async confirmEmailVerification(
    rawToken: string,
  ): Promise<Result<{ message: string; email: string }>> {
    if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
      return err("Token de verificación no proporcionado.", "INVALID_TOKEN");
    }

    try {
      const tokenHash = hashToken(rawToken.trim());
      const tokenRecord = await this.authRepo.findEmailVerificationTokenByHash(tokenHash);

      // 1. Validar existencia del token
      if (!tokenRecord) {
        return err(
          "El enlace de verificación es inválido o no existe.",
          "INVALID_TOKEN",
        );
      }

      // 2. Validar que no haya sido consumido previamente (un solo uso)
      if (tokenRecord.consumedAt !== null) {
        return err(
          "Este enlace de verificación ya fue utilizado.",
          "TOKEN_ALREADY_USED",
        );
      }

      // 3. Validar que no haya expirado (TTL 24 horas)
      if (tokenRecord.expiresAt < new Date()) {
        return err(
          "El enlace de verificación ha expirado. Por favor solicite uno nuevo.",
          "TOKEN_EXPIRED",
        );
      }

      // 4. Consumir token y actualizar email_verified_at en transacción
      const updatedUser = await this.authRepo.consumeEmailVerificationToken(
        tokenRecord.id,
        tokenRecord.userId,
      );

      appLogger.info("[AuthService.confirmEmailVerification] Correo verificado con éxito", {
        userId: updatedUser.id,
        email: updatedUser.email,
      });

      return ok({
        message: "Correo electrónico verificado exitosamente.",
        email: updatedUser.email,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.confirmEmailVerification Error] ${msg}`, error);
      return err("Error interno al verificar el correo electrónico.", "DB_ERROR");
    }
  }

  /**
   * Procesa la solicitud de inicio de sesión nativo de un usuario (AUTH-001 T-10, design §5.2).
   *
   * Flujo de ejecución:
   * 1. Valida la carga útil con {@link loginUserSchema}. Si falla, retorna `VALIDATION_ERROR`.
   * 2. Normaliza el correo y consulta el usuario en el Router (`admin.users`).
   * 3. Si el usuario no existe: ejecuta {@link verifyDummyPassword} y retorna error 401 genérico ("Correo o contraseña incorrectos.").
   * 4. Valida `identityLocation`:
   *    - Si apunta a una celda y `activeClientId` es nulo: retorna error 503 (`IDENTITY_INCONSISTENT`).
   *    - Si apunta a una celda: retorna error 503 (`CELL_UNAVAILABLE`) en Fase 1.
   * 5. Si la cuenta está deshabilitada (`status === 'disabled'`) o carece de `passwordHash` (cuenta solo federada):
   *    ejecuta {@link verifyDummyPassword} y retorna error 401 genérico.
   * 6. Verifica la contraseña candidata contra `passwordHash` usando Argon2id. Si no coincide, retorna error 401 genérico.
   * 7. Si los parámetros del hash son inferiores a los vigentes, rehashea y actualiza la base de datos de manera transparente.
   * 8. Si la cuenta tiene 2FA habilitado (`totpEnabledAt !== null`), genera un challenge de 5 minutos y no emite sesión aún.
   * 9. Resuelve `routingVersion` consultando `client_routing` para `activeClientId`.
   * 10. Crea una nueva sesión opaca en `admin.sessions` con límite de 10 sesiones por usuario, emitiendo `sid` y `csrfToken`.
   *
   * @param rawInput - Objeto con credenciales (`email`, `password`).
   * @param options - Metadatos opcionales como `clientIp`, `userAgent` y `pepper`.
   * @returns Un {@link LoginResult} con la sesión creada o el challenge 2FA.
   */
  async login(
    rawInput: unknown,
    options?: LoginContextOptions,
  ): Promise<LoginResult> {
    const parseResult = loginUserSchema.safeParse(rawInput);
    if (!parseResult.success) {
      appLogger.warn("[AuthService.login] Carga de credenciales inválida", {
        issuesCount: parseResult.error.issues.length,
      });
      return err(
        "Los datos ingresados no son válidos.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const { email, password } = parseResult.data;

    try {
      // 1. Resolver usuario por correo normalizado en Router (AUTH-001 §5.2)
      const user = await this.authRepo.findUserByEmail(email);

      // Si el usuario no existe, ejecutar verificación ficticia y retornar 401
      if (!user) {
        await verifyDummyPassword(password);
        return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
      }

      // 2. Resolver identity_location (AUTH-001 §5.2)
      if (user.identityLocation !== "router") {
        if (!user.activeClientId) {
          appLogger.error(
            "[AuthService.login] Identidad inconsistente: identityLocation apunta a celda pero activeClientId es nulo",
            { userId: user.id, identityLocation: user.identityLocation },
          );
          return err("Identidad inconsistente.", "IDENTITY_INCONSISTENT");
        }

        // En Fase 1 (previo a conexión multicanal a celdas dedicadas), responder 503
        appLogger.warn(
          "[AuthService.login] Autenticación en celda dedicada no disponible en esta fase",
          { userId: user.id, cellId: user.identityLocation },
        );
        return err(
          "Celda temporalmente fuera de servicio.",
          "CELL_UNAVAILABLE",
        );
      }

      // 3. Evaluar estado de la cuenta (disabled) o cuenta federada sin passwordHash
      if (user.status === "disabled" || !user.passwordHash) {
        await verifyDummyPassword(password);
        return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
      }

      // 4. Verificar contraseña con Argon2id en tiempo constante
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
      }

      // 5. Rehash transparente si los parámetros son inferiores a los vigentes
      if (needsRehash(user.passwordHash)) {
        try {
          const newHash = await hashPassword(password);
          await this.authRepo.updateUserPasswordHash(user.id, newHash);
          appLogger.info("[AuthService.login] Contraseña rehasheada con éxito", {
            userId: user.id,
          });
        } catch (rehashError) {
          appLogger.warn("[AuthService.login] Fallo al rehashear contraseña", {
            userId: user.id,
            error: rehashError,
          });
        }
      }

      // 6. Resolver routing_version para activeClientId
      let routingVersion: number | null = null;
      if (user.activeClientId) {
        routingVersion = await this.authRepo.getClientRoutingVersion(
          user.activeClientId,
        );
      }

      // 7. Verificar si requiere doble factor (TOTP) (AUTH-001 §5.5, design §5.2)
      if (user.totpEnabledAt !== null) {
        const challenge = await this.mfaChallengeManager.createChallenge({
          userId: user.id,
          clientId: user.activeClientId,
          routingVersion,
          identityLocation: user.identityLocation,
        });

        return ok({
          mfaRequired: true,
          userId: user.id,
          challengeToken: challenge.challengeToken,
          expiresAt: challenge.expiresAt.toISOString(),
        });
      }

      // 8. Crear sesión opaca con CSRF y límites (AUTH-001 §5.6)
      return await this.createSessionForUser(user, "password", routingVersion, options);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.login Unexpected Error] ${msg}`, error, {
        email,
      });
      return err("Error interno al procesar el inicio de sesión.", "DB_ERROR");
    }
  }

  /**
   * Helper privado para emitir una sesión opaca con tokens y cookies canónicas para un usuario (AUTH-001 §5.6).
   */
  private async createSessionForUser(
    user: User,
    authMethod: "password" | "google" | "facebook",
    routingVersion: number | null,
    options?: LoginContextOptions,
  ): Promise<Result<LoginSuccessData>> {
    const sid = generateSessionId();
    const csrfToken = generateCsrfToken();
    const sidHash = hashToken(sid);
    const csrfHash = hashToken(csrfToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutos inactividad
    const absoluteExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 horas absoluto

    const ipHash =
      options?.clientIp && options?.pepper
        ? hashIpWithPepper(options.clientIp, options.pepper)
        : null;

    const userAgentHash =
      options?.userAgent && options?.pepper
        ? hashIpWithPepper(options.userAgent, options.pepper)
        : null;

    const session = await this.authRepo.createSession({
      userId: user.id,
      sidHash,
      csrfHash,
      clientId: user.activeClientId,
      routingVersion,
      authMethod,
      reauthAt: now,
      expiresAt,
      absoluteExpiresAt,
      ipHash,
      userAgentHash,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.displayName,
        status: user.status,
      },
      emailVerified: Boolean(user.emailVerifiedAt),
      clientId: user.activeClientId,
      expiresAt: session.expiresAt.toISOString(),
      sid,
      csrfToken,
    });
  }

  /**
   * Procesa la autenticación y resolución de un usuario mediante Google OIDC (AUTH-001 §5.3, T-14).
   *
   * Flujo de resolución:
   * 1. Valida y consume atómicamente el estado y cookie de Redis (anti-replay).
   * 2. Canjea el código de autorización por tokens con Google usando PKCE S256.
   * 3. Valida estrictamente el ID Token (emisor, audiencia, expiración, nonce, email_verified).
   * 4. Resolución de identidad (§5.3):
   *    a) Si existe la identidad en `admin.identities`, actualiza `last_login_at` e inicia sesión.
   *    b) Si no existe la identidad pero el correo coincide con un usuario existente en `admin.users`:
   *       - Si el correo de la cuenta existente no está verificado, rechaza (§5.4).
   *       - Si está verificado, vincula la identidad a la cuenta e inicia sesión.
   *    c) Si el usuario no existe, crea atómicamente el usuario (con `email_verified_at`) y la identidad, e inicia sesión.
   *
   * @param input - Parámetros recibidos en el callback de Google.
   * @returns Resultado {@link FederatedLoginResult} con la sesión creada o error descriptivo.
   */
  async authenticateWithGoogle(
    input: AuthenticateWithGoogleInput,
  ): Promise<FederatedLoginResult> {
    try {
      // 1. Validar y consumir atómicamente el estado y cookie de Redis (anti-replay)
      const stateResult = await this.stateManager.consumeState({
        provider: "google",
        state: input.state,
        cookieState: input.clientCookieState,
      });

      if (!stateResult.ok) {
        return err(stateResult.error, stateResult.code);
      }

      const { codeVerifier, nonce } = stateResult.data;

      // 2. Canjear código por tokens con Google
      let tokens;
      try {
        tokens = await this.googleOidcClient.exchangeCodeForTokens({
          code: input.code,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          redirectUri: input.redirectUri,
          codeVerifier,
        });
      } catch (error) {
        if (error instanceof GoogleProviderUnavailableError) {
          return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
        }
        throw error;
      }

      // 3. Validar ID Token de Google (emisor, aud, exp, nonce, email_verified)
      let payload;
      try {
        payload = await this.googleOidcClient.verifyIdToken(
          tokens.id_token,
          nonce ?? "",
          input.clientId,
        );
      } catch (error) {
        if (error instanceof GoogleTokenValidationError) {
          return err(error.message, error.code);
        }
        throw error;
      }

      // 4. Resolución de identidad (§5.3):
      // 4a. Buscar identidad federada existente por proveedor y provider_user_id
      const existingIdentity = await this.authRepo.findIdentityByProvider(
        "google",
        payload.sub,
      );

      if (existingIdentity) {
        const user = await this.authRepo.findUserById(existingIdentity.userId);
        if (!user || user.status !== "active") {
          return err("Cuenta deshabilitada o inexistente.", "ACCOUNT_DISABLED");
        }

        await this.authRepo.updateIdentityLastLogin(existingIdentity.id);

        let routingVersion: number | null = null;
        if (user.activeClientId) {
          routingVersion = await this.authRepo.getClientRoutingVersion(user.activeClientId);
        }

        return await this.createSessionForUser(user, "google", routingVersion, {
          clientIp: input.clientIp,
          userAgent: input.userAgent,
          pepper: input.pepper,
        });
      }

      // 4b. Buscar usuario por correo verificado en admin.users
      const existingUser = await this.authRepo.findUserByEmail(payload.email);
      if (existingUser) {
        if (existingUser.status !== "active") {
          return err("Cuenta deshabilitada o inexistente.", "ACCOUNT_DISABLED");
        }

        // §5.4: "El correo federado coincide con una cuenta no verificada: No vincular; exigir primero la verificación del correo."
        if (!existingUser.emailVerifiedAt) {
          return err(
            "No es posible vincular la cuenta. La cuenta existente aún no ha verificado su correo electrónico.",
            "EXISTING_USER_UNVERIFIED",
          );
        }

        // Vincular identidad a cuenta existente
        await this.authRepo.createIdentity({
          userId: existingUser.id,
          provider: "google",
          providerUserId: payload.sub,
          providerEmail: payload.email,
          emailVerified: true,
          displayName: payload.name ?? null,
          avatarUrl: payload.picture ?? null,
        });

        let routingVersion: number | null = null;
        if (existingUser.activeClientId) {
          routingVersion = await this.authRepo.getClientRoutingVersion(
            existingUser.activeClientId,
          );
        }

        return await this.createSessionForUser(
          existingUser,
          "google",
          routingVersion,
          {
            clientIp: input.clientIp,
            userAgent: input.userAgent,
            pepper: input.pepper,
          },
        );
      }

      // 4c. Si no existe usuario, crear usuario federado e identidad en transacción atómica
      const { user } = await this.authRepo.createFederatedUserWithIdentity({
        email: payload.email,
        provider: "google",
        providerUserId: payload.sub,
        providerEmail: payload.email,
        displayName: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      });

      return await this.createSessionForUser(user, "google", null, {
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        pepper: input.pepper,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.authenticateWithGoogle Error] ${msg}`, error);
      return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
    }
  }

  /**
   * Procesa la autenticación y resolución de un usuario mediante Facebook OAuth 2.0 (AUTH-001 §5.3, T-15).
   *
   * Flujo de resolución:
   * 1. Valida y consume atómicamente el estado y cookie de Redis (anti-replay).
   * 2. Canjea el código de autorización por token de acceso con Facebook Graph API.
   * 3. Consulta el perfil en `/me` y valida estrictamente la presencia de correo verificado.
   * 4. Resolución de identidad (§5.3):
   *    a) Si existe la identidad en `admin.identities`, actualiza `last_login_at` e inicia sesión.
   *    b) Si no existe la identidad pero el correo coincide con un usuario existente en `admin.users`:
   *       - Si el correo de la cuenta existente no está verificado, rechaza (§5.4).
   *       - Si está verificado, vincula la identidad a la cuenta e inicia sesión.
   *    c) Si el usuario no existe, crea atómicamente el usuario (con `email_verified_at`) y la identidad, e inicia sesión.
   *
   * @param input - Parámetros recibidos en el callback de Facebook.
   * @returns Resultado {@link FederatedLoginResult} con la sesión creada o error descriptivo.
   */
  async authenticateWithFacebook(
    input: AuthenticateWithFacebookInput,
  ): Promise<FederatedLoginResult> {
    try {
      // 1. Validar y consumir atómicamente el estado y cookie de Redis (anti-replay)
      const stateResult = await this.stateManager.consumeState({
        provider: "facebook",
        state: input.state,
        cookieState: input.clientCookieState,
      });

      if (!stateResult.ok) {
        return err(stateResult.error, stateResult.code);
      }

      // 2. Canjear código por tokens con Facebook
      let tokens;
      try {
        tokens = await this.facebookOAuthClient.exchangeCodeForAccessToken({
          code: input.code,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          redirectUri: input.redirectUri,
        });
      } catch (error) {
        if (error instanceof FacebookProviderUnavailableError) {
          return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
        }
        if (error instanceof FacebookOAuthValidationError) {
          return err(error.message, error.code);
        }
        throw error;
      }

      // 3. Consultar perfil en Graph API y validar correo electrónico verificado
      let profile;
      try {
        profile = await this.facebookOAuthClient.fetchUserProfile(tokens.access_token);
      } catch (error) {
        if (error instanceof FacebookProviderUnavailableError) {
          return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
        }
        if (error instanceof FacebookOAuthValidationError) {
          return err(error.message, error.code);
        }
        throw error;
      }

      // 4. Resolución de identidad (§5.3):
      // 4a. Buscar identidad federada existente por proveedor y provider_user_id
      const existingIdentity = await this.authRepo.findIdentityByProvider(
        "facebook",
        profile.id,
      );

      if (existingIdentity) {
        const user = await this.authRepo.findUserById(existingIdentity.userId);
        if (!user || user.status !== "active") {
          return err("Cuenta deshabilitada o inexistente.", "ACCOUNT_DISABLED");
        }

        await this.authRepo.updateIdentityLastLogin(existingIdentity.id);

        let routingVersion: number | null = null;
        if (user.activeClientId) {
          routingVersion = await this.authRepo.getClientRoutingVersion(user.activeClientId);
        }

        return await this.createSessionForUser(user, "facebook", routingVersion, {
          clientIp: input.clientIp,
          userAgent: input.userAgent,
          pepper: input.pepper,
        });
      }

      // 4b. Buscar usuario por correo verificado en admin.users
      const existingUser = await this.authRepo.findUserByEmail(profile.email!);
      if (existingUser) {
        if (existingUser.status !== "active") {
          return err("Cuenta deshabilitada o inexistente.", "ACCOUNT_DISABLED");
        }

        // §5.4: "El correo federado coincide con una cuenta no verificada: No vincular; exigir primero la verificación del correo."
        if (!existingUser.emailVerifiedAt) {
          return err(
            "No es posible vincular la cuenta. La cuenta existente aún no ha verificado su correo electrónico.",
            "EXISTING_USER_UNVERIFIED",
          );
        }

        // Vincular identidad a cuenta existente
        await this.authRepo.createIdentity({
          userId: existingUser.id,
          provider: "facebook",
          providerUserId: profile.id,
          providerEmail: profile.email!,
          emailVerified: true,
          displayName: profile.name ?? null,
          avatarUrl: profile.picture?.data?.url ?? null,
        });

        let routingVersion: number | null = null;
        if (existingUser.activeClientId) {
          routingVersion = await this.authRepo.getClientRoutingVersion(
            existingUser.activeClientId,
          );
        }

        return await this.createSessionForUser(
          existingUser,
          "facebook",
          routingVersion,
          {
            clientIp: input.clientIp,
            userAgent: input.userAgent,
            pepper: input.pepper,
          },
        );
      }

      // 4c. Si no existe usuario, crear usuario federado e identidad en transacción atómica
      const { user } = await this.authRepo.createFederatedUserWithIdentity({
        email: profile.email!,
        provider: "facebook",
        providerUserId: profile.id,
        providerEmail: profile.email!,
        displayName: profile.name ?? null,
        avatarUrl: profile.picture?.data?.url ?? null,
      });

      return await this.createSessionForUser(user, "facebook", null, {
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        pepper: input.pepper,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.authenticateWithFacebook Error] ${msg}`, error);
      return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
    }
  }

  /**
   * Procesa el callback de vinculación de una identidad federada a una cuenta existente (AUTH-001 §5.4, T-16).
   *
   * Flujo de ejecución:
   * 1. Valida y consume el estado de vinculación en Redis a partir de la cookie de estado `mocter_oauth_link_state_<provider>`.
   * 2. Canjea el código de autorización por tokens con el proveedor (PKCE S256 para Google, Graph API para Facebook).
   * 3. Valida estrictamente el correo verificado del proveedor.
   * 4. Valida que la identidad no se encuentre ya vinculada a otro usuario distinto (previene takeover).
   * 5. Si ya pertenece a este usuario, actualiza `last_login_at`. Si no, crea la identidad asociada en `admin.identities`.
   * 6. Emite una sesión opaca con tokens canónicos y retorna la URL de retorno sanitizada (`returnTo`).
   *
   * @param input - Parámetros recibidos en el callback de vinculación.
   * @returns Resultado {@link LinkIdentityResult} con la sesión emitida y URL de destino.
   */
  async linkProviderIdentity(
    input: LinkIdentityCallbackInput,
  ): Promise<LinkIdentityResult> {
    try {
      // 1. Validar y consumir atómicamente el estado y cookie de Redis (anti-replay)
      const stateResult = await this.stateManager.consumeState({
        provider: input.provider,
        state: input.state,
        cookieState: input.clientCookieState,
      });

      if (!stateResult.ok) {
        return err(stateResult.error, stateResult.code);
      }

      const { userId, codeVerifier, nonce, returnTo } = stateResult.data;
      if (!userId) {
        return err(
          "Estado de vinculación inválido o ausente de usuario ancla.",
          "INVALID_STATE",
        );
      }

      const user = await this.authRepo.findUserById(userId);
      if (!user || user.status !== "active") {
        return err("Cuenta de usuario inexistente o inactiva.", "ACCOUNT_DISABLED");
      }

      let providerUserId: string;
      let providerEmail: string;
      let displayName: string | null = null;
      let avatarUrl: string | null = null;

      // 2. Canjear tokens y verificar identidad con el proveedor correspondiente
      if (input.provider === "google") {
        let tokens;
        try {
          tokens = await this.googleOidcClient.exchangeCodeForTokens({
            code: input.code,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            redirectUri: input.redirectUri,
            codeVerifier,
          });
        } catch (error) {
          if (error instanceof GoogleProviderUnavailableError) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
          }
          throw error;
        }

        let payload;
        try {
          payload = await this.googleOidcClient.verifyIdToken(
            tokens.id_token,
            nonce ?? "",
            input.clientId,
          );
        } catch (error) {
          if (error instanceof GoogleTokenValidationError) {
            return err(error.message, error.code);
          }
          throw error;
        }

        providerUserId = payload.sub;
        providerEmail = payload.email;
        displayName = payload.name ?? null;
        avatarUrl = payload.picture ?? null;
      } else {
        let tokens;
        try {
          tokens = await this.facebookOAuthClient.exchangeCodeForAccessToken({
            code: input.code,
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            redirectUri: input.redirectUri,
          });
        } catch (error) {
          if (error instanceof FacebookProviderUnavailableError) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
          }
          if (error instanceof FacebookOAuthValidationError) {
            return err(error.message, error.code);
          }
          throw error;
        }

        let profile;
        try {
          profile = await this.facebookOAuthClient.fetchUserProfile(tokens.access_token);
        } catch (error) {
          if (error instanceof FacebookProviderUnavailableError) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
          }
          if (error instanceof FacebookOAuthValidationError) {
            return err(error.message, error.code);
          }
          throw error;
        }

        providerUserId = profile.id;
        providerEmail = profile.email!;
        displayName = profile.name ?? null;
        avatarUrl = profile.picture?.data?.url ?? null;
      }

      // 3. Verificar si la identidad ya está registrada
      const existingIdentity = await this.authRepo.findIdentityByProvider(
        input.provider,
        providerUserId,
      );

      if (existingIdentity) {
        if (existingIdentity.userId !== user.id) {
          return err(
            "Esta cuenta del proveedor ya se encuentra vinculada a otro usuario.",
            "IDENTITY_ALREADY_LINKED",
          );
        }
        await this.authRepo.updateIdentityLastLogin(existingIdentity.id);
      } else {
        await this.authRepo.createIdentity({
          userId: user.id,
          provider: input.provider,
          providerUserId,
          providerEmail,
          emailVerified: true,
          displayName,
          avatarUrl,
        });
      }

      // 4. Emitir sesión renovada para el usuario vinculado
      let routingVersion: number | null = null;
      if (user.activeClientId) {
        routingVersion = await this.authRepo.getClientRoutingVersion(user.activeClientId);
      }

      const sessionResult = await this.createSessionForUser(
        user,
        input.provider,
        routingVersion,
        {
          clientIp: input.clientIp,
          userAgent: input.userAgent,
          pepper: input.pepper,
        },
      );

      if (!sessionResult.ok) {
        return err(sessionResult.error, sessionResult.code);
      }

      appLogger.info("[AuthService.linkProviderIdentity] Identidad vinculada exitosamente", {
        userId: user.id,
        provider: input.provider,
      });

      return ok({
        ...sessionResult.data,
        returnTo: returnTo || "/admin",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.linkProviderIdentity Error] ${msg}`, error);
      return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
    }
  }

  /**
   * Desvincula una identidad federada de un usuario autenticado (AUTH-001 §5.4, T-16).
   *
   * Flujo de ejecución:
   * 1. Consulta el usuario y sus identidades vinculadas.
   * 2. Reautenticación: si tiene contraseña nativa, valida la contraseña actual provista.
   * 3. Verifica que la identidad exista para este usuario.
   * 4. Impide desvincular el último método de acceso a la cuenta (si no tiene contraseña y es su única identidad).
   * 5. Elimina la identidad de `admin.identities`.
   * 6. Gestión de sesiones (§5.4): si se desvincula el proveedor usado para la sesión actual, revoca las demás y rota la actual.
   *
   * @param input - Parámetros de desvinculación {@link UnlinkIdentityInput}.
   * @returns Resultado {@link UnlinkIdentityResult}.
   */
  async unlinkProviderIdentity(
    input: UnlinkIdentityInput,
  ): Promise<UnlinkIdentityResult> {
    try {
      const user = await this.authRepo.findUserById(input.userId);
      if (!user || user.status !== "active") {
        return err("Usuario inexistente o inactivo.", "ACCOUNT_DISABLED");
      }

      // 1. Reautenticación con contraseña si la cuenta posee contraseña nativa
      if (user.passwordHash !== null) {
        if (!input.currentPassword) {
          return err(
            "Debe ingresar su contraseña actual para desvincular.",
            "PASSWORD_REQUIRED",
          );
        }
        const isPasswordValid = await verifyPassword(
          input.currentPassword,
          user.passwordHash,
        );
        if (!isPasswordValid) {
          return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
        }
      }

      // 2. Verificar que la identidad exista para este usuario
      const userIdentities = await this.authRepo.findIdentitiesByUserId(user.id);
      const targetIdentity = userIdentities.find((i) => i.provider === input.provider);
      if (!targetIdentity) {
        return err(
          "La identidad federada no está vinculada a esta cuenta.",
          "IDENTITY_NOT_FOUND",
        );
      }

      // 3. Impedir desvincular el último método de acceso (§5.4)
      if (user.passwordHash === null && userIdentities.length <= 1) {
        return err(
          "No es posible desvincular el único método de acceso a la cuenta.",
          "CANNOT_UNLINK_LAST_METHOD",
        );
      }

      // 4. Eliminar la identidad
      await this.authRepo.deleteIdentity(user.id, input.provider);

      // 5. Gestión de sesiones si el método activo coincide con el desvinculado
      let rotatedSessionData:
        | { sid: string; csrfToken: string; expiresAt: string }
        | undefined;

      if (input.currentAuthMethod === input.provider) {
        await this.authRepo.revokeAllUserSessions(
          user.id,
          "provider_unlinked",
          input.sessionId,
        );

        const newSid = generateSessionId();
        const newCsrfToken = generateCsrfToken();
        const newSidHash = hashToken(newSid);
        const newCsrfHash = hashToken(newCsrfToken);

        const rotatedSession = await this.authRepo.rotateSession(
          input.sessionId,
          newSidHash,
          newCsrfHash,
        );

        rotatedSessionData = {
          sid: newSid,
          csrfToken: newCsrfToken,
          expiresAt: rotatedSession.expiresAt.toISOString(),
        };
      }

      appLogger.info("[AuthService.unlinkProviderIdentity] Identidad desvinculada exitosamente", {
        userId: user.id,
        provider: input.provider,
      });

      return ok({
        message: "Identidad desvinculada exitosamente.",
        rotatedSession: rotatedSessionData,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.unlinkProviderIdentity Error] ${msg}`, error, {
        userId: input.userId,
        provider: input.provider,
      });
      return err("Error interno al desvincular la identidad.", "DB_ERROR");
    }
  }

  /**
   * Procesa la solicitud de recuperación de contraseña (AUTH-001 T-11, design §5.8).
   *
   * Flujo de ejecución:
   * 1. Valida el correo con {@link forgotPasswordSchema}.
   * 2. Consulta el usuario en el Router (`admin.users`).
   * 3. Anti-enumeración: Si el usuario no existe, está deshabilitado o es exclusivamente federado (`passwordHash === null`),
   *    retorna respuesta genérica exitosa sin emitir token (AUTH-001 §5.8).
   * 4. Si el usuario existe y posee contraseña nativa:
   *    - Invalida tokens previos con `purpose = 'reset'`.
   *    - Genera token de 32 bytes con TTL de 30 minutos.
   *    - Despacha correo vía {@link IAuthMailer.sendPasswordResetEmail}.
   * 5. Retorna siempre `GENERIC_FORGOT_PASSWORD_MESSAGE`.
   */
  async forgotPassword(
    rawInput: unknown,
    options?: RegisterContextOptions,
  ): Promise<ForgotPasswordResult> {
    const parseResult = forgotPasswordSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return err(
        "El formato del correo electrónico es inválido.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const { email } = parseResult.data;

    try {
      const user = await this.authRepo.findUserByEmail(email);

      // Si no existe, está disabled o no tiene passwordHash (solo federado), retornar respuesta genérica
      if (!user || user.status === "disabled" || !user.passwordHash) {
        appLogger.info(
          "[AuthService.forgotPassword] Solicitud genérica (usuario inexistente, deshabilitado o federado)",
          { email },
        );
        return ok({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
      }

      // Invalidar tokens previos de recuperación para este usuario
      await this.authRepo.invalidatePendingPasswordResetTokens(user.id, "reset");

      // Generar token seguro de 32 bytes con vencimiento a 30 minutos
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

      const requestedIpHash =
        options?.clientIp && options?.pepper
          ? hashIpWithPepper(options.clientIp, options.pepper)
          : null;

      await this.authRepo.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        purpose: "reset",
        expiresAt,
        requestedIpHash,
      });

      await this.mailer.sendPasswordResetEmail(
        user.email,
        rawToken,
        user.displayName ?? undefined,
      );

      appLogger.info("[AuthService.forgotPassword] Correo de recuperación enviado", {
        userId: user.id,
      });

      return ok({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.forgotPassword Error] ${msg}`, error, { email });
      return err("Error interno al procesar la solicitud de recuperación.", "DB_ERROR");
    }
  }

  /**
   * Restablece o establece la contraseña de una cuenta utilizando un token válido (AUTH-001 T-11, design §5.8).
   *
   * Flujo de ejecución:
   * 1. Valida la carga útil con {@link resetPasswordSchema}.
   * 2. Calcula el hash SHA-256 del token y consulta `password_reset_tokens`.
   * 3. Valida:
   *    - Existencia del token (400 `INVALID_TOKEN`).
   *    - No consumido previamente (400 `TOKEN_ALREADY_USED`).
   *    - No expirado dentro de sus 30 minutos de vigencia (400 `TOKEN_EXPIRED`).
   * 4. Valida propósito:
   *    - Si `purpose = 'setup'`: exige que la cuenta NO tenga contraseña previa (400 `PASSWORD_ALREADY_EXISTS`).
   *    - Si `purpose = 'reset'`: exige que la cuenta YA tenga contraseña nativa previa (400 `NO_NATIVE_PASSWORD`).
   * 5. Hashea la nueva contraseña con Argon2id.
   * 6. En una transacción atómica:
   *    - Consume el token (`consumed_at = now()`).
   *    - Actualiza `password_hash` y `password_updated_at`.
   *    - Si `purpose = 'setup'`, marca `email_verified_at = now()` si estaba nulo.
   *    - Revoca todas las sesiones activas del usuario (`revokedReason = 'password_reset'`).
   * 7. No inicia sesión automáticamente; el usuario debe autenticarse en el login.
   */
  async resetPassword(rawInput: unknown): Promise<ResetPasswordResult> {
    const parseResult = resetPasswordSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return err(
        "Los datos ingresados no cumplen con las políticas de contraseña.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const { token, password } = parseResult.data;

    try {
      const tokenHash = hashToken(token);
      const tokenRecord = await this.authRepo.findPasswordResetTokenByHash(tokenHash);

      if (!tokenRecord) {
        return err(
          "El enlace de restablecimiento es inválido o no existe.",
          "INVALID_TOKEN",
        );
      }

      if (tokenRecord.consumedAt !== null) {
        return err(
          "Este enlace de restablecimiento ya fue utilizado.",
          "TOKEN_ALREADY_USED",
        );
      }

      if (tokenRecord.expiresAt < new Date()) {
        return err(
          "El enlace de restablecimiento ha expirado. Por favor solicite uno nuevo.",
          "TOKEN_EXPIRED",
        );
      }

      const user = await this.authRepo.findUserById(tokenRecord.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (tokenRecord.purpose === "setup" && user.passwordHash !== null) {
        return err(
          "La cuenta ya cuenta con una contraseña establecida.",
          "PASSWORD_ALREADY_EXISTS",
        );
      }

      if (tokenRecord.purpose === "reset" && user.passwordHash === null) {
        return err(
          "La cuenta no cuenta con una contraseña nativa previa para recuperar.",
          "NO_NATIVE_PASSWORD",
        );
      }

      const newPasswordHash = await hashPassword(password);

      await this.authRepo.consumePasswordResetToken(
        tokenRecord.id,
        user.id,
        newPasswordHash,
        tokenRecord.purpose as "reset" | "setup",
      );

      appLogger.info("[AuthService.resetPassword] Contraseña actualizada y sesiones revocadas", {
        userId: user.id,
        purpose: tokenRecord.purpose,
      });

      return ok({
        message: "Contraseña actualizada exitosamente. Ya puedes iniciar sesión.",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.resetPassword Error] ${msg}`, error);
      return err("Error interno al restablecer la contraseña.", "DB_ERROR");
    }
  }

  /**
   * Cambia la contraseña de una sesión autenticada (AUTH-001 T-11, design §5.8).
   *
   * Flujo de ejecución:
   * 1. Valida la carga útil con {@link changePasswordSchema}.
   * 2. Consulta el usuario por `context.userId`.
   * 3. Verifica la contraseña actual con Argon2id. Si es incorrecta, retorna 401 (`INVALID_CREDENTIALS`).
   * 4. Si la cuenta tiene 2FA activado (`totpEnabledAt !== null`), valida que se suministre `totpCode`.
   * 5. Hashea la nueva contraseña con Argon2id.
   * 6. Actualiza `password_hash` y `password_updated_at`.
   * 7. Revoca todas las demás sesiones activas del usuario (excepto la sesión actual `context.sessionId`).
   * 8. Rota la sesión actual: genera nuevo `sid` y `csrfToken`, actualiza `sessions` y `reauth_at`.
   * 9. Retorna nuevo `sid` y `csrfToken` para renovar las cookies del cliente.
   */
  async changePassword(
    rawInput: unknown,
    context: ChangePasswordContext,
  ): Promise<ChangePasswordResult> {
    const parseResult = changePasswordSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return err(
        "Los datos ingresados no cumplen con las políticas requeridas.",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const { currentPassword, newPassword, totpCode } = parseResult.data;

    try {
      const user = await this.authRepo.findUserById(context.userId);
      if (!user || !user.passwordHash) {
        return err("No es posible cambiar la contraseña para esta cuenta.", "INVALID_REQUEST");
      }

      // Validar contraseña actual en tiempo constante
      const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
      }

      // Si tiene 2FA activado, exigir código TOTP
      if (user.totpEnabledAt !== null && !totpCode) {
        return err(
          "Debe proporcionar el código de autenticación de dos factores.",
          "MFA_REQUIRED",
        );
      }

      // Hashear nueva contraseña
      const newPasswordHash = await hashPassword(newPassword);
      await this.authRepo.updateUserPassword(user.id, newPasswordHash);

      // Revocar las demás sesiones del usuario (AUTH-001 §5.8)
      await this.authRepo.revokeAllUserSessions(
        user.id,
        "password_change",
        context.sessionId,
      );

      // Rotar la sesión actual (AUTH-001 §5.6 y §5.8)
      const newSid = generateSessionId();
      const newCsrfToken = generateCsrfToken();
      const newSidHash = hashToken(newSid);
      const newCsrfHash = hashToken(newCsrfToken);

      const rotatedSession = await this.authRepo.rotateSession(
        context.sessionId,
        newSidHash,
        newCsrfHash,
      );

      appLogger.info("[AuthService.changePassword] Contraseña cambiada y sesión rotada", {
        userId: user.id,
      });

      return ok({
        message: "Contraseña actualizada exitosamente.",
        sid: newSid,
        csrfToken: newCsrfToken,
        expiresAt: rotatedSession.expiresAt.toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.changePassword Error] ${msg}`, error, {
        userId: context.userId,
      });
      return err("Error interno al cambiar la contraseña.", "DB_ERROR");
    }
  }

  /**
   * Valida una sesión activa a partir de su `sid` en claro y opcionalmente verifica el token CSRF (AUTH-001 §5.6).
   *
   * @param sid - Identificador de sesión en claro extraído de la cookie HTTP.
   * @param csrfToken - Token CSRF en claro provisto en el encabezado `x-csrf-token` (opcional).
   * @returns Un {@link Result} con la entidad {@link Session} activa o un error tipado ("UNAUTHORIZED" | "FORBIDDEN" | "DB_ERROR").
   */
  async validateSession(
    sid: string,
    csrfToken?: string,
  ): Promise<Result<{ session: Session }, "UNAUTHORIZED" | "FORBIDDEN" | "DB_ERROR">> {
    if (!sid) {
      return err("Identificador de sesión ausente.", "UNAUTHORIZED");
    }

    try {
      const sidHash = hashToken(sid);
      const session = await this.authRepo.findSessionBySidHash(sidHash);

      if (!session) {
        return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
      }

      const now = new Date();
      if (session.revokedAt !== null || session.expiresAt < now) {
        return err("Sesión expirada o revocada.", "UNAUTHORIZED");
      }

      if (csrfToken) {
        const csrfHash = hashToken(csrfToken);
        if (!compareHashesConstantTime(csrfHash, session.csrfHash)) {
          return err("Token CSRF inválido.", "FORBIDDEN");
        }
      }

      return ok({ session });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.validateSession Error] ${msg}`, error);
      return err("Error interno al validar la sesión.", "DB_ERROR");
    }
  }

  /**
   * Genera un nuevo secreto TOTP pendiente y su URI canónica de enrolamiento (AUTH-001 §5.5, T-18).
   *
   * Flujo de ejecución:
   * 1. Consulta el usuario en `admin.users`.
   * 2. Si el usuario no existe, retorna 404 `USER_NOT_FOUND`.
   * 3. Si `user.passwordHash === null`, retorna 403 `MFA_NOT_AVAILABLE`
   *    (la autenticación de doble factor solo está disponible para cuentas con contraseña).
   * 4. Valida la ventana de reautenticación:
   *    - Si `reauthAt` es más antiguo de 5 minutos (o no se provee):
   *      - Exige `input.password`. Si falta, retorna `REAUTH_REQUIRED`.
   *      - Valida la contraseña con Argon2id. Si es incorrecta, retorna `INVALID_CREDENTIALS`.
   * 5. Genera secreto aleatorio de 20 bytes (160 bits) codificado en Base32 (32 caracteres).
   * 6. Cifra el secreto en Base32 con AES-256-GCM usando la clave activa y AAD `user.id:keyId`.
   * 7. Persiste `totp_pending_secret_ciphertext`, `totp_pending_key_id` y `totp_pending_created_at = now()`.
   * 8. Genera la URI canónica `otpauth://totp/Mocter:<email>?secret=...`.
   * 9. Retorna la URI y el secreto en claro con vencimiento a 10 minutos (se muestra una sola vez).
   */
  async enroll2fa(input: Enroll2faInput): Promise<Enroll2faResult> {
    try {
      const user = await this.authRepo.findUserById(input.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      // Restricción RF-03 / §5.5: 2FA exclusivo para cuentas con contraseña nativa
      if (user.passwordHash === null) {
        return err(
          "La autenticación de doble factor solo está disponible para cuentas con contraseña.",
          "MFA_NOT_AVAILABLE",
        );
      }

      // Reautenticación: ventana de 5 minutos (AUTH-001 §5.5)
      const now = Date.now();
      const reauthWindowExpired =
        !input.reauthAt || now - new Date(input.reauthAt).getTime() > 5 * 60 * 1000;

      if (reauthWindowExpired || input.password) {
        if (!input.password) {
          return err(
            "Se requiere reautenticación con contraseña para enrolar 2FA.",
            "REAUTH_REQUIRED",
          );
        }

        const isValid = await verifyPassword(input.password, user.passwordHash);
        if (!isValid) {
          return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
        }
      }

      // Generación del secreto de 20 bytes (160 bits) en Base32
      const { base32 } = generateTotpSecret(20);

      // Cifrado AES-256-GCM con AAD inmutable `user.id:keyId`
      const encrypted = this.totpCrypto.encrypt(base32, user.id);

      // Persistencia del secreto pendiente con timestamp de creación
      await this.authRepo.updateUserTotpKeys(user.id, {
        totpPendingSecretCiphertext: encrypted.ciphertext,
        totpPendingKeyId: encrypted.keyId,
        totpPendingCreatedAt: new Date(),
      });

      // Construcción de URI otpauth canónica
      const otpauthUri = generateOtpauthUri({
        email: user.email,
        secretBase32: base32,
        issuer: "Mocter",
      });

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      appLogger.info("[AuthService.enroll2fa] Secreto pendiente de 2FA generado exitosamente", {
        userId: user.id,
      });

      return ok({
        otpauthUri,
        secret: base32,
        expiresAt,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.enroll2fa Error] ${msg}`, error, {
        userId: input.userId,
      });
      return err("Error interno al generar el enrolamiento 2FA.", "DB_ERROR");
    }
  }

  /**
   * Confirma y activa la autenticación 2FA validando el código TOTP inicial (AUTH-001 §5.5, T-18).
   *
   * Flujo de ejecución:
   * 1. Consulta el usuario en `admin.users`.
   * 2. Si no tiene secreto pendiente o este superó los 10 minutos de vigencia, retorna 401 `INVALID_TOTP_CODE`.
   * 3. Descifra el secreto pendiente con AES-256-GCM.
   * 4. Valida el código con tolerancia de ±1 paso (30s) y anti-replay contra `totp_last_used_step`.
   * 5. Si es inválido, retorna 401 `INVALID_TOTP_CODE`.
   * 6. Si es válido:
   *    - Mueve el secreto pendiente a activo (`totp_secret_ciphertext`, `totp_key_id`, `totp_enabled_at = now()`).
   *    - Limpia los campos pendientes y registra `totp_last_used_step`.
   *    - Revoca todas las demás sesiones activas del usuario (motivo `mfa_enabled`).
   *    - Rota la sesión actual fijando `mfa_at = now()`.
   * 7. Retorna confirmación y los identificadores de la sesión rotada.
   */
  async confirm2fa(input: Confirm2faInput): Promise<Confirm2faResult> {
    try {
      const user = await this.authRepo.findUserById(input.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (
        !user.totpPendingSecretCiphertext ||
        !user.totpPendingKeyId ||
        !user.totpPendingCreatedAt
      ) {
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // TTL de 10 minutos para el secreto pendiente (AUTH-001 §5.5)
      const pendingAgeMs = Date.now() - new Date(user.totpPendingCreatedAt).getTime();
      if (pendingAgeMs > 10 * 60 * 1000) {
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // Descifrado autenticado AES-256-GCM
      let base32Secret: string;
      try {
        base32Secret = this.totpCrypto
          .decrypt(
            user.totpPendingSecretCiphertext,
            user.id,
            user.totpPendingKeyId,
          )
          .toString("utf-8");
      } catch (decryptError) {
        appLogger.error(
          `[AuthService.confirm2fa] Fallo al descifrar secreto pendiente: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          decryptError,
          { userId: user.id },
        );
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // Validación con tolerancia ±1 paso y anti-replay
      const verifyResult = verifyTotpCode(input.code, base32Secret, {
        window: 1,
        lastUsedStep: user.totpLastUsedStep,
      });

      if (!verifyResult.valid || verifyResult.step === undefined) {
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      const now = new Date();

      // Promover secreto pendiente a activo y registrar paso
      await this.authRepo.updateUserTotpKeys(user.id, {
        totpSecretCiphertext: user.totpPendingSecretCiphertext,
        totpKeyId: user.totpPendingKeyId,
        totpEnabledAt: now,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: verifyResult.step,
      });

      // Revocar las demás sesiones activas del usuario (AUTH-001 §5.5)
      await this.authRepo.revokeAllUserSessions(
        user.id,
        "mfa_enabled",
        input.sessionId,
      );

      // Rotar la sesión actual con mfa_at actualizado
      const newSid = generateSessionId();
      const newCsrfToken = generateCsrfToken();
      const newSidHash = hashToken(newSid);
      const newCsrfHash = hashToken(newCsrfToken);

      const rotatedSession = await this.authRepo.rotateSession(
        input.sessionId,
        newSidHash,
        newCsrfHash,
        { mfaAt: now, reauthAt: now },
      );

      appLogger.info("[AuthService.confirm2fa] 2FA activado y sesión rotada exitosamente", {
        userId: user.id,
      });

      return ok({
        message: "Autenticación de dos factores activada exitosamente.",
        rotatedSession: {
          sid: newSid,
          csrfToken: newCsrfToken,
          expiresAt: rotatedSession.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.confirm2fa Error] ${msg}`, error, {
        userId: input.userId,
      });
      return err("Error interno al confirmar 2FA.", "DB_ERROR");
    }
  }

  /**
   * Desactiva la autenticación 2FA previa validación de contraseña actual y código TOTP (AUTH-001 §5.5, T-18).
   *
   * Flujo de ejecución:
   * 1. Consulta el usuario en `admin.users`.
   * 2. Si no tiene 2FA activo, retorna `MFA_NOT_ENABLED`.
   * 3. Exige y valida la contraseña actual con Argon2id. Si es incorrecta, retorna 401 `INVALID_CREDENTIALS`.
   * 4. Exige y valida el código TOTP contra el secreto activo con tolerancia ±1 y anti-replay. Si falla, retorna 401 `INVALID_TOTP_CODE`.
   * 5. Limpia los secretos TOTP activos y pendientes, y remueve `totp_enabled_at` y `totp_last_used_step`.
   * 6. Revoca las demás sesiones activas del usuario (motivo `mfa_disabled`).
   * 7. Rota la sesión actual removiendo `mfa_at` (`mfaAt = null`).
   * 8. Retorna confirmación y los identificadores de la sesión rotada.
   */
  async disable2fa(input: Disable2faInput): Promise<Disable2faResult> {
    try {
      const user = await this.authRepo.findUserById(input.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (
        !user.totpEnabledAt ||
        !user.totpSecretCiphertext ||
        !user.totpKeyId
      ) {
        return err("La cuenta no tiene 2FA activado.", "MFA_NOT_ENABLED");
      }

      // Validar contraseña actual
      if (!input.password || !user.passwordHash) {
        return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
      }

      const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
      if (!isPasswordValid) {
        return err("La contraseña actual es incorrecta.", "INVALID_CREDENTIALS");
      }

      // Validar código TOTP
      if (!input.code) {
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      let base32Secret: string;
      try {
        base32Secret = this.totpCrypto
          .decrypt(
            user.totpSecretCiphertext,
            user.id,
            user.totpKeyId,
          )
          .toString("utf-8");
      } catch (decryptError) {
        appLogger.error(
          `[AuthService.disable2fa] Fallo al descifrar secreto activo: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          decryptError,
          { userId: user.id },
        );
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      const verifyResult = verifyTotpCode(input.code, base32Secret, {
        window: 1,
        lastUsedStep: user.totpLastUsedStep,
      });

      if (!verifyResult.valid || verifyResult.step === undefined) {
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // Limpiar secretos TOTP activos y pendientes
      await this.authRepo.updateUserTotpKeys(user.id, {
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
      });

      // Revocar las demás sesiones activas del usuario (AUTH-001 §5.5)
      await this.authRepo.revokeAllUserSessions(
        user.id,
        "mfa_disabled",
        input.sessionId,
      );

      // Rota la sesión actual removiendo mfa_at
      const newSid = generateSessionId();
      const newCsrfToken = generateCsrfToken();
      const newSidHash = hashToken(newSid);
      const newCsrfHash = hashToken(newCsrfToken);

      const rotatedSession = await this.authRepo.rotateSession(
        input.sessionId,
        newSidHash,
        newCsrfHash,
        { mfaAt: null, reauthAt: new Date() },
      );

      appLogger.info("[AuthService.disable2fa] 2FA desactivado y sesión rotada exitosamente", {
        userId: user.id,
      });

      return ok({
        message: "Autenticación de dos factores desactivada exitosamente.",
        rotatedSession: {
          sid: newSid,
          csrfToken: newCsrfToken,
          expiresAt: rotatedSession.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.disable2fa Error] ${msg}`, error, {
        userId: input.userId,
      });
      return err("Error interno al desactivar 2FA.", "DB_ERROR");
    }
  }

  /**
   * Resuelve el challenge 2FA en el proceso de inicio de sesión nativo (AUTH-001 §5.5, design §5.2, T-19).
   *
   * Flujo de ejecución:
   * 1. Valida presencia de parámetros `challengeToken` y `code`.
   * 2. Consulta el challenge en Redis usando el hash SHA-256 del `challengeToken`.
   * 3. Si no existe o expiró (TTL 5 min), retorna 401 `CHALLENGE_EXPIRED`.
   * 4. Si tiene 5 o más fallos acumulados, elimina el challenge y retorna 401 `CHALLENGE_EXHAUSTED`.
   * 5. Resuelve el usuario en su ubicación de identidad (`identityLocation`).
   * 6. Descifra el secreto TOTP activo con AES-256-GCM y AAD `user_id:key_id`.
   * 7. Valida el código TOTP con tolerancia ±1 paso y anti-replay contra `totp_last_used_step`.
   *    - Si es inválido: incrementa los intentos fallidos. Si llega a 5, autodestruye el challenge y retorna `CHALLENGE_EXHAUSTED`.
   *    - Si no: retorna `INVALID_TOTP_CODE`.
   * 8. Si es válido:
   *    - Consume atómicamente el challenge en Redis (anti-replay).
   *    - Actualiza `totp_last_used_step` en la base de datos.
   *    - Emite una nueva sesión opaca con `mfa_at = now()` y `reauth_at = now()`.
   *    - Retorna datos de sesión y usuario.
   */
  async verify2faChallenge(input: Verify2faChallengeInput): Promise<Verify2faChallengeResult> {
    if (!input.challengeToken || !input.code) {
      return err("Datos de verificación incompletos.", "VALIDATION_ERROR");
    }

    try {
      // 1. Consultar challenge en Redis
      const challenge = await this.mfaChallengeManager.getChallenge(input.challengeToken);
      if (!challenge) {
        return err(
          "El desafío de autenticación ha vencido o no existe.",
          "CHALLENGE_EXPIRED",
        );
      }

      // 2. Verificar que no haya agotado los 5 intentos
      if (challenge.attempts >= 5) {
        await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
        return err(
          "Ha superado el número máximo de intentos. Inicie sesión de nuevo.",
          "CHALLENGE_EXHAUSTED",
        );
      }

      // 3. Resolver usuario según su identityLocation
      if (challenge.identityLocation !== "router") {
        appLogger.warn(
          "[AuthService.verify2faChallenge] Verificación 2FA en celda dedicada no disponible en esta fase",
          { userId: challenge.userId, cellId: challenge.identityLocation },
        );
        return err("Celda temporalmente fuera de servicio.", "CELL_UNAVAILABLE");
      }

      const user = await this.authRepo.findUserById(challenge.userId);
      if (!user || user.status === "disabled") {
        await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
        return err("Usuario no encontrado o deshabilitado.", "USER_NOT_FOUND");
      }

      if (!user.totpEnabledAt || !user.totpSecretCiphertext || !user.totpKeyId) {
        await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
        return err("La cuenta no tiene 2FA activado.", "MFA_NOT_ENABLED");
      }

      // 4. Descifrar secreto activo con AES-256-GCM
      let base32Secret: string;
      try {
        base32Secret = this.totpCrypto
          .decrypt(user.totpSecretCiphertext, user.id, user.totpKeyId)
          .toString("utf-8");
      } catch (decryptError) {
        appLogger.error(
          `[AuthService.verify2faChallenge] Fallo al descifrar secreto activo: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          decryptError,
          { userId: user.id },
        );
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // 5. Validar código TOTP con ventana ±1 y anti-replay
      const verifyResult = verifyTotpCode(input.code, base32Secret, {
        window: 1,
        lastUsedStep: user.totpLastUsedStep,
      });

      if (!verifyResult.valid || verifyResult.step === undefined) {
        const attemptResult = await this.mfaChallengeManager.recordFailedAttempt(input.challengeToken);
        if (attemptResult.exhausted) {
          return err(
            "Ha superado el número máximo de intentos. Inicie sesión de nuevo.",
            "CHALLENGE_EXHAUSTED",
          );
        }
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // 6. Código válido: consumir challenge (un solo uso, anti-replay)
      await this.mfaChallengeManager.consumeChallenge(input.challengeToken);

      // 7. Actualizar totp_last_used_step
      await this.authRepo.updateUserTotpKeys(user.id, {
        totpLastUsedStep: verifyResult.step,
      });

      // 8. Crear sesión opaca con mfa_at y reauth_at vigentes (AUTH-001 §5.5, §5.6, T-19)
      const sid = generateSessionId();
      const csrfToken = generateCsrfToken();
      const sidHash = hashToken(sid);
      const csrfHash = hashToken(csrfToken);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min inactividad
      const absoluteExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 horas máx

      const ipHash =
        input.clientIp && input.pepper
          ? hashIpWithPepper(input.clientIp, input.pepper)
          : null;

      const userAgentHash =
        input.userAgent && input.pepper
          ? hashIpWithPepper(input.userAgent, input.pepper)
          : null;

      const session = await this.authRepo.createSession({
        userId: user.id,
        sidHash,
        csrfHash,
        clientId: challenge.clientId,
        routingVersion: challenge.routingVersion,
        authMethod: "password",
        mfaAt: now,
        reauthAt: now,
        expiresAt,
        absoluteExpiresAt,
        ipHash,
        userAgentHash,
      });

      appLogger.info(
        "[AuthService.verify2faChallenge] Desafío 2FA verificado y sesión emitida exitosamente",
        { userId: user.id },
      );

      return ok({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.displayName,
          status: user.status,
        },
        emailVerified: user.emailVerifiedAt !== null,
        clientId: challenge.clientId,
        expiresAt: session.expiresAt.toISOString(),
        sid,
        csrfToken,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.verify2faChallenge Error] ${msg}`, error, {
        challengeToken: input.challengeToken,
      });
      return err("Error interno al verificar challenge 2FA.", "DB_ERROR");
    }
  }
}

/** Instancia singleton por defecto de {@link AuthService}. */
export const authService = new AuthService();
