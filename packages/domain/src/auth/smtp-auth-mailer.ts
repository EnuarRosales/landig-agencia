import nodemailer, { type Transporter } from "nodemailer";
import type { IAuthMailer } from "./auth-mailer.interface";
import { appLogger } from "../utils/logger";
import { getValidatedEnv } from "../utils/env";

export interface SmtpMailerConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  from: string;
  baseUrl: string;
}

/**
 * Despachador transaccional de correos de autenticación basado en SMTP y Nodemailer (AUTH-001 §5.7, §5.8).
 *
 * Envía correos reales a través de servidores SMTP estándar (Google Workspace, SendGrid, Amazon SES, etc.).
 * Sanitiza automáticamente prefijos de protocolo en el host (e.g. `://gmail.com` -> `smtp.gmail.com`).
 * Implementa degradación elegante: ante fallas de transporte SMTP, registra el error y expone el enlace
 * en el log para no bloquear la operación en ambientes de prueba.
 */
export class SmtpAuthMailer implements IAuthMailer {
  private transporter: Transporter | null = null;
  private readonly config: SmtpMailerConfig;

  constructor(customConfig?: Partial<SmtpMailerConfig>) {
    const hostEnv = process.env.SMTP_HOST || "";
    let rawHost = customConfig?.host || hostEnv;
    // Limpieza de prefijos accidentales como "://gmail.com" o "https://"
    rawHost = rawHost.replace(/^(https?:\/\/|\/\/|:\/\/)/, "").trim();
    if (rawHost === "gmail.com") {
      rawHost = "smtp.gmail.com";
    }

    const port = customConfig?.port || Number(process.env.SMTP_PORT) || 587;
    const user = customConfig?.user || process.env.SMTP_USER || "";
    const password = customConfig?.password || process.env.SMTP_PASSWORD || "";
    const from = customConfig?.from || process.env.SMTP_FROM || user || "soporte@mocter.co";
    const baseUrl = customConfig?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    this.config = {
      host: rawHost,
      port,
      user,
      password,
      from,
      baseUrl: baseUrl.replace(/\/+$/, ""),
    };

    if (this.config.host && this.config.user) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.port === 465,
        auth: {
          user: this.config.user,
          pass: this.config.password,
        },
      });
    }
  }

  async sendVerificationEmail(to: string, rawToken: string, name?: string): Promise<void> {
    const verificationUrl = `${this.config.baseUrl}/auth/email/verify/confirm?token=${rawToken}`;

    appLogger.info("[AuthMailer.sendVerificationEmail] Preparando correo de verificación", {
      to,
      name,
      verificationUrl,
    });

    if (!this.transporter) {
      appLogger.warn("[AuthMailer.sendVerificationEmail] SMTP no configurado, omitiendo envío de red");
      return;
    }

    const recipientName = name ? name.trim() : "Estimado(a) usuario(a)";
    const subject = "Verifica tu cuenta en Mocter";
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 24px; }
    .card { max-width: 540px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .logo { font-size: 20px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 14px; line-height: 1.6; color: #9ca3af; margin-bottom: 24px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #0284c7, #38bdf8); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #6b7280; border-top: 1px solid #1f2937; padding-top: 16px; }
    .link-alt { color: #38bdf8; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MOCTER</div>
    <h1>¡Hola, ${recipientName}!</h1>
    <p>Gracias por registrar tu cuenta en Mocter. Para activar tu acceso y comenzar a operar, por favor confirma tu dirección de correo electrónico haciendo clic en el siguiente botón:</p>
    <div>
      <a href="${verificationUrl}" class="btn" target="_blank">Verificar mi correo</a>
    </div>
    <p>Este enlace es válido durante 24 horas y de un solo uso. Si no solicitaste este registro, podés ignorar este mensaje con total seguridad.</p>
    <div class="footer">
      <p>Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
      <a href="${verificationUrl}" class="link-alt">${verificationUrl}</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"Mocter" <${this.config.from}>`,
        to,
        subject,
        text: `Hola ${recipientName},\n\nVerifica tu cuenta en Mocter ingresando al siguiente enlace:\n${verificationUrl}\n\nVálido por 24 horas.`,
        html,
      });
      appLogger.info("[AuthMailer.sendVerificationEmail] Correo enviado satisfactoriamente", { to });
    } catch (err: unknown) {
      appLogger.error(
        `[AuthMailer.sendVerificationEmail Error] No se pudo entregar por SMTP: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async sendPasswordSetupEmail(to: string, rawToken: string, name?: string): Promise<void> {
    const setupUrl = `${this.config.baseUrl}/auth/password/setup?token=${rawToken}`;

    appLogger.info("[AuthMailer.sendPasswordSetupEmail] Preparando correo de setup de contraseña", {
      to,
      name,
      setupUrl,
    });

    if (!this.transporter) return;

    const recipientName = name ? name.trim() : "Estimado(a) usuario(a)";
    const subject = "Configura tu contraseña en Mocter";
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #0b0f19; color: #f3f4f6; padding: 24px;">
  <div style="max-width: 540px; margin: 0 auto; background-color: #111827; border-radius: 16px; padding: 32px;">
    <h2 style="color: #38bdf8;">MOCTER</h2>
    <h3>Hola, ${recipientName}</h3>
    <p style="color: #9ca3af; line-height: 1.6;">Tu cuenta ha sido creada en la plataforma. Para establecer tu contraseña de acceso nativo, ingresa al siguiente enlace:</p>
    <p><a href="${setupUrl}" style="display: inline-block; background: #0284c7; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Establecer contraseña</a></p>
    <p style="color: #6b7280; font-size: 12px;">Este enlace expira en 30 minutos.</p>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"Mocter" <${this.config.from}>`,
        to,
        subject,
        text: `Hola ${recipientName},\n\nConfigura tu contraseña de Mocter en:\n${setupUrl}\n\nVálido por 30 minutos.`,
        html,
      });
    } catch (err: unknown) {
      appLogger.error(`[AuthMailer.sendPasswordSetupEmail Error] ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }

  async sendPasswordResetEmail(to: string, rawToken: string, name?: string): Promise<void> {
    const resetUrl = `${this.config.baseUrl}/auth/password/reset?token=${rawToken}`;

    appLogger.info("[AuthMailer.sendPasswordResetEmail] Preparando correo de restablecimiento", {
      to,
      name,
      resetUrl,
    });

    if (!this.transporter) return;

    const recipientName = name ? name.trim() : "Estimado(a) usuario(a)";
    const subject = "Restablece tu contraseña en Mocter";
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #0b0f19; color: #f3f4f6; padding: 24px;">
  <div style="max-width: 540px; margin: 0 auto; background-color: #111827; border-radius: 16px; padding: 32px;">
    <h2 style="color: #38bdf8;">MOCTER</h2>
    <h3>Hola, ${recipientName}</h3>
    <p style="color: #9ca3af; line-height: 1.6;">Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, haz clic en el siguiente botón:</p>
    <p><a href="${resetUrl}" style="display: inline-block; background: #0284c7; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Restablecer contraseña</a></p>
    <p style="color: #6b7280; font-size: 12px;">Este enlace expira en 15 minutos. Si no solicitaste este cambio, puedes ignorarlo.</p>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.transporter.sendMail({
        from: `"Mocter" <${this.config.from}>`,
        to,
        subject,
        text: `Hola ${recipientName},\n\nRestablece tu contraseña en:\n${resetUrl}\n\nVálido por 15 minutos.`,
        html,
      });
    } catch (err: unknown) {
      appLogger.error(`[AuthMailer.sendPasswordResetEmail Error] ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }

  async sendAccountAlreadyExistsEmail(to: string, name?: string): Promise<void> {
    appLogger.info("[AuthMailer.sendAccountAlreadyExistsEmail] Notificación de cuenta ya existente", { to, name });
    if (!this.transporter) return;

    try {
      await this.transporter.sendMail({
        from: `"Mocter" <${this.config.from}>`,
        to,
        subject: "Intento de registro en Mocter",
        text: `Hola ${name || ""},\n\nSe intentó registrar una cuenta con este correo en Mocter. Si ya tienes una cuenta, puedes iniciar sesión o recuperar tu contraseña.\n\nEquipo Mocter.`,
      });
    } catch (err: unknown) {
      appLogger.error(`[AuthMailer.sendAccountAlreadyExistsEmail Error] ${err instanceof Error ? err.message : String(err)}`, err);
    }
  }
}

/**
 * Crea la instancia adecuada de {@link IAuthMailer}.
 * Si existen variables de configuración SMTP (`SMTP_HOST` y `SMTP_USER`), crea {@link SmtpAuthMailer}.
 * De lo contrario, retorna un {@link LogAuthMailer} para pruebas locales.
 */
export function createDefaultAuthMailer(): IAuthMailer {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  if (host && user) {
    return new SmtpAuthMailer();
  }
  return {
    async sendVerificationEmail(to: string, rawToken: string, name?: string) {
      appLogger.info("[AuthMailer] Enlace de verificación generado", {
        to,
        name,
        verificationUrl: `/auth/email/verify/confirm?token=${rawToken}`,
      });
    },
    async sendPasswordSetupEmail(to: string, rawToken: string, name?: string) {
      appLogger.info("[AuthMailer] Enlace para establecer contraseña generado", {
        to,
        name,
        setupUrl: `/auth/password/setup?token=${rawToken}`,
      });
    },
    async sendPasswordResetEmail(to: string, rawToken: string, name?: string) {
      appLogger.info("[AuthMailer] Enlace de restablecimiento de contraseña generado", {
        to,
        name,
        resetUrl: `/auth/password/reset?token=${rawToken}`,
      });
    },
    async sendAccountAlreadyExistsEmail(to: string, name?: string) {
      appLogger.info("[AuthMailer] Notificación de cuenta ya existente", { to, name });
    },
  };
}
