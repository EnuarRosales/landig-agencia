import type {
  User,
  UserConsent,
  EmailVerificationToken,
  PasswordResetToken,
  Session,
  Identity,
} from "../db/schemas";

/**
 * Parámetros para la creación de un usuario nativo junto con su consentimiento de tratamiento.
 */
export interface CreateUserWithConsentParams {
  /** Correo normalizado en minúsculas. */
  email: string;
  /** Hash Argon2id con parámetros embebidos (opcional si es cuenta sin contraseña inicial). */
  passwordHash?: string | null;
  /** Nombre visible del usuario. */
  displayName?: string | null;
  /** Inquilino activo inicial si se crea durante un alta manual (AUTH-001 §5.9, T-26). */
  activeClientId?: string | null;
  /** Fecha de verificación de correo si ya está verificado. */
  emailVerifiedAt?: Date | null;
  /** Creador del registro ("self", "platform_sales", "system"). */
  createdBy?: string;
  /** Versión del aviso de privacidad y tratamiento de datos aceptada (p. ej. "v1.0"). */
  policyVersion: string;
  /** Canal de captura del consentimiento (p. ej. "register_form", "manual_sales"). */
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

  /**
   * Crea una nueva sesión opaca en la tabla `sessions`, aplicando el límite de 10 sesiones por usuario (AUTH-001 §5.6).
   *
   * Si el usuario ya posee 10 sesiones activas, revoca la más antigua antes de insertar la nueva.
   *
   * @param params - Parámetros de la sesión a persistir.
   * @returns La entidad {@link Session} persistida.
   */
  createSession(params: CreateSessionParams): Promise<Session>;

  /**
   * Actualiza el hash Argon2id de la contraseña de un usuario en el Router (rehash transparente, AUTH-001 T-07).
   *
   * @param userId - Identificador UUID del usuario.
   * @param newPasswordHash - Nuevo hash Argon2id con parámetros canónicos vigentes.
   */
  updateUserPasswordHash(userId: string, newPasswordHash: string): Promise<void>;

  /**
   * Consulta la versión vigente de enrutamiento (`routing_version`) para un inquilino en `client_routing`.
   *
   * @param clientId - Identificador UUID del inquilino.
   * @returns La versión entera de enrutamiento o `null` si no existe fila para el cliente.
   */
  getClientRoutingVersion(clientId: string): Promise<number | null>;

  /**
   * Busca una sesión activa por el hash binario SHA-256 de su `sid`.
   *
   * @param sidHash - Buffer de 32 bytes con el hash SHA-256 del `sid`.
   * @returns La entidad {@link Session} encontrada o `null` si no existe o está revocada.
   */
  findSessionBySidHash(sidHash: Buffer): Promise<Session | null>;

  /**
   * Revoca una sesión específica marcando `revoked_at = now()` y el motivo correspondiente.
   *
   * @param sessionId - Identificador UUID de la sesión.
   * @param reason - Motivo descriptivo de la revocación (p. ej. "user_logout", "session_limit").
   * @returns La entidad {@link Session} revocada o `null` si no existía.
   */
  revokeSession(sessionId: string, reason: string): Promise<Session | null>;

