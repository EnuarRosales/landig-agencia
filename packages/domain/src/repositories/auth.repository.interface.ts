import type {
  User,
  UserConsent,
  EmailVerificationToken,
  PasswordResetToken,
} from "../db/schemas";

/**
 * Parámetros para la creación de un usuario nativo junto con su consentimiento de tratamiento.
 */
export interface CreateUserWithConsentParams {
  /** Correo normalizado en minúsculas. */
  email: string;
  /** Hash Argon2id con parámetros embebidos. */
  passwordHash: string;
  /** Nombre visible del usuario. */
  displayName?: string | null;
  /** Versión del aviso de privacidad y tratamiento de datos aceptada (p. ej. "v1.0"). */
  policyVersion: string;
  /** Canal de captura del consentimiento (p. ej. "register_form"). */
  channel: string;
}

/**
 * Parámetros para la emisión de un token de verificación de correo electrónico.
 */
export interface CreateEmailVerificationTokenParams {
  /** Identificador UUID del usuario destinatario. */
  userId: string;
  /** Hash binario SHA-256 (32 bytes) del token en claro. */
  tokenHash: Buffer;
  /** Fecha y hora UTC de vencimiento del token (24 horas tras la emisión). */
  expiresAt: Date;
  /** Hash HMAC opcional de la dirección IP solicitante. */
  requestedIpHash?: Buffer | null;
}

/**
 * Parámetros para la emisión de un token de restablecimiento o establecimiento de contraseña.
 */
export interface CreatePasswordResetTokenParams {
  /** Identificador UUID del usuario destinatario. */
  userId: string;
  /** Hash binario SHA-256 (32 bytes) del token en claro. */
  tokenHash: Buffer;
  /** Propósito del token: "setup" (primera contraseña en federados) o "reset" (recuperación). */
  purpose: "reset" | "setup";
  /** Fecha y hora UTC de vencimiento del token (30 minutos tras la emisión). */
  expiresAt: Date;
  /** Hash HMAC opcional de la dirección IP solicitante. */
  requestedIpHash?: Buffer | null;
}

/**
 * Contrato de repositorio para la gestión de persistencia de identidades, tokens y consentimientos de autenticación (AUTH-001).
 */
export interface IAuthRepository {
  /**
   * Busca un usuario por su dirección de correo electrónico normalizada.
   *
   * @param email - Correo electrónico normalizado en minúsculas.
   * @returns La entidad {@link User} o `null` si no existe.
   */
  findUserByEmail(email: string): Promise<User | null>;

  /**
   * Busca un usuario por su identificador UUID.
   *
   * @param id - Identificador UUID del usuario.
   * @returns La entidad {@link User} o `null` si no existe.
   */
  findUserById(id: string): Promise<User | null>;

  /**
   * Crea un nuevo usuario y su consentimiento de tratamiento de datos en una transacción atómica.
   *
   * @param params - Parámetros de creación del usuario y consentimiento.
   * @returns Objeto con las entidades creadas {@link User} y {@link UserConsent}.
   */
  createUserWithConsent(
    params: CreateUserWithConsentParams,
  ): Promise<{ user: User; consent: UserConsent }>;

  /**
   * Registra un token de verificación de correo en la tabla `email_verification_tokens`.
   *
   * @param params - Parámetros de emisión del token.
   * @returns La entidad {@link EmailVerificationToken} creada.
   */
  createEmailVerificationToken(
    params: CreateEmailVerificationTokenParams,
  ): Promise<EmailVerificationToken>;

  /**
   * Invalida los tokens de verificación de correo pendientes de un usuario marcando `consumed_at = now()`.
   *
   * @param userId - Identificador UUID del usuario.
   */
  invalidatePendingEmailVerificationTokens(userId: string): Promise<void>;

  /**
   * Registra un token de restablecimiento o establecimiento de contraseña en `password_reset_tokens`.
   *
   * @param params - Parámetros de emisión del token.
   * @returns La entidad {@link PasswordResetToken} creada.
   */
  createPasswordResetToken(
    params: CreatePasswordResetTokenParams,
  ): Promise<PasswordResetToken>;

  /**
   * Invalida los tokens de restablecimiento pendientes de un usuario marcando `consumed_at = now()`.
   *
   * @param userId - Identificador UUID del usuario.
   * @param purpose - Propósito opcional ("reset" o "setup") a invalidar.
   */
  invalidatePendingPasswordResetTokens(
    userId: string,
    purpose?: "reset" | "setup",
  ): Promise<void>;

  /**
   * Busca un token de verificación de correo por su hash SHA-256 binario.
   *
   * @param tokenHash - Buffer de 32 bytes con el hash SHA-256.
   * @returns La entidad {@link EmailVerificationToken} o `null` si no existe.
   */
  findEmailVerificationTokenByHash(
    tokenHash: Buffer,
  ): Promise<EmailVerificationToken | null>;

  /**
   * Consume un token de verificación y marca el correo del usuario como verificado (`email_verified_at = now()`)
   * en una sola transacción atómica (AUTH-001 §5.7).
   *
   * @param tokenId - Identificador UUID del token a consumir.
   * @param userId - Identificador UUID del usuario correspondiente.
   * @returns La entidad {@link User} actualizada.
   */
  consumeEmailVerificationToken(
    tokenId: string,
    userId: string,
  ): Promise<User>;
}
