import {
  registerUserSchema,
  loginUserSchema,
  authEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  setupOwnerSchema,
  type RegisterUserInput,
  type LoginUserInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type ChangePasswordInput,
  type SetupOwnerInputSchema,
} from "../auth/validation";
import { timingSafeEqual } from "node:crypto";
import { getValidatedEnv } from "../utils/env";
import {
  type ICellAuthRepository,
  type CellUserCredentials,
  type CellIdentitySnapshot,
  CellUnavailableError,
} from "../repositories/cell-auth.repository.interface";
import { defaultCellAuthRepository } from "../repositories/drizzle-cell-auth.repository";
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  needsRehash,
} from "../auth/password-hasher";
import { randomUUID } from "node:crypto";
import {
  generateSecureToken,
  hashToken,
  hashIpWithPepper,
  generateSessionId,
  generateCsrfToken,
  compareHashesConstantTime,
} from "../auth/tokens";
import {
  type ChatwootSsoClaims,
  type IssueChatwootSsoParams,
  type ChatwootSsoErrorCode,
  signChatwootJwt,
  verifyChatwootJwt,
  consumeChatwootSsoJti,
} from "../auth/chatwoot-sso";
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
import {
  SessionCacheManager,
  sessionCacheManager as defaultSessionCacheManager,
} from "../auth/session-cache";
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
 * Resumen público y sanitizado de una sesión activa (AUTH-001 §5.6, T-23).
 *
 * No expone hashes de sesión, CSRF, IP ni tokens criptográficos.
 */
export interface SessionSummaryDto {
  /** Identificador público UUID de la sesión */
  id: string;
  /** Método de autenticación utilizado ("password" | "google" | "facebook") */
  authMethod: "password" | "google" | "facebook";
  /** Fecha ISO de verificación de segundo factor, o null si no se utilizó */
  mfaAt: string | null;
  /** Fecha ISO de creación de la sesión */
  createdAt: string;
  /** Fecha ISO del último acceso registrado */
  lastSeenAt: string;
  /** Fecha ISO de vencimiento de la sesión */
  expiresAt: string;
  /** Indica si corresponde a la sesión desde la que se realiza la consulta */
  isCurrent: boolean;
}

/**
 * Parámetros de entrada para vincular una sesión a un inquilino durante onboarding/invitación (AUTH-001 §5.6, §5.9, T-24).
 */
export interface BindSessionToClientInput {
  /** Identificador opaco de sesión en claro (cookie). */
  sid?: string;
  /** Identificador UUID público de la sesión. */
  sessionId?: string;
  /** Identificador UUID del cliente/inquilino al que se vincula la membresía. */
  clientId: string;
  /** Versión de enrutamiento opcional; si se omite, se consulta client_routing. */
  routingVersion?: number | null;
}

/**
 * Códigos de error para el flujo de vinculación de sesión con inquilino (AUTH-001 T-24, T-26).
 */
export type BindSessionToClientErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "USER_NOT_FOUND"
  | "USER_DISABLED"
  | "EMAIL_NOT_VERIFIED"
  | "MEMBERSHIP_CONFLICT"
  | "DB_ERROR";

/**
 * Parámetros de entrada para la validación de sesión en flujos de onboarding o invitaciones (AUTH-001 §5.9, T-26).
 */
export interface ValidateOnboardingSessionInput {
  /** Identificador de sesión o cookie `sid`. */
  sid: string;
  /** Correo esperado de la invitación (opcional). */
  expectedEmail?: string;
  /** Token CSRF opcional para validación conjunta. */
  csrfToken?: string;
}

/**
 * Códigos de error para la validación de sesión de onboarding o invitaciones (AUTH-001 §5.9, T-26).
 */
export type ValidateOnboardingSessionErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "USER_NOT_FOUND"
  | "USER_DISABLED"
  | "EMAIL_NOT_VERIFIED"
  | "SESSION_EMAIL_MISMATCH"
  | "MEMBERSHIP_CONFLICT"
  | "DB_ERROR";

/**
 * Datos retornados tras validar exitosamente una sesión para onboarding o invitación.
 */
export interface OnboardingSessionValidationData {
  user: User;
  session: Session;
}

/**
 * Códigos de error para la reserva atómica de membresía de inquilino (AUTH-001 §5.9, T-26).
 */
export type ReserveMembershipErrorCode =
  | "USER_NOT_FOUND"
  | "USER_DISABLED"
  | "EMAIL_NOT_VERIFIED"
  | "MEMBERSHIP_CONFLICT"
  | "DB_ERROR";

/**
 * Datos retornados tras reservar exitosamente la membresía de un inquilino.
 */
export interface ReserveMembershipData {
  reserved: boolean;
  userId: string;
  clientId: string;
}

/**
 * Parámetros de entrada para el aprovisionamiento manual de usuario por ventas de plataforma (AUTH-001 §5.9, T-26).
 */
export interface ProvisionUserForManualSalesInput {
  /** Correo electrónico del usuario a vincular o crear. */
  email: string;
  /** Identificador UUID del cliente/inquilino al que se asignará. */
  clientId: string;
  /** Nombre visible opcional del usuario. */
  displayName?: string | null;
  /** Identificador o nombre del operador/sistema que realiza el alta. */
  createdBy?: string;
  /** Versión del aviso de privacidad y tratamiento de datos aceptada (por defecto "v1.0"). */
  policyVersion?: string;
  /** Canal de captura del consentimiento (por defecto "manual_sales"). */
  channel?: string;
}

/**
 * Códigos de error para el aprovisionamiento manual de usuario por ventas de plataforma (AUTH-001 §5.9, T-26).
 */
export type ProvisionUserForManualSalesErrorCode =
  | "VALIDATION_ERROR"
  | "USER_DISABLED"
  | "MEMBERSHIP_CONFLICT"
  | "DB_ERROR";

/**
 * Datos retornados tras aprovisionar un usuario en alta manual.
 */
export interface ProvisionUserForManualSalesData {
  user: User;
  isNew: boolean;
  setupPasswordToken: string | null;
}

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
 * Respuesta del asistente de primer arranque (setup-owner) (AUTH-001 T-27).
 */
export interface SetupOwnerResponseData {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    status: string;
  };
  sid: string;
  csrfToken: string;
  expiresAt: string;
}

export type SetupOwnerResult = Result<
  SetupOwnerResponseData,
  "VALIDATION_ERROR" | "INVALID_SETUP_TOKEN" | "SETUP_OWNER_ALREADY_COMPLETED" | "DB_ERROR"
>;

/**
 * Respuesta de migración inter-celdas (AUTH-001 §5.12, T-27).
 */
export interface MigrateTenantIdentityResponseData {
  userId: string;
  clientId: string;
  targetCellId: string;
  routingVersion: number;
}

export type MigrateTenantIdentityResult = Result<
  MigrateTenantIdentityResponseData,
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "CELL_UNAVAILABLE"
  | "SOURCE_USER_NOT_FOUND"
  | "VERIFICATION_FAILED"
  | "DB_ERROR"
>;

/**
 * Plazo canónico de retención (en días) para preregistros en staging del Router Global
 * que no materialicen un inquilino ni se vinculen a un plan durante el onboarding (AUTH-001 §5.1).
 */
export const PREREGISTRATION_RETENTION_DAYS = 60;

/**
 * Respuesta de promoción de identidad desde el staging del Router Global hacia una celda asignada (AUTH-001 T-04, §5.1).
 */
export interface PromoteStagingIdentityResponseData {
  userId: string;
  clientId: string;
  targetCellId: string;
}

export type PromoteStagingIdentityResult = Result<
  PromoteStagingIdentityResponseData,
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "USER_DISABLED"
  | "EMAIL_NOT_VERIFIED"
  | "MEMBERSHIP_CONFLICT"
  | "CELL_UNAVAILABLE"
  | "VERIFICATION_FAILED"
  | "DB_ERROR"
>;

/**
 * Respuesta de la purga de preregistros no materializados en el Router Global (AUTH-001 §5.1).
 */
export interface PurgeStalePreregistrationsResponseData {
  purgedCount: number;
  purgedUserIds: string[];
  cutoffDate: string;
}

export type PurgeStalePreregistrationsResult = Result<
  PurgeStalePreregistrationsResponseData,
  "INVALID_INPUT" | "DB_ERROR"
>;

/**
 * Resumen público de un proveedor OAuth habilitado en tiempo de ejecución (AUTH-001 AUTH-D-08, CA-AUTH-02).
 */
export interface OAuthProviderSummaryDto {
  id: "google" | "facebook" | string;
  displayName: string;
  scopes: string[];
}

/**
 * Configuración en tiempo de ejecución resuelta para un proveedor OAuth (AUTH-001 AUTH-D-08, CA-AUTH-02).
 */
export interface OAuthProviderRuntimeConfigData {
  id: "google" | "facebook";
  displayName: string;
  isEnabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  source: "database" | "env_fallback";
}

export type ResolveOAuthProviderRuntimeConfigResult = Result<
  OAuthProviderRuntimeConfigData,
  "PROVIDER_DISABLED" | "PROVIDER_UNAVAILABLE" | "DECRYPTION_ERROR"
>;

/**
 * Parámetros de entrada para registrar o actualizar un proveedor OAuth en `admin.auth_providers_config` (AUTH-001 AUTH-D-08).
 */
export interface UpsertOAuthProviderConfigInput {
  id: string;
  displayName: string;
  isEnabled: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  targetKeyId?: string;
  scopes?: string[];
  authUrl?: string | null;
  tokenUrl?: string | null;
  userInfoUrl?: string | null;
  actor?: string;
}

/**
 * Respuesta sanitizada tras guardar un proveedor OAuth (nunca incluye el secreto en texto plano ni el ciphertext).
 */
export interface UpsertOAuthProviderConfigResponseData {
  id: string;
  displayName: string;
  isEnabled: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
  secretKeyId: string | null;
  scopes: string[];
  authUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
}

export type UpsertOAuthProviderConfigResult = Result<
  UpsertOAuthProviderConfigResponseData,
  "INVALID_INPUT" | "ENCRYPTION_ERROR" | "DB_ERROR"
>;

/**
 * Roles canónicos de inquilino definidos en ADM-001 D-31 (`tenant_owner` y `tenant_agent`, sin `tenant_admin`).
 */
export type TenantRole = "tenant_owner" | "tenant_agent";

/**
 * Resultado de la resolución externa de autorización por petición provista por `ADM-001` (AUTH-001 T-28).
 */
export interface ResolvedRequestAuthorization {
  tenantRole?: TenantRole | null;
  platformScopes?: string[];
  membershipActive?: boolean;
}

/**
 * Parámetros para autorizar una petición autenticada sin almacenar roles en la sesión ni en la cookie (AUTH-001 §3.2, T-28).
 */
export interface AuthorizeSessionContextInput {
  /** Identificador de sesión en claro recibido desde `__Host-mocter_sid`. */
  sid: string;
  /** Identificador del inquilino sobre el que opera la petición (opcional para rutas globales de plataforma). */
  requestedClientId?: string | null;
  /** Lista de roles de inquilino admitidos para la operación (`tenant_owner`, `tenant_agent`). */
  requiredTenantRoles?: TenantRole[];
  /** Scope de plataforma o permiso específico requerido para la operación. */
  requiredScope?: string;
  /**
   * Callback inyectado por `ADM-001` que resuelve en cada petición `tenant_users.role` y scopes de plataforma.
   * `mocter_auth` nunca consulta `tenant_users` directamente.
   */
  resolveAuthorization: (context: {
    userId: string;
    clientId: string | null;
  }) => Promise<ResolvedRequestAuthorization>;
}

