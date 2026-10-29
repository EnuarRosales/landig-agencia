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
import type { Session } from "../db/schemas";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import { defaultAuthRepository } from "../repositories/drizzle-auth.repository";
import type { IAuthMailer } from "../auth/auth-mailer.interface";
import { defaultAuthMailer } from "../auth/auth-mailer.interface";
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
   */
  constructor(
    private readonly authRepo: IAuthRepository = defaultAuthRepository,
    private readonly mailer: IAuthMailer = defaultAuthMailer,
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

      // 6. Verificar si requiere doble factor (TOTP)
      if (user.totpEnabledAt !== null) {
        const challengeToken = generateSecureToken(32);
        const challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos (AUTH-001 §5.5)

        return ok({
          mfaRequired: true,
          userId: user.id,
          challengeToken,
          expiresAt: challengeExpiresAt.toISOString(),
        });
      }

      // 7. Resolver routing_version para activeClientId
      let routingVersion: number | null = null;
      if (user.activeClientId) {
        routingVersion = await this.authRepo.getClientRoutingVersion(
          user.activeClientId,
        );
      }

      // 8. Crear sesión opaca con CSRF y límites (AUTH-001 §5.6)
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
        authMethod: "password",
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthService.login Unexpected Error] ${msg}`, error, {
        email,
      });
      return err("Error interno al procesar el inicio de sesión.", "DB_ERROR");
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
}

/** Instancia singleton por defecto de {@link AuthService}. */
export const authService = new AuthService();
