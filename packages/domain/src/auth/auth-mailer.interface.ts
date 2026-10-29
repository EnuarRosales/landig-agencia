import { appLogger } from "../utils/logger";

/**
 * Contrato para el despacho de correos transaccionales de autenticación (AUTH-001 §5.1, §5.7, §5.8).
 *
 * Durante la Fase 1 opera con un despachador mínimo; en la Fase 2 se integrará con el worker NTF-001.
 */
export interface IAuthMailer {
  /**
   * Envía correo con el enlace de verificación de cuenta nativa.
   *
   * @param to - Correo del destinatario.
   * @param rawToken - Token seguro en claro para conformar el enlace.
   * @param name - Nombre visible opcional del usuario.
   */
  sendVerificationEmail(to: string, rawToken: string, name?: string): Promise<void>;

  /**
   * Envía correo con el enlace de establecimiento de contraseña para cuentas originalmente federadas.
   *
   * @param to - Correo del destinatario.
   * @param rawToken - Token seguro en claro con propósito "setup".
   * @param name - Nombre visible opcional del usuario.
   */
  sendPasswordSetupEmail(to: string, rawToken: string, name?: string): Promise<void>;

  /**
   * Envía correo con el enlace de recuperación de contraseña para cuentas nativas existentes.
   *
   * @param to - Correo del destinatario.
   * @param rawToken - Token seguro en claro con propósito "reset".
   * @param name - Nombre visible opcional del usuario.
   */
  sendPasswordResetEmail(to: string, rawToken: string, name?: string): Promise<void>;

  /**
   * Envía correo informativo cuando se intenta registrar una cuenta nativa ya verificada.
   *
   * @param to - Correo del destinatario.
   * @param name - Nombre visible opcional del usuario.
   */
  sendAccountAlreadyExistsEmail(to: string, name?: string): Promise<void>;
}

/**
 * Implementación de consola y logging estructurado de {@link IAuthMailer}.
 * Utilizada como despachador predeterminado en entornos de desarrollo local y pruebas sin SMTP activo.
 */
export class LogAuthMailer implements IAuthMailer {
  async sendVerificationEmail(to: string, rawToken: string, name?: string): Promise<void> {
    appLogger.info("[AuthMailer] Enlace de verificación generado", {
      to,
      name,
      verificationUrl: `/auth/email/verify/confirm?token=${rawToken}`,
    });
  }

  async sendPasswordSetupEmail(to: string, rawToken: string, name?: string): Promise<void> {
    appLogger.info("[AuthMailer] Enlace para establecer contraseña generado", {
      to,
      name,
      setupUrl: `/auth/password/setup?token=${rawToken}`,
    });
  }

  async sendPasswordResetEmail(to: string, rawToken: string, name?: string): Promise<void> {
    appLogger.info("[AuthMailer] Enlace de restablecimiento de contraseña generado", {
      to,
      name,
      resetUrl: `/auth/password/reset?token=${rawToken}`,
    });
  }

  async sendAccountAlreadyExistsEmail(to: string, name?: string): Promise<void> {
    appLogger.info("[AuthMailer] Notificación de cuenta ya existente", {
      to,
      name,
    });
  }
}

/** Instancia predeterminada de {@link IAuthMailer}. */
export const defaultAuthMailer = new LogAuthMailer();