/**
 * Contexto autorizado para una petición tras verificar sesión, pertenencia a inquilino y permisos en tiempo real (AUTH-001 T-28).
 */
export interface AuthorizeSessionContextData {
  sessionId: string;
  userId: string;
  clientId: string | null;
  tenantRole: TenantRole | null;
  platformScopes: string[];
  /** Siempre `false`: los cambios de rol se aplican por petición sin reemitir la cookie de sesión. */
  cookieReissued: false;
}

export type AuthorizeSessionContextResult = Result<
  AuthorizeSessionContextData,
  | "INVALID_SESSION"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "USER_DISABLED"
  | "CLIENT_MISMATCH"
  | "FORBIDDEN_CLIENT_MISMATCH"
  | "FORBIDDEN_NO_MEMBERSHIP"
  | "FORBIDDEN_INSUFFICIENT_ROLE"
  | "FORBIDDEN_INSUFFICIENT_SCOPE"
>;

/**
 * Parámetros para reaccionar ante un cambio de rol o scope de un usuario (AUTH-001 T-28).
 */
export interface HandleAuthorizationChangeInput {
  userId: string;
  changeType:
    | "tenant_role_updated"
    | "sensitive_scope_removed"
    | "platform_privilege_elevated"
    | "tenant_membership_removed";
  /** Identificador de sesión actual en claro (solo cuando se desea rotar en lugar de revocar ante elevación). */
  currentSid?: string;
}

export interface HandleAuthorizationChangeData {
  userId: string;
  changeType: HandleAuthorizationChangeInput["changeType"];
  action: "none" | "revoked_all" | "rotated_current_and_revoked_others";
  cookieReissued: boolean;
  rotatedSession?: {
    sid: string;
    csrfToken: string;
    expiresAt: string;
  };
}

