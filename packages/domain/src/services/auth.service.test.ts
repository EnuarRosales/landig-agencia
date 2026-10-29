import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AuthService,
  GENERIC_REGISTER_SUCCESS_MESSAGE,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  GENERIC_FORGOT_PASSWORD_MESSAGE,
} from "./auth.service";
import type { IAuthRepository } from "../repositories/auth.repository.interface";
import type { IAuthMailer } from "../auth/auth-mailer.interface";
import type {
  User,
  UserConsent,
  EmailVerificationToken,
  PasswordResetToken,
  Session,
} from "../db/schemas";
import { hashPassword } from "../auth/password-hasher";
import { hashToken } from "../auth/tokens";

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
      createSession: vi.fn(),
      updateUserPasswordHash: vi.fn(),
      getClientRoutingVersion: vi.fn(),
      findSessionBySidHash: vi.fn(),
      revokeSession: vi.fn(),
      findPasswordResetTokenByHash: vi.fn(),
      consumePasswordResetToken: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      updateUserPassword: vi.fn(),
      rotateSession: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
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
      createSession: vi.fn(),
      updateUserPasswordHash: vi.fn(),
      getClientRoutingVersion: vi.fn(),
      findSessionBySidHash: vi.fn(),
      revokeSession: vi.fn(),
      findPasswordResetTokenByHash: vi.fn(),
      consumePasswordResetToken: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      updateUserPassword: vi.fn(),
      rotateSession: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
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

