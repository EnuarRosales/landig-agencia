import { and, asc, desc, eq, gt, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  users,
  userConsents,
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  clientRouting,
  identities,
  type User,
  type UserConsent,
  type EmailVerificationToken,
  type PasswordResetToken,
  type Session,
  type Identity,
} from "../db/schemas";
import type {
  IAuthRepository,
  CreateUserWithConsentParams,
  CreateEmailVerificationTokenParams,
  CreatePasswordResetTokenParams,
  CreateSessionParams,
  CreateFederatedUserParams,
  CreateIdentityParams,
} from "./auth.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Implementación de persistencia con Drizzle ORM para identidades y autenticación (AUTH-001).
 */
export class DrizzleAuthRepository implements IAuthRepository {
  /**
   * Crea una instancia de `DrizzleAuthRepository`.
   *
   * @param dbProvider - Proveedor de base de datos Drizzle ORM (por defecto {@link getDb}).
   */
  constructor(
    private readonly dbProvider: () => PostgresJsDatabase<typeof schema> = getDb,
  ) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbProvider();
  }

  /**
   * Busca un usuario por correo electrónico insensible a mayúsculas/minúsculas.
   */
  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const normalized = email.trim().toLowerCase();
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(sql`lower(${users.email})`, normalized))
        .limit(1);

      return rows[0] || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findUserByEmail Failed] ${msg}`, error);
      throw error;
    }
  }

  /**
   * Busca un usuario por su identificador UUID.
   */
  async findUserById(id: string): Promise<User | null> {
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return rows[0] || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findUserById Failed] ${msg}`, error, { id });
      throw error;
    }
  }

  /**
   * Crea un usuario y registra su consentimiento de tratamiento de datos en una sola transacción atómica.
   */
  async createUserWithConsent(
    params: CreateUserWithConsentParams,
  ): Promise<{ user: User; consent: UserConsent }> {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();
        const createdBy = params.createdBy ?? "self";
        const [user] = await tx
          .insert(users)
          .values({
            email: params.email.trim().toLowerCase(),
            passwordHash: params.passwordHash ?? null,
            passwordUpdatedAt: params.passwordHash ? now : null,
            displayName: params.displayName || null,
            activeClientId: params.activeClientId ?? null,
            emailVerifiedAt: params.emailVerifiedAt ?? null,
            status: "active",
            identityLocation: "router",
            createdBy,
            updatedBy: createdBy,
          })
          .returning();

        if (!user) {
          throw new Error("DrizzleAuthRepository: user insert returned no rows");
        }

        const [consent] = await tx
          .insert(userConsents)
          .values({
            userId: user.id,
            purpose: "data_treatment",
            policyVersion: params.policyVersion,
            status: "granted",
            channel: params.channel,
            createdBy: user.id,
            updatedBy: user.id,
          })
          .returning();

        if (!consent) {
          throw new Error("DrizzleAuthRepository: consent insert returned no rows");
        }

        return { user, consent };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.createUserWithConsent Failed] ${msg}`, error, {
        email: params.email,
      });
      throw error;
    }
  }

  /**
   * Registra un token de verificación de correo en la tabla `email_verification_tokens`.
   */
  async createEmailVerificationToken(
    params: CreateEmailVerificationTokenParams,
  ): Promise<EmailVerificationToken> {
    try {
      const [token] = await this.db
        .insert(emailVerificationTokens)
        .values({
          userId: params.userId,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
          requestedIpHash: params.requestedIpHash || null,
          createdBy: "system",
          updatedBy: "system",
        })
        .returning();

      if (!token) {
        throw new Error("DrizzleAuthRepository: token insert returned no rows");
      }

      return token;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.createEmailVerificationToken Failed] ${msg}`, error, {
        userId: params.userId,
      });
      throw error;
    }
  }

  /**
   * Invalida tokens de verificación de correo pendientes del usuario marcando `consumed_at = now()`.
   */
  async invalidatePendingEmailVerificationTokens(userId: string): Promise<void> {
    try {
      await this.db
        .update(emailVerificationTokens)
        .set({
          consumedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: "system",
        })
        .where(
          and(
            eq(emailVerificationTokens.userId, userId),
            isNull(emailVerificationTokens.consumedAt),
          ),
        );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.invalidatePendingEmailVerificationTokens Failed] ${msg}`,
        error,
        { userId },
      );
      throw error;
    }
  }

  /**
   * Registra un token de restablecimiento o establecimiento de contraseña.
   */
  async createPasswordResetToken(
    params: CreatePasswordResetTokenParams,
  ): Promise<PasswordResetToken> {
    try {
      const [token] = await this.db
        .insert(passwordResetTokens)
        .values({
          userId: params.userId,
          tokenHash: params.tokenHash,
          purpose: params.purpose,
          expiresAt: params.expiresAt,
          requestedIpHash: params.requestedIpHash || null,
          createdBy: "system",
          updatedBy: "system",
        })
        .returning();

      if (!token) {
        throw new Error("DrizzleAuthRepository: password token insert returned no rows");
      }

      return token;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.createPasswordResetToken Failed] ${msg}`, error, {
        userId: params.userId,
      });
      throw error;
    }
  }

  /**
   * Invalida tokens de contraseña pendientes del usuario.
   */
  async invalidatePendingPasswordResetTokens(
    userId: string,
    purpose?: "reset" | "setup",
  ): Promise<void> {
    try {
      const conditions = [
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.consumedAt),
      ];

      if (purpose) {
        conditions.push(eq(passwordResetTokens.purpose, purpose));
      }

      await this.db
        .update(passwordResetTokens)
        .set({
          consumedAt: new Date(),
          updatedAt: new Date(),
          updatedBy: "system",
        })
        .where(and(...conditions));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.invalidatePendingPasswordResetTokens Failed] ${msg}`,
        error,
        { userId, purpose },
      );
      throw error;
    }
  }

  /**
   * Busca un token de verificación de correo por su hash SHA-256 binario.
   */
  async findEmailVerificationTokenByHash(
    tokenHash: Buffer,
  ): Promise<EmailVerificationToken | null> {
    try {
      const rows = await this.db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.tokenHash, tokenHash))
        .limit(1);

      return rows[0] || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.findEmailVerificationTokenByHash Failed] ${msg}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consume un token de verificación y marca email_verified_at en users en una sola transacción atómica.
   */
  async consumeEmailVerificationToken(
    tokenId: string,
    userId: string,
  ): Promise<User> {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();

        await tx
          .update(emailVerificationTokens)
          .set({
            consumedAt: now,
            updatedAt: now,
            updatedBy: "system",
          })
          .where(eq(emailVerificationTokens.id, tokenId));

        const [updatedUser] = await tx
          .update(users)
          .set({
            emailVerifiedAt: now,
            updatedAt: now,
            updatedBy: "self",
          })
          .where(eq(users.id, userId))
          .returning();

        if (!updatedUser) {
          throw new Error(
            "DrizzleAuthRepository: user update returned no rows upon email verification",
          );
        }

        return updatedUser;
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.consumeEmailVerificationToken Failed] ${msg}`,
        error,
        { tokenId, userId },
      );
      throw error;
    }
  }

  /**
   * Crea una nueva sesión opaca en la tabla `sessions`, aplicando el límite de 10 sesiones por usuario (AUTH-001 §5.6).
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();

        // 1. Límite de 10 sesiones activas por usuario (AUTH-001 §5.6, T-23)
        const activeSessions = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, params.userId),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, now),
              gt(sessions.absoluteExpiresAt, now),
            ),
          )
          .orderBy(asc(sessions.createdAt));

        if (activeSessions.length >= 10) {
          const toRevokeCount = activeSessions.length - 9;
          const toRevoke = activeSessions.slice(0, toRevokeCount);
          for (const s of toRevoke) {
            await tx
              .update(sessions)
              .set({
                revokedAt: now,
                revokedReason: "session_limit",
                updatedAt: now,
                updatedBy: "system",
              })
              .where(eq(sessions.id, s.id));
          }
        }

        // 2. Inserción de la nueva sesión opaca
        const [newSession] = await tx
          .insert(sessions)
          .values({
            userId: params.userId,
            sidHash: params.sidHash,
            csrfHash: params.csrfHash,
            clientId: params.clientId ?? null,
            routingVersion: params.routingVersion ?? null,
            authMethod: params.authMethod,
            mfaAt: params.mfaAt ?? null,
            reauthAt: params.reauthAt,
            lastSeenAt: now,
            expiresAt: params.expiresAt,
            absoluteExpiresAt: params.absoluteExpiresAt,
            ipHash: params.ipHash ?? null,
            userAgentHash: params.userAgentHash ?? null,
            createdBy: "self",
            updatedBy: "self",
          })
          .returning();

        return newSession;
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.createSession Failed] ${msg}`, error, {
        userId: params.userId,
      });
      throw error;
    }
  }

  /**
   * Actualiza el hash Argon2id de la contraseña de un usuario en el Router (rehash transparente, AUTH-001 T-07).
   */
  async updateUserPasswordHash(
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    try {
      const now = new Date();
      await this.db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          passwordUpdatedAt: now,
          updatedAt: now,
          updatedBy: "self",
        })
        .where(eq(users.id, userId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.updateUserPasswordHash Failed] ${msg}`,
        error,
        { userId },
      );
      throw error;
    }
  }

  /**
   * Consulta la versión vigente de enrutamiento (`routing_version`) para un inquilino en `client_routing`.
   */
  async getClientRoutingVersion(clientId: string): Promise<number | null> {
    try {
      const rows = await this.db
        .select({ routingVersion: clientRouting.routingVersion })
        .from(clientRouting)
        .where(eq(clientRouting.clientId, clientId))
        .limit(1);

      return rows[0]?.routingVersion ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.getClientRoutingVersion Failed] ${msg}`,
        error,
        { clientId },
      );
      throw error;
    }
  }

  /**
   * Busca una sesión activa por el hash binario SHA-256 de su `sid`.
   */
  async findSessionBySidHash(sidHash: Buffer): Promise<Session | null> {
    try {
      const rows = await this.db
        .select()
        .from(sessions)
        .where(and(eq(sessions.sidHash, sidHash), isNull(sessions.revokedAt)))
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.findSessionBySidHash Failed] ${msg}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Revoca una sesión específica marcando `revoked_at = now()`.
   */
  async revokeSession(sessionId: string, reason: string): Promise<Session | null> {
    try {
      const now = new Date();
      const [updated] = await this.db
        .update(sessions)
        .set({
          revokedAt: now,
          revokedReason: reason,
          updatedAt: now,
          updatedBy: "self",
        })
        .where(eq(sessions.id, sessionId))
        .returning();

      return updated ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.revokeSession Failed] ${msg}`, error, {
        sessionId,
        reason,
      });
      throw error;
    }
  }

  /**
   * Actualiza el registro de actividad y extiende el vencimiento por inactividad de una sesión activa (AUTH-001 §5.6).
   */
  async touchSession(
    sessionId: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    try {
      await this.db
        .update(sessions)
        .set({
          lastSeenAt,
          expiresAt: sql`LEAST(${expiresAt}, ${sessions.absoluteExpiresAt})`,
          updatedAt: lastSeenAt,
        })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.touchSession Failed] ${msg}`, error, {
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Busca una sesión por su identificador público UUID (AUTH-001 §5.6, T-23).
   */
  async findSessionById(sessionId: string): Promise<Session | null> {
    try {
      const rows = await this.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findSessionById Failed] ${msg}`, error, { sessionId });
      throw error;
    }
  }

  /**
   * Lista todas las sesiones activas y vigentes de un usuario ordenadas por última actividad (AUTH-001 §5.6, T-23).
   */
  async listActiveSessionsByUserId(userId: string): Promise<Session[]> {
    try {
      const now = new Date();
      return await this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            gt(sessions.absoluteExpiresAt, now),
          ),
        )
        .orderBy(desc(sessions.lastSeenAt));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.listActiveSessionsByUserId Failed] ${msg}`, error, { userId });
      throw error;
    }
  }

  /**
   * Purga sesiones vencidas o revocadas de la base de datos (AUTH-001 §5.6, T-23).
   * No elimina sesiones vigentes (revoked_at IS NULL y expires_at > now y absolute_expires_at > now).
   */
  async purgeExpiredSessions(now: Date = new Date()): Promise<number> {
    try {
      const deletedRows = await this.db
        .delete(sessions)
        .where(
          or(
            isNotNull(sessions.revokedAt),
            lte(sessions.expiresAt, now),
            lte(sessions.absoluteExpiresAt, now),
          ),
        )
        .returning({ id: sessions.id });

      return deletedRows.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.purgeExpiredSessions Failed] ${msg}`, error);
      throw error;
    }
  }

  /**
   * Busca un token de restablecimiento o establecimiento de contraseña por su hash SHA-256 binario.
   */
  async findPasswordResetTokenByHash(
    tokenHash: Buffer,
  ): Promise<PasswordResetToken | null> {
    try {
      const rows = await this.db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);

      return rows[0] || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.findPasswordResetTokenByHash Failed] ${msg}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Consume un token de restablecimiento, actualiza la contraseña del usuario y revoca todas sus sesiones activas (AUTH-001 §5.8).
   */
  async consumePasswordResetToken(
    tokenId: string,
    userId: string,
    newPasswordHash: string,
    purpose: "reset" | "setup",
  ): Promise<User> {
    try {
      return await this.db.transaction(async (tx) => {
        const now = new Date();

        // 1. Marcar el token de restablecimiento como consumido
        await tx
          .update(passwordResetTokens)
          .set({
            consumedAt: now,
            updatedAt: now,
            updatedBy: "system",
          })
          .where(eq(passwordResetTokens.id, tokenId));

        // 2. Actualizar contraseña del usuario y email_verified_at si es setup
        const userUpdateValues: Record<string, unknown> = {
          passwordHash: newPasswordHash,
          passwordUpdatedAt: now,
          updatedAt: now,
          updatedBy: "self",
        };

        if (purpose === "setup") {
          userUpdateValues.emailVerifiedAt = sql`COALESCE(${users.emailVerifiedAt}, ${now})`;
        }

        const [updatedUser] = await tx
          .update(users)
          .set(userUpdateValues)
          .where(eq(users.id, userId))
          .returning();

        if (!updatedUser) {
          throw new Error(
            "DrizzleAuthRepository: user update returned no rows upon password reset",
          );
        }

        // 3. Revocar todas las sesiones activas del usuario (AUTH-001 §5.8)
        await tx
          .update(sessions)
          .set({
            revokedAt: now,
            revokedReason: "password_reset",
            updatedAt: now,
            updatedBy: "system",
          })
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

        return updatedUser;
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.consumePasswordResetToken Failed] ${msg}`,
        error,
        { tokenId, userId, purpose },
      );
      throw error;
    }
  }

  /**
   * Revoca todas las sesiones activas de un usuario, opcionalmente excluyendo la sesión actual (AUTH-001 §5.6 y §5.8).
   */
  async revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<void> {
    try {
      const now = new Date();
      let condition = and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
      if (exceptSessionId) {
        condition = and(condition, sql`${sessions.id} != ${exceptSessionId}`);
      }

      await this.db
        .update(sessions)
        .set({
          revokedAt: now,
          revokedReason: reason,
          updatedAt: now,
          updatedBy: "system",
        })
        .where(condition);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.revokeAllUserSessions Failed] ${msg}`,
        error,
        { userId, reason, exceptSessionId },
      );
      throw error;
    }
  }

  /**
   * Actualiza la contraseña de un usuario tras un cambio autenticado, actualizando password_updated_at (AUTH-001 §5.8).
   */
  async updateUserPassword(
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    try {
      const now = new Date();
      await this.db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          passwordUpdatedAt: now,
          updatedAt: now,
          updatedBy: "self",
        })
        .where(eq(users.id, userId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.updateUserPassword Failed] ${msg}`,
        error,
        { userId },
      );
      throw error;
    }
  }

  /**
   * Rota una sesión activa emitiendo nuevos hashes de sid y csrfToken, renovando su vencimiento por inactividad (AUTH-001 §5.6 y §5.8).
   */
  async rotateSession(
    sessionId: string,
    newSidHash: Buffer,
    newCsrfHash: Buffer,
    options?: {
      mfaAt?: Date | null;
      reauthAt?: Date;
    },
  ): Promise<Session> {
    try {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      const setValues: Record<string, unknown> = {
        sidHash: newSidHash,
        csrfHash: newCsrfHash,
        reauthAt: options?.reauthAt ?? now,
        lastSeenAt: now,
        expiresAt: sql`LEAST(${newExpiresAt}, ${sessions.absoluteExpiresAt})`,
        updatedAt: now,
        updatedBy: "self",
      };

      if (options && "mfaAt" in options) {
        setValues.mfaAt = options.mfaAt;
      }

      const [updatedSession] = await this.db
        .update(sessions)
        .set(setValues)
        .where(eq(sessions.id, sessionId))
        .returning();

      if (!updatedSession) {
        throw new Error(
          `DrizzleAuthRepository: session rotation returned no rows for session ${sessionId}`,
        );
      }

      return updatedSession;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.rotateSession Failed] ${msg}`, error, {
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Busca una identidad federada por proveedor y su identificador de sujeto (AUTH-001 §5.3).
   */
  async findIdentityByProvider(
    provider: "google" | "facebook",
    providerUserId: string,
  ): Promise<Identity | null> {
    try {
      const rows = await this.db
        .select()
        .from(identities)
        .where(
          and(
            eq(identities.provider, provider),
            eq(identities.providerUserId, providerUserId),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findIdentityByProvider Failed] ${msg}`, error, {
        provider,
      });
      throw error;
    }
  }

  /**
   * Crea un nuevo usuario federado con correo verificado y su identidad en una sola transacción atómica (AUTH-001 §5.3).
   */
  async createFederatedUserWithIdentity(
    params: CreateFederatedUserParams,
  ): Promise<{ user: User; identity: Identity }> {
    try {
      const now = new Date();
      return await this.db.transaction(async (tx) => {
        const [newUser] = await tx
          .insert(users)
          .values({
            email: params.email.trim().toLowerCase(),
            emailVerifiedAt: now,
            passwordHash: null,
            passwordUpdatedAt: null,
            status: "active",
            identityLocation: "router",
            displayName: params.displayName ?? null,
            avatarUrl: params.avatarUrl ?? null,
            createdBy: "self",
            updatedBy: "self",
          })
          .returning();

        if (!newUser) {
          throw new Error("DrizzleAuthRepository: user creation returned no rows");
        }

        const [newIdentity] = await tx
          .insert(identities)
          .values({
            userId: newUser.id,
            provider: params.provider,
            providerUserId: params.providerUserId,
            providerEmail: params.providerEmail ?? params.email,
            emailVerified: true,
            displayName: params.displayName ?? null,
            avatarUrl: params.avatarUrl ?? null,
            linkedAt: now,
            lastLoginAt: now,
            createdBy: "self",
            updatedBy: "self",
          })
          .returning();

        if (!newIdentity) {
          throw new Error("DrizzleAuthRepository: identity creation returned no rows");
        }

        return { user: newUser, identity: newIdentity };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(
        `[AuthRepository.createFederatedUserWithIdentity Failed] ${msg}`,
        error,
        { provider: params.provider },
      );
      throw error;
    }
  }

  /**
   * Vincula una nueva identidad federada a un usuario existente (AUTH-001 §5.4).
   */
  async createIdentity(params: CreateIdentityParams): Promise<Identity> {
    try {
      const now = new Date();
      const [newIdentity] = await this.db
        .insert(identities)
        .values({
          userId: params.userId,
          provider: params.provider,
          providerUserId: params.providerUserId,
          providerEmail: params.providerEmail ?? null,
          emailVerified: params.emailVerified ?? false,
          displayName: params.displayName ?? null,
          avatarUrl: params.avatarUrl ?? null,
          linkedAt: now,
          lastLoginAt: now,
          createdBy: "self",
          updatedBy: "self",
        })
        .returning();

      if (!newIdentity) {
        throw new Error("DrizzleAuthRepository: identity creation returned no rows");
      }

      return newIdentity;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.createIdentity Failed] ${msg}`, error, {
        userId: params.userId,
        provider: params.provider,
      });
      throw error;
    }
  }

  /**
   * Actualiza la fecha y hora del último inicio de sesión de una identidad federada (`last_login_at = now()`).
   */
  async updateIdentityLastLogin(identityId: string): Promise<void> {
    try {
      const now = new Date();
      await this.db
        .update(identities)
        .set({
          lastLoginAt: now,
          updatedAt: now,
          updatedBy: "self",
        })
        .where(eq(identities.id, identityId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.updateIdentityLastLogin Failed] ${msg}`, error, {
        identityId,
      });
      throw error;
    }
  }

  /**
   * Lista todas las identidades federadas vinculadas a un usuario (AUTH-001 §5.4).
   */
  async findIdentitiesByUserId(userId: string): Promise<Identity[]> {
    try {
      return await this.db
        .select()
        .from(identities)
        .where(eq(identities.userId, userId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findIdentitiesByUserId Failed] ${msg}`, error, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Elimina una identidad federada vinculada a un usuario (AUTH-001 §5.4).
   */
  async deleteIdentity(
    userId: string,
    provider: "google" | "facebook",
  ): Promise<void> {
    try {
      await this.db
        .delete(identities)
        .where(
          and(
            eq(identities.userId, userId),
            eq(identities.provider, provider),
          ),
        );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.deleteIdentity Failed] ${msg}`, error, {
        userId,
        provider,
      });
      throw error;
    }
  }

  /**
   * Busca usuarios que posean secretos TOTP activos o pendientes cifrados con una clave distinta a la objetivo (AUTH-001 §4.1, T-17).
   */
  async findUsersWithOutdatedTotpKey(
    targetKeyId: string,
    limit: number = 100,
  ): Promise<User[]> {
    try {
      const rows = await this.db
        .select()
        .from(users)
        .where(
          or(
            and(isNotNull(users.totpKeyId), ne(users.totpKeyId, targetKeyId)),
            and(
              isNotNull(users.totpPendingKeyId),
              ne(users.totpPendingKeyId, targetKeyId),
            ),
          ),
        )
        .limit(limit);

      return rows;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.findUsersWithOutdatedTotpKey Failed] ${msg}`, error, {
        targetKeyId,
      });
      throw error;
    }
  }

  /**
   * Cuenta cuántos usuarios poseen secretos activos o pendientes cifrados con un `keyId` específico.
   */
  async countUsersWithTotpKey(keyId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(
          or(
            eq(users.totpKeyId, keyId),
            eq(users.totpPendingKeyId, keyId),
          ),
        );

      return result[0]?.count ?? 0;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.countUsersWithTotpKey Failed] ${msg}`, error, {
        keyId,
      });
      throw error;
    }
  }

  /**
   * Actualiza las columnas de secretos y claves TOTP de un usuario de forma atómica (AUTH-001 §4.1, T-17).
   */
  async updateUserTotpKeys(
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
  ): Promise<void> {
    try {
      await this.db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.updateUserTotpKeys Failed] ${msg}`, error, {
        userId,
      });
      throw error;
    }
  }

  /**
   * Asocia una sesión activa a un inquilino (`client_id`) y actualiza su versión de enrutamiento (AUTH-001 §5.6, §5.9, T-24).
   */
  async bindSessionToClient(
    sessionId: string,
    clientId: string,
    routingVersion?: number | null,
  ): Promise<Session> {
    try {
      const now = new Date();
      const [updated] = await this.db
        .update(sessions)
        .set({
          clientId,
          routingVersion: routingVersion ?? null,
          updatedAt: now,
          updatedBy: "system",
        })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
        .returning();

      if (!updated) {
        throw new Error(
          "DrizzleAuthRepository: session not found or already revoked to bind client",
        );
      }

      return updated;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.bindSessionToClient Failed] ${msg}`, error, {
        sessionId,
        clientId,
        routingVersion,
      });
      throw error;
    }
  }

  /**
   * Revoca masivamente todas las sesiones activas asociadas a un inquilino en Postgres (AUTH-001 §5.6, T-24).
   */
  async revokeSessionsByClientId(
    clientId: string,
    reason: string,
  ): Promise<Array<{ id: string; userId: string; sidHash: Buffer }>> {
    try {
      const now = new Date();
      const revoked = await this.db
        .update(sessions)
        .set({
          revokedAt: now,
          revokedReason: reason,
          updatedAt: now,
          updatedBy: "system",
        })
        .where(and(eq(sessions.clientId, clientId), isNull(sessions.revokedAt)))
        .returning({
          id: sessions.id,
          userId: sessions.userId,
          sidHash: sessions.sidHash,
        });

      return revoked;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.revokeSessionsByClientId Failed] ${msg}`, error, {
        clientId,
        reason,
      });
      throw error;
    }
  }

  /**
   * Reserva atómicamente la membresía del usuario (`active_client_id`) si no tiene una asignada (AUTH-001 §5.9, T-26).
   */
  async reserveUserActiveClient(userId: string, clientId: string): Promise<boolean> {
    try {
      const now = new Date();
      const updated = await this.db
        .update(users)
        .set({
          activeClientId: clientId,
          updatedAt: now,
          updatedBy: "system",
        })
        .where(
          and(
            eq(users.id, userId),
            or(isNull(users.activeClientId), eq(users.activeClientId, clientId)),
          ),
        )
        .returning({ id: users.id });

      return updated.length === 1;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.reserveUserActiveClient Failed] ${msg}`, error, {
        userId,
        clientId,
      });
      throw error;
    }
  }

  /**
   * Libera la reserva de membresía (`active_client_id = NULL`) de un usuario si coincide con el cliente esperado (AUTH-001 §5.9, T-26).
   */
  async clearUserActiveClient(userId: string, clientId: string): Promise<boolean> {
    try {
      const now = new Date();
      const updated = await this.db
        .update(users)
        .set({
          activeClientId: null,
          updatedAt: now,
          updatedBy: "system",
        })
        .where(
          and(
            eq(users.id, userId),
            eq(users.activeClientId, clientId),
          ),
        )
        .returning({ id: users.id });

      return updated.length === 1;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[AuthRepository.clearUserActiveClient Failed] ${msg}`, error, {
        userId,
        clientId,
      });
      throw error;
    }
  }
}

/** Instancia singleton por defecto de {@link DrizzleAuthRepository}. */
export const defaultAuthRepository = new DrizzleAuthRepository();
