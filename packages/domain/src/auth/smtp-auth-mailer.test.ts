import { describe, it, expect, vi, beforeEach } from "vitest";
import { SmtpAuthMailer, createDefaultAuthMailer } from "./smtp-auth-mailer";

vi.mock("nodemailer", () => {
  const sendMailMock = vi.fn();
  return {
    default: {
      createTransport: vi.fn(() => ({
        sendMail: sendMailMock,
      })),
    },
    sendMailMock,
  };
});

describe("AUTH-001 · SmtpAuthMailer (Nodemailer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM;
  });

  it("sanitiza el host removiendo prefijos de protocolo erróneos", () => {
    const mailer = new SmtpAuthMailer({
      host: "://gmail.com",
      user: "soporte@mocter.co",
    });
    // @ts-expect-error Acceso a config privada para verificación
    expect(mailer.config.host).toBe("smtp.gmail.com");
  });

  it("despacha correo de verificación correctamente", async () => {
    const mailer = new SmtpAuthMailer({
      host: "smtp.example.com",
      port: 587,
      user: "soporte@mocter.co",
      password: "secret",
      from: "soporte@mocter.co",
      baseUrl: "https://mocter.co",
    });

    const nodemailer = await import("nodemailer");
    // @ts-expect-error sendMailMock inyectado en el mock
    const sendMail = nodemailer.sendMailMock;
    sendMail.mockResolvedValueOnce({ messageId: "msg-123" });

    await mailer.sendVerificationEmail("usuario@empresa.com", "token-raw-123", "Carlos Gómez");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArgs = sendMail.mock.calls[0][0];
    expect(callArgs.to).toBe("usuario@empresa.com");
    expect(callArgs.subject).toContain("Verifica tu cuenta");
    expect(callArgs.html).toContain("https://mocter.co/auth/email/verify/confirm?token=token-raw-123");
    expect(callArgs.html).toContain("Carlos Gómez");
  });

  it("captura errores de transporte SMTP sin propagar excepciones no controladas", async () => {
    const mailer = new SmtpAuthMailer({
      host: "smtp.example.com",
      user: "soporte@mocter.co",
    });

    const nodemailer = await import("nodemailer");
    // @ts-expect-error sendMailMock inyectado en el mock
    const sendMail = nodemailer.sendMailMock;
    sendMail.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(
      mailer.sendVerificationEmail("fail@empresa.com", "token-raw", "Fail User"),
    ).resolves.toBeUndefined();
  });

  it("createDefaultAuthMailer retorna fallback si no hay SMTP_HOST configurado", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;

    const mailer = createDefaultAuthMailer();
    expect(mailer).toBeDefined();
    await expect(mailer.sendVerificationEmail("test@test.com", "token")).resolves.toBeUndefined();
  });
});
