import { registerUserSchema, type RegisterUserInput } from "../auth/validation";
import { hashPassword } from "../auth/password-hasher";
import { generateSecureToken, hashToken, hashIpWithPepper } from "../auth/tokens";
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
}

/** Instancia singleton por defecto de {@link AuthService}. */
export const authService = new AuthService();