  /**
   * Actualiza el registro de actividad y extiende el vencimiento por inactividad de una sesión activa (AUTH-001 §5.6).
   *
   * @param sessionId - Identificador UUID de la sesión.
   * @param lastSeenAt - Marca de tiempo de la última interacción.
   * @param expiresAt - Nueva fecha de vencimiento por inactividad (sin superar absolute_expires_at).
   */
  touchSession(
    sessionId: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void>;

  /**
   * Busca una sesión por su identificador público UUID (AUTH-001 §5.6, T-23).
   *
   * @param sessionId - Identificador UUID público de la sesión.
   * @returns La entidad {@link Session} o `null` si no existe.
   */
  findSessionById(sessionId: string): Promise<Session | null>;

  /**
   * Lista todas las sesiones activas y vigentes de un usuario ordenadas por última actividad (AUTH-001 §5.6, T-23).
   *
   * @param userId - Identificador UUID del usuario.
   * @returns Lista de entidades {@link Session} no revocadas ni expiradas.
   */
  listActiveSessionsByUserId(userId: string): Promise<Session[]>;

  /**
   * Purga sesiones vencidas o revocadas de la base de datos (AUTH-001 §5.6, T-23).
   * No elimina sesiones vigentes (revoked_at IS NULL y expires_at > now y absolute_expires_at > now).
   *
   * @param now - Fecha de corte actual (por defecto la fecha del sistema).
   * @returns Número de registros de sesión eliminados.
   */
  purgeExpiredSessions(now?: Date): Promise<number>;

  /**
   * Busca un token de restablecimiento o establecimiento de contraseña por su hash SHA-256 binario.
   *
   * @param tokenHash - Buffer de 32 bytes con el hash SHA-256.
   * @returns La entidad {@link PasswordResetToken} o `null` si no existe.
   */
  findPasswordResetTokenByHash(
    tokenHash: Buffer,
  ): Promise<PasswordResetToken | null>;

  /**
   * Consume un token de restablecimiento, actualiza la contraseña del usuario y revoca todas sus sesiones activas (AUTH-001 §5.8).
   *
   * En caso de `purpose = 'setup'`, establece además `email_verified_at = now()` si no estaba verificado.
   *
   * @param tokenId - Identificador UUID del token a consumir.
   * @param userId - Identificador UUID del usuario.
   * @param newPasswordHash - Nuevo hash Argon2id a persistir.
   * @param purpose - Propósito del token ("reset" o "setup").
   * @returns La entidad {@link User} actualizada.
   */
  consumePasswordResetToken(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
    purpose: "reset" | "setup",
  ): Promise<User>;

  /**
   * Revoca todas las sesiones activas de un usuario, opcionalmente excluyendo la sesión actual (AUTH-001 §5.6 y §5.8).
   *
   * @param userId - Identificador UUID del usuario.
   * @param reason - Motivo descriptivo de la revocación (p. ej. "password_reset", "password_change").
   * @param exceptSessionId - Identificador opcional de la sesión que no debe ser revocada.
   */
  revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<void>;

  /**
   * Actualiza la contraseña de un usuario tras un cambio autenticado, actualizando `password_updated_at` (AUTH-001 §5.8).
   *
   * @param userId - Identificador UUID del usuario.
   * @param newPasswordHash - Nuevo hash Argon2id de la contraseña.
   */
  updateUserPassword(
    userId: string,
    newPasswordHash: string,
  ): Promise<void>;

  /**
   * Rota una sesión activa emitiendo nuevos hashes de `sid` y `csrfToken`, renovando su vencimiento por inactividad (AUTH-001 §5.6 y §5.8).
   *
   * @param sessionId - Identificador UUID de la sesión a rotar.
   * @param newSidHash - Nuevo hash binario SHA-256 (32 bytes) del identificador de sesión.
   * @param newCsrfHash - Nuevo hash binario SHA-256 (32 bytes) del token CSRF.
   * @param options - Opciones opcionales de rotación como `mfaAt` o `reauthAt`.
   * @returns La entidad {@link Session} rotada y actualizada.
   */
  rotateSession(
    sessionId: string,
    newSidHash: Buffer,
    newCsrfHash: Buffer,
    options?: {
      mfaAt?: Date | null;
      reauthAt?: Date;
    },
  ): Promise<Session>;

  /**
   * Busca una identidad federada por proveedor y su identificador de sujeto (AUTH-001 §5.3).
   *
   * @param provider - Nombre del proveedor ("google" o "facebook").
   * @param providerUserId - Identificador de sujeto devuelto por el proveedor.
   * @returns La entidad {@link Identity} o `null` si no existe.
   */
  findIdentityByProvider(
    provider: "google" | "facebook",
    providerUserId: string,
  ): Promise<Identity | null>;

  /**
   * Crea un nuevo usuario federado con correo verificado y su identidad en una sola transacción atómica (AUTH-001 §5.3).
   *
   * @param params - Parámetros de creación del usuario y la identidad federada.
   * @returns Objeto con las entidades {@link User} e {@link Identity} creadas.
   */
  createFederatedUserWithIdentity(
    params: CreateFederatedUserParams,
  ): Promise<{ user: User; identity: Identity }>;

  /**
   * Vincula una nueva identidad federada a un usuario existente (AUTH-001 §5.4).
   *
   * @param params - Parámetros de la identidad a vincular.
   * @returns La entidad {@link Identity} creada.
   */
  createIdentity(params: CreateIdentityParams): Promise<Identity>;

  /**
   * Actualiza la fecha y hora del último inicio de sesión de una identidad federada (`last_login_at = now()`).
   *
   * @param identityId - Identificador UUID de la identidad.
   */
  updateIdentityLastLogin(identityId: string): Promise<void>;

  /**
   * Lista todas las identidades federadas vinculadas a un usuario (AUTH-001 §5.4).
   *
   * @param userId - Identificador UUID del usuario.
   * @returns Lista de entidades {@link Identity}.
   */
  findIdentitiesByUserId(userId: string): Promise<Identity[]>;

  /**
   * Elimina una identidad federada vinculada a un usuario (AUTH-001 §5.4).
   *
   * @param userId - Identificador UUID del usuario.
   * @param provider - Proveedor a desvincular ("google" o "facebook").
   */
  deleteIdentity(userId: string, provider: "google" | "facebook"): Promise<void>;

  /**
   * Busca usuarios que posean secretos TOTP activos o pendientes cifrados con una clave distinta a la objetivo (AUTH-001 §4.1, T-17).
   *
   * @param targetKeyId - Identificador de la clave activa objetivo.
   * @param limit - Límite de registros a retornar por lote.
   * @returns Lista de entidades {@link User} desactualizadas.
   */
  findUsersWithOutdatedTotpKey(
    targetKeyId: string,
    limit?: number,
  ): Promise<User[]>;

  /**
   * Cuenta cuántos usuarios poseen secretos activos o pendientes cifrados con un `keyId` específico.
   *
   * @param keyId - Identificador de la clave a consultar.
   * @returns Cantidad de usuarios asociados.
   */
  countUsersWithTotpKey(keyId: string): Promise<number>;

  /**
   * Actualiza las columnas de secretos y claves TOTP de un usuario de forma atómica (AUTH-001 §4.1, T-17).
   *
   * @param userId - Identificador UUID del usuario.
   * @param updates - Columnas de secretos y claves a actualizar.
   */
  updateUserTotpKeys(
    userId: string,
    updates: {
      totpSecretCiphertext?: Buffer | null;
      totpKeyId?: string | null;
      totpPendingSecretCiphertext?: Buffer | null;
      totpPendingKeyId?: string | null;
      totpEnabledAt?: Date | null;
      totpPendingCreatedAt?: Date | null;
      totpLastUsedStep?: number | null;
    },
  ): Promise<void>;

  /**
   * Asocia una sesión activa a un inquilino (`client_id`) y actualiza su versión de enrutamiento (AUTH-001 §5.6, §5.9, T-24).
   *
   * Utilizado exclusivamente en los flujos de onboarding o aceptación de invitación de ADM-001.
   *
   * @param sessionId - Identificador UUID de la sesión a actualizar.
   * @param clientId - Identificador UUID del cliente/inquilino.
   * @param routingVersion - Versión de enrutamiento asignada (opcional).
   * @returns La entidad {@link Session} actualizada.
   */
  bindSessionToClient(
    sessionId: string,
    clientId: string,
    routingVersion?: number | null,
  ): Promise<Session>;

  /**
   * Revoca masivamente todas las sesiones activas asociadas a un inquilino en Postgres (AUTH-001 §5.6, T-24).
   *
   * Utilizado cuando un inquilino es suspendido o dado de baja en ADM-001.
   *
   * @param clientId - Identificador UUID del inquilino/cliente.
   * @param reason - Motivo descriptivo de la revocación (p. ej. "tenant_suspended", "tenant_decommissioned").
   * @returns Lista de sesiones revocadas con sus identificadores para invalidación en caché.
   */
  revokeSessionsByClientId(
    clientId: string,
    reason: string,
  ): Promise<Array<{ id: string; userId: string; sidHash: Buffer }>>;

  /**
   * Reserva atómicamente la membresía del usuario (`active_client_id`) si no tiene una asignada (AUTH-001 §5.9, T-26).
   *
   * Ejecuta: `UPDATE admin.users SET active_client_id = $clientId, updated_at = now() WHERE id = $userId AND active_client_id IS NULL`
   *
   * @param userId - Identificador UUID del usuario.
   * @param clientId - Identificador UUID del cliente/inquilino a reservar.
   * @returns `true` si se reservó exitosamente (1 fila modificada o ya reservado para el mismo cliente); `false` si ya tenía otra membresía o no existe.
   */
  reserveUserActiveClient(userId: string, clientId: string): Promise<boolean>;

  /**
   * Libera la reserva de membresía (`active_client_id = NULL`) de un usuario si coincide con el cliente esperado (AUTH-001 §5.9, T-26).
   *
   * Utilizado para rollback cuando una transacción de alta u onboarding en ADM-001 es cancelada o falla.
   *
   * @param userId - Identificador UUID del usuario.
   * @param clientId - Identificador UUID del cliente/inquilino cuya reserva se va a cancelar.
   * @returns `true` si se liberó la reserva (afectó 1 fila); `false` en caso contrario.
   */
  clearUserActiveClient(userId: string, clientId: string): Promise<boolean>;

  /**
   * Cuenta la cantidad de usuarios operadores de plataforma registrados en el Router Global (AUTH-001 T-27).
   *
   * Consulta `COUNT(*)` sobre `admin.users WHERE identity_location = 'router'`.
   */
  countPlatformOperators(): Promise<number>;

  /**
   * Crea el usuario `platform_owner` inicial de la SaaS Mocter en el Router Global (AUTH-001 T-27).
   */
  createInitialPlatformOwner(params: {
    email: string;
    passwordHash: string;
    displayName?: string | null;
  }): Promise<User>;

  /**
   * Conmuta la ubicación de identidad (`identity_location`) de un usuario en el Router Global (AUTH-001 §5.12, T-27).
   */
  updateUserIdentityLocation(userId: string, newLocation: string): Promise<void>;

  /**
   * Conmuta la celda de destino y avanza `routing_version` en `client_routing` (AUTH-001 §5.12, T-27).
   */
  updateClientRoutingCell(clientId: string, targetCellId: string): Promise<number>;
}

/**
 * Parámetros para la creación de un usuario federado y su primera identidad (AUTH-001 §5.3).
 */
export interface CreateFederatedUserParams {
  /** Correo electrónico verificado del usuario. */
  email: string;
  /** Proveedor de autenticación federada ("google" o "facebook"). */
  provider: "google" | "facebook";
  /** Identificador de sujeto del proveedor. */
  providerUserId: string;
  /** Correo original reportado por el proveedor si difiere del principal. */
  providerEmail?: string | null;
  /** Nombre visible reportado por el proveedor. */
  displayName?: string | null;
  /** URL del avatar o foto de perfil. */
  avatarUrl?: string | null;
}

/**
 * Parámetros para la vinculación de una identidad federada a una cuenta existente (AUTH-001 §5.4).
 */
export interface CreateIdentityParams {
  /** Identificador UUID del usuario de la plataforma. */
  userId: string;
  /** Proveedor de autenticación federada ("google" o "facebook"). */
  provider: "google" | "facebook";
  /** Identificador de sujeto del proveedor. */
  providerUserId: string;
  /** Correo reportado por el proveedor. */
  providerEmail?: string | null;
  /** Si el correo fue reportado como verificado por el proveedor. */
  emailVerified?: boolean;
  /** Nombre visible reportado por el proveedor. */
  displayName?: string | null;
  /** URL del avatar o foto de perfil. */
  avatarUrl?: string | null;
}

/**
 * Parámetros para la creación de una nueva sesión opaca en el Router (AUTH-001 §5.6).
 */
export interface CreateSessionParams {
  /** Identificador UUID del usuario autenticado. */
  userId: string;
  /** Hash binario SHA-256 (32 bytes) del identificador de sesión `sid`. */
  sidHash: Buffer;
  /** Hash binario SHA-256 (32 bytes) del token CSRF. */
  csrfHash: Buffer;
  /** Identificador del cliente activo copiado de `users.active_client_id` (nulo si no tiene membresía). */
  clientId?: string | null;
  /** Versión de enrutamiento vigente para el inquilino (nulo si no tiene membresía). */
  routingVersion?: number | null;
  /** Método de autenticación utilizado ("password", "google", "facebook"). */
  authMethod: "password" | "google" | "facebook";
  /** Momento en que la sesión superó la verificación de segundo factor TOTP (nulo si no aplica). */
  mfaAt?: Date | null;
  /** Momento de reautenticación explícita con credenciales o TOTP. */
  reauthAt: Date;
  /** Fecha y hora UTC de vencimiento por inactividad (30 minutos tras emisión). */
  expiresAt: Date;
  /** Fecha y hora UTC de vencimiento absoluto ineludible (12 horas tras emisión). */
  absoluteExpiresAt: Date;
  /** Hash HMAC de la dirección IP del cliente (opcional). */
  ipHash?: Buffer | null;
  /** Hash HMAC del User-Agent del cliente (opcional). */
  userAgentHash?: Buffer | null;
}
