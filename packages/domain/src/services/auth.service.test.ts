import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
  Identity,
} from "../db/schemas";
import { hashPassword } from "../auth/password-hasher";
import { hashToken, generateSessionId, generateCsrfToken } from "../auth/tokens";
import {
  type IGoogleOidcClient,
  GoogleProviderUnavailableError,
  GoogleTokenValidationError,
} from "../auth/google-oidc.service";
import {
  type IFacebookOAuthClient,
  FacebookProviderUnavailableError,
  FacebookOAuthValidationError,
} from "../auth/facebook-oauth.service";
import type { OAuthStateManager } from "../auth/oauth-state";
import { TotpCryptoService } from "../auth/totp-crypto";
import { generateTotpCode } from "../auth/totp";
import { mfaChallengeManager, buildChallengeRedisKey } from "../auth/mfa-challenge";
import {
  SessionCacheManager,
  buildSessionRedisKey,
  buildUserSessionsRedisKey,
} from "../auth/session-cache";
import { MockRedisClient, createMockRedisClient } from "../redis/mock-redis";
import { setRedisClientForTesting } from "../redis/client";

function createBaseMockAuthRepo(): IAuthRepository {
  return {
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
    findIdentityByProvider: vi.fn(),
    createFederatedUserWithIdentity: vi.fn(),
    createIdentity: vi.fn(),
    updateIdentityLastLogin: vi.fn(),
    findIdentitiesByUserId: vi.fn(),
    deleteIdentity: vi.fn(),
    findUsersWithOutdatedTotpKey: vi.fn(),
    countUsersWithTotpKey: vi.fn(),
    updateUserTotpKeys: vi.fn(),
    touchSession: vi.fn(),
    findSessionById: vi.fn(),
    listActiveSessionsByUserId: vi.fn(),
    purgeExpiredSessions: vi.fn(),
    bindSessionToClient: vi.fn(),
    revokeSessionsByClientId: vi.fn(),
  };
}