export type HandleAuthorizationChangeResult = Result<
  HandleAuthorizationChangeData,
  "INVALID_INPUT" | "SESSION_NOT_FOUND" | "DB_ERROR"
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
   * @param sessionCache - Gestor de caché de sesiones en Redis (por defecto {@link defaultSessionCacheManager}).
   */
  constructor(
    private readonly authRepo: IAuthRepository = defaultAuthRepository,
    private readonly mailer: IAuthMailer = defaultAuthMailer,
    private readonly googleOidcClient: IGoogleOidcClient = defaultGoogleOidcClient,
    private readonly stateManager: OAuthStateManager = oauthStateManager,
    private readonly facebookOAuthClient: IFacebookOAuthClient = defaultFacebookOAuthClient,
    private readonly totpCrypto: TotpCryptoService = defaultTotpCryptoService,
    private readonly mfaChallengeManager: MfaChallengeManager = defaultMfaChallengeManager,
    private readonly sessionCache: SessionCacheManager = defaultSessionCacheManager,
    private readonly cellAuthRepo: ICellAuthRepository = defaultCellAuthRepository,
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

      let passwordHashToVerify: string | null = null;
      let isTotpEnabled = false;

      // 2. Resolver identity_location (AUTH-001 §5.2, T-27)
      if (user.identityLocation !== "router") {
        if (!user.activeClientId) {
          appLogger.error(
            "[AuthService.login] Identidad inconsistente: identityLocation apunta a celda pero activeClientId es nulo",
            { userId: user.id, identityLocation: user.identityLocation },
          );
          return err("Identidad inconsistente.", "IDENTITY_INCONSISTENT");
        }

        let cellCredentials: CellUserCredentials | null = null;
        try {
          cellCredentials = await this.cellAuthRepo.findUserCredentialsInCell(
            user.identityLocation,
            user.activeClientId,
            user.id,
          );
        } catch (cellError) {
          appLogger.error(
            "[AuthService.login] Fallo de conexión con la celda asignada (Fail-Closed)",
            cellError,
            { userId: user.id, cellId: user.identityLocation },
          );
          return err(
            "Celda temporalmente fuera de servicio.",
            "CELL_UNAVAILABLE",
          );
        }

        if (
          !cellCredentials ||
          cellCredentials.status === "disabled" ||
          !cellCredentials.passwordHash
        ) {
          await verifyDummyPassword(password);
          return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
        }

        passwordHashToVerify = cellCredentials.passwordHash;
        isTotpEnabled = cellCredentials.totpEnabledAt !== null;

        const isValid = await verifyPassword(password, passwordHashToVerify);
        if (!isValid) {
          return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
        }

        if (needsRehash(passwordHashToVerify)) {
          try {
            const newHash = await hashPassword(password);
            await this.cellAuthRepo.updatePasswordHashInCell(
              user.identityLocation,
              user.activeClientId,
              user.id,
              newHash,
            );
            appLogger.info(
              "[AuthService.login] Contraseña rehasheada con éxito en celda",
              { userId: user.id, cellId: user.identityLocation },
            );
          } catch (rehashError) {
            appLogger.warn(
              "[AuthService.login] Fallo al rehashear contraseña en celda",
              { userId: user.id, error: rehashError },
            );
          }
        }
      } else {
        // Operador corporativo en Router Global
        if (user.status === "disabled" || !user.passwordHash) {
          await verifyDummyPassword(password);
          return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
        }

        passwordHashToVerify = user.passwordHash;
        isTotpEnabled = user.totpEnabledAt !== null;

        const isValid = await verifyPassword(password, passwordHashToVerify);
        if (!isValid) {
          return err(GENERIC_INVALID_CREDENTIALS_MESSAGE, "INVALID_CREDENTIALS");
        }

        if (needsRehash(passwordHashToVerify)) {
          try {
            const newHash = await hashPassword(password);
            await this.authRepo.updateUserPasswordHash(user.id, newHash);
            appLogger.info(
              "[AuthService.login] Contraseña rehasheada con éxito en Router",
              { userId: user.id },
            );
          } catch (rehashError) {
            appLogger.warn(
              "[AuthService.login] Fallo al rehashear contraseña en Router",
              { userId: user.id, error: rehashError },
            );
          }
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
      if (isTotpEnabled) {
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

    // Poblar caché de Redis con TTL de inactividad (AUTH-001 §5.6, T-21)
    await this.sessionCache.cacheSession(session, sidHash.toString("hex"));

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
      // 0. Validar que el proveedor Google no esté deshabilitado en auth_providers_config (CA-AUTH-02)
      let resolvedClientId = input.clientId;
      let resolvedClientSecret = input.clientSecret;
      if (this.authRepo.findAuthProviderConfig) {
        const providerRow = await this.authRepo.findAuthProviderConfig("google");
        if (providerRow) {
          if (!providerRow.isEnabled) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_DISABLED");
          }
          if (providerRow.clientId) {
            resolvedClientId = providerRow.clientId;
          }
          if (providerRow.clientSecretEncrypted && providerRow.secretKeyId) {
            resolvedClientSecret = this.totpCrypto
              .decrypt(
                providerRow.clientSecretEncrypted,
                "oauth_provider:google",
                providerRow.secretKeyId,
              )
              .toString("utf-8");
          }
        }
      }

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
          clientId: resolvedClientId,
          clientSecret: resolvedClientSecret,
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
          resolvedClientId,
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
      // 0. Validar que el proveedor Facebook no esté deshabilitado en auth_providers_config (CA-AUTH-02)
      let resolvedClientId = input.clientId;
      let resolvedClientSecret = input.clientSecret;
      if (this.authRepo.findAuthProviderConfig) {
        const providerRow = await this.authRepo.findAuthProviderConfig("facebook");
        if (providerRow) {
          if (!providerRow.isEnabled) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_DISABLED");
          }
          if (providerRow.clientId) {
            resolvedClientId = providerRow.clientId;
          }
          if (providerRow.clientSecretEncrypted && providerRow.secretKeyId) {
            resolvedClientSecret = this.totpCrypto
              .decrypt(
                providerRow.clientSecretEncrypted,
                "oauth_provider:facebook",
                providerRow.secretKeyId,
              )
              .toString("utf-8");
          }
        }
      }

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
          clientId: resolvedClientId,
          clientSecret: resolvedClientSecret,
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
      // 0. Validar que el proveedor no esté deshabilitado en auth_providers_config (CA-AUTH-02)
      if (this.authRepo.findAuthProviderConfig) {
        const providerRow = await this.authRepo.findAuthProviderConfig(input.provider);
        if (providerRow && !providerRow.isEnabled) {
          return err("Proveedor temporalmente fuera de servicio", "PROVIDER_DISABLED");
        }
      }

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

      // Cachear sesión rotada e invalidar demás sesiones en Redis (AUTH-001 §5.6, T-21)
      await this.sessionCache.cacheSession(rotatedSession, newSidHash.toString("hex"));
      await this.sessionCache.deleteAllUserSessions(user.id, newSidHash.toString("hex"));

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
   * Valida una sesión activa a partir de su `sid` en claro y opcionalmente verifica el token CSRF (AUTH-001 §5.6, T-21).
   *
   * Flujo de ejecución:
   * 1. Consulta la caché en Redis `auth:session:<sha256(sid)>`.
   * 2. Si hay acierto en caché:
   *    - Valida CSRF si se proveyó `csrfToken`.
   *    - Consulta el usuario en Postgres (la autoridad definitiva). Fail-Closed: si Postgres falla, retorna 503 `DB_ERROR`.
   *    - Si el usuario está deshabilitado o `activeClientId` no coincide con la sesión, revoca la sesión y retorna `UNAUTHORIZED`.
   *    - Si han pasado >= 60s desde `last_seen_at`, actualiza `last_seen_at` y extiende `expires_at = min(now + 30m, absolute_expires_at)`.
   *    - Retorna la sesión y el usuario.
   * 3. Si no está en caché (o Redis no responde):
   *    - Consulta la sesión en Postgres por su hash SHA-256.
   *    - Valida revocación y vencimiento por inactividad / absoluto.
   *    - Valida CSRF y estado del usuario en Postgres.
   *    - Si han pasado >= 60s, actualiza actividad y extiende vencimiento.
   *    - Repuebla la caché de Redis con TTL dinámico.
   *    - Retorna la sesión y el usuario.
   *
   * @param sid - Identificador de sesión en claro extraído de la cookie HTTP.
   * @param csrfToken - Token CSRF en claro provisto en el encabezado `x-csrf-token` (opcional).
   * @returns Un {@link Result} con la sesión activa y usuario, o un error tipado ("UNAUTHORIZED" | "FORBIDDEN" | "DB_ERROR").
   */
  async validateSession(
    sid: string,
    csrfToken?: string,
  ): Promise<Result<{ session: Session; user?: User }, "UNAUTHORIZED" | "FORBIDDEN" | "DB_ERROR">> {
    if (!sid) {
      return err("Identificador de sesión ausente.", "UNAUTHORIZED");
    }

    try {
      const sidHash = hashToken(sid);
      const sidHashHex = sidHash.toString("hex");

      // 1. Consultar la caché en Redis (AUTH-001 §5.6)
      const cached = await this.sessionCache.getCachedSession(sidHashHex);

      if (cached) {
        // Validar CSRF si fue provisto
        if (csrfToken) {
          const csrfHash = hashToken(csrfToken);
          const cachedCsrfHash = Buffer.from(cached.csrfHashHex, "hex");
          if (!compareHashesConstantTime(csrfHash, cachedCsrfHash)) {
            return err("Token CSRF inválido.", "FORBIDDEN");
          }
        }

        // Autoridad en Postgres: resolver usuario (Fail-Closed)
        let user: User | null = null;
        try {
          user = await this.authRepo.findUserById(cached.userId);
        } catch (pgError) {
          appLogger.error(
            `[AuthService.validateSession Postgres Error] ${pgError instanceof Error ? pgError.message : String(pgError)}`,
            pgError,
          );
          return err("Error interno al validar la sesión.", "DB_ERROR");
        }

        if (!user || user.status === "disabled") {
          await this.revokeSession(sid, "account_disabled");
          return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
        }

        if (user.activeClientId !== cached.clientId) {
          await this.revokeSession(sid, "client_id_mismatch");
          return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
        }

        // Ventana deslizante de inactividad (touchSession cada >= 60s)
        const now = new Date();
        const lastSeenAt = new Date(cached.lastSeenAt);
        const absoluteExpiresAt = new Date(cached.absoluteExpiresAt);
        let currentExpiresAt = new Date(cached.expiresAt);
        let currentLastSeenAt = lastSeenAt;

        if (now.getTime() - lastSeenAt.getTime() >= 60 * 1000) {
          const potentialExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
          currentExpiresAt =
            potentialExpiresAt > absoluteExpiresAt
              ? absoluteExpiresAt
              : potentialExpiresAt;
          currentLastSeenAt = now;

          try {
            await this.authRepo.touchSession(
              cached.id,
              currentLastSeenAt,
              currentExpiresAt,
            );
          } catch (touchError) {
            appLogger.warn(
              `[AuthService.validateSession] Error al actualizar touchSession en Postgres: ${touchError instanceof Error ? touchError.message : String(touchError)}`,
            );
          }

          await this.sessionCache.touchSession(
            sidHashHex,
            currentLastSeenAt,
            currentExpiresAt,
          );
        }

        const session: Session = {
          id: cached.id,
          userId: cached.userId,
          clientId: cached.clientId,
          routingVersion: cached.routingVersion,
          sidHash,
          csrfHash: Buffer.from(cached.csrfHashHex, "hex"),
          authMethod: cached.authMethod as "password" | "google" | "facebook",
          mfaAt: cached.mfaAt ? new Date(cached.mfaAt) : null,
          reauthAt: cached.reauthAt ? new Date(cached.reauthAt) : null,
          lastSeenAt: currentLastSeenAt,
          expiresAt: currentExpiresAt,
          absoluteExpiresAt,
          revokedAt: null,
          revokedReason: null,
          ipHash: null,
          userAgentHash: null,
          createdAt: lastSeenAt,
          updatedAt: currentLastSeenAt,
          createdBy: cached.userId,
          updatedBy: cached.userId,
        };

        return ok({ session, user });
      }

      // 2. Cache miss o fallo de Redis: consultar Postgres
      let session: Session | null = null;
      try {
        session = await this.authRepo.findSessionBySidHash(sidHash);
      } catch (pgError) {
        appLogger.error(
          `[AuthService.validateSession Postgres Error] ${pgError instanceof Error ? pgError.message : String(pgError)}`,
          pgError,
        );
        return err("Error interno al validar la sesión.", "DB_ERROR");
      }

      if (!session) {
        return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
      }

      const now = new Date();
      if (
        session.revokedAt !== null ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now
      ) {
        return err("Sesión expirada o revocada.", "UNAUTHORIZED");
      }

      if (csrfToken) {
        const csrfHash = hashToken(csrfToken);
        if (!compareHashesConstantTime(csrfHash, session.csrfHash)) {
          return err("Token CSRF inválido.", "FORBIDDEN");
        }
      }

      let user: User | null = null;
      try {
        user = await this.authRepo.findUserById(session.userId);
      } catch (pgError) {
        appLogger.error(
          `[AuthService.validateSession Postgres Error] ${pgError instanceof Error ? pgError.message : String(pgError)}`,
          pgError,
        );
        return err("Error interno al validar la sesión.", "DB_ERROR");
      }

      if (!user || user.status === "disabled") {
        await this.revokeSession(sid, "account_disabled");
        return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
      }

      if (user.activeClientId !== session.clientId) {
        await this.revokeSession(sid, "client_id_mismatch");
        return err("Sesión no encontrada o revocada.", "UNAUTHORIZED");
      }

      let currentExpiresAt = session.expiresAt;
      let currentLastSeenAt = session.lastSeenAt;

      if (now.getTime() - session.lastSeenAt.getTime() >= 60 * 1000) {
        const potentialExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
        currentExpiresAt =
          potentialExpiresAt > session.absoluteExpiresAt
            ? session.absoluteExpiresAt
            : potentialExpiresAt;
        currentLastSeenAt = now;

        try {
          await this.authRepo.touchSession(
            session.id,
            currentLastSeenAt,
            currentExpiresAt,
          );
        } catch (touchError) {
          appLogger.warn(
            `[AuthService.validateSession] Error al actualizar touchSession en Postgres: ${touchError instanceof Error ? touchError.message : String(touchError)}`,
          );
        }

        session.lastSeenAt = currentLastSeenAt;
        session.expiresAt = currentExpiresAt;
      }

      // Repoblar caché en Redis con TTL de inactividad
      await this.sessionCache.cacheSession(session, sidHashHex);

      return ok({ session, user });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.validateSession Error] ${msg}`, error);
      return err("Error interno al validar la sesión.", "DB_ERROR");
    }
  }

  /**
   * Revoca una sesión por su `sid` en claro e invalida su caché en Redis (AUTH-001 §5.6, §6.4).
   *
   * @param sid - Identificador opaco de sesión en claro extraído de la cookie.
   * @param reason - Motivo descriptivo de la revocación.
   * @returns Un {@link Result} con confirmación o error de persistencia.
   */
  async revokeSession(
    sid: string,
    reason: string,
  ): Promise<Result<{ message: string }, "DB_ERROR">> {
    try {
      const sidHash = hashToken(sid);
      const sidHashHex = sidHash.toString("hex");

      const cached = await this.sessionCache.getCachedSession(sidHashHex);
      let sessionId = cached?.id;
      let userId = cached?.userId;

      if (!sessionId) {
        const dbSession = await this.authRepo.findSessionBySidHash(sidHash);
        if (dbSession) {
          sessionId = dbSession.id;
          userId = dbSession.userId;
        }
      }

      if (sessionId) {
        await this.authRepo.revokeSession(sessionId, reason);
      }

      await this.sessionCache.deleteSession(sidHashHex, userId);

      appLogger.info("[AuthService.revokeSession] Sesión revocada exitosamente", {
        sessionId,
        userId,
        reason,
      });

      return ok({ message: "Sesión revocada exitosamente." });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.revokeSession Error] ${msg}`, error);
      return err("Error interno al revocar la sesión.", "DB_ERROR");
    }
  }

  /**
   * Revoca todas las sesiones activas de un usuario en Postgres y Redis (AUTH-001 §5.6, §6.4, T-24).
   *
   * @param userId - Identificador UUID del usuario.
   * @param reason - Motivo descriptivo de la revocación.
   * @param exceptSidOrOptions - Identificador opcional de sesión en claro o identificador UUID que no debe ser revocada.
   * @returns Un {@link Result} con confirmación o error de persistencia.
   */
  async revokeUserSessions(
    userId: string,
    reason: string,
    exceptSidOrOptions?: string | { exceptSid?: string; exceptSessionId?: string },
  ): Promise<Result<{ message: string }, "DB_ERROR">> {
    try {
      let exceptSessionId: string | undefined = undefined;
      let exceptSidHashHex: string | undefined = undefined;

      if (typeof exceptSidOrOptions === "string") {
        const exceptHash = hashToken(exceptSidOrOptions);
        exceptSidHashHex = exceptHash.toString("hex");
        const exceptSession = await this.authRepo.findSessionBySidHash(exceptHash);
        exceptSessionId = exceptSession?.id;
      } else if (typeof exceptSidOrOptions === "object" && exceptSidOrOptions !== null) {
        if (exceptSidOrOptions.exceptSid) {
          const exceptHash = hashToken(exceptSidOrOptions.exceptSid);
          exceptSidHashHex = exceptHash.toString("hex");
          const exceptSession = await this.authRepo.findSessionBySidHash(exceptHash);
          exceptSessionId = exceptSession?.id;
        } else if (exceptSidOrOptions.exceptSessionId) {
          exceptSessionId = exceptSidOrOptions.exceptSessionId;
          const session = await this.authRepo.findSessionById(exceptSessionId);
          if (session) {
            exceptSidHashHex = session.sidHash.toString("hex");
          }
        }
      }

      await this.authRepo.revokeAllUserSessions(userId, reason, exceptSessionId);
      await this.sessionCache.deleteAllUserSessions(userId, exceptSidHashHex);

      appLogger.info("[AuthService.revokeUserSessions] Sesiones de usuario revocadas", {
        userId,
        reason,
        exceptSessionId,
      });

      return ok({ message: "Sesiones de usuario revocadas exitosamente." });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.revokeUserSessions Error] ${msg}`, error);
      return err("Error interno al revocar las sesiones del usuario.", "DB_ERROR");
    }
  }

  /**
   * Comprueba si la marca de reautenticación `reauth_at` es válida dentro de una ventana de tiempo (AUTH-001 §5.5, §5.6, T-21).
   *
   * Por defecto, la ventana para operaciones sensibles (cambio de contraseña, enrolar 2FA, etc.) es de 5 minutos (300 segundos).
   *
   * @param reauthAt - Marca de tiempo de última reautenticación explícita.
   * @param maxAgeSeconds - Tiempo de vigencia permitido en segundos (por defecto 300 = 5 minutos).
   * @returns `true` si la reautenticación sigue vigente, `false` en caso contrario.
   */
  isReauthValid(reauthAt: Date | string, maxAgeSeconds = 300): boolean {
    const timestamp =
      typeof reauthAt === "string" ? new Date(reauthAt).getTime() : reauthAt.getTime();
    return Date.now() - timestamp <= maxAgeSeconds * 1000;
  }

  /**
   * Lista todas las sesiones activas y vigentes del usuario con formato sanitizado DTO (AUTH-001 §5.6, T-23).
   *
   * Garantiza que el `sid_hash`, `csrf_hash`, `ip_hash` y tokens sensibles jamás sean expuestos.
   *
   * @param userId - Identificador UUID del usuario.
   * @param currentSessionId - Identificador opcional de la sesión en curso para marcar `isCurrent`.
   * @returns Lista de entidades {@link SessionSummaryDto}.
   */
  async listUserSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<Result<SessionSummaryDto[], "DB_ERROR">> {
    try {
      const activeSessions = await this.authRepo.listActiveSessionsByUserId(userId);

      const dtoList: SessionSummaryDto[] = activeSessions.map((s) => ({
        id: s.id,
        authMethod: s.authMethod as "password" | "google" | "facebook",
        mfaAt: s.mfaAt ? s.mfaAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: Boolean(currentSessionId && s.id === currentSessionId),
      }));

      return ok(dtoList);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.listUserSessions Error] ${msg}`, error, { userId });
      return err("Error interno al listar sesiones de usuario.", "DB_ERROR");
    }
  }

  /**
   * Revoca una sesión específica por su ID público UUID verificando pertenencia al usuario (AUTH-001 §5.6, T-23).
   *
   * Invalida el registro en base de datos y la clave correspondiente en la caché de Redis.
   *
   * @param userId - Identificador UUID del usuario autenticado.
   * @param sessionId - Identificador UUID público de la sesión a revocar.
   * @returns Un {@link Result} con confirmación o error.
   */
  async revokeSessionById(
    userId: string,
    sessionId: string,
  ): Promise<Result<{ message: string }, "NOT_FOUND" | "DB_ERROR">> {
    try {
      const session = await this.authRepo.findSessionById(sessionId);
      if (!session || session.userId !== userId || session.revokedAt !== null) {
        return err("Sesión no encontrada o ya revocada.", "NOT_FOUND");
      }

      await this.authRepo.revokeSession(sessionId, "user_revoked");
      await this.sessionCache.deleteSession(session.sidHash.toString("hex"), userId);

      appLogger.info("[AuthService.revokeSessionById] Sesión revocada por el usuario", {
        userId,
        sessionId,
      });

      return ok({ message: "Sesión revocada exitosamente." });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.revokeSessionById Error] ${msg}`, error, {
        userId,
        sessionId,
      });
      return err("Error interno al revocar la sesión.", "DB_ERROR");
    }
  }

  /**
   * Ejecuta la purga de sesiones vencidas o revocadas en base de datos (AUTH-001 §5.6, T-23).
   *
   * No elimina sesiones vigentes (revoked_at IS NULL y expires_at > now y absolute_expires_at > now).
   *
   * @param now - Fecha de corte actual.
   * @returns Cantidad de sesiones purgadas.
   */
  async purgeExpiredSessions(
    now: Date = new Date(),
  ): Promise<Result<{ purgedCount: number }, "DB_ERROR">> {
    try {
      const purgedCount = await this.authRepo.purgeExpiredSessions(now);
      appLogger.info("[AuthService.purgeExpiredSessions] Purga de sesiones ejecutada exitosamente", {
        purgedCount,
      });
      return ok({ purgedCount });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.purgeExpiredSessions Error] ${msg}`, error);
      return err("Error interno al purgar sesiones.", "DB_ERROR");
    }
  }

  /**
   * Asocia una sesión activa al inquilino resultante de un flujo de onboarding o invitación,
   * y revoca todas las demás sesiones del usuario (AUTH-001 §5.6, §5.9, T-24).
   *
   * Reglas estrictas:
   * 1. Una segunda membresía se rechaza de inmediato si el usuario ya posee un `active_client_id` diferente,
   *    sin alterar la sesión existente.
   * 2. Si es válida, actualiza `client_id` y `routing_version` en `sessions` y en la caché de Redis.
   * 3. Revoca todas las demás sesiones activas del usuario con motivo "membership_onboarding" en Postgres y Redis.
   *
   * @param sidOrInput - `sid` en claro, o un objeto {@link BindSessionToClientInput}.
   * @param maybeClientId - UUID del cliente si el primer argumento es un string `sid`.
   * @param maybeRoutingVersion - Versión de enrutamiento si el primer argumento es un string `sid`.
   * @returns Un {@link Result} con la sesión actualizada o el código de error correspondiente.
   */
  async bindSessionToClient(
    sidOrInput: string | BindSessionToClientInput,
    maybeClientId?: string,
    maybeRoutingVersion?: number | null,
  ): Promise<Result<{ session: Session }, BindSessionToClientErrorCode>> {
    try {
      let sid: string | undefined;
      let sessionId: string | undefined;
      let clientId: string;
      let routingVersion: number | null | undefined;

      if (typeof sidOrInput === "string") {
        sid = sidOrInput;
        clientId = maybeClientId!;
        routingVersion = maybeRoutingVersion;
      } else {
        sid = sidOrInput.sid;
        sessionId = sidOrInput.sessionId;
        clientId = sidOrInput.clientId;
        routingVersion = sidOrInput.routingVersion;
      }

      if (!clientId) {
        return err("Identificador de cliente inválido.", "DB_ERROR");
      }

      // 1. Resolver sesión activa
      let session: Session | null = null;
      let sidHashHex: string | undefined;

      if (sid) {
        const sidHash = hashToken(sid);
        sidHashHex = sidHash.toString("hex");
        session = await this.authRepo.findSessionBySidHash(sidHash);
      } else if (sessionId) {
        session = await this.authRepo.findSessionById(sessionId);
        if (session) {
          sidHashHex = session.sidHash.toString("hex");
        }
      }

      if (!session || session.revokedAt !== null) {
        return err("Sesión no encontrada o ya revocada.", "SESSION_NOT_FOUND");
      }

      const now = new Date();
      if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
        return err("La sesión ha expirado.", "SESSION_EXPIRED");
      }

      // 2. Resolver usuario y validar restricciones
      const user = await this.authRepo.findUserById(session.userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (user.status === "disabled") {
        return err("El usuario se encuentra deshabilitado.", "USER_DISABLED");
      }

      // Regla canónica de correo verificado (AUTH-001 §5.9, T-26):
      // No se permite vincular una sesión a un inquilino si el correo no está verificado.
      if (user.emailVerifiedAt === null) {
        return err(
          "El correo electrónico del usuario debe estar verificado antes de vincular la sesión con un inquilino.",
          "EMAIL_NOT_VERIFIED",
        );
      }

      // 3. Regla canónica de membresía única (ADM-001 D-15 / AUTH-001 §5.9):
      // Si el usuario ya tiene un activeClientId distinto, una segunda membresía se rechaza
      // terminantemente y NO altera la sesión existente.
      if (user.activeClientId && user.activeClientId !== clientId) {
        return err(
          "El usuario ya posee una membresía activa en otro inquilino.",
          "MEMBERSHIP_CONFLICT",
        );
      }

      // 4. Resolver versión de enrutamiento si no fue provista
      let resolvedRoutingVersion = routingVersion;
      if (resolvedRoutingVersion === undefined || resolvedRoutingVersion === null) {
        resolvedRoutingVersion = await this.authRepo.getClientRoutingVersion(clientId);
      }

      // 5. Actualizar la sesión en Postgres
      const updatedSession = await this.authRepo.bindSessionToClient(
        session.id,
        clientId,
        resolvedRoutingVersion,
      );

      // 6. Revocar todas las demás sesiones activas del usuario (AUTH-001 §5.6, §5.9, T-24)
      await this.authRepo.revokeAllUserSessions(
        session.userId,
        "membership_onboarding",
        session.id,
      );

      // 7. Sincronizar caché de Redis: invalidar otras sesiones y refrescar la actual
      if (sidHashHex) {
        await this.sessionCache.deleteAllUserSessions(session.userId, sidHashHex);
        await this.sessionCache.cacheSession(updatedSession, sidHashHex);
      } else {
        await this.sessionCache.deleteAllUserSessions(session.userId);
      }

      appLogger.info("[AuthService.bindSessionToClient] Sesión vinculada exitosamente al cliente", {
        sessionId: session.id,
        userId: session.userId,
        clientId,
        routingVersion: resolvedRoutingVersion,
      });

      return ok({ session: updatedSession });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.bindSessionToClient Error] ${msg}`, error);
      return err("Error interno al vincular la sesión con el inquilino.", "DB_ERROR");
    }
  }

  /**
   * Revoca todas las sesiones activas asociadas a un inquilino cuando este se suspende o se da de baja (AUTH-001 §5.6, T-24).
   *
   * Invalida los registros en Postgres y elimina de forma inmediata las claves correspondientes en Redis
   * para garantizar que ningún usuario conserve acceso al inquilino suspendido a través de réplicas.
   *
   * @param clientId - Identificador UUID del cliente/inquilino.
   * @param reason - Motivo de la revocación (p. ej. "tenant_suspended", "tenant_decommissioned").
   * @returns Un {@link Result} con la cantidad de sesiones revocadas.
   */
  async revokeClientSessions(
    clientId: string,
    reason: string = "tenant_suspended",
  ): Promise<Result<{ revokedCount: number }, "DB_ERROR">> {
    try {
      const revokedSessions = await this.authRepo.revokeSessionsByClientId(clientId, reason);

      // Invalidar inmediatamente en Redis cada sesión revocada
      for (const s of revokedSessions) {
        const sidHashHex = s.sidHash.toString("hex");
        await this.sessionCache.deleteSession(sidHashHex, s.userId);
      }

      appLogger.info("[AuthService.revokeClientSessions] Sesiones de inquilino revocadas", {
        clientId,
        reason,
        revokedCount: revokedSessions.length,
      });

      return ok({ revokedCount: revokedSessions.length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.revokeClientSessions Error] ${msg}`, error, { clientId, reason });
      return err("Error interno al revocar las sesiones del inquilino.", "DB_ERROR");
    }
  }

  /**
   * Valida que la sesión actual cumpla los requisitos estrictos para flujos de onboarding o invitaciones (AUTH-001 §5.9, T-26).
   *
   * Reglas:
   * 1. La sesión debe ser válida, no revocada y vigente (verificada vía `validateSession`).
   * 2. El usuario debe existir y su estado no debe ser `disabled`.
   * 3. El usuario debe poseer correo electrónico verificado (`email_verified_at IS NOT NULL`).
   * 4. Si se especifica `expectedEmail`, el correo del usuario debe coincidir exactamente (ignorando mayúsculas/minúsculas).
   * 5. El usuario NO debe poseer ya una membresía activa en otro inquilino (`active_client_id IS NULL`), preservando la regla 1:0..1.
   *
   * @param input - Parámetros con el identificador de sesión y correo esperado opcional.
   * @returns Un {@link Result} con las entidades {@link User} y {@link Session} o el código de error correspondiente.
   */
  async validateOnboardingSession(
    input: ValidateOnboardingSessionInput,
  ): Promise<Result<OnboardingSessionValidationData, ValidateOnboardingSessionErrorCode>> {
    try {
      if (!input.sid) {
        return err("Identificador de sesión ausente.", "UNAUTHORIZED");
      }

      // 1. Validar la sesión a través de validateSession (evalúa Redis + Postgres + CSRF)
      const sessionResult = await this.validateSession(input.sid, input.csrfToken);
      if (!sessionResult.ok) {
        return err(sessionResult.error, sessionResult.code);
      }

      const { session } = sessionResult.data;
      let user: User | null | undefined = sessionResult.data.user;
      if (!user) {
        user = await this.authRepo.findUserById(session.userId);
      }

      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (user.status === "disabled") {
        return err("El usuario se encuentra deshabilitado.", "USER_DISABLED");
      }

      // 2. Exigir correo electrónico verificado (AUTH-001 §5.9, T-26)
      if (user.emailVerifiedAt === null) {
        return err(
          "El correo electrónico del usuario debe estar verificado para completar el onboarding o aceptar invitaciones.",
          "EMAIL_NOT_VERIFIED",
        );
      }

      // 3. Exigir que la sesión coincida con el correo esperado si se suministró (invitación)
      if (input.expectedEmail) {
        const normalizedSessionEmail = user.email.trim().toLowerCase();
        const normalizedExpectedEmail = input.expectedEmail.trim().toLowerCase();
        if (normalizedSessionEmail !== normalizedExpectedEmail) {
          return err(
            "El correo de la sesión no coincide con el correo invitado.",
            "SESSION_EMAIL_MISMATCH",
          );
        }
      }

      // 4. Exigir que el usuario no posea ya una membresía activa en otro inquilino (anti-segunda membresía)
      if (user.activeClientId !== null) {
        return err(
          "El usuario ya posee una membresía activa en un inquilino.",
          "MEMBERSHIP_CONFLICT",
        );
      }

      return ok({ user, session });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.validateOnboardingSession Error] ${msg}`, error);
      return err("Error interno al validar la sesión de onboarding.", "DB_ERROR");
    }
  }

  /**
   * Reserva atómicamente el apuntador `users.active_client_id` para un nuevo inquilino antes de crear `tenant_users` (AUTH-001 §5.9, T-26).
   *
   * Reglas:
   * 1. Verifica que el usuario exista, esté activo y con correo verificado.
   * 2. Si el usuario ya tiene asignado un inquilino distinto, rechaza de inmediato con `MEMBERSHIP_CONFLICT`.
   * 3. Ejecuta la actualización atómica en la base de datos garantizando que no se viole el contrato de membresía única (1:0..1).
   *
   * @param userId - Identificador UUID del usuario.
   * @param clientId - Identificador UUID del cliente/inquilino a reservar.
   * @returns Un {@link Result} confirmando la reserva.
   */
  async reserveMembershipForOnboarding(
    userId: string,
    clientId: string,
  ): Promise<Result<ReserveMembershipData, ReserveMembershipErrorCode>> {
    try {
      if (!userId || !clientId) {
        return err("Parámetros de usuario o cliente inválidos.", "DB_ERROR");
      }

      const user = await this.authRepo.findUserById(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (user.status === "disabled") {
        return err("El usuario se encuentra deshabilitado.", "USER_DISABLED");
      }

      if (user.emailVerifiedAt === null) {
        return err(
          "El correo electrónico del usuario debe estar verificado antes de reservar membresía.",
          "EMAIL_NOT_VERIFIED",
        );
      }

      if (user.activeClientId !== null && user.activeClientId !== clientId) {
        return err(
          "El usuario ya posee una membresía activa en otro inquilino.",
          "MEMBERSHIP_CONFLICT",
        );
      }

      const reserved = await this.authRepo.reserveUserActiveClient(userId, clientId);
      if (!reserved) {
        return err(
          "El usuario ya posee una membresía activa en otro inquilino o no fue posible reservar.",
          "MEMBERSHIP_CONFLICT",
        );
      }

      appLogger.info("[AuthService.reserveMembershipForOnboarding] Membresía reservada exitosamente", {
        userId,
        clientId,
      });

      return ok({ reserved: true, userId, clientId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.reserveMembershipForOnboarding Error] ${msg}`, error, {
        userId,
        clientId,
      });
      return err("Error interno al reservar la membresía.", "DB_ERROR");
    }
  }

  /**
   * Libera la reserva del apuntador `users.active_client_id` si una transacción de alta falla o se cancela (AUTH-001 §5.9, T-26).
   *
   * @param userId - Identificador UUID del usuario.
   * @param clientId - Identificador UUID del cliente/inquilino cuya reserva se va a anular.
   * @returns Un {@link Result} indicando si la liberación fue realizada.
   */
  async releaseMembershipReservation(
    userId: string,
    clientId: string,
  ): Promise<Result<{ released: boolean }, "DB_ERROR">> {
    try {
      const released = await this.authRepo.clearUserActiveClient(userId, clientId);
      appLogger.info("[AuthService.releaseMembershipReservation] Reserva liberada", {
        userId,
        clientId,
        released,
      });
      return ok({ released });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.releaseMembershipReservation Error] ${msg}`, error, {
        userId,
        clientId,
      });
      return err("Error interno al liberar la reserva de membresía.", "DB_ERROR");
    }
  }

  /**
   * Aprovisiona un usuario para un inquilino durante el alta manual por ventas de plataforma (AUTH-001 §5.9, T-26).
   *
   * Reglas:
   * 1. Reutiliza la identidad existente si el correo ya existe; nunca crea registros duplicados en `admin.users`.
   * 2. Si el usuario ya existe pero tiene un `active_client_id` asignado a otro cliente, la operación falla con `MEMBERSHIP_CONFLICT`.
   * 3. Si el usuario existe y no tiene membresía, reserva atómicamente `active_client_id = clientId`.
   * 4. Si el usuario no existe, lo crea con estado `active`, `active_client_id = clientId`, correo verificado,
   *    genera un token para establecer su contraseña inicial (`purpose: 'setup'`) y despacha el correo de invitación.
   *
   * @param input - Datos del usuario y cliente para el alta manual.
   * @returns Un {@link Result} con la información del usuario aprovisionado.
   */
  async provisionUserForManualSales(
    input: ProvisionUserForManualSalesInput,
  ): Promise<Result<ProvisionUserForManualSalesData, ProvisionUserForManualSalesErrorCode>> {
    try {
      const email = input.email.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return err("Formato de correo electrónico inválido.", "VALIDATION_ERROR");
      }

      if (!input.clientId) {
        return err("Identificador de cliente inválido.", "VALIDATION_ERROR");
      }

      const existingUser = await this.authRepo.findUserByEmail(email);

      if (existingUser) {
        // Caso 1: El usuario ya existe en la plataforma (reutilización de identidad)
        if (existingUser.status === "disabled") {
          return err("El usuario se encuentra deshabilitado.", "USER_DISABLED");
        }

        if (existingUser.activeClientId !== null && existingUser.activeClientId !== input.clientId) {
          return err(
            "El usuario ya posee una membresía activa en otro inquilino.",
            "MEMBERSHIP_CONFLICT",
          );
        }

        const reserved = await this.authRepo.reserveUserActiveClient(existingUser.id, input.clientId);
        if (!reserved) {
          return err(
            "El usuario ya posee una membresía activa en otro inquilino o no fue posible reservar.",
            "MEMBERSHIP_CONFLICT",
          );
        }

        appLogger.info(
          "[AuthService.provisionUserForManualSales] Identidad existente reutilizada para inquilino",
          {
            userId: existingUser.id,
            email,
            clientId: input.clientId,
          },
        );

        return ok({
          user: {
            ...existingUser,
            activeClientId: input.clientId,
          },
          isNew: false,
          setupPasswordToken: null,
        });
      }

      // Caso 2: Nuevo usuario a registrar en la plataforma
      const createdBy = input.createdBy ?? "platform_sales";
      const { user: newUser } = await this.authRepo.createUserWithConsent({
        email,
        passwordHash: null,
        displayName: input.displayName || null,
        activeClientId: input.clientId,
        emailVerifiedAt: new Date(),
        createdBy,
        policyVersion: input.policyVersion ?? "v1.0",
        channel: input.channel ?? "manual_sales",
      });

      // Emitir token para que configure su primera contraseña (setup)
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

      await this.authRepo.createPasswordResetToken({
        userId: newUser.id,
        tokenHash,
        purpose: "setup",
        expiresAt,
      });

      // Notificar por correo
      try {
        await this.mailer.sendPasswordSetupEmail(newUser.email, rawToken);
      } catch (mailError) {
        appLogger.warn(
          `[AuthService.provisionUserForManualSales] Error al enviar correo de setup de contraseña: ${mailError instanceof Error ? mailError.message : String(mailError)}`,
        );
      }

      appLogger.info(
        "[AuthService.provisionUserForManualSales] Nuevo usuario aprovisionado exitosamente para inquilino",
        {
          userId: newUser.id,
          email,
          clientId: input.clientId,
        },
      );

      return ok({
        user: newUser,
        isNew: true,
        setupPasswordToken: rawToken,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.provisionUserForManualSales Error] ${msg}`, error, {
        email: input.email,
        clientId: input.clientId,
      });
      return err("Error interno al aprovisionar el usuario para el inquilino.", "DB_ERROR");
    }
  }

  /**
   * Emite un token JWT firmado (HS256) con TTL de 5 minutos para el inicio de sesión único (SSO) en Chatwoot (AUTH-001 §5.10, T-25).
   *
   * Reglas estrictas:
   * 1. Valida que el usuario exista y su cuenta esté en estado `active`.
   * 2. Valida que el `clientId` solicitado coincida exactamente con la membresía activa del usuario (`user.activeClientId`).
   * 3. Utiliza el secreto `CHATWOOT_SSO_SECRET` compartido con la instancia de Chatwoot.
   * 4. Incluye claims requeridas: `email`, `name`, `identifier` (el `userId`), `iat`, `exp` (exactamente 5 min), y `jti` para uso único.
   * 5. Principio de cero persistencia: el token jamás se guarda en base de datos ni se escribe en logs.
   *
   * @param userIdOrParams - Identificador UUID del usuario, o un objeto {@link IssueChatwootSsoParams}.
   * @param maybeClientId - Identificador UUID del cliente/inquilino.
   * @param options - Opciones opcionales como el secreto a utilizar.
   * @returns Un {@link Result} con el token generado y su fecha de expiración.
   */
  async issueChatwootSso(
    userIdOrParams: string | IssueChatwootSsoParams,
    maybeClientId?: string,
    options?: { secret?: string },
  ): Promise<Result<{ token: string; expiresAt: Date; claims: ChatwootSsoClaims }, ChatwootSsoErrorCode>> {
    try {
      let userId: string;
      let clientId: string;
      let secret: string | undefined;

      if (typeof userIdOrParams === "string") {
        userId = userIdOrParams;
        clientId = maybeClientId!;
        secret = options?.secret;
      } else {
        userId = userIdOrParams.userId;
        clientId = userIdOrParams.clientId;
        secret = userIdOrParams.secret ?? options?.secret;
      }

      if (!secret) {
        secret = process.env.CHATWOOT_SSO_SECRET;
      }

      if (!secret) {
        appLogger.error("[AuthService.issueChatwootSso] Secreto CHATWOOT_SSO_SECRET no configurado");
        return err("Secreto de SSO de Chatwoot no configurado.", "SSO_SECRET_MISSING");
      }

      // 1. Resolver usuario
      const user = await this.authRepo.findUserById(userId);
      if (!user) {
        return err("Usuario no encontrado.", "USER_NOT_FOUND");
      }

      if (user.status !== "active") {
        return err("La cuenta del usuario no se encuentra activa.", "ACCOUNT_NOT_ACTIVE");
      }

      // 2. Validar que el cliente solicitado coincida con la membresía activa del usuario
      if (!user.activeClientId || user.activeClientId !== clientId) {
        return err(
          "El usuario no posee una membresía activa en el inquilino especificado.",
          "INVALID_CLIENT_MEMBERSHIP",
        );
      }

      // 3. Construir claims según especificación §5.10
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = nowSec + 300; // 5 minutos de vigencia estricta
      const jti = randomUUID();

      const claims: ChatwootSsoClaims = {
        email: user.email,
        name: user.displayName || user.email.split("@")[0] || "Usuario Mocter",
        identifier: user.id,
        jti,
        iat: nowSec,
        exp: expSec,
      };

      // 4. Firmar con HS256
      const token = signChatwootJwt(claims, secret);

      // Cero persistencia y cero logging del token o datos sensibles
      appLogger.info("[AuthService.issueChatwootSso] Token SSO emitido exitosamente", {
        userId,
        clientId,
        expiresAt: new Date(expSec * 1000).toISOString(),
      });

      return ok({
        token,
        expiresAt: new Date(expSec * 1000),
        claims,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.issueChatwootSso Error] ${msg}`, error, {
        userIdOrParams,
      });
      return err("Error interno al emitir token SSO.", "DB_ERROR");
    }
  }

  /**
   * Verifica la autenticidad, vigencia y condición de un solo uso de un token SSO de Chatwoot (AUTH-001 §5.10, T-25).
   *
   * @param token - Token JWT compacto a verificar.
   * @param options - Opciones opcionales como el secreto.
   * @returns Un {@link Result} con las claims verificadas o el código de error.
   */
  async verifyAndConsumeChatwootSsoToken(
    token: string,
    options?: { secret?: string },
  ): Promise<Result<{ claims: ChatwootSsoClaims }, ChatwootSsoErrorCode>> {
    try {
      const secret = options?.secret || process.env.CHATWOOT_SSO_SECRET;
      if (!secret) {
        return err("Secreto de SSO de Chatwoot no configurado.", "SSO_SECRET_MISSING");
      }

      let claims: ChatwootSsoClaims;
      try {
        claims = verifyChatwootJwt(token, secret);
      } catch (jwtError) {
        const msg = jwtError instanceof Error ? jwtError.message : String(jwtError);
        if (msg.includes("expirado")) {
          return err("El token JWT ha expirado.", "TOKEN_EXPIRED");
        }
        return err("Firma o formato de token JWT inválido.", "INVALID_TOKEN");
      }

      // Validar condición de un solo uso si posee jti
      if (claims.jti) {
        const isFirstUse = await consumeChatwootSsoJti(claims.jti);
        if (!isFirstUse) {
          appLogger.warn(
            "[AuthService.verifyAndConsumeChatwootSsoToken] Intento de segundo uso de token SSO detectado",
            {
              jti: claims.jti,
              identifier: claims.identifier,
            },
          );
          return err(
            "El token SSO ya ha sido utilizado (un solo uso permitido).",
            "TOKEN_ALREADY_USED",
          );
        }
      }

      return ok({ claims });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.verifyAndConsumeChatwootSsoToken Error] ${msg}`, error);
      return err("Error interno al verificar el token SSO.", "DB_ERROR");
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

      // Cachear sesión rotada e invalidar demás sesiones en Redis (AUTH-001 §5.6, T-21)
      await this.sessionCache.cacheSession(rotatedSession, newSidHash.toString("hex"));
      await this.sessionCache.deleteAllUserSessions(user.id, newSidHash.toString("hex"));

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

      // Cachear sesión rotada e invalidar demás sesiones en Redis (AUTH-001 §5.6, T-21)
      await this.sessionCache.cacheSession(rotatedSession, newSidHash.toString("hex"));
      await this.sessionCache.deleteAllUserSessions(user.id, newSidHash.toString("hex"));

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

      let totpSecretCiphertext: Buffer | null = null;
      let totpKeyId: string | null = null;
      let totpLastUsedStep: number | null = null;

      // 3. Resolver usuario en Router Global
      const user = await this.authRepo.findUserById(challenge.userId);
      if (!user || user.status === "disabled") {
        await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
        return err("Usuario no encontrado o deshabilitado.", "USER_NOT_FOUND");
      }

      if (challenge.identityLocation !== "router") {
        if (!challenge.clientId) {
          await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
          return err("Usuario no encontrado o deshabilitado.", "USER_NOT_FOUND");
        }

        let cellCredentials: CellUserCredentials | null = null;
        try {
          cellCredentials = await this.cellAuthRepo.findUserCredentialsInCell(
            challenge.identityLocation,
            challenge.clientId,
            challenge.userId,
          );
        } catch (cellError) {
          appLogger.error(
            "[AuthService.verify2faChallenge] Fallo de conexión con la celda asignada (Fail-Closed)",
            cellError,
            { userId: challenge.userId, cellId: challenge.identityLocation },
          );
          return err(
            "Celda temporalmente fuera de servicio.",
            "CELL_UNAVAILABLE",
          );
        }

        if (!cellCredentials || cellCredentials.status === "disabled") {
          await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
          return err("Usuario no encontrado o deshabilitado.", "USER_NOT_FOUND");
        }

        if (
          !cellCredentials.totpEnabledAt ||
          !cellCredentials.totpSecretCiphertext ||
          !cellCredentials.totpKeyId
        ) {
          await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
          return err("La cuenta no tiene 2FA activado.", "MFA_NOT_ENABLED");
        }

        totpSecretCiphertext = cellCredentials.totpSecretCiphertext;
        totpKeyId = cellCredentials.totpKeyId;
        totpLastUsedStep = cellCredentials.totpLastUsedStep;
      } else {
        if (!user.totpEnabledAt || !user.totpSecretCiphertext || !user.totpKeyId) {
          await this.mfaChallengeManager.deleteChallenge(input.challengeToken);
          return err("La cuenta no tiene 2FA activado.", "MFA_NOT_ENABLED");
        }

        totpSecretCiphertext = user.totpSecretCiphertext as unknown as Buffer;
        totpKeyId = user.totpKeyId;
        totpLastUsedStep = user.totpLastUsedStep;
      }

      // 4. Descifrar secreto activo con AES-256-GCM
      let base32Secret: string;
      try {
        base32Secret = this.totpCrypto
          .decrypt(totpSecretCiphertext, challenge.userId, totpKeyId)
          .toString("utf-8");
      } catch (decryptError) {
        appLogger.error(
          `[AuthService.verify2faChallenge] Fallo al descifrar secreto activo: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          decryptError,
          { userId: challenge.userId },
        );
        return err("Código de verificación inválido o vencido.", "INVALID_TOTP_CODE");
      }

      // 5. Validar código TOTP con ventana ±1 y anti-replay
      const verifyResult = verifyTotpCode(input.code, base32Secret, {
        window: 1,
        lastUsedStep: totpLastUsedStep,
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
      if (challenge.identityLocation !== "router" && challenge.clientId) {
        await this.cellAuthRepo.updateTotpLastUsedStepInCell(
          challenge.identityLocation,
          challenge.clientId,
          challenge.userId,
          verifyResult.step,
        );
      } else {
        await this.authRepo.updateUserTotpKeys(challenge.userId, {
          totpLastUsedStep: verifyResult.step,
        });
      }

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

      // Poblar caché de Redis con TTL de inactividad (AUTH-001 §5.6, T-21)
      await this.sessionCache.cacheSession(session, sidHash.toString("hex"));

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

  /**
   * Ejecuta la inicialización (bootstrap) del primer usuario platform_owner de la SaaS Mocter (AUTH-001 T-27).
   *
   * Reglas de seguridad:
   * - Requiere SETUP_OWNER_TOKEN configurado y verificado en tiempo constante.
   * - Solo está permitido si COUNT(users WHERE identity_location = 'router') === 0.
   * - Al completar el alta, se sella de forma permanente respondiendo 404 en adelante.
   */
  async setupInitialPlatformOwner(
    input: unknown,
    options?: {
      clientIp?: string;
      userAgent?: string;
      pepper?: string;
      expectedToken?: string;
    },
  ): Promise<SetupOwnerResult> {
    const parseResult = setupOwnerSchema.safeParse(input);
    if (!parseResult.success) {
      return err(
        parseResult.error.issues[0]?.message ?? "Datos de configuración inválidos",
        "VALIDATION_ERROR",
        parseResult.error.issues,
      );
    }

    const { token, email, password, name } = parseResult.data;

    // 1. Validar el token de setup contra la variable de entorno SETUP_OWNER_TOKEN
    let configuredToken: string | undefined = options?.expectedToken;
    if (!configuredToken) {
      try {
        configuredToken = getValidatedEnv().SETUP_OWNER_TOKEN;
      } catch {
        configuredToken = process.env.SETUP_OWNER_TOKEN;
      }
    }

    if (!configuredToken || configuredToken.trim() === "") {
      appLogger.error(
        "[AuthService.setupInitialPlatformOwner] SETUP_OWNER_TOKEN no configurado en el servidor",
      );
      return err("Token de configuración inválido o no configurado.", "INVALID_SETUP_TOKEN");
    }

    const inputBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(configuredToken);
    if (
      inputBuf.length !== expectedBuf.length ||
      !timingSafeEqual(inputBuf, expectedBuf)
    ) {
      appLogger.warn(
        "[AuthService.setupInitialPlatformOwner] Intento de setup con token inválido",
        { email },
      );
      return err("Token de configuración inválido.", "INVALID_SETUP_TOKEN");
    }

    // 2. Verificar que no exista ningún operador en Router Global
    try {
      const operatorCount = await this.authRepo.countPlatformOperators();
      if (operatorCount > 0) {
        appLogger.warn(
          "[AuthService.setupInitialPlatformOwner] Intento de setup cuando ya existen operadores",
          { operatorCount, email },
        );
        return err(
          "El asistente de configuración ya fue completado.",
          "SETUP_OWNER_ALREADY_COMPLETED",
        );
      }

      // 3. Hashear contraseña con Argon2id
      const passwordHash = await hashPassword(password);

      // 4. Crear el platform_owner en el Router Global
      const user = await this.authRepo.createInitialPlatformOwner({
        email,
        passwordHash,
        displayName: name,
      });

      // 5. Crear sesión opaca de servidor
      const sessionResult = await this.createSessionForUser(
        user,
        "password",
        null,
        options,
      );

      if (!sessionResult.ok) {
        return sessionResult;
      }

      appLogger.info(
        "[AuthService.setupInitialPlatformOwner] Platform Owner inicial creado exitosamente",
        { userId: user.id, email: user.email },
      );

      return ok({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.displayName,
          status: user.status,
        },
        sid: sessionResult.data.sid,
        csrfToken: sessionResult.data.csrfToken,
        expiresAt: sessionResult.data.expiresAt,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.setupInitialPlatformOwner Failed] ${msg}`, error, { email });
      return err("Error interno al inicializar el usuario principal.", "DB_ERROR");
    }
  }

  /**
   * Ejecuta la migración transaccional de identidad de un inquilino de una celda a otra (AUTH-001 §5.12, T-27).
   *
   * Cuatro fases:
   * 1. Expandir: crear o actualizar `users` en la celda destino con RLS.
   * 2. Copiar: copiar `password_hash`, secretos TOTP e `identities` a la celda destino.
   * 3. Conmutar: actualizar `users.identity_location` y `client_routing.cell_id` en Router, limpiar credenciales en origen, revocar sesiones.
   * 4. Verificar: comprobar credenciales en destino.
   */
  async migrateTenantIdentityInterCells(params: {
    userId: string;
    clientId: string;
    sourceCellId: string;
    targetCellId: string;
  }): Promise<MigrateTenantIdentityResult> {
    const { userId, clientId, sourceCellId, targetCellId } = params;

    if (!userId || !clientId || !sourceCellId || !targetCellId) {
      return err("Parámetros de migración incompletos.", "INVALID_INPUT");
    }

    if (sourceCellId === targetCellId) {
      return err("La celda origen y destino no pueden ser iguales.", "INVALID_INPUT");
    }

    try {
      // 0. Validar usuario en Router Global
      const user = await this.authRepo.findUserById(userId);
      if (!user) {
        return err("Usuario no encontrado en el Router Global.", "USER_NOT_FOUND");
      }

      if (user.activeClientId !== clientId || user.identityLocation !== sourceCellId) {
        return err(
          "El usuario no pertenece a la celda de origen indicada.",
          "INVALID_INPUT",
        );
      }

      // 1. Expandir: consultar credenciales en celda origen y expandir en destino
      const sourceCredentials = await this.cellAuthRepo.findUserCredentialsInCell(
        sourceCellId,
        clientId,
        userId,
      );

      if (!sourceCredentials) {
        return err(
          "El usuario no posee registro en la celda de origen.",
          "SOURCE_USER_NOT_FOUND",
        );
      }

      const sourceIdentities = await this.cellAuthRepo.listUserIdentitiesInCell(
        sourceCellId,
        clientId,
        userId,
      );

      await this.cellAuthRepo.expandCellUser(targetCellId, {
        id: user.id,
        clientId,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        status: user.status,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });

      // 2. Copiar: copiar credenciales e identidades a celda destino
      await this.cellAuthRepo.copyCredentialsToCell(targetCellId, sourceCredentials);
      if (sourceIdentities.length > 0) {
        await this.cellAuthRepo.copyIdentitiesToCell(
          targetCellId,
          clientId,
          userId,
          sourceIdentities,
        );
      }

      // 3. Conmutar: actualizar Router Global, limpiar origen y revocar sesiones
      await this.authRepo.updateUserIdentityLocation(userId, targetCellId);
      const newRoutingVersion = await this.authRepo.updateClientRoutingCell(
        clientId,
        targetCellId,
      );
      await this.cellAuthRepo.cleanupSourceCredentials(sourceCellId, clientId, userId);
      await this.revokeUserSessions(userId, "cell_migration");

      // 4. Verificar: comprobar que la celda destino responde y contiene credenciales
      const targetCheck = await this.cellAuthRepo.findUserCredentialsInCell(
        targetCellId,
        clientId,
        userId,
      );

      if (!targetCheck) {
        return err(
          "Verificación fallida en la celda destino tras la conmutación.",
          "VERIFICATION_FAILED",
        );
      }

      appLogger.info(
        "[AuthService.migrateTenantIdentityInterCells] Migración inter-celdas completada con éxito",
        { userId, clientId, sourceCellId, targetCellId, routingVersion: newRoutingVersion },
      );

      return ok({
        userId,
        clientId,
        targetCellId,
        routingVersion: newRoutingVersion,
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        return err("Celda temporalmente fuera de servicio.", "CELL_UNAVAILABLE");
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.migrateTenantIdentityInterCells Failed] ${msg}`, error, {
        userId,
        clientId,
        sourceCellId,
        targetCellId,
      });
      return err("Error interno durante la migración inter-celdas.", "DB_ERROR");
    }
  }

  /**
   * Promueve de forma transaccional las credenciales e identidades federadas de un usuario desde el staging
   * pre-onboarding del Router Global hacia su celda asignada al completar el alta del inquilino (AUTH-001 T-04, §5.1).
   *
   * Garantías de seguridad:
   * - Exige correo verificado y membresía única 1:0..1 (`active_client_id`).
   * - Ejecuta Expandir -> Copiar -> Verificar -> Conmutar y limpiar secretos del Router.
   * - Si falla la expansión o copia en la celda destino, NO conmuta `identity_location` ni borra las credenciales del Router.
   */
  async promoteStagingIdentityToCell(params: {
    userId: string;
    clientId: string;
    targetCellId: string;
  }): Promise<PromoteStagingIdentityResult> {
    const { userId, clientId, targetCellId } = params;

    if (!userId || !clientId || !targetCellId || targetCellId === "router") {
      return err("Parámetros de promoción a celda inválidos.", "INVALID_INPUT");
    }

    let reservedInThisCall = false;

    try {
      const user = await this.authRepo.findUserById(userId);
      if (!user) {
        return err("Usuario no encontrado en el Router Global.", "USER_NOT_FOUND");
      }

      if (user.status === "disabled") {
        return err("La cuenta de usuario se encuentra deshabilitada.", "USER_DISABLED");
      }

      if (!user.emailVerifiedAt) {
        return err(
          "El correo electrónico debe estar verificado antes de promover la identidad a una celda.",
          "EMAIL_NOT_VERIFIED",
        );
      }

      if (user.activeClientId && user.activeClientId !== clientId) {
        return err(
          "El usuario ya posee una membresía activa en otro inquilino.",
          "MEMBERSHIP_CONFLICT",
        );
      }

      if (user.identityLocation !== "router") {
        if (user.identityLocation === targetCellId && user.activeClientId === clientId) {
          return ok({ userId, clientId, targetCellId });
        }
        return err(
          "La identidad del usuario ya reside en una celda distinta del staging del Router.",
          "INVALID_INPUT",
        );
      }

      if (!user.activeClientId) {
        const reserved = await this.authRepo.reserveUserActiveClient(userId, clientId);
        if (!reserved) {
          return err(
            "No fue posible reservar la membresía única del usuario.",
            "MEMBERSHIP_CONFLICT",
          );
        }
        reservedInThisCall = true;
      }

      // 1. Expandir fila base en la celda destino bajo RLS
      await this.cellAuthRepo.expandCellUser(targetCellId, {
        id: user.id,
        clientId,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
        status: user.status,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });

      // 2. Copiar credenciales Argon2id, secretos TOTP e identidades federadas a la celda destino
      await this.cellAuthRepo.copyCredentialsToCell(targetCellId, {
        id: user.id,
        clientId,
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        passwordUpdatedAt: user.passwordUpdatedAt ?? null,
        totpSecretCiphertext: (user.totpSecretCiphertext as unknown as Buffer) ?? null,
        totpKeyId: user.totpKeyId ?? null,
        totpEnabledAt: user.totpEnabledAt ?? null,
        totpPendingSecretCiphertext:
          (user.totpPendingSecretCiphertext as unknown as Buffer) ?? null,
        totpPendingKeyId: user.totpPendingKeyId ?? null,
        totpPendingCreatedAt: user.totpPendingCreatedAt ?? null,
        totpLastUsedStep: user.totpLastUsedStep ?? null,
        status: user.status,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
      });

      const routerIdentities = (await this.authRepo.findIdentitiesByUserId(userId)) ?? [];
      if (routerIdentities.length > 0) {
        await this.cellAuthRepo.copyIdentitiesToCell(
          targetCellId,
          clientId,
          userId,
          routerIdentities.map((identity) => ({
            provider: identity.provider as "google" | "facebook",
            providerUserId: identity.providerUserId,
            providerEmail: identity.providerEmail ?? null,
            emailVerified: identity.emailVerified,
            displayName: identity.displayName ?? null,
            avatarUrl: identity.avatarUrl ?? null,
            linkedAt: identity.linkedAt,
            lastLoginAt: identity.lastLoginAt ?? null,
          })),
        );
      }

      // 3. Verificar persistencia efectiva en la celda antes de conmutar el Router
      const targetCheck = await this.cellAuthRepo.findUserCredentialsInCell(
        targetCellId,
        clientId,
        userId,
      );
      if (!targetCheck) {
        if (reservedInThisCall) {
          await this.authRepo.clearUserActiveClient(userId, clientId);
        }
        return err(
          "Verificación fallida en la celda destino antes de conmutar identity_location.",
          "VERIFICATION_FAILED",
        );
      }

      // 4. Conmutar identity_location y purgar password_hash, TOTP e identidades del Router Global
      await this.authRepo.updateUserIdentityLocation(userId, targetCellId);
      await this.authRepo.clearRouterUserCredentials(userId);

      appLogger.info(
        "[AuthService.promoteStagingIdentityToCell] Identidad promovida a celda y limpiada del Router Global",
        { userId, clientId, targetCellId },
      );

      return ok({ userId, clientId, targetCellId });
    } catch (error) {
      if (reservedInThisCall) {
        try {
          await this.authRepo.clearUserActiveClient(userId, clientId);
        } catch (rollbackError) {
          appLogger.warn(
            "[AuthService.promoteStagingIdentityToCell] Fallo al revertir reserva de active_client_id",
            { userId, clientId, error: rollbackError },
          );
        }
      }
      if (error instanceof CellUnavailableError) {
        return err("Celda temporalmente fuera de servicio.", "CELL_UNAVAILABLE");
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.promoteStagingIdentityToCell Failed] ${msg}`, error, {
        userId,
        clientId,
        targetCellId,
      });
      return err("Error interno al promover la identidad a la celda.", "DB_ERROR");
    }
  }

  /**
   * Depura del Router Global los preregistros de prospectos que no completaron su onboarding ni se vincularon
   * a ningún plan dentro del plazo de retención (60 días por defecto), preservando intactos a los operadores
   * de plataforma y a cualquier usuario con membresía activa (AUTH-001 §5.1).
   */
  async purgeStalePreregistrations(options?: {
    now?: Date;
    retentionDays?: number;
  }): Promise<PurgeStalePreregistrationsResult> {
    const now = options?.now ?? new Date();
    const retentionDays = options?.retentionDays ?? PREREGISTRATION_RETENTION_DAYS;

    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return err("El plazo de retención debe ser un número positivo de días.", "INVALID_INPUT");
    }

    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const purgedUserIds = await this.authRepo.purgeStalePreregistrations(cutoffDate);

      for (const purgedUserId of purgedUserIds) {
        await this.sessionCache.deleteAllUserSessions(purgedUserId);
      }

      appLogger.info(
        "[AuthService.purgeStalePreregistrations] Purga de preregistros no materializados ejecutada",
        { purgedCount: purgedUserIds.length, retentionDays, cutoffDate: cutoffDate.toISOString() },
      );

      return ok({
        purgedCount: purgedUserIds.length,
        purgedUserIds,
        cutoffDate: cutoffDate.toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.purgeStalePreregistrations Failed] ${msg}`, error);
      return err("Error interno al depurar preregistros caducados.", "DB_ERROR");
    }
  }

  /**
   * Registra o actualiza la configuración dinámica de un proveedor OAuth en `admin.auth_providers_config`
   * cifrando el `client_secret` mediante AES-256-GCM con AAD `oauth_provider:<id>:<key_id>` (AUTH-001 AUTH-D-08, CA-AUTH-02).
   *
   * @param input - Parámetros del proveedor OAuth a persistir en el Router Global.
   * @returns Resumen sanitizado del proveedor persistido sin exponer secretos.
   */
  async upsertOAuthProviderConfig(
    input: UpsertOAuthProviderConfigInput,
  ): Promise<UpsertOAuthProviderConfigResult> {
    const normalizedId = input.id?.trim().toLowerCase();
    const displayName = input.displayName?.trim();

    if (!normalizedId || !displayName) {
      return err("El identificador y el nombre visible del proveedor son obligatorios.", "INVALID_INPUT");
    }

    let clientSecretEncrypted: Buffer | null = null;
    let secretKeyId: string | null = null;

    if (input.clientSecret && input.clientSecret.trim().length > 0) {
      try {
        const encrypted = this.totpCrypto.encrypt(
          input.clientSecret.trim(),
          `oauth_provider:${normalizedId}`,
          input.targetKeyId,
        );
        clientSecretEncrypted = encrypted.ciphertext;
        secretKeyId = encrypted.keyId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        appLogger.error(`[AuthService.upsertOAuthProviderConfig Encryption Failed] ${msg}`, error, {
          providerId: normalizedId,
        });
        return err("Error al cifrar el secreto del proveedor OAuth con AES-256-GCM.", "ENCRYPTION_ERROR");
      }
    }

    try {
      if (!this.authRepo.upsertAuthProviderConfig) {
        return err("Repositorio no soporta configuración de proveedores OAuth.", "DB_ERROR");
      }

      const row = await this.authRepo.upsertAuthProviderConfig({
        id: normalizedId,
        displayName,
        isEnabled: input.isEnabled,
        clientId: input.clientId ?? null,
        clientSecretEncrypted,
        secretKeyId,
        scopes: input.scopes ?? [],
        authUrl: input.authUrl ?? null,
        tokenUrl: input.tokenUrl ?? null,
        userInfoUrl: input.userInfoUrl ?? null,
        actor: input.actor ?? "platform_owner",
      });

      return ok({
        id: row.id,
        displayName: row.displayName,
        isEnabled: row.isEnabled,
        clientId: row.clientId,
        hasClientSecret: Boolean(row.clientSecretEncrypted && row.secretKeyId),
        secretKeyId: row.secretKeyId,
        scopes: row.scopes,
        authUrl: row.authUrl,
        tokenUrl: row.tokenUrl,
        userInfoUrl: row.userInfoUrl,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.upsertOAuthProviderConfig Failed] ${msg}`, error, {
        providerId: normalizedId,
      });
      return err("Error interno al guardar la configuración del proveedor OAuth.", "DB_ERROR");
    }
  }

  /**
   * Obtiene la lista de proveedores OAuth habilitados en tiempo de ejecución para renderizar los botones
   * en `/login` y `/register` (AUTH-001 AUTH-D-08, CA-AUTH-02).
   *
   * Si `admin.auth_providers_config` contiene registros, respeta estrictamente el flag `is_enabled`.
   * Si la tabla está vacía (entorno local sin seed), aplica fallback a los proveedores por defecto (`google`, `facebook`).
   */
  async getEnabledOAuthProviders(): Promise<OAuthProviderSummaryDto[]> {
    try {
      if (this.authRepo.listAuthProvidersConfig) {
        const rows = await this.authRepo.listAuthProvidersConfig();
        if (rows && rows.length > 0) {
          return rows
            .filter((row) => row.isEnabled)
            .map((row) => ({
              id: row.id,
              displayName: row.displayName,
              scopes: row.scopes ?? [],
            }));
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.warn(
        `[AuthService.getEnabledOAuthProviders] Fallo al consultar auth_providers_config; usando fallback por defecto: ${msg}`,
      );
    }

    return [
      { id: "google", displayName: "Google", scopes: ["openid", "email", "profile"] },
      { id: "facebook", displayName: "Facebook", scopes: ["email", "public_profile"] },
    ];
  }

  /**
   * Resuelve la configuración en tiempo de ejecución de un proveedor OAuth (`google` o `facebook`),
   * verificando si se encuentra habilitado en `admin.auth_providers_config` y descifrando su `client_secret`
   * con AES-256-GCM (AUTH-001 AUTH-D-08, CA-AUTH-02).
   *
   * @param providerId - Identificador del proveedor (`google` o `facebook`).
   * @param envFallback - Credenciales de respaldo desde variables de entorno cuando la tabla no tiene fila para el proveedor.
   */
  async resolveOAuthProviderRuntimeConfig(
    providerId: "google" | "facebook",
    envFallback?: { clientId?: string; clientSecret?: string },
  ): Promise<ResolveOAuthProviderRuntimeConfigResult> {
    try {
      if (this.authRepo.findAuthProviderConfig) {
        const row = await this.authRepo.findAuthProviderConfig(providerId);
        if (row) {
          if (!row.isEnabled) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_DISABLED");
          }

          let decryptedSecret: string | undefined;
          if (row.clientSecretEncrypted && row.secretKeyId) {
            try {
              decryptedSecret = this.totpCrypto
                .decrypt(
                  row.clientSecretEncrypted,
                  `oauth_provider:${providerId}`,
                  row.secretKeyId,
                )
                .toString("utf-8");
            } catch (decryptErr) {
              const msg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
              appLogger.error(
                `[AuthService.resolveOAuthProviderRuntimeConfig] Fallo al descifrar client_secret de ${providerId}: ${msg}`,
              );
              return err("Proveedor temporalmente fuera de servicio", "DECRYPTION_ERROR");
            }
          }

          const clientId = row.clientId || envFallback?.clientId;
          const clientSecret = decryptedSecret || envFallback?.clientSecret;

          if (!clientId || !clientSecret) {
            return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
          }

          return ok({
            id: providerId,
            displayName: row.displayName,
            isEnabled: true,
            clientId,
            clientSecret,
            scopes:
              row.scopes && row.scopes.length > 0
                ? row.scopes
                : providerId === "google"
                  ? ["openid", "email", "profile"]
                  : ["email", "public_profile"],
            authUrl: row.authUrl ?? null,
            tokenUrl: row.tokenUrl ?? null,
            userInfoUrl: row.userInfoUrl ?? null,
            source: "database",
          });
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.warn(
        `[AuthService.resolveOAuthProviderRuntimeConfig] Fallo al consultar BD para ${providerId}; evaluando fallback de entorno: ${msg}`,
      );
    }

    if (!envFallback?.clientId || !envFallback?.clientSecret) {
      return err("Proveedor temporalmente fuera de servicio", "PROVIDER_UNAVAILABLE");
    }

    return ok({
      id: providerId,
      displayName: providerId === "google" ? "Google" : "Facebook",
      isEnabled: true,
      clientId: envFallback.clientId,
      clientSecret: envFallback.clientSecret,
      scopes: providerId === "google" ? ["openid", "email", "profile"] : ["email", "public_profile"],
      authUrl: null,
      tokenUrl: null,
      userInfoUrl: null,
      source: "env_fallback",
    });
  }

  /**
   * Autoriza una petición autenticada resolviendo permisos y roles en tiempo real sin almacenar roles
   * en la sesión ni en la cookie (AUTH-001 §3.2, T-28).
   *
   * Garantías de seguridad:
   * 1. La sesión solo transporta `user_id` y `client_id`; nunca contiene `role` ni `scopes`.
   * 2. Si `session.clientId` difiere de `user.activeClientId`, la sesión se revoca de inmediato (`validateSession`).
   * 3. Si la petición exige un `requestedClientId` distinto al `session.clientId`, se rechaza con `FORBIDDEN_CLIENT_MISMATCH`.
   * 4. `ADM-001` resuelve `tenant_users.role` y scopes de plataforma en cada petición a través del callback `resolveAuthorization`;
   *    el rol de base de datos `mocter_auth` jamás lee `tenant_users`.
   * 5. Un cambio de rol de inquilino surte efecto en la siguiente petición sin reemitir la cookie (`cookieReissued: false`).
   */
  async authorizeSessionContext(
    input: AuthorizeSessionContextInput,
  ): Promise<AuthorizeSessionContextResult> {
    const sessionCheck = await this.validateSession(input.sid);
    if (!sessionCheck.ok) {
      return err(sessionCheck.error, sessionCheck.code);
    }

    const { session } = sessionCheck.data;

    // Si la ruta solicita operar sobre un client_id específico, debe coincidir exactamente con el client_id de la sesión
    if (input.requestedClientId !== undefined && input.requestedClientId !== null) {
      if (!session.clientId || session.clientId !== input.requestedClientId) {
        return err(
          "La sesión actual no pertenece al inquilino solicitado.",
          "FORBIDDEN_CLIENT_MISMATCH",
        );
      }
    }

    // ADM-001 resuelve tenant_users.role y scopes de plataforma en cada petición; mocter_auth no lee tenant_users
    const resolved = await input.resolveAuthorization({
      userId: session.userId,
      clientId: session.clientId,
    });

    if (input.requestedClientId !== undefined && input.requestedClientId !== null) {
      if (resolved.membershipActive === false || !resolved.tenantRole) {
        return err(
          "El usuario no posee una membresía activa en el inquilino solicitado.",
          "FORBIDDEN_NO_MEMBERSHIP",
        );
      }
    }

    if (input.requiredTenantRoles && input.requiredTenantRoles.length > 0) {
      if (!resolved.tenantRole || !input.requiredTenantRoles.includes(resolved.tenantRole)) {
        return err(
          "El rol actual del usuario no tiene permisos para esta operación.",
          "FORBIDDEN_INSUFFICIENT_ROLE",
        );
      }
    }

    const platformScopes = resolved.platformScopes ?? [];
    if (input.requiredScope) {
      if (!platformScopes.includes(input.requiredScope)) {
        return err(
          "El usuario carece del scope requerido para esta operación.",
          "FORBIDDEN_INSUFFICIENT_SCOPE",
        );
      }
    }

    return ok({
      sessionId: session.id,
      userId: session.userId,
      clientId: session.clientId,
      tenantRole: resolved.tenantRole ?? null,
      platformScopes,
      cookieReissued: false,
    });
  }

  /**
   * Aplica la política de ciclo de vida de sesión ante cambios de rol o de scopes sensibles (AUTH-001 T-28).
   *
   * - `tenant_role_updated`: como la sesión solo lleva `user_id` y `client_id` y `ADM-001` resuelve el rol en cada petición,
   *   cambiar un rol de inquilino (`tenant_agent` ↔ `tenant_owner`) NO requiere reemitir la cookie ni revocar la sesión.
   * - `sensitive_scope_removed` o `tenant_membership_removed`: retirar un rol/scope sensible o dar de baja la membresía
   *   revoca de inmediato todas las sesiones activas del usuario en Postgres y Redis.
   * - `platform_privilege_elevated`: si se provee `currentSid`, rota la sesión actual y revoca las demás sesiones del usuario;
   *   si no se provee `currentSid`, revoca todas las sesiones activas del usuario.
   */
  async handleAuthorizationChange(
    input: HandleAuthorizationChangeInput,
  ): Promise<HandleAuthorizationChangeResult> {
    if (!input.userId || !input.userId.trim()) {
      return err("El identificador de usuario es obligatorio.", "INVALID_INPUT");
    }

    try {
      if (input.changeType === "tenant_role_updated") {
        return ok({
          userId: input.userId,
          changeType: input.changeType,
          action: "none",
          cookieReissued: false,
        });
      }

      if (
        input.changeType === "sensitive_scope_removed" ||
        input.changeType === "tenant_membership_removed"
      ) {
        await this.revokeUserSessions(input.userId, input.changeType);
        return ok({
          userId: input.userId,
          changeType: input.changeType,
          action: "revoked_all",
          cookieReissued: false,
        });
      }

      // platform_privilege_elevated
      if (input.currentSid) {
        const sidHash = hashToken(input.currentSid);
        const existingSession = await this.authRepo.findSessionBySidHash(sidHash);
        if (!existingSession || existingSession.userId !== input.userId || existingSession.revokedAt) {
          return err("Sesión actual no encontrada o inválida para rotación.", "SESSION_NOT_FOUND");
        }

        const newSid = generateSessionId();
        const newCsrfToken = generateCsrfToken();
        const newSidHash = hashToken(newSid);
        const newCsrfHash = hashToken(newCsrfToken);

        await this.sessionCache.deleteSession(
          existingSession.sidHash.toString("hex"),
          existingSession.userId,
        );
        const rotated = await this.authRepo.rotateSession(
          existingSession.id,
          newSidHash,
          newCsrfHash,
          { reauthAt: new Date() },
        );

        await this.revokeUserSessions(input.userId, "platform_privilege_elevated", {
          exceptSessionId: rotated.id,
        });

        await this.sessionCache.cacheSession(rotated, newSidHash.toString("hex"));

        return ok({
          userId: input.userId,
          changeType: input.changeType,
          action: "rotated_current_and_revoked_others",
          cookieReissued: true,
          rotatedSession: {
            sid: newSid,
            csrfToken: newCsrfToken,
            expiresAt: rotated.expiresAt.toISOString(),
          },
        });
      }

      await this.revokeUserSessions(input.userId, "platform_privilege_elevated");
      return ok({
        userId: input.userId,
        changeType: input.changeType,
        action: "revoked_all",
        cookieReissued: false,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.handleAuthorizationChange Failed] ${msg}`, error, {
        userId: input.userId,
        changeType: input.changeType,
      });
      return err("Error interno al procesar el cambio de autorización.", "DB_ERROR");
    }
  }
}

/** Instancia singleton por defecto de {@link AuthService}. */
export const authService = new AuthService();

