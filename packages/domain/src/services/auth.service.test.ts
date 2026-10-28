import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthService, GENERIC_REGISTER_SUCCESS_MESSAGE } from "./auth.service";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { IAuthMailer } from "../auth/auth-mailer.interface";
import type { User, UserConsent, EmailVerificationToken, PasswordResetToken } from "../db/schemas";

describe("AUTH-001 T-08 · Servicio de Registro Nativo (AuthService)", () => {
  let mockAuthRepo: IAuthRepository;
  let mockMailer: IAuthMailer;
  let authService: AuthService;

  const validPayload = {
    name: "Carlos Gómez",
    email: "carlos@empresa.com",
    password: "Password123!",
    treatmentConsent: true,
    policyVersion: "v1.0",
    channel: "register_form",
  };

  beforeEach(() => {
    mockAuthRepo = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createUserWithConsent: vi.fn(),
      createEmailVerificationToken: vi.fn(),
      invalidatePendingEmailVerificationTokens: vi.fn(),
      createPasswordResetToken: vi.fn(),
      invalidatePendingPasswordResetTokens: vi.fn(),
      findEmailVerificationTokenByHash: vi.fn(),
      consumeEmailVerificationToken: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    authService = new AuthService(mockAuthRepo, mockMailer);
  });

  it("registra un nuevo usuario, genera token de 24h, consentimiento en user_consents y responde con mensaje genérico", async () => {
    // 1. Usuario no existe
    vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

    const mockUser: User = {
      id: "uuid-user-1",
      email: "carlos@empresa.com",
      emailVerifiedAt: null,
      passwordHash: "$argon2id$v=19$...",
      passwordUpdatedAt: new Date(),
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpEnabledAt: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      identityLocation: "router",
      activeClientId: null,
      status: "active",
      displayName: "Carlos Gómez",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
    };

    const mockConsent: UserConsent = {
      id: "uuid-consent-1",
      userId: "uuid-user-1",
      purpose: "data_treatment",
      policyVersion: "v1.0",
      status: "granted",
      grantedAt: new Date(),
      revokedAt: null,
      channel: "register_form",
      evidenceRef: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
    };

    vi.mocked(mockAuthRepo.createUserWithConsent).mockResolvedValue({
      user: mockUser,
      consent: mockConsent,
    });

    vi.mocked(mockAuthRepo.createEmailVerificationToken).mockResolvedValue({
      id: "uuid-token-1",
      userId: "uuid-user-1",
      tokenHash: Buffer.alloc(32),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      consumedAt: null,
      requestedIpHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    });

    const result = await authService.register(validPayload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Mensaje genérico uniforme
      expect(result.data.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
      // El token en claro nunca debe revelarse en la respuesta
      expect(result.data).not.toHaveProperty("token");
      expect(result.data).not.toHaveProperty("rawToken");
    }

    // Se creó el usuario con hash y consentimiento
    expect(mockAuthRepo.createUserWithConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "carlos@empresa.com",
        displayName: "Carlos Gómez",
        policyVersion: "v1.0",
        channel: "register_form",
        passwordHash: expect.stringMatching(/^\$argon2id\$/),
      }),
    );

    // Se emitió token de verificación a 24 horas
    expect(mockAuthRepo.createEmailVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "uuid-user-1",
        tokenHash: expect.any(Buffer),
        expiresAt: expect.any(Date),
      }),
    );

    // Se envió correo con token al destinatario
    expect(mockMailer.sendVerificationEmail).toHaveBeenCalledWith(
      "carlos@empresa.com",
      expect.any(String),
      "Carlos Gómez",
    );
  });

  it("rechaza el registro si no se otorga el consentimiento de tratamiento de datos", async () => {
    const payloadSinConsentimiento = {
      ...validPayload,
      treatmentConsent: false,
    };

    const result = await authService.register(payloadSinConsentimiento);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
    }

    // No debe interactuar con base de datos ni despachar correos
    expect(mockAuthRepo.findUserByEmail).not.toHaveBeenCalled();
    expect(mockAuthRepo.createUserWithConsent).not.toHaveBeenCalled();
    expect(mockMailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("no duplica cuenta existente y responde con la misma respuesta genérica (anti-enumeración)", async () => {
    const existingUser: User = {
      id: "uuid-user-existente",
      email: "carlos@empresa.com",
      emailVerifiedAt: null, // No verificado aún
      passwordHash: "$argon2id$v=19$...",
      passwordUpdatedAt: new Date(),
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpEnabledAt: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      identityLocation: "router",
      activeClientId: null,
      status: "active",
      displayName: "Carlos Anterior",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
    };

    vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(existingUser);

    const result = await authService.register(validPayload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    // NO debe crear usuario nuevo ni crear consentimiento duplicado
    expect(mockAuthRepo.createUserWithConsent).not.toHaveBeenCalled();

    // Debe invalidar tokens anteriores y emitir nuevo token de verificación
    expect(mockAuthRepo.invalidatePendingEmailVerificationTokens).toHaveBeenCalledWith(
      "uuid-user-existente",
    );
    expect(mockAuthRepo.createEmailVerificationToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "uuid-user-existente",
      }),
    );

    // Debe enviar correo de verificación
    expect(mockMailer.sendVerificationEmail).toHaveBeenCalledWith(
      "carlos@empresa.com",
      expect.any(String),
      "Carlos Anterior",
    );
  });

  it("si la cuenta existente es federada, genera token setup (30 min) y no persiste la contraseña del registro", async () => {
    const federatedUser: User = {
      id: "uuid-user-google",
      email: "carlos@empresa.com",
      emailVerifiedAt: new Date(),
      passwordHash: null, // Cuenta federada sin contraseña local
      passwordUpdatedAt: null,
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpEnabledAt: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      identityLocation: "router",
      activeClientId: null,
      status: "active",
      displayName: "Carlos Google",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "google",
      updatedBy: "google",
    };

    vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(federatedUser);

    const result = await authService.register(validPayload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    // NO debe crear usuario nuevo ni modificar su password_hash
    expect(mockAuthRepo.createUserWithConsent).not.toHaveBeenCalled();

    // Debe invalidar tokens setup anteriores
    expect(mockAuthRepo.invalidatePendingPasswordResetTokens).toHaveBeenCalledWith(
      "uuid-user-google",
      "setup",
    );

    // Debe emitir token de contraseña con propósito 'setup'
    expect(mockAuthRepo.createPasswordResetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "uuid-user-google",
        purpose: "setup",
      }),
    );

    // Debe enviar correo con instrucciones para establecer contraseña
    expect(mockMailer.sendPasswordSetupEmail).toHaveBeenCalledWith(
      "carlos@empresa.com",
      expect.any(String),
      "Carlos Google",
    );
  });

  it("si la cuenta nativa ya está verificada, despacha correo informativo sin modificar credenciales", async () => {
    const verifiedUser: User = {
      id: "uuid-verified",
      email: "carlos@empresa.com",
      emailVerifiedAt: new Date(), // Ya verificada
      passwordHash: "$argon2id$v=19$...",
      passwordUpdatedAt: new Date(),
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpEnabledAt: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      identityLocation: "router",
      activeClientId: null,
      status: "active",
      displayName: "Carlos Activo",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
    };

    vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(verifiedUser);

    const result = await authService.register(validPayload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe(GENERIC_REGISTER_SUCCESS_MESSAGE);
    }

    expect(mockAuthRepo.createUserWithConsent).not.toHaveBeenCalled();
    expect(mockAuthRepo.createEmailVerificationToken).not.toHaveBeenCalled();
    expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();

    // Notificación informativa
    expect(mockMailer.sendAccountAlreadyExistsEmail).toHaveBeenCalledWith(
      "carlos@empresa.com",
      "Carlos Activo",
    );
  });
});