describe("AUTH-001 T-10 · Inicio de Sesión Nativo (login)", () => {
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
      createSession: vi.fn(),
      updateUserPasswordHash: vi.fn(),
      getClientRoutingVersion: vi.fn(),
      findSessionBySidHash: vi.fn(),
      revokeSession: vi.fn(),
      findPasswordResetTokenByHash: vi.fn(),
      consumePasswordResetToken: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      updateUserPassword: vi.fn(),
      rotateSession: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    authService = new AuthService(mockAuthRepo, mockMailer);
  });

  const rawPassword = "Password123!";

  const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
      const passwordHash = await hashPassword(rawPassword);
      return {
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
        passwordHash,
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
        createdBy: "system",
        updatedBy: "system",
        ...overrides,
      };
    };

    const buildMockSession = (overrides?: Partial<Session>): Session => ({
      id: "uuid-session-1",
      sidHash: Buffer.alloc(32),
      csrfHash: Buffer.alloc(32),
      userId: "uuid-user-1",
      clientId: null,
      routingVersion: null,
      authMethod: "password",
      mfaAt: null,
      reauthAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      revokedAt: null,
      revokedReason: null,
      ipHash: null,
      userAgentHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
      ...overrides,
    });

    it("inicia sesión correctamente para credenciales válidas y emite sesión con sid y csrfToken", async () => {
      const mockUser = await buildMockUser();
      const mockSession = buildMockSession();

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(true);
      if (result.ok && !("mfaRequired" in result.data)) {
        expect(result.data.user.id).toBe("uuid-user-1");
        expect(result.data.user.email).toBe("carlos@empresa.com");
        expect(result.data.emailVerified).toBe(true);
        expect(result.data.sid).toBeTypeOf("string");
        expect(result.data.csrfToken).toBeTypeOf("string");
        expect(result.data.expiresAt).toBe(mockSession.expiresAt.toISOString());
      }
      expect(mockAuthRepo.createSession).toHaveBeenCalled();
    });

    it("rechaza con 401 genérico y ejecuta verificación ficticia si el usuario no existe", async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

      const result = await authService.login({
        email: "inexistente@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(GENERIC_INVALID_CREDENTIALS_MESSAGE);
        expect(result.code).toBe("INVALID_CREDENTIALS");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("rechaza con 401 genérico y ejecuta verificación ficticia si la cuenta está deshabilitada", async () => {
      const disabledUser = await buildMockUser({ status: "disabled" });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(disabledUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(GENERIC_INVALID_CREDENTIALS_MESSAGE);
        expect(result.code).toBe("INVALID_CREDENTIALS");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("rechaza con 401 genérico y ejecuta verificación ficticia si la cuenta es solo federada (passwordHash es null)", async () => {
      const federatedUser = await buildMockUser({ passwordHash: null });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(federatedUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(GENERIC_INVALID_CREDENTIALS_MESSAGE);
        expect(result.code).toBe("INVALID_CREDENTIALS");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("rechaza con 401 genérico si la contraseña no coincide", async () => {
      const mockUser = await buildMockUser();
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(mockUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: "WrongPassword999!",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(GENERIC_INVALID_CREDENTIALS_MESSAGE);
        expect(result.code).toBe("INVALID_CREDENTIALS");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("rehashea automáticamente si el hash posee parámetros obsoletos", async () => {
      // Hash generado con memoria inferior (32 MiB en vez de 64 MiB)
      const outdatedHash = await hashPassword(rawPassword, { memoryCost: 32768, timeCost: 2 });
      const mockUser = await buildMockUser({ passwordHash: outdatedHash });
      const mockSession = buildMockSession();

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(mockUser);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.updateUserPasswordHash).toHaveBeenCalledWith(
        mockUser.id,
        expect.stringContaining("$argon2id$"),
      );
    });

    it("retorna challenge 2FA si la cuenta tiene totpEnabledAt sin emitir sesión", async () => {
      const totpUser = await buildMockUser({ totpEnabledAt: new Date() });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(totpUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(true);
      if (result.ok && "mfaRequired" in result.data) {
        expect(result.data.mfaRequired).toBe(true);
        expect(result.data.challengeToken).toBeTypeOf("string");
        expect(result.data.userId).toBe(totpUser.id);
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("falla con 503 IDENTITY_INCONSISTENT si identityLocation es una celda y activeClientId es nulo", async () => {
      const inconsistentUser = await buildMockUser({
        identityLocation: "11111111-1111-1111-1111-111111111111",
        activeClientId: null,
      });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(inconsistentUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("IDENTITY_INCONSISTENT");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("falla con 503 CELL_UNAVAILABLE si identityLocation es una celda con activeClientId en Fase 1", async () => {
      const cellUser = await buildMockUser({
        identityLocation: "11111111-1111-1111-1111-111111111111",
        activeClientId: "22222222-2222-2222-2222-222222222222",
      });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(cellUser);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CELL_UNAVAILABLE");
      }
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("asocia routingVersion si el usuario tiene activeClientId", async () => {
      const clientId = "22222222-2222-2222-2222-222222222222";
      const userWithClient = await buildMockUser({ activeClientId: clientId });
      const mockSession = buildMockSession({ clientId, routingVersion: 3 });

      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(userWithClient);
      vi.mocked(mockAuthRepo.getClientRoutingVersion).mockResolvedValue(3);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.login({
        email: "carlos@empresa.com",
        password: rawPassword,
      });

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.getClientRoutingVersion).toHaveBeenCalledWith(clientId);
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId,
          routingVersion: 3,
        }),
      );
    });
  });

describe("AUTH-001 T-11 · Recuperación, establecimiento y cambio de contraseña", () => {
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
      createSession: vi.fn(),
      updateUserPasswordHash: vi.fn(),
      getClientRoutingVersion: vi.fn(),
      findSessionBySidHash: vi.fn(),
      revokeSession: vi.fn(),
      findPasswordResetTokenByHash: vi.fn(),
      consumePasswordResetToken: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      updateUserPassword: vi.fn(),
      rotateSession: vi.fn(),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    authService = new AuthService(mockAuthRepo, mockMailer);
  });

  const rawPassword = "Password123!";
  const newPassword = "NewStrongPassword456!";

  const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
    const passwordHash = await hashPassword(rawPassword);
    return {
      id: "uuid-user-1",
      email: "carlos@empresa.com",
      emailVerifiedAt: new Date(),
      passwordHash,
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
      createdBy: "system",
      updatedBy: "system",
      ...overrides,
    };
  };

  describe("forgotPassword", () => {
    it("genera token de recuperación, despacha correo y retorna mensaje genérico anti-enumeración", async () => {
      const user = await buildMockUser();
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(user);

      const result = await authService.forgotPassword({ email: "carlos@empresa.com" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.message).toBe(GENERIC_FORGOT_PASSWORD_MESSAGE);
      }
      expect(mockAuthRepo.invalidatePendingPasswordResetTokens).toHaveBeenCalledWith(
        user.id,
        "reset",
      );
      expect(mockAuthRepo.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          purpose: "reset",
        }),
      );
      expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalledWith(
        "carlos@empresa.com",
        expect.any(String),
        "Carlos Gómez",
      );
    });

    it("no despacha correo ni crea token si la cuenta no existe (anti-enumeración)", async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);

      const result = await authService.forgotPassword({ email: "desconocido@empresa.com" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.message).toBe(GENERIC_FORGOT_PASSWORD_MESSAGE);
      }
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("no despacha correo si la cuenta es exclusivamente federada (sin passwordHash)", async () => {
      const federatedUser = await buildMockUser({ passwordHash: null });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(federatedUser);

      const result = await authService.forgotPassword({ email: "carlos@empresa.com" });

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("no despacha correo si la cuenta está deshabilitada", async () => {
      const disabledUser = await buildMockUser({ status: "disabled" });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(disabledUser);

      const result = await authService.forgotPassword({ email: "carlos@empresa.com" });

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
      expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("rechaza correo con formato inválido", async () => {
      const result = await authService.forgotPassword({ email: "correo-invalido" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("resetPassword", () => {
    it("restablece contraseña con éxito, consume el token y revoca sesiones previas", async () => {
      const user = await buildMockUser();
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-reset",
        userId: user.id,
        tokenHash: Buffer.alloc(32),
        purpose: "reset",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.consumePasswordResetToken).mockResolvedValue({
        ...user,
        passwordUpdatedAt: new Date(),
      });

      const result = await authService.resetPassword({
        token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        password: newPassword,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.message).toContain("exitosa");
      }
      expect(mockAuthRepo.consumePasswordResetToken).toHaveBeenCalledWith(
        tokenRecord.id,
        user.id,
        expect.stringContaining("$argon2id$"),
        "reset",
      );
    });

    it("establece contraseña para purpose setup cuando la cuenta no tenía contraseña previa", async () => {
      const federatedUser = await buildMockUser({ passwordHash: null, emailVerifiedAt: null });
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-setup",
        userId: federatedUser.id,
        tokenHash: Buffer.alloc(32),
        purpose: "setup",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(federatedUser);
      vi.mocked(mockAuthRepo.consumePasswordResetToken).mockResolvedValue({
        ...federatedUser,
        emailVerifiedAt: new Date(),
        passwordUpdatedAt: new Date(),
      });

      const result = await authService.resetPassword({
        token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        password: newPassword,
      });

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.consumePasswordResetToken).toHaveBeenCalledWith(
        tokenRecord.id,
        federatedUser.id,
        expect.stringContaining("$argon2id$"),
        "setup",
      );
    });

    it("falla si el token no existe", async () => {
      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(null);

      const result = await authService.resetPassword({
        token: "token-no-existente",
        password: newPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_TOKEN");
      }
    });

    it("falla si el token ya fue consumido", async () => {
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-reset",
        userId: "uuid-user-1",
        tokenHash: Buffer.alloc(32),
        purpose: "reset",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        consumedAt: new Date(),
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);

      const result = await authService.resetPassword({
        token: "token-usado",
        password: newPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TOKEN_ALREADY_USED");
      }
    });

    it("falla si el token ha expirado", async () => {
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-reset",
        userId: "uuid-user-1",
        tokenHash: Buffer.alloc(32),
        purpose: "reset",
        expiresAt: new Date(Date.now() - 60 * 1000),
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);

      const result = await authService.resetPassword({
        token: "token-vencido",
        password: newPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("TOKEN_EXPIRED");
      }
    });

    it("falla con PASSWORD_ALREADY_EXISTS si purpose es setup pero el usuario ya tiene contraseña", async () => {
      const user = await buildMockUser();
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-setup",
        userId: user.id,
        tokenHash: Buffer.alloc(32),
        purpose: "setup",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

      const result = await authService.resetPassword({
        token: "token-setup",
        password: newPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PASSWORD_ALREADY_EXISTS");
      }
    });

    it("falla con NO_NATIVE_PASSWORD si purpose es reset pero el usuario no tiene contraseña nativa", async () => {
      const user = await buildMockUser({ passwordHash: null });
      const tokenRecord: PasswordResetToken = {
        id: "uuid-token-reset",
        userId: user.id,
        tokenHash: Buffer.alloc(32),
        purpose: "reset",
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        consumedAt: null,
        requestedIpHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      };

      vi.mocked(mockAuthRepo.findPasswordResetTokenByHash).mockResolvedValue(tokenRecord);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

      const result = await authService.resetPassword({
        token: "token-reset",
        password: newPassword,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("NO_NATIVE_PASSWORD");
      }
    });

    it("rechaza si la nueva contraseña no cumple con las políticas", async () => {
      const result = await authService.resetPassword({
        token: "token-valido",
        password: "short",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("changePassword", () => {
    it("cambia contraseña con éxito, revoca otras sesiones y rota la sesión actual", async () => {
      const user = await buildMockUser();
      const mockRotatedSession: Session = {
        id: "uuid-current-session",
        sidHash: Buffer.alloc(32),
        csrfHash: Buffer.alloc(32),
        userId: user.id,
        clientId: null,
        routingVersion: null,
        authMethod: "password",
        mfaAt: null,
        reauthAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        revokedAt: null,
        revokedReason: null,
        ipHash: null,
        userAgentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.rotateSession).mockResolvedValue(mockRotatedSession);

      const result = await authService.changePassword(
        {
          currentPassword: rawPassword,
          newPassword,
        },
        {
          userId: user.id,
          sessionId: "uuid-current-session",
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.sid).toBeTypeOf("string");
        expect(result.data.csrfToken).toBeTypeOf("string");
        expect(result.data.expiresAt).toBe(mockRotatedSession.expiresAt.toISOString());
      }
      expect(mockAuthRepo.updateUserPassword).toHaveBeenCalledWith(
        user.id,
        expect.stringContaining("$argon2id$"),
      );
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
        user.id,
        "password_change",
        "uuid-current-session",
      );
      expect(mockAuthRepo.rotateSession).toHaveBeenCalledWith(
        "uuid-current-session",
        expect.any(Buffer),
        expect.any(Buffer),
      );
    });

    it("falla con INVALID_CREDENTIALS si la contraseña actual es errónea", async () => {
      const user = await buildMockUser();
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

      const result = await authService.changePassword(
        {
          currentPassword: "WrongCurrentPassword123!",
          newPassword,
        },
        {
          userId: user.id,
          sessionId: "uuid-current-session",
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_CREDENTIALS");
      }
      expect(mockAuthRepo.updateUserPassword).not.toHaveBeenCalled();
      expect(mockAuthRepo.rotateSession).not.toHaveBeenCalled();
    });

    it("exige código TOTP si el usuario tiene doble factor activo", async () => {
      const userWithTotp = await buildMockUser({ totpEnabledAt: new Date() });
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithTotp);

      const result = await authService.changePassword(
        {
          currentPassword: rawPassword,
          newPassword,
        },
        {
          userId: userWithTotp.id,
          sessionId: "uuid-current-session",
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MFA_REQUIRED");
      }
      expect(mockAuthRepo.updateUserPassword).not.toHaveBeenCalled();
    });

    it("rechaza si la cuenta no tiene passwordHash (cuenta federada)", async () => {
      const federatedUser = await buildMockUser({ passwordHash: null });
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(federatedUser);

      const result = await authService.changePassword(
        {
          currentPassword: rawPassword,
          newPassword,
        },
        {
          userId: federatedUser.id,
          sessionId: "uuid-current-session",
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_REQUEST");
      }
    });

    it("rechaza nueva contraseña que no cumple con las políticas", async () => {
      const result = await authService.changePassword(
        {
          currentPassword: rawPassword,
          newPassword: "short",
        },
        {
          userId: "uuid-user-1",
          sessionId: "uuid-current-session",
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("validateSession", () => {
    it("valida satisfactoriamente una sesión activa sin CSRF", async () => {
      const mockSession: Session = {
        id: "uuid-session-1",
        sidHash: Buffer.alloc(32),
        csrfHash: Buffer.alloc(32),
        userId: "uuid-user-1",
        clientId: null,
        routingVersion: null,
        authMethod: "password",
        mfaAt: null,
        reauthAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        revokedAt: null,
        revokedReason: null,
        ipHash: null,
        userAgentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(mockSession);

      const result = await authService.validateSession("valid-sid");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.session.id).toBe("uuid-session-1");
      }
    });

    it("valida satisfactoriamente sesión activa con CSRF coincidente", async () => {
      const csrfRaw = "my-csrf-token";
      const csrfHash = hashToken(csrfRaw);
      const mockSession: Session = {
        id: "uuid-session-1",
        sidHash: Buffer.alloc(32),
        csrfHash,
        userId: "uuid-user-1",
        clientId: null,
        routingVersion: null,
        authMethod: "password",
        mfaAt: null,
        reauthAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        revokedAt: null,
        revokedReason: null,
        ipHash: null,
        userAgentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(mockSession);

      const result = await authService.validateSession("valid-sid", csrfRaw);
      expect(result.ok).toBe(true);
    });

    it("falla con FORBIDDEN si el CSRF no coincide", async () => {
      const mockSession: Session = {
        id: "uuid-session-1",
        sidHash: Buffer.alloc(32),
        csrfHash: hashToken("correct-csrf"),
        userId: "uuid-user-1",
        clientId: null,
        routingVersion: null,
        authMethod: "password",
        mfaAt: null,
        reauthAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        revokedAt: null,
        revokedReason: null,
        ipHash: null,
        userAgentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(mockSession);

      const result = await authService.validateSession("valid-sid", "wrong-csrf");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("FORBIDDEN");
      }
    });

    it("falla con UNAUTHORIZED si la sesión ha expirado", async () => {
      const expiredSession: Session = {
        id: "uuid-session-1",
        sidHash: Buffer.alloc(32),
        csrfHash: Buffer.alloc(32),
        userId: "uuid-user-1",
        clientId: null,
        routingVersion: null,
        authMethod: "password",
        mfaAt: null,
        reauthAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() - 60 * 1000),
        absoluteExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        revokedAt: null,
        revokedReason: null,
        ipHash: null,
        userAgentHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(expiredSession);

      const result = await authService.validateSession("expired-sid");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNAUTHORIZED");
      }
    });
  });
});