describe("AUTH-001 T-08 · Servicio de Registro Nativo (AuthService)", () => {
  let mockAuthRepo: IAuthRepository;
  let mockMailer: IAuthMailer;
  let mockGoogleOidcClient: IGoogleOidcClient;
  let mockStateManager: OAuthStateManager;
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
    mockAuthRepo = createBaseMockAuthRepo();

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    mockGoogleOidcClient = {
      discover: vi.fn(),
      getAuthorizationUrl: vi.fn(),
      exchangeCodeForTokens: vi.fn(),
      verifyIdToken: vi.fn(),
    };

    mockStateManager = {
      createState: vi.fn(),
      consumeState: vi.fn(),
    } as unknown as OAuthStateManager;

    authService = new AuthService(
      mockAuthRepo,
      mockMailer,
      mockGoogleOidcClient,
      mockStateManager,
    );
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
    mockAuthRepo = createBaseMockAuthRepo();

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
  let mockRedis: MockRedisClient;
  let authService: AuthService;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);

    mockAuthRepo = createBaseMockAuthRepo();

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    authService = new AuthService(mockAuthRepo, mockMailer);
  });

  afterEach(() => {
    setRedisClientForTesting(null);
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
    mockAuthRepo = createBaseMockAuthRepo();

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
    const mockUser: User = {
      id: "uuid-user-1",
      email: "test@example.com",
      displayName: "Test User",
      passwordHash: "some-hash",
      passwordUpdatedAt: new Date(),
      avatarUrl: null,
      identityLocation: "router",
      activeClientId: null,
      emailVerifiedAt: new Date(),
      status: "active",
      totpEnabledAt: null,
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "self",
      updatedBy: "self",
    };

    beforeEach(() => {
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(mockUser);
    });

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

describe("AUTH-001 T-14 · Autenticación Federada con Google (authenticateWithGoogle)", () => {
  let mockAuthRepo: IAuthRepository;
  let mockMailer: IAuthMailer;
  let mockGoogleOidcClient: IGoogleOidcClient;
  let mockStateManager: OAuthStateManager;
  let authService: AuthService;

  const rawPassword = "Password123!";
  const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
    const passwordHash = await hashPassword(rawPassword);
    return {
      id: "uuid-user-1",
      email: "carlos@empresa.com",
      emailVerifiedAt: new Date(),
      passwordHash,
      passwordUpdatedAt: new Date(),
      status: "active",
      identityLocation: "router",
      activeClientId: null,
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpEnabledAt: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      displayName: "Carlos Gómez",
      avatarUrl: null,
      createdBy: "self",
      updatedBy: "self",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  };

  beforeEach(() => {
    mockAuthRepo = createBaseMockAuthRepo();

    mockMailer = {
      sendVerificationEmail: vi.fn(),
      sendPasswordSetupEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendAccountAlreadyExistsEmail: vi.fn(),
    };

    mockGoogleOidcClient = {
      discover: vi.fn(),
      getAuthorizationUrl: vi.fn(),
      exchangeCodeForTokens: vi.fn(),
      verifyIdToken: vi.fn(),
    };

    mockStateManager = {
      createState: vi.fn(),
      consumeState: vi.fn(),
    } as unknown as OAuthStateManager;

    authService = new AuthService(
      mockAuthRepo,
      mockMailer,
      mockGoogleOidcClient,
      mockStateManager,
    );
  });

  const defaultGoogleInput = {
    code: "google-auth-code-123",
    state: "valid-state-value",
    clientCookieState: "valid-state-value",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/api/auth/google/callback",
    clientIp: "127.0.0.1",
    userAgent: "TestAgent",
    pepper: "test-pepper",
  };

    const mockSession: Session = {
      id: "uuid-session-google",
      sidHash: Buffer.alloc(32),
      csrfHash: Buffer.alloc(32),
      userId: "uuid-user-1",
      clientId: null,
      routingVersion: null,
      authMethod: "google",
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

    it("falla si el estado OAuth es inválido, expirado o consumido", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: false,
        code: "INVALID_STATE",
        error: "El estado de autorización es inválido.",
      });

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_STATE");
      }
      expect(mockGoogleOidcClient.exchangeCodeForTokens).not.toHaveBeenCalled();
    });

    it("retorna texto exacto «Proveedor temporalmente fuera de servicio» si Google está caído", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockRejectedValue(
        new GoogleProviderUnavailableError("Proveedor temporalmente fuera de servicio"),
      );

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Proveedor temporalmente fuera de servicio");
        expect(result.code).toBe("PROVIDER_UNAVAILABLE");
      }
    });

    it("falla si el ID Token no valida claims (emisor, audiencia, nonce, email no verificado)", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "mock-access",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      vi.mocked(mockGoogleOidcClient.verifyIdToken).mockRejectedValue(
        new GoogleTokenValidationError(
          "EMAIL_NOT_VERIFIED",
          "El proveedor no devolvió un correo verificado.",
        ),
      );

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("EMAIL_NOT_VERIFIED");
        expect(result.error).toBe("El proveedor no devolvió un correo verificado.");
      }
    });

    it("inicia sesión directamente si la identidad federada ya existe en identities", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "mock-access",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
        iss: "https://accounts.google.com",
        sub: "google-sub-123",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        nonce: "nonce-123",
        email: "carlos@empresa.com",
        email_verified: true,
      });

      const existingIdentity: Identity = {
        id: "uuid-identity-1",
        userId: "uuid-user-1",
        provider: "google",
        providerUserId: "google-sub-123",
        providerEmail: "carlos@empresa.com",
        emailVerified: true,
        displayName: "Carlos Gómez",
        avatarUrl: null,
        linkedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      const user = await buildMockUser({ id: "uuid-user-1", email: "carlos@empresa.com" });
      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(existingIdentity);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-1");
        expect(result.data.sid).toBeDefined();
        expect(result.data.csrfToken).toBeDefined();
      }
      expect(mockAuthRepo.updateIdentityLastLogin).toHaveBeenCalledWith("uuid-identity-1");
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-1",
          authMethod: "google",
        }),
      );
    });

    it("auto-vincula identidad e inicia sesión si existe usuario con correo verificado", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "mock-access",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
        iss: "https://accounts.google.com",
        sub: "google-sub-nuevo",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        nonce: "nonce-123",
        email: "carlos@empresa.com",
        email_verified: true,
        name: "Carlos Gómez",
      });

      const user = await buildMockUser({
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
      });

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-1");
      }
      expect(mockAuthRepo.createIdentity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-1",
          provider: "google",
          providerUserId: "google-sub-nuevo",
          emailVerified: true,
        }),
      );
    });

    it("rechaza vincular si el correo coincide con una cuenta existente NO verificada (§5.4)", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "mock-access",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
        iss: "https://accounts.google.com",
        sub: "google-sub-nuevo",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        nonce: "nonce-123",
        email: "carlos@empresa.com",
        email_verified: true,
      });

      const unverifiedUser = await buildMockUser({
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: null,
      });

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(unverifiedUser);

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("EXISTING_USER_UNVERIFIED");
        expect(result.error).toContain("no ha verificado su correo electrónico");
      }
      expect(mockAuthRepo.createIdentity).not.toHaveBeenCalled();
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("crea nuevo usuario federado e identidad e inicia sesión si la cuenta no existe", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "google",
          codeVerifier: "verifier-123",
          codeChallenge: "challenge-123",
          nonce: "nonce-123",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
        access_token: "mock-access",
        id_token: "mock-id-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
        iss: "https://accounts.google.com",
        sub: "google-sub-nuevo",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        nonce: "nonce-123",
        email: "nuevo@empresa.com",
        email_verified: true,
        name: "Nuevo Usuario",
        picture: "https://lh3.googleusercontent.com/avatar",
      });

      const newUser = await buildMockUser({
        id: "uuid-user-nuevo",
        email: "nuevo@empresa.com",
        emailVerifiedAt: new Date(),
        displayName: "Nuevo Usuario",
      });

      const newIdentity: Identity = {
        id: "uuid-identity-nuevo",
        userId: "uuid-user-nuevo",
        provider: "google",
        providerUserId: "google-sub-nuevo",
        providerEmail: "nuevo@empresa.com",
        emailVerified: true,
        displayName: "Nuevo Usuario",
        avatarUrl: "https://lh3.googleusercontent.com/avatar",
        linkedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.createFederatedUserWithIdentity).mockResolvedValue({
        user: newUser,
        identity: newIdentity,
      });
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue({
        ...mockSession,
        userId: "uuid-user-nuevo",
      });

      const result = await authService.authenticateWithGoogle(defaultGoogleInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-nuevo");
        expect(result.data.emailVerified).toBe(true);
      }
      expect(mockAuthRepo.createFederatedUserWithIdentity).toHaveBeenCalledWith({
        email: "nuevo@empresa.com",
        provider: "google",
        providerUserId: "google-sub-nuevo",
        providerEmail: "nuevo@empresa.com",
        displayName: "Nuevo Usuario",
        avatarUrl: "https://lh3.googleusercontent.com/avatar",
      });
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-nuevo",
          authMethod: "google",
        }),
      );
    });
  });

  describe("AUTH-001 T-15 · Autenticación Federada con Facebook (authenticateWithFacebook)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let authService: AuthService;

    const rawPassword = "Password123!";
    const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
      const passwordHash = await hashPassword(rawPassword);
      return {
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
        passwordHash,
        passwordUpdatedAt: new Date(),
        status: "active",
        identityLocation: "router",
        activeClientId: null,
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        displayName: "Carlos Gómez",
        avatarUrl: null,
        createdBy: "self",
        updatedBy: "self",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    };

    beforeEach(() => {
      mockAuthRepo = createBaseMockAuthRepo();

      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };

      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };

      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };

      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
      );
    });

    const defaultFacebookInput = {
      code: "facebook-auth-code-123",
      state: "valid-state-value",
      clientCookieState: "valid-state-value",
      clientId: "test-fb-app-id",
      clientSecret: "test-fb-secret",
      redirectUri: "http://localhost:3000/api/auth/facebook/callback",
      clientIp: "127.0.0.1",
      userAgent: "TestAgent",
      pepper: "test-pepper",
    };

    const mockSession: Session = {
      id: "uuid-session-facebook",
      sidHash: Buffer.alloc(32),
      csrfHash: Buffer.alloc(32),
      userId: "uuid-user-1",
      clientId: null,
      routingVersion: null,
      authMethod: "facebook",
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

    it("falla si el estado OAuth es inválido, expirado o consumido", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: false,
        code: "INVALID_STATE",
        error: "El estado de autorización es inválido.",
      });

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_STATE");
      }
      expect(mockFacebookOAuthClient.exchangeCodeForAccessToken).not.toHaveBeenCalled();
    });

    it("retorna texto exacto «Proveedor temporalmente fuera de servicio» si Facebook está caído al canjear código", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockRejectedValue(
        new FacebookProviderUnavailableError("Proveedor temporalmente fuera de servicio"),
      );

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Proveedor temporalmente fuera de servicio");
        expect(result.code).toBe("PROVIDER_UNAVAILABLE");
      }
    });

    it("retorna texto exacto «El proveedor no devolvió un correo verificado.» si Facebook no devuelve email", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
        access_token: "fb-access-token",
        token_type: "bearer",
      });

      vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockRejectedValue(
        new FacebookOAuthValidationError(
          "MISSING_OR_UNVERIFIED_EMAIL",
          "El proveedor no devolvió un correo verificado.",
        ),
      );

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MISSING_OR_UNVERIFIED_EMAIL");
        expect(result.error).toBe("El proveedor no devolvió un correo verificado.");
      }
    });

    it("inicia sesión directamente si la identidad federada ya existe en identities", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
        access_token: "fb-access-token",
        token_type: "bearer",
      });

      vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockResolvedValue({
        id: "fb-user-id-123",
        name: "Carlos Gómez",
        email: "carlos@empresa.com",
      });

      const existingIdentity: Identity = {
        id: "uuid-identity-fb-1",
        userId: "uuid-user-1",
        provider: "facebook",
        providerUserId: "fb-user-id-123",
        providerEmail: "carlos@empresa.com",
        emailVerified: true,
        displayName: "Carlos Gómez",
        avatarUrl: null,
        linkedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      const user = await buildMockUser({ id: "uuid-user-1", email: "carlos@empresa.com" });
      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(existingIdentity);
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-1");
        expect(result.data.sid).toBeDefined();
        expect(result.data.csrfToken).toBeDefined();
      }
      expect(mockAuthRepo.updateIdentityLastLogin).toHaveBeenCalledWith("uuid-identity-fb-1");
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-1",
          authMethod: "facebook",
        }),
      );
    });

    it("auto-vincula identidad e inicia sesión si existe usuario con correo verificado", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
        access_token: "fb-access-token",
        token_type: "bearer",
      });

      vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockResolvedValue({
        id: "fb-user-id-nuevo",
        name: "Carlos Gómez",
        email: "carlos@empresa.com",
      });

      const user = await buildMockUser({
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
      });

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(user);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-1");
      }
      expect(mockAuthRepo.createIdentity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-1",
          provider: "facebook",
          providerUserId: "fb-user-id-nuevo",
          emailVerified: true,
        }),
      );
    });

    it("rechaza vincular si el correo coincide con una cuenta existente NO verificada (§5.4)", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
        access_token: "fb-access-token",
        token_type: "bearer",
      });

      vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockResolvedValue({
        id: "fb-user-id-nuevo",
        name: "Carlos Gómez",
        email: "carlos@empresa.com",
      });

      const unverifiedUser = await buildMockUser({
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: null,
      });

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(unverifiedUser);

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("EXISTING_USER_UNVERIFIED");
        expect(result.error).toContain("no ha verificado su correo electrónico");
      }
      expect(mockAuthRepo.createIdentity).not.toHaveBeenCalled();
      expect(mockAuthRepo.createSession).not.toHaveBeenCalled();
    });

    it("crea nuevo usuario federado e identidad e inicia sesión si la cuenta no existe", async () => {
      vi.mocked(mockStateManager.consumeState).mockResolvedValue({
        ok: true,
        data: {
          provider: "facebook",
          codeVerifier: "",
          codeChallenge: "",
          returnTo: "/admin",
          action: "login",
          createdAt: Date.now(),
        },
      });

      vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
        access_token: "fb-access-token",
        token_type: "bearer",
      });

      vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockResolvedValue({
        id: "fb-user-id-nuevo",
        name: "Nuevo Usuario",
        email: "nuevo@empresa.com",
        picture: {
          data: {
            url: "https://platform-lookaside.fbsbx.com/avatar.jpg",
          },
        },
      });

      const newUser = await buildMockUser({
        id: "uuid-user-nuevo",
        email: "nuevo@empresa.com",
        emailVerifiedAt: new Date(),
        displayName: "Nuevo Usuario",
      });

      const newIdentity: Identity = {
        id: "uuid-identity-fb-nuevo",
        userId: "uuid-user-nuevo",
        provider: "facebook",
        providerUserId: "fb-user-id-nuevo",
        providerEmail: "nuevo@empresa.com",
        emailVerified: true,
        displayName: "Nuevo Usuario",
        avatarUrl: "https://platform-lookaside.fbsbx.com/avatar.jpg",
        linkedAt: new Date(),
        lastLoginAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(null);
      vi.mocked(mockAuthRepo.createFederatedUserWithIdentity).mockResolvedValue({
        user: newUser,
        identity: newIdentity,
      });
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue({
        ...mockSession,
        userId: "uuid-user-nuevo",
      });

      const result = await authService.authenticateWithFacebook(defaultFacebookInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe("uuid-user-nuevo");
        expect(result.data.emailVerified).toBe(true);
      }
      expect(mockAuthRepo.createFederatedUserWithIdentity).toHaveBeenCalledWith({
        email: "nuevo@empresa.com",
        provider: "facebook",
        providerUserId: "fb-user-id-nuevo",
        providerEmail: "nuevo@empresa.com",
        displayName: "Nuevo Usuario",
        avatarUrl: "https://platform-lookaside.fbsbx.com/avatar.jpg",
      });
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "uuid-user-nuevo",
          authMethod: "facebook",
        }),
      );
    });
  });

  describe("AUTH-001 T-16 · Vinculación y Desvinculación de Identidades (link y unlink)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let authService: AuthService;

    const rawPassword = "Password123!";
    const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
      const passwordHash = await hashPassword(rawPassword);
      return {
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
        passwordHash,
        passwordUpdatedAt: new Date(),
        status: "active",
        identityLocation: "router",
        activeClientId: null,
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        displayName: "Carlos Gómez",
        avatarUrl: null,
        createdBy: "self",
        updatedBy: "self",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    };

    beforeEach(() => {
      mockAuthRepo = createBaseMockAuthRepo();

      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };

      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };

      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };

      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
      );
    });

    const mockSession: Session = {
      id: "uuid-session-link",
      sidHash: Buffer.alloc(32),
      csrfHash: Buffer.alloc(32),
      userId: "uuid-user-1",
      clientId: null,
      routingVersion: null,
      authMethod: "google",
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

    describe("linkProviderIdentity", () => {
      it("falla si el estado de vinculación no contiene userId", async () => {
        vi.mocked(mockStateManager.consumeState).mockResolvedValue({
          ok: true,
          data: {
            provider: "google",
            codeVerifier: "v",
            codeChallenge: "c",
            action: "login", // no vinculación, sin userId
            returnTo: "/admin",
            createdAt: Date.now(),
          },
        });

        const result = await authService.linkProviderIdentity({
          provider: "google",
          code: "c",
          state: "s",
          clientCookieState: "s",
          clientId: "id",
          clientSecret: "sec",
          redirectUri: "uri",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_STATE");
        }
      });

      it("rechaza si la identidad del proveedor ya está vinculada a OTRO usuario", async () => {
        vi.mocked(mockStateManager.consumeState).mockResolvedValue({
          ok: true,
          data: {
            provider: "google",
            codeVerifier: "v",
            codeChallenge: "c",
            nonce: "n",
            action: "link",
            userId: "uuid-user-1",
            returnTo: "/admin/settings",
            createdAt: Date.now(),
          },
        });

        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
          access_token: "tok",
          id_token: "idtok",
          expires_in: 3600,
          token_type: "Bearer",
        });

        vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
          iss: "https://accounts.google.com",
          sub: "google-sub-otro",
          aud: "id",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: "otro@empresa.com",
          email_verified: true,
        });

        // Identidad ya vinculada a otro usuario (uuid-user-999)
        const anotherIdentity: Identity = {
          id: "uuid-identity-other",
          userId: "uuid-user-999",
          provider: "google",
          providerUserId: "google-sub-otro",
          providerEmail: "otro@empresa.com",
          emailVerified: true,
          displayName: null,
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        };

        vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(anotherIdentity);

        const result = await authService.linkProviderIdentity({
          provider: "google",
          code: "c",
          state: "s",
          clientCookieState: "s",
          clientId: "id",
          clientSecret: "sec",
          redirectUri: "uri",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("IDENTITY_ALREADY_LINKED");
          expect(result.error).toContain("ya se encuentra vinculada a otro usuario");
        }
        expect(mockAuthRepo.createIdentity).not.toHaveBeenCalled();
      });

      it("vincula exitosamente Google OIDC a la cuenta y emite sesión con returnTo", async () => {
        vi.mocked(mockStateManager.consumeState).mockResolvedValue({
          ok: true,
          data: {
            provider: "google",
            codeVerifier: "v",
            codeChallenge: "c",
            nonce: "n",
            action: "link",
            userId: "uuid-user-1",
            returnTo: "/admin/profile",
            createdAt: Date.now(),
          },
        });

        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        vi.mocked(mockGoogleOidcClient.exchangeCodeForTokens).mockResolvedValue({
          access_token: "tok",
          id_token: "idtok",
          expires_in: 3600,
          token_type: "Bearer",
        });

        vi.mocked(mockGoogleOidcClient.verifyIdToken).mockResolvedValue({
          iss: "https://accounts.google.com",
          sub: "google-sub-1",
          aud: "id",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: "carlos@empresa.com",
          email_verified: true,
          name: "Carlos Gómez",
        });

        vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
        vi.mocked(mockAuthRepo.createIdentity).mockResolvedValue({
          id: "uuid-identity-new",
          userId: "uuid-user-1",
          provider: "google",
          providerUserId: "google-sub-1",
          providerEmail: "carlos@empresa.com",
          emailVerified: true,
          displayName: "Carlos Gómez",
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        });
        vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

        const result = await authService.linkProviderIdentity({
          provider: "google",
          code: "c",
          state: "s",
          clientCookieState: "s",
          clientId: "id",
          clientSecret: "sec",
          redirectUri: "uri",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.user.id).toBe("uuid-user-1");
          expect(result.data.returnTo).toBe("/admin/profile");
        }
        expect(mockAuthRepo.createIdentity).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "uuid-user-1",
            provider: "google",
            providerUserId: "google-sub-1",
            emailVerified: true,
          }),
        );
      });

      it("vincula exitosamente Facebook OAuth a la cuenta y emite sesión", async () => {
        vi.mocked(mockStateManager.consumeState).mockResolvedValue({
          ok: true,
          data: {
            provider: "facebook",
            codeVerifier: "",
            codeChallenge: "",
            action: "link",
            userId: "uuid-user-1",
            returnTo: "/admin/account",
            createdAt: Date.now(),
          },
        });

        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        vi.mocked(mockFacebookOAuthClient.exchangeCodeForAccessToken).mockResolvedValue({
          access_token: "fb-tok",
          token_type: "bearer",
        });

        vi.mocked(mockFacebookOAuthClient.fetchUserProfile).mockResolvedValue({
          id: "fb-sub-1",
          name: "Carlos Gómez",
          email: "carlos@empresa.com",
        });

        vi.mocked(mockAuthRepo.findIdentityByProvider).mockResolvedValue(null);
        vi.mocked(mockAuthRepo.createIdentity).mockResolvedValue({
          id: "uuid-identity-fb-new",
          userId: "uuid-user-1",
          provider: "facebook",
          providerUserId: "fb-sub-1",
          providerEmail: "carlos@empresa.com",
          emailVerified: true,
          displayName: "Carlos Gómez",
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        });
        vi.mocked(mockAuthRepo.createSession).mockResolvedValue(mockSession);

        const result = await authService.linkProviderIdentity({
          provider: "facebook",
          code: "c",
          state: "s",
          clientCookieState: "s",
          clientId: "id",
          clientSecret: "sec",
          redirectUri: "uri",
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.user.id).toBe("uuid-user-1");
          expect(result.data.returnTo).toBe("/admin/account");
        }
        expect(mockAuthRepo.createIdentity).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "uuid-user-1",
            provider: "facebook",
            providerUserId: "fb-sub-1",
          }),
        );
      });
    });

    describe("unlinkProviderIdentity", () => {
      it("rechaza desvincular si la cuenta posee contraseña y no se suministra la contraseña actual", async () => {
        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const result = await authService.unlinkProviderIdentity({
          userId: "uuid-user-1",
          sessionId: "uuid-session-1",
          provider: "google",
          // sin currentPassword
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("PASSWORD_REQUIRED");
        }
      });

      it("rechaza desvincular si la contraseña actual provista es incorrecta", async () => {
        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const result = await authService.unlinkProviderIdentity({
          userId: "uuid-user-1",
          sessionId: "uuid-session-1",
          provider: "google",
          currentPassword: "WrongPassword!",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_CREDENTIALS");
        }
        expect(mockAuthRepo.deleteIdentity).not.toHaveBeenCalled();
      });

      it("rechaza desvincular el único método de acceso si no tiene contraseña nativa (§5.4)", async () => {
        const federatedOnlyUser = await buildMockUser({
          id: "uuid-user-fed",
          passwordHash: null,
        });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(federatedOnlyUser);

        // Solo tiene 1 identidad vinculada
        const onlyIdentity: Identity = {
          id: "uuid-identity-google",
          userId: "uuid-user-fed",
          provider: "google",
          providerUserId: "google-123",
          providerEmail: "fed@empresa.com",
          emailVerified: true,
          displayName: null,
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        };
        vi.mocked(mockAuthRepo.findIdentitiesByUserId).mockResolvedValue([onlyIdentity]);

        const result = await authService.unlinkProviderIdentity({
          userId: "uuid-user-fed",
          sessionId: "uuid-session-1",
          provider: "google",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("CANNOT_UNLINK_LAST_METHOD");
          expect(result.error).toContain("No es posible desvincular el único método");
        }
        expect(mockAuthRepo.deleteIdentity).not.toHaveBeenCalled();
      });

      it("desvincula exitosamente si el usuario posee contraseña nativa", async () => {
        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const identityToUnlink: Identity = {
          id: "uuid-identity-fb",
          userId: "uuid-user-1",
          provider: "facebook",
          providerUserId: "fb-123",
          providerEmail: "carlos@empresa.com",
          emailVerified: true,
          displayName: null,
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        };
        vi.mocked(mockAuthRepo.findIdentitiesByUserId).mockResolvedValue([identityToUnlink]);

        const result = await authService.unlinkProviderIdentity({
          userId: "uuid-user-1",
          sessionId: "uuid-session-1",
          currentAuthMethod: "password", // sesión actual autenticada por password, no por facebook
          provider: "facebook",
          currentPassword: rawPassword,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.message).toContain("exitosamente");
        }
        expect(mockAuthRepo.deleteIdentity).toHaveBeenCalledWith("uuid-user-1", "facebook");
        // No requiere rotar sesión porque el login fue por password
        expect(mockAuthRepo.revokeAllUserSessions).not.toHaveBeenCalled();
      });

      it("revoca las demás sesiones y rota la actual si se desvincula el método usado para el login activo (§5.4)", async () => {
        const user = await buildMockUser({ id: "uuid-user-1" });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const identityGoogle: Identity = {
          id: "uuid-identity-google",
          userId: "uuid-user-1",
          provider: "google",
          providerUserId: "google-123",
          providerEmail: "carlos@empresa.com",
          emailVerified: true,
          displayName: null,
          avatarUrl: null,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "self",
          updatedBy: "self",
        };
        vi.mocked(mockAuthRepo.findIdentitiesByUserId).mockResolvedValue([identityGoogle]);
        vi.mocked(mockAuthRepo.rotateSession).mockResolvedValue({
          ...mockSession,
          id: "uuid-session-1",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        });

        const result = await authService.unlinkProviderIdentity({
          userId: "uuid-user-1",
          sessionId: "uuid-session-1",
          currentAuthMethod: "google", // se desvincula el mismo método de la sesión activa
          provider: "google",
          currentPassword: rawPassword,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.rotatedSession).toBeDefined();
          expect(result.data.rotatedSession?.sid).toBeDefined();
          expect(result.data.rotatedSession?.csrfToken).toBeDefined();
        }
        expect(mockAuthRepo.deleteIdentity).toHaveBeenCalledWith("uuid-user-1", "google");
        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          "uuid-user-1",
          "provider_unlinked",
          "uuid-session-1",
        );
        expect(mockAuthRepo.rotateSession).toHaveBeenCalledWith(
          "uuid-session-1",
          expect.any(Buffer),
          expect.any(Buffer),
        );
      });
    });
  });

  describe("AUTH-001 T-18 · Enrolamiento y desenrolamiento 2FA (AuthService)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let totpCrypto: TotpCryptoService;
    let authService: AuthService;

    const rawPassword = "Password123!";
    const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
      const passwordHash = await hashPassword(rawPassword);
      return {
        id: "uuid-user-1",
        email: "carlos@empresa.com",
        emailVerifiedAt: new Date(),
        passwordHash,
        passwordUpdatedAt: new Date(),
        status: "active",
        identityLocation: "router",
        activeClientId: null,
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpEnabledAt: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        displayName: "Carlos Gómez",
        avatarUrl: null,
        createdBy: "self",
        updatedBy: "self",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    };

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

    beforeEach(() => {
      mockAuthRepo = createBaseMockAuthRepo();
      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };
      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };
      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };
      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;

      totpCrypto = new TotpCryptoService();
      totpCrypto.registerKey("test-key-v1", Buffer.alloc(32, 9));
      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
        totpCrypto,
      );
    });

    describe("enroll2fa", () => {
      it("rechaza con MFA_NOT_AVAILABLE si la cuenta no posee contraseña nativa (solo federada)", async () => {
        const federatedUser = await buildMockUser({
          id: "uuid-user-fed",
          passwordHash: null,
          passwordUpdatedAt: null,
        });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(federatedUser);

        const result = await authService.enroll2fa({
          userId: federatedUser.id,
          sessionId: "uuid-session-1",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("MFA_NOT_AVAILABLE");
          expect(result.error).toBe(
            "La autenticación de doble factor solo está disponible para cuentas con contraseña.",
          );
        }
        expect(mockAuthRepo.updateUserTotpKeys).not.toHaveBeenCalled();
      });

      it("exige reautenticación con contraseña (REAUTH_REQUIRED) si la sesión tiene más de 5 minutos", async () => {
        const user = await buildMockUser();
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const expiredReauth = new Date(Date.now() - 6 * 60 * 1000);
        const result = await authService.enroll2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          reauthAt: expiredReauth,
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("REAUTH_REQUIRED");
        }
        expect(mockAuthRepo.updateUserTotpKeys).not.toHaveBeenCalled();
      });

      it("rechaza si la contraseña suministrada en reautenticación es incorrecta", async () => {
        const user = await buildMockUser();
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const expiredReauth = new Date(Date.now() - 6 * 60 * 1000);
        const result = await authService.enroll2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          reauthAt: expiredReauth,
          password: "WrongPassword999!",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_CREDENTIALS");
        }
        expect(mockAuthRepo.updateUserTotpKeys).not.toHaveBeenCalled();
      });

      it("genera el secreto pendiente de 20 bytes en Base32, lo cifra con AES-256-GCM y retorna otpauthUri", async () => {
        const user = await buildMockUser();
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const recentReauth = new Date(Date.now() - 1 * 60 * 1000);
        const result = await authService.enroll2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          reauthAt: recentReauth,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.secret).toBeDefined();
          expect(result.data.secret.length).toBe(32);
          expect(result.data.otpauthUri).toContain("otpauth://totp/Mocter:carlos%40empresa.com?");
          expect(result.data.otpauthUri).toContain(`secret=${result.data.secret}`);
          expect(result.data.expiresAt).toBeDefined();
        }

        expect(mockAuthRepo.updateUserTotpKeys).toHaveBeenCalledWith(
          user.id,
          expect.objectContaining({
            totpPendingSecretCiphertext: expect.any(Buffer),
            totpPendingKeyId: "test-key-v1",
            totpPendingCreatedAt: expect.any(Date),
          }),
        );
      });
    });

    describe("confirm2fa", () => {
      it("falla con INVALID_TOTP_CODE si no tiene secreto pendiente", async () => {
        const user = await buildMockUser({
          totpPendingSecretCiphertext: null,
          totpPendingKeyId: null,
          totpPendingCreatedAt: null,
        });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const result = await authService.confirm2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          code: "123456",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_TOTP_CODE");
        }
      });

      it("falla con INVALID_TOTP_CODE si el secreto pendiente superó los 10 minutos de vigencia", async () => {
        const expiredPendingDate = new Date(Date.now() - 11 * 60 * 1000);
        const user = await buildMockUser();
        const encrypted = totpCrypto.encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", user.id);
        const userWithExpiredPending = {
          ...user,
          totpPendingSecretCiphertext: encrypted.ciphertext,
          totpPendingKeyId: encrypted.keyId,
          totpPendingCreatedAt: expiredPendingDate,
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithExpiredPending);

        const result = await authService.confirm2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          code: "123456",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_TOTP_CODE");
        }
      });

      it("falla con INVALID_TOTP_CODE si el código es incorrecto", async () => {
        const user = await buildMockUser();
        const encrypted = totpCrypto.encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", user.id);
        const userWithPending = {
          ...user,
          totpPendingSecretCiphertext: encrypted.ciphertext,
          totpPendingKeyId: encrypted.keyId,
          totpPendingCreatedAt: new Date(),
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithPending);

        const result = await authService.confirm2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          code: "000000",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_TOTP_CODE");
        }
      });

      it("activa 2FA, promueve el secreto, revoca las demás sesiones y rota la actual con mfa_at", async () => {
        const user = await buildMockUser();
        const base32Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        const encrypted = totpCrypto.encrypt(base32Secret, user.id);
        const userWithPending = {
          ...user,
          totpPendingSecretCiphertext: encrypted.ciphertext,
          totpPendingKeyId: encrypted.keyId,
          totpPendingCreatedAt: new Date(),
          totpLastUsedStep: null,
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithPending);

        vi.mocked(mockAuthRepo.rotateSession).mockResolvedValue({
          ...mockSession,
          id: "uuid-session-1",
          mfaAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        });

        const validCode = generateTotpCode(base32Secret);

        const result = await authService.confirm2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          code: validCode,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.rotatedSession.sid).toBeDefined();
          expect(result.data.rotatedSession.csrfToken).toBeDefined();
        }

        expect(mockAuthRepo.updateUserTotpKeys).toHaveBeenCalledWith(
          user.id,
          expect.objectContaining({
            totpSecretCiphertext: encrypted.ciphertext,
            totpKeyId: encrypted.keyId,
            totpEnabledAt: expect.any(Date),
            totpPendingSecretCiphertext: null,
            totpPendingKeyId: null,
            totpPendingCreatedAt: null,
            totpLastUsedStep: expect.any(Number),
          }),
        );

        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          user.id,
          "mfa_enabled",
          "uuid-session-1",
        );
        expect(mockAuthRepo.rotateSession).toHaveBeenCalledWith(
          "uuid-session-1",
          expect.any(Buffer),
          expect.any(Buffer),
          expect.objectContaining({
            mfaAt: expect.any(Date),
            reauthAt: expect.any(Date),
          }),
        );
      });
    });

    describe("disable2fa", () => {
      it("falla con MFA_NOT_ENABLED si la cuenta no tiene 2FA activo", async () => {
        const user = await buildMockUser({
          totpEnabledAt: null,
          totpSecretCiphertext: null,
          totpKeyId: null,
        });
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

        const result = await authService.disable2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          password: rawPassword,
          code: "123456",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("MFA_NOT_ENABLED");
        }
      });

      it("falla con INVALID_CREDENTIALS si la contraseña es incorrecta", async () => {
        const user = await buildMockUser();
        const encrypted = totpCrypto.encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", user.id);
        const userWithMfa = {
          ...user,
          totpEnabledAt: new Date(),
          totpSecretCiphertext: encrypted.ciphertext,
          totpKeyId: encrypted.keyId,
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithMfa);

        const result = await authService.disable2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          password: "WrongPassword999!",
          code: "123456",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_CREDENTIALS");
        }
      });

      it("falla con INVALID_TOTP_CODE si el código TOTP es inválido", async () => {
        const user = await buildMockUser();
        const encrypted = totpCrypto.encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", user.id);
        const userWithMfa = {
          ...user,
          totpEnabledAt: new Date(),
          totpSecretCiphertext: encrypted.ciphertext,
          totpKeyId: encrypted.keyId,
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithMfa);

        const result = await authService.disable2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          password: rawPassword,
          code: "000000",
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("INVALID_TOTP_CODE");
        }
      });

      it("desactiva 2FA, remueve secretos, revoca las demás sesiones y rota la actual limpiando mfa_at", async () => {
        const user = await buildMockUser();
        const base32Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        const encrypted = totpCrypto.encrypt(base32Secret, user.id);
        const userWithMfa = {
          ...user,
          totpEnabledAt: new Date(),
          totpSecretCiphertext: encrypted.ciphertext,
          totpKeyId: encrypted.keyId,
        };
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithMfa);

        vi.mocked(mockAuthRepo.rotateSession).mockResolvedValue({
          ...mockSession,
          id: "uuid-session-1",
          mfaAt: null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        });

        const validCode = generateTotpCode(base32Secret);

        const result = await authService.disable2fa({
          userId: user.id,
          sessionId: "uuid-session-1",
          password: rawPassword,
          code: validCode,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.rotatedSession.sid).toBeDefined();
        }

        expect(mockAuthRepo.updateUserTotpKeys).toHaveBeenCalledWith(user.id, {
          totpSecretCiphertext: null,
          totpKeyId: null,
          totpEnabledAt: null,
          totpPendingSecretCiphertext: null,
          totpPendingKeyId: null,
          totpPendingCreatedAt: null,
          totpLastUsedStep: null,
        });

        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          user.id,
          "mfa_disabled",
          "uuid-session-1",
        );

        expect(mockAuthRepo.rotateSession).toHaveBeenCalledWith(
          "uuid-session-1",
          expect.any(Buffer),
          expect.any(Buffer),
          expect.objectContaining({
            mfaAt: null,
            reauthAt: expect.any(Date),
          }),
        );
      });
    });
  });

  describe("AUTH-001 T-19 · Challenge y login 2FA (verify2faChallenge)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let mockRedis: MockRedisClient;
    let totpCrypto: TotpCryptoService;
    let authService: AuthService;

    const buildMockUser = async (overrides?: Partial<User>): Promise<User> => {
      const passwordHash = await hashPassword("Password123!");
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

    beforeEach(() => {
      mockRedis = new MockRedisClient();
      setRedisClientForTesting(mockRedis as unknown as ReturnType<typeof createMockRedisClient>);

      mockAuthRepo = createBaseMockAuthRepo();
      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };
      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };
      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };
      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;

      totpCrypto = new TotpCryptoService();
      totpCrypto.registerKey("test-key-v1", Buffer.alloc(32, 7));

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
        totpCrypto,
        mfaChallengeManager,
      );
    });

    afterEach(() => {
      setRedisClientForTesting(null);
    });

    it("login con 2FA habilitado crea challenge en Redis y retorna mfaRequired: true", async () => {
      const user = await buildMockUser({
        totpEnabledAt: new Date(),
        totpSecretCiphertext: Buffer.alloc(32),
        totpKeyId: "test-key-v1",
      });
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(user);

      const result = await authService.login({
        email: user.email,
        password: "Password123!",
      });

      expect(result.ok).toBe(true);
      if (result.ok && "mfaRequired" in result.data) {
        expect(result.data.mfaRequired).toBe(true);
        expect(result.data.userId).toBe(user.id);
        expect(result.data.challengeToken).toBeDefined();
        expect(result.data.expiresAt).toBeDefined();

        const stored = await mfaChallengeManager.getChallenge(result.data.challengeToken);
        expect(stored).not.toBeNull();
        expect(stored!.userId).toBe(user.id);
      } else {
        expect.unreachable("Se esperaba mfaRequired");
      }
    });

    it("falla con VALIDATION_ERROR si faltan parámetros en verify2faChallenge", async () => {
      const result = await authService.verify2faChallenge({
        challengeToken: "",
        code: "",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("VALIDATION_ERROR");
      }
    });

    it("falla con CHALLENGE_EXPIRED si el challenge no existe o expiró en Redis", async () => {
      const result = await authService.verify2faChallenge({
        challengeToken: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        code: "123456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CHALLENGE_EXPIRED");
      }
    });

    it("falla con CHALLENGE_EXHAUSTED y elimina el challenge si tiene 5 o más intentos fallidos", async () => {
      const user = await buildMockUser();
      const base32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const encrypted = totpCrypto.encrypt(base32Secret, user.id);

      const userWith2fa = {
        ...user,
        totpEnabledAt: new Date(),
        totpSecretCiphertext: encrypted.ciphertext,
        totpKeyId: encrypted.keyId,
        totpLastUsedStep: null,
      };
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWith2fa);

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      // Simular 4 intentos fallidos previos
      for (let i = 0; i < 4; i++) {
        await mfaChallengeManager.recordFailedAttempt(challenge.challengeToken);
      }

      // El 5to intento incorrecto debe arrojar CHALLENGE_EXHAUSTED y autodestruir el challenge
      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: "000000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CHALLENGE_EXHAUSTED");
      }

      const check = await mfaChallengeManager.getChallenge(challenge.challengeToken);
      expect(check).toBeNull();
    });

    it("falla con USER_NOT_FOUND si el usuario no existe", async () => {
      const challenge = await mfaChallengeManager.createChallenge({
        userId: "uuid-inexistente",
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(null);

      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: "123456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("USER_NOT_FOUND");
      }
    });

    it("falla con MFA_NOT_ENABLED si la cuenta no tiene 2FA habilitado", async () => {
      const user = await buildMockUser({
        totpEnabledAt: null,
      });

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(user);

      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: "123456",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("MFA_NOT_ENABLED");
      }
    });

    it("falla con INVALID_TOTP_CODE e incrementa intentos si el código TOTP es incorrecto", async () => {
      const user = await buildMockUser();
      const base32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const encrypted = totpCrypto.encrypt(base32Secret, user.id);

      const userWith2fa = {
        ...user,
        totpEnabledAt: new Date(),
        totpSecretCiphertext: encrypted.ciphertext,
        totpKeyId: encrypted.keyId,
        totpLastUsedStep: null,
      };
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWith2fa);

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: "000000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_TOTP_CODE");
      }

      const stored = await mfaChallengeManager.getChallenge(challenge.challengeToken);
      expect(stored).not.toBeNull();
      expect(stored!.attempts).toBe(1);
    });

    it("se autodestruye y responde CHALLENGE_EXHAUSTED al quinto fallo consecutivo de código TOTP", async () => {
      const user = await buildMockUser();
      const base32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const encrypted = totpCrypto.encrypt(base32Secret, user.id);

      const userWith2fa = {
        ...user,
        totpEnabledAt: new Date(),
        totpSecretCiphertext: encrypted.ciphertext,
        totpKeyId: encrypted.keyId,
        totpLastUsedStep: null,
      };
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWith2fa);

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      // Fallos 1 a 4
      for (let i = 1; i <= 4; i++) {
        const res = await authService.verify2faChallenge({
          challengeToken: challenge.challengeToken,
          code: "000000",
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe("INVALID_TOTP_CODE");
        }
      }

      // Fallo 5
      const res5 = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: "000000",
      });
      expect(res5.ok).toBe(false);
      if (!res5.ok) {
        expect(res5.code).toBe("CHALLENGE_EXHAUSTED");
      }

      // El challenge fue autodestruido de Redis
      const check = await mfaChallengeManager.getChallenge(challenge.challengeToken);
      expect(check).toBeNull();
    });

    it("rechaza con INVALID_TOTP_CODE si el código es repetido (anti-replay con totpLastUsedStep)", async () => {
      const user = await buildMockUser();
      const base32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const encrypted = totpCrypto.encrypt(base32Secret, user.id);

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const userWithReplay = {
        ...user,
        totpEnabledAt: new Date(),
        totpSecretCiphertext: encrypted.ciphertext,
        totpKeyId: encrypted.keyId,
        totpLastUsedStep: currentStep, // Ya usado para este paso
      };
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWithReplay);

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: null,
        routingVersion: null,
        identityLocation: "router",
      });

      const currentCode = generateTotpCode(base32Secret);

      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: currentCode,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INVALID_TOTP_CODE");
      }
    });

    it("verifica satisfactoriamente código TOTP válido, consume el challenge, actualiza totpLastUsedStep y crea sesión con mfa_at", async () => {
      const user = await buildMockUser();
      const base32Secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      const encrypted = totpCrypto.encrypt(base32Secret, user.id);

      const userWith2fa = {
        ...user,
        totpEnabledAt: new Date(),
        totpSecretCiphertext: encrypted.ciphertext,
        totpKeyId: encrypted.keyId,
        totpLastUsedStep: null,
      };
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(userWith2fa);

      const challenge = await mfaChallengeManager.createChallenge({
        userId: user.id,
        clientId: "client-abc",
        routingVersion: 3,
        identityLocation: "router",
      });

      vi.mocked(mockAuthRepo.createSession).mockResolvedValue({
        id: "session-mfa-1",
        userId: user.id,
        sidHash: Buffer.alloc(32),
        csrfHash: Buffer.alloc(32),
        clientId: "client-abc",
        routingVersion: 3,
        authMethod: "password",
        mfaAt: new Date(),
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
      });

      const validCode = generateTotpCode(base32Secret);

      const result = await authService.verify2faChallenge({
        challengeToken: challenge.challengeToken,
        code: validCode,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.user.id).toBe(user.id);
        expect(result.data.sid).toBeDefined();
        expect(result.data.csrfToken).toBeDefined();
        expect(result.data.clientId).toBe("client-abc");
        expect(result.data.expiresAt).toBeDefined();
      }

      // Challenge consumido (un solo uso)
      const check = await mfaChallengeManager.getChallenge(challenge.challengeToken);
      expect(check).toBeNull();

      // totpLastUsedStep actualizado
      expect(mockAuthRepo.updateUserTotpKeys).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({
          totpLastUsedStep: expect.any(Number),
        }),
      );

      // Sesión creada con mfaAt y reauthAt vigentes
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          clientId: "client-abc",
          routingVersion: 3,
          authMethod: "password",
          mfaAt: expect.any(Date),
          reauthAt: expect.any(Date),
        }),
      );
    });
  });

  describe("AUTH-001 T-21 · Creación, validación y revocación de sesión con caché Redis (SessionCacheManager)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockStateManager: OAuthStateManager;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let totpCrypto: TotpCryptoService;
    let sessionCache: SessionCacheManager;
    let mockRedis: MockRedisClient;
    let authService: AuthService;

    let testUser: User;
    const testPassword = "SecurePassword123!";

    beforeEach(async () => {
      mockAuthRepo = createBaseMockAuthRepo();
      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };
      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };
      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };
      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;
      totpCrypto = new TotpCryptoService();
      totpCrypto.registerKey("k1", Buffer.alloc(32, 0x01));

      mockRedis = new MockRedisClient();
      setRedisClientForTesting(mockRedis as unknown as any);
      sessionCache = new SessionCacheManager();

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
        totpCrypto,
        mfaChallengeManager,
        sessionCache,
      );

      const passwordHash = await hashPassword(testPassword);
      testUser = {
        id: "uuid-user-t21",
        email: "user.t21@mocter.co",
        displayName: "T21 User",
        passwordHash,
        passwordUpdatedAt: new Date(),
        avatarUrl: null,
        identityLocation: "router",
        activeClientId: "client-uuid-t21",
        emailVerifiedAt: new Date(),
        status: "active",
        totpEnabledAt: null,
        totpSecretCiphertext: null,
        totpKeyId: null,
        totpPendingSecretCiphertext: null,
        totpPendingKeyId: null,
        totpPendingCreatedAt: null,
        totpLastUsedStep: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "self",
        updatedBy: "self",
      };

      vi.mocked(mockAuthRepo.findUserById).mockResolvedValue(testUser);
    });

    afterEach(() => {
      setRedisClientForTesting(null);
    });

    it("crea sesión en Postgres y puebla la caché en Redis bajo auth:session:<sha256(sid)> y auth:user:sessions:<userId>", async () => {
      vi.mocked(mockAuthRepo.findUserByEmail).mockResolvedValue(testUser);
      vi.mocked(mockAuthRepo.getClientRoutingVersion).mockResolvedValue(2);

      const createdSession: Session = {
        id: "session-uuid-1",
        sidHash: Buffer.alloc(32),
        csrfHash: Buffer.alloc(32),
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
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
        createdBy: testUser.id,
        updatedBy: testUser.id,
      };
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue(createdSession);

      const result = await authService.login({
        email: testUser.email,
        password: testPassword,
      });

      expect(result.ok).toBe(true);
      if (!result.ok || "mfaRequired" in result.data) {
        throw new Error("Login failed unexpectedly");
      }

      const sid = result.data.sid;
      expect(sid).toBeDefined();
      expect(sid).toHaveLength(43); // 32 bytes en base64url

      // La cookie/sid no contiene clientId ni roles (token opaco)
      expect(sid).not.toContain(testUser.activeClientId!);
      expect(sid).not.toContain("tenant_owner");

      const sidHashHex = hashToken(sid).toString("hex");

      // Clave en Redis poblada
      const redisKey = buildSessionRedisKey(sidHashHex);
      const rawCached = await mockRedis.get(redisKey);
      expect(rawCached).not.toBeNull();

      const parsed = JSON.parse(rawCached!);
      expect(parsed.id).toBe(createdSession.id);
      expect(parsed.userId).toBe(testUser.id);
      expect(parsed.clientId).toBe(testUser.activeClientId);
      expect(parsed.csrfHashHex).toBeDefined();

      // Ni en Redis ni en Postgres se guarda el sid en claro
      expect(rawCached).not.toContain(sid);
      expect(mockAuthRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sidHash: expect.any(Buffer),
        }),
      );
      const createSessionCall = vi.mocked(mockAuthRepo.createSession).mock.calls[0][0];
      expect(createSessionCall.sidHash.toString("hex")).toBe(sidHashHex);

      // Conjunto de usuario auth:user:sessions:<userId> en Redis
      const userKey = buildUserSessionsRedisKey(testUser.id);
      const members = await mockRedis.smembers(userKey);
      expect(members).toContain(sidHashHex);
    });

    it("valida satisfactoriamente desde caché Redis sin consultar findSessionBySidHash en Postgres pero verificando el usuario", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");
      const csrfToken = generateCsrfToken();
      const csrfHash = hashToken(csrfToken);

      const now = new Date();
      const cachedData = {
        id: "session-uuid-cache",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: csrfHash.toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      const result = await authService.validateSession(sid, csrfToken);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.session.id).toBe("session-uuid-cache");
        expect(result.data.user?.id).toBe(testUser.id);
      }

      // No consulta sesión a Postgres (cache hit)
      expect(mockAuthRepo.findSessionBySidHash).not.toHaveBeenCalled();
      // Consulta obligatoria de usuario en Postgres (autoridad final)
      expect(mockAuthRepo.findUserById).toHaveBeenCalledWith(testUser.id);
    });

    it("falla cerrado con DB_ERROR (503) si Postgres cae, aun cuando la sesión esté en caché de Redis", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      const now = new Date();
      const cachedData = {
        id: "session-uuid-cache-2",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: hashToken("csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      // Simular falla de Postgres (Fail-Closed)
      vi.mocked(mockAuthRepo.findUserById).mockRejectedValueOnce(
        new Error("Connection terminated unexpectedly"),
      );

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("DB_ERROR");
        expect(result.error).toBe("Error interno al validar la sesión.");
      }
    });

    it("revoca la sesión y retorna UNAUTHORIZED si el usuario está deshabilitado en Postgres", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      const now = new Date();
      const cachedData = {
        id: "session-uuid-disabled",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: hashToken("csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
        ...testUser,
        status: "disabled",
      });

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNAUTHORIZED");
      }

      // Sesión revocada en Postgres y eliminada de Redis
      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(
        "session-uuid-disabled",
        "account_disabled",
      );
      const inRedis = await mockRedis.get(buildSessionRedisKey(sidHashHex));
      expect(inRedis).toBeNull();
    });

    it("revoca la sesión y retorna UNAUTHORIZED si el activeClientId de la sesión no coincide con el usuario", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      const now = new Date();
      const cachedData = {
        id: "session-uuid-mismatch",
        userId: testUser.id,
        clientId: "old-client-uuid",
        routingVersion: 2,
        csrfHashHex: hashToken("csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      // Usuario tiene otro client_id activo
      vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
        ...testUser,
        activeClientId: "new-client-uuid",
      });

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("UNAUTHORIZED");
      }

      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(
        "session-uuid-mismatch",
        "client_id_mismatch",
      );
    });

    it("rechaza con FORBIDDEN si el token CSRF provisto no coincide en tiempo constante", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      const now = new Date();
      const cachedData = {
        id: "session-uuid-csrf",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: hashToken("correct-csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      const result = await authService.validateSession(sid, "wrong-csrf");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("FORBIDDEN");
        expect(result.error).toBe("Token CSRF inválido.");
      }
    });

    it("actualiza last_seen_at y extiende expires_at si pasaron >= 60 segundos (touchSession)", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      // lastSeenAt hace 65 segundos
      const sixtyFiveSecsAgo = new Date(Date.now() - 65 * 1000);
      const oldExpiresAt = new Date(Date.now() + 25 * 60 * 1000);
      const absoluteExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      const cachedData = {
        id: "session-uuid-touch",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: hashToken("csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: sixtyFiveSecsAgo.toISOString(),
        lastSeenAt: sixtyFiveSecsAgo.toISOString(),
        expiresAt: oldExpiresAt.toISOString(),
        absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.touchSession).toHaveBeenCalledWith(
        "session-uuid-touch",
        expect.any(Date),
        expect.any(Date),
      );

      const updatedRaw = await mockRedis.get(buildSessionRedisKey(sidHashHex));
      const updatedData = JSON.parse(updatedRaw!);
      expect(new Date(updatedData.lastSeenAt).getTime()).toBeGreaterThan(
        sixtyFiveSecsAgo.getTime(),
      );
      expect(new Date(updatedData.expiresAt).getTime()).toBeGreaterThan(
        oldExpiresAt.getTime(),
      );
    });

    it("si Redis no contiene la sesión (cache miss), consulta Postgres y repuebla la caché", async () => {
      const sid = generateSessionId();
      const sidHash = hashToken(sid);
      const sidHashHex = sidHash.toString("hex");

      const dbSession: Session = {
        id: "session-uuid-from-db",
        sidHash,
        csrfHash: Buffer.alloc(32),
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
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
        createdBy: testUser.id,
        updatedBy: testUser.id,
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(dbSession);

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(true);
      expect(mockAuthRepo.findSessionBySidHash).toHaveBeenCalledWith(sidHash);

      // Repobló la caché en Redis
      const cached = await mockRedis.get(buildSessionRedisKey(sidHashHex));
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached!);
      expect(parsed.id).toBe("session-uuid-from-db");
    });

    it("si Redis está caído, la validación contra Postgres continúa con éxito (resiliencia)", async () => {
      const sid = generateSessionId();
      const sidHash = hashToken(sid);

      const dbSession: Session = {
        id: "session-uuid-resilient",
        sidHash,
        csrfHash: Buffer.alloc(32),
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
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
        createdBy: testUser.id,
        updatedBy: testUser.id,
      };

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValue(dbSession);

      // Simular Redis completamente caído
      mockRedis.simulateFailure(true);

      const result = await authService.validateSession(sid);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.session.id).toBe("session-uuid-resilient");
      }

      mockRedis.simulateFailure(false);
    });

    it("revokeSession revoca en Postgres y elimina la clave de Redis inmediatamente", async () => {
      const sid = generateSessionId();
      const sidHashHex = hashToken(sid).toString("hex");

      const now = new Date();
      const cachedData = {
        id: "session-uuid-to-revoke",
        userId: testUser.id,
        clientId: testUser.activeClientId,
        routingVersion: 2,
        csrfHashHex: hashToken("csrf").toString("hex"),
        authMethod: "password",
        mfaAt: null,
        reauthAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      };

      await mockRedis.set(
        buildSessionRedisKey(sidHashHex),
        JSON.stringify(cachedData),
        "EX",
        1800,
      );
      await mockRedis.sadd(buildUserSessionsRedisKey(testUser.id), sidHashHex);

      const revResult = await authService.revokeSession(sid, "user_logout");

      expect(revResult.ok).toBe(true);
      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(
        "session-uuid-to-revoke",
        "user_logout",
      );

      // Clave eliminada de Redis y removida del conjunto de usuario
      const checkRedis = await mockRedis.get(buildSessionRedisKey(sidHashHex));
      expect(checkRedis).toBeNull();
      const members = await mockRedis.smembers(buildUserSessionsRedisKey(testUser.id));
      expect(members).not.toContain(sidHashHex);
    });

    it("revokeUserSessions revoca todas las sesiones del usuario en Postgres y Redis", async () => {
      const sid1 = generateSessionId();
      const sid2 = generateSessionId();
      const hash1 = hashToken(sid1).toString("hex");
      const hash2 = hashToken(sid2).toString("hex");

      await mockRedis.set(buildSessionRedisKey(hash1), JSON.stringify({ id: "s1" }), "EX", 1800);
      await mockRedis.set(buildSessionRedisKey(hash2), JSON.stringify({ id: "s2" }), "EX", 1800);
      const userKey = buildUserSessionsRedisKey(testUser.id);
      await mockRedis.sadd(userKey, hash1, hash2);

      const revResult = await authService.revokeUserSessions(
        testUser.id,
        "membership_changed",
      );

      expect(revResult.ok).toBe(true);
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
        testUser.id,
        "membership_changed",
        undefined,
      );

      // Todas las claves borradas
      expect(await mockRedis.get(buildSessionRedisKey(hash1))).toBeNull();
      expect(await mockRedis.get(buildSessionRedisKey(hash2))).toBeNull();
      expect(await mockRedis.get(userKey)).toBeNull();
    });

    it("revokeUserSessions con exceptSid revoca todas excepto la sesión indicada", async () => {
      const sid1 = generateSessionId();
      const sid2 = generateSessionId();
      const hash1 = hashToken(sid1).toString("hex");
      const hash2 = hashToken(sid2).toString("hex");

      await mockRedis.set(buildSessionRedisKey(hash1), JSON.stringify({ id: "s1" }), "EX", 1800);
      await mockRedis.set(buildSessionRedisKey(hash2), JSON.stringify({ id: "s2" }), "EX", 1800);
      const userKey = buildUserSessionsRedisKey(testUser.id);
      await mockRedis.sadd(userKey, hash1, hash2);

      vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce({
        id: "s1",
      } as any);

      const revResult = await authService.revokeUserSessions(
        testUser.id,
        "password_change",
        sid1,
      );

      expect(revResult.ok).toBe(true);
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
        testUser.id,
        "password_change",
        "s1",
      );

      // sid2 fue borrado, sid1 se conserva
      expect(await mockRedis.get(buildSessionRedisKey(hash2))).toBeNull();
      expect(await mockRedis.get(buildSessionRedisKey(hash1))).not.toBeNull();
    });

    it("isReauthValid evalúa correctamente la ventana de 5 minutos (300 segundos)", () => {
      // Menos de 5 minutos: válida
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000);
      expect(authService.isReauthValid(fourMinutesAgo)).toBe(true);
      expect(authService.isReauthValid(fourMinutesAgo.toISOString())).toBe(true);

      // Más de 5 minutos: inválida
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      expect(authService.isReauthValid(sixMinutesAgo)).toBe(false);
      expect(authService.isReauthValid(sixMinutesAgo.toISOString())).toBe(false);
    });
  });

  describe("AUTH-001 T-23 · TTL, limpieza y gestión de sesiones (listado, revocación y purga)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let mockRedis: MockRedisClient;
    let sessionCache: SessionCacheManager;
    let authService: AuthService;

    const testUser: User = {
      id: "uuid-user-t23",
      email: "t23@mocter.co",
      displayName: "Usuario T23",
      status: "active",
      passwordHash: "hash-argon2id",
      passwordUpdatedAt: new Date(),
      identityLocation: "router",
      avatarUrl: null,
      totpEnabledAt: null,
      totpSecretCiphertext: null,
      totpKeyId: null,
      totpPendingSecretCiphertext: null,
      totpPendingKeyId: null,
      totpPendingCreatedAt: null,
      totpLastUsedStep: null,
      activeClientId: "uuid-client-t23",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    };

    const now = new Date();
    const mockSession1: Session = {
      id: "session-uuid-1",
      userId: testUser.id,
      clientId: testUser.activeClientId,
      routingVersion: 1,
      sidHash: Buffer.alloc(32, 1),
      csrfHash: Buffer.alloc(32, 2),
      authMethod: "password",
      mfaAt: null,
      reauthAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      revokedAt: null,
      revokedReason: null,
      ipHash: null,
      userAgentHash: null,
      createdAt: now,
      updatedAt: now,
      createdBy: testUser.id,
      updatedBy: testUser.id,
    };

    const mockSession2: Session = {
      ...mockSession1,
      id: "session-uuid-2",
      authMethod: "google",
      sidHash: Buffer.alloc(32, 3),
      csrfHash: Buffer.alloc(32, 4),
      lastSeenAt: new Date(now.getTime() - 5 * 60 * 1000),
    };

    beforeEach(() => {
      mockAuthRepo = createBaseMockAuthRepo();
      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };
      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };
      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };
      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
        saveOAuthState: vi.fn(),
        verifyAndConsumeOAuthState: vi.fn(),
        saveLinkState: vi.fn(),
        verifyAndConsumeLinkState: vi.fn(),
      } as unknown as OAuthStateManager;

      mockRedis = new MockRedisClient();
      setRedisClientForTesting(mockRedis as unknown as any);
      sessionCache = new SessionCacheManager();

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockStateManager,
        mockFacebookOAuthClient,
        undefined,
        mfaChallengeManager,
        sessionCache,
      );
    });

    afterEach(() => {
      setRedisClientForTesting(null);
    });

    describe("listUserSessions", () => {
      it("retorna lista de sesiones sanitizada en DTOs sin exponer sidHash, csrfHash ni hashes de seguridad", async () => {
        vi.mocked(mockAuthRepo.listActiveSessionsByUserId).mockResolvedValueOnce([
          mockSession1,
          mockSession2,
        ]);

        const result = await authService.listUserSessions(testUser.id, "session-uuid-1");

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.data).toHaveLength(2);

        // Sesión 1: marcada como current
        expect(result.data[0].id).toBe("session-uuid-1");
        expect(result.data[0].authMethod).toBe("password");
        expect(result.data[0].isCurrent).toBe(true);
        expect((result.data[0] as any).sidHash).toBeUndefined();
        expect((result.data[0] as any).csrfHash).toBeUndefined();
        expect((result.data[0] as any).ipHash).toBeUndefined();

        // Sesión 2: no current
        expect(result.data[1].id).toBe("session-uuid-2");
        expect(result.data[1].authMethod).toBe("google");
        expect(result.data[1].isCurrent).toBe(false);
      });

      it("retorna lista vacía si el usuario no posee sesiones activas", async () => {
        vi.mocked(mockAuthRepo.listActiveSessionsByUserId).mockResolvedValueOnce([]);

        const result = await authService.listUserSessions(testUser.id);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual([]);
        }
      });

      it("retorna DB_ERROR si la consulta al repositorio falla", async () => {
        vi.mocked(mockAuthRepo.listActiveSessionsByUserId).mockRejectedValueOnce(
          new Error("Postgres query timeout"),
        );

        const result = await authService.listUserSessions(testUser.id);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("DB_ERROR");
        }
      });
    });

    describe("revokeSessionById", () => {
      it("revoca exitosamente una sesión propia del usuario y elimina su clave de Redis", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce(mockSession1);
        vi.mocked(mockAuthRepo.revokeSession).mockResolvedValueOnce(mockSession1);

        const sidHashHex = mockSession1.sidHash.toString("hex");
        await sessionCache.cacheSession(mockSession1, sidHashHex);

        const result = await authService.revokeSessionById(testUser.id, "session-uuid-1");

        expect(result.ok).toBe(true);
        expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(
          "session-uuid-1",
          "user_revoked",
        );

        // Clave eliminada de Redis
        const cached = await sessionCache.getCachedSession(sidHashHex);
        expect(cached).toBeNull();
      });

      it("retorna NOT_FOUND si la sesión no existe", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce(null);

        const result = await authService.revokeSessionById(testUser.id, "session-inexistente");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("NOT_FOUND");
        }
        expect(mockAuthRepo.revokeSession).not.toHaveBeenCalled();
      });

      it("retorna NOT_FOUND si la sesión pertenece a otro usuario (protección anti-IDOR)", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce({
          ...mockSession1,
          userId: "uuid-otro-usuario",
        });

        const result = await authService.revokeSessionById(testUser.id, "session-uuid-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("NOT_FOUND");
        }
        expect(mockAuthRepo.revokeSession).not.toHaveBeenCalled();
      });

      it("retorna NOT_FOUND si la sesión ya fue revocada previamente", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce({
          ...mockSession1,
          revokedAt: new Date(),
        });

        const result = await authService.revokeSessionById(testUser.id, "session-uuid-1");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("NOT_FOUND");
        }
        expect(mockAuthRepo.revokeSession).not.toHaveBeenCalled();
      });
    });

    describe("purgeExpiredSessions", () => {
      it("ejecuta la purga de sesiones vencidas y retorna la cantidad de registros eliminados", async () => {
        vi.mocked(mockAuthRepo.purgeExpiredSessions).mockResolvedValueOnce(5);

        const result = await authService.purgeExpiredSessions();

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.purgedCount).toBe(5);
        }
        expect(mockAuthRepo.purgeExpiredSessions).toHaveBeenCalled();
      });

      it("retorna DB_ERROR si la purga en base de datos arroja un error", async () => {
        vi.mocked(mockAuthRepo.purgeExpiredSessions).mockRejectedValueOnce(
          new Error("DB disk failure"),
        );

        const result = await authService.purgeExpiredSessions();

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("DB_ERROR");
        }
      });
    });
  });

  describe("AUTH-001 T-24 · Integrar membresía y revocación con ADM-001 (bindSessionToClient, revokeClientSessions, revokeUserSessions)", () => {
    let mockAuthRepo: IAuthRepository;
    let mockMailer: IAuthMailer;
    let mockGoogleOidcClient: IGoogleOidcClient;
    let mockFacebookOAuthClient: IFacebookOAuthClient;
    let mockStateManager: OAuthStateManager;
    let mockRedis: MockRedisClient;
    let sessionCache: SessionCacheManager;
    let authService: AuthService;

    const testUser: User = {
      id: "uuid-user-t24",
      email: "owner@mocter.co",
      emailVerifiedAt: new Date(),
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummy",
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
      displayName: "Owner Mocter",
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    };

    const rawSid = "12345678901234567890123456789012";
    const sidHash = hashToken(rawSid);
    const csrfToken = "csrf1234567890123456789012345678";
    const csrfHash = hashToken(csrfToken);

    const now = new Date();
    const mockSession: Session = {
      id: "session-uuid-t24",
      userId: testUser.id,
      clientId: null,
      routingVersion: null,
      sidHash,
      csrfHash,
      authMethod: "password",
      mfaAt: null,
      reauthAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      absoluteExpiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
      revokedAt: null,
      revokedReason: null,
      ipHash: null,
      userAgentHash: null,
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system",
    };

    const targetClientId = "client-uuid-mocter-1";

    beforeEach(() => {
      mockAuthRepo = createBaseMockAuthRepo();
      mockMailer = {
        sendVerificationEmail: vi.fn(),
        sendPasswordResetEmail: vi.fn(),
        sendPasswordSetupEmail: vi.fn(),
        sendAccountAlreadyExistsEmail: vi.fn(),
      };
      mockGoogleOidcClient = {
        discover: vi.fn(),
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForTokens: vi.fn(),
        verifyIdToken: vi.fn(),
      };
      mockFacebookOAuthClient = {
        getAuthorizationUrl: vi.fn(),
        exchangeCodeForAccessToken: vi.fn(),
        fetchUserProfile: vi.fn(),
      };
      mockStateManager = {
        createState: vi.fn(),
        consumeState: vi.fn(),
      } as unknown as OAuthStateManager;
      mockRedis = createMockRedisClient();
      setRedisClientForTesting(mockRedis);
      sessionCache = new SessionCacheManager();

      authService = new AuthService(
        mockAuthRepo,
        mockMailer,
        mockGoogleOidcClient,
        mockFacebookOAuthClient,
        mockStateManager,
        undefined,
        sessionCache,
      );
    });

    describe("bindSessionToClient", () => {
      it("rechaza con SESSION_NOT_FOUND si la sesión no existe", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(null);

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("SESSION_NOT_FOUND");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con SESSION_NOT_FOUND si la sesión ya fue revocada", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce({
          ...mockSession,
          revokedAt: new Date(),
          revokedReason: "user_logout",
        });

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("SESSION_NOT_FOUND");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con SESSION_EXPIRED si la sesión expiró por inactividad", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce({
          ...mockSession,
          expiresAt: new Date(Date.now() - 1000),
        });

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("SESSION_EXPIRED");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con SESSION_EXPIRED si la sesión expiró por tiempo absoluto", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce({
          ...mockSession,
          absoluteExpiresAt: new Date(Date.now() - 1000),
        });

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("SESSION_EXPIRED");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con USER_NOT_FOUND si el usuario no existe", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce(null);

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("USER_NOT_FOUND");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con USER_DISABLED si el usuario se encuentra deshabilitado", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
          ...testUser,
          status: "disabled",
        });

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("USER_DISABLED");
        }
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
      });

      it("rechaza con MEMBERSHIP_CONFLICT si el usuario ya posee una membresía activa en otro inquilino (anti-segunda membresía)", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
          ...testUser,
          activeClientId: "otro-cliente-uuid",
        });

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("MEMBERSHIP_CONFLICT");
        }
        // Verificación de contrato: NO altera la sesión ni revoca las demás
        expect(mockAuthRepo.bindSessionToClient).not.toHaveBeenCalled();
        expect(mockAuthRepo.revokeAllUserSessions).not.toHaveBeenCalled();
      });

      it("vincula exitosamente en onboarding: actualiza la sesión, revoca las demás y sincroniza Redis", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
          ...testUser,
          activeClientId: null, // Nuevo onboarding
        });
        vi.mocked(mockAuthRepo.getClientRoutingVersion).mockResolvedValueOnce(1);

        const updatedSession: Session = {
          ...mockSession,
          clientId: targetClientId,
          routingVersion: 1,
        };
        vi.mocked(mockAuthRepo.bindSessionToClient).mockResolvedValueOnce(updatedSession);

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.session.clientId).toBe(targetClientId);
          expect(result.data.session.routingVersion).toBe(1);
        }

        // 1. Actualizó la sesión en Postgres
        expect(mockAuthRepo.bindSessionToClient).toHaveBeenCalledWith(
          mockSession.id,
          targetClientId,
          1,
        );

        // 2. Revocó las demás sesiones del usuario con motivo membership_onboarding
        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          testUser.id,
          "membership_onboarding",
          mockSession.id,
        );

        // 3. Verificación de caché en Redis
        const cachedRaw = await mockRedis.get(buildSessionRedisKey(sidHash.toString("hex")));
        expect(cachedRaw).not.toBeNull();
        const cachedData = JSON.parse(cachedRaw!);
        expect(cachedData.clientId).toBe(targetClientId);
        expect(cachedData.routingVersion).toBe(1);
      });

      it("vincula exitosamente recibiendo un objeto con sessionId y routingVersion explícito", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce(testUser);

        const updatedSession: Session = {
          ...mockSession,
          clientId: targetClientId,
          routingVersion: 2,
        };
        vi.mocked(mockAuthRepo.bindSessionToClient).mockResolvedValueOnce(updatedSession);

        const result = await authService.bindSessionToClient({
          sessionId: mockSession.id,
          clientId: targetClientId,
          routingVersion: 2,
        });

        expect(result.ok).toBe(true);
        expect(mockAuthRepo.bindSessionToClient).toHaveBeenCalledWith(
          mockSession.id,
          targetClientId,
          2,
        );
        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          testUser.id,
          "membership_onboarding",
          mockSession.id,
        );
      });

      it("permite revinculación idempotente si el activeClientId coincide con el clientId objetivo", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce({
          ...testUser,
          activeClientId: targetClientId, // Mismo cliente
        });
        vi.mocked(mockAuthRepo.getClientRoutingVersion).mockResolvedValueOnce(1);

        const updatedSession: Session = {
          ...mockSession,
          clientId: targetClientId,
          routingVersion: 1,
        };
        vi.mocked(mockAuthRepo.bindSessionToClient).mockResolvedValueOnce(updatedSession);

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(true);
        expect(mockAuthRepo.bindSessionToClient).toHaveBeenCalled();
      });

      it("retorna DB_ERROR si la base de datos falla al actualizar la sesión", async () => {
        vi.mocked(mockAuthRepo.findSessionBySidHash).mockResolvedValueOnce(mockSession);
        vi.mocked(mockAuthRepo.findUserById).mockResolvedValueOnce(testUser);
        vi.mocked(mockAuthRepo.getClientRoutingVersion).mockResolvedValueOnce(1);
        vi.mocked(mockAuthRepo.bindSessionToClient).mockRejectedValueOnce(
          new Error("DB connection terminated"),
        );

        const result = await authService.bindSessionToClient(rawSid, targetClientId);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("DB_ERROR");
        }
      });
    });

    describe("revokeClientSessions", () => {
      it("revoca masivamente todas las sesiones activas del inquilino en Postgres y purga Redis", async () => {
        const s1Hash = hashToken("sid1");
        const s2Hash = hashToken("sid2");

        // Poblar claves en Redis
        await mockRedis.set(buildSessionRedisKey(s1Hash.toString("hex")), JSON.stringify({ id: "s1" }));
        await mockRedis.set(buildSessionRedisKey(s2Hash.toString("hex")), JSON.stringify({ id: "s2" }));

        vi.mocked(mockAuthRepo.revokeSessionsByClientId).mockResolvedValueOnce([
          { id: "s1", userId: "u1", sidHash: s1Hash },
          { id: "s2", userId: "u2", sidHash: s2Hash },
        ]);

        const result = await authService.revokeClientSessions(targetClientId, "tenant_suspended");

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data.revokedCount).toBe(2);
        }

        expect(mockAuthRepo.revokeSessionsByClientId).toHaveBeenCalledWith(
          targetClientId,
          "tenant_suspended",
        );

        // Claves purgadas en Redis
        const s1Cached = await mockRedis.get(buildSessionRedisKey(s1Hash.toString("hex")));
        const s2Cached = await mockRedis.get(buildSessionRedisKey(s2Hash.toString("hex")));
        expect(s1Cached).toBeNull();
        expect(s2Cached).toBeNull();
      });

      it("retorna DB_ERROR si la revocación masiva del inquilino arroja un error", async () => {
        vi.mocked(mockAuthRepo.revokeSessionsByClientId).mockRejectedValueOnce(
          new Error("Deadlock detected"),
        );

        const result = await authService.revokeClientSessions(targetClientId, "tenant_decommissioned");

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("DB_ERROR");
        }
      });
    });

    describe("revokeUserSessions", () => {
      it("revoca todas las sesiones con motivo membership_changed al cambiar active_client_id", async () => {
        const result = await authService.revokeUserSessions(testUser.id, "membership_changed");

        expect(result.ok).toBe(true);
        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          testUser.id,
          "membership_changed",
          undefined,
        );
      });

      it("revoca sesiones con exceptSessionId preservando la sesión indicada", async () => {
        vi.mocked(mockAuthRepo.findSessionById).mockResolvedValueOnce(mockSession);

        const result = await authService.revokeUserSessions(testUser.id, "membership_changed", {
          exceptSessionId: mockSession.id,
        });

        expect(result.ok).toBe(true);
        expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(
          testUser.id,
          "membership_changed",
          mockSession.id,
        );
      });
    });
  });