describe("AUTH-001 T-09 · Verificación de correo (request y confirm)", () => {
  let mockAuthRepo: IAuthRepository;
  let mockMailer: IAuthMailer;
  let authService: AuthService;

  beforeEach(() => {
    mockAuthRepo = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      createUserWithConsent: vi.fn(),
      createEmailVerificationToken: vi.fn(),
      invalidatePendingEmailVerificationTokens: vi.fn(),
      createPasswordResetToken: vi.fn(),
      invalidatePendingPasswordResetTokens: vi.fn(),
      findEmailVerificationTokenByHash: vi.fn(),
      consumeEmailVerificationToken: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    authService = new AuthService(mockAuthRepo, mockMailer);
  });

  describe("requestEmailVerification", () => {
    it("reenvía token invalidando el anterior si la cuenta existe y no está verificada", async () => {
      const unverifiedUser: User = {
        id: "uuid-unverified",
        email: "carlos@empresa.com",
        emailVerifiedAt: null,
        passwordHash: "$argon2id$...",
        passwordUpdatedAt: new Date(),
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        identityLocation: "router",
        activeClientId: null,
        status: "active",
        displayName: "Carlos",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(unverifiedUser);

      const result = await authService.requestEmailVerification("carlos@empresa.com");

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.invalidatePendingEmailVerificationTokens).toHaveBeenCalledWith(
        "uuid-unverified",
      );
      expect(mockAuthRepo.createEmailVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-unverified",
        }),
      );
      expect(mockMailer.sendVerificationEmail).toHaveBeenCalledWith(
        "carlos@empresa.com",
        expect.any(String),
        "Carlos",
      );
    });

    it("responde con mensaje genérico y no despacha correo si la cuenta no existe", async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

      const result = await authService.requestEmailVerification("desconocido@empresa.com");

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.createEmailVerificationToken).not.toHaveBeenCalled();
      expect(mockMailer.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("rechaza formato de correo inválido", async () => {
      const result = await authService.requestEmailVerification("correo-invalido");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("confirmEmailVerification", () => {
    it("verifica el correo con éxito y consume el token", async () => {
      const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const validTokenRecord: EmailVerificationToken = {
        id: "uuid-token-1",
        userId: "uuid-user-1",
        tokenHash: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Válido por 10 min más
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      const updatedUser: User = {
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
        passwordHash: "$argon2id$...",
        passwordUpdatedAt: new Date(),
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        identityLocation: "router",
        activeClientId: null,
        status: "active",
        displayName: "Carlos",
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findEmailVerificationTokenByHash).mockResolvedValue(validTokenRecord);
      vi.mocked(mockAuthRepo.consumeEmailVerificationToken).mockResolvedValue(updatedUser);

      const result = await authService.confirmEmailVerification(rawToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.email).toBe("carlos@empresa.com");
      }

      expect(mockAuthRepo.consumeEmailVerificationToken).toHaveBeenCalledWith(
        "uuid-token-1",
        "uuid-user-1",
      );
    });

    it("falla si el token no existe", async () => {
      vi.mocked(mockAuthRepo.findEmailVerificationTokenByHash).mockResolvedValue(null);

      const result = await authService.confirmEmailVerification("token-inexistente");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_TOKEN");
      }
      expect(mockAuthRepo.consumeEmailVerificationToken).not.toHaveBeenCalled();
    });

    it("falla si el token ya fue consumido", async () => {
      const consumedToken: EmailVerificationToken = {
        id: "uuid-token-1",
        userId: "uuid-user-1",
        tokenHash: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        consumedAt: new Date(), // Ya consumido
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findEmailVerificationTokenByHash).mockResolvedValue(consumedToken);

      const result = await authService.confirmEmailVerification("token-ya-usado");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TOKEN_ALREADY_USED");
      }
      expect(mockAuthRepo.consumeEmailVerificationToken).not.toHaveBeenCalled();
    });

    it("falla si el token ha expirado", async () => {
      const expiredToken: EmailVerificationToken = {
        id: "uuid-token-1",
        userId: "uuid-user-1",
        tokenHash: Buffer.alloc(32),
        expiresAt: new Date(Date.now() - 60 * 1000), // Expiró hace 1 minuto
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findEmailVerificationTokenByHash).mockResolvedValue(expiredToken);

      const result = await authService.confirmEmailVerification("token-vencido");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TOKEN_EXPIRED");
      }
      expect(mockAuthRepo.consumeEmailVerificationToken).not.toHaveBeenCalled();
    });
  });
});
