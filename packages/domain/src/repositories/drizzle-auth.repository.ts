import { and, asc, eq, isNull, sql } from "drizzle-orm";
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
  type User,
  type UserConsent,
  type EmailVerificationToken,
  type PasswordResetToken,
  type Session,
} from "../db/schemas";
import type {
  IAuthRepository,
  CreateUserWithConsentParams,
  CreateEmailVerificationTokenParams,
  CreatePasswordResetTokenParams,
  CreateSessionParams,
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
        const [user] = await tx
          .insert(users)
          .values({
            email: params.email.trim().toLowerCase(),
            passwordHash: params.passwordHash,
            passwordUpdatedAt: new Date(),
            displayName: params.displayName || null,
            status: "active",
            identityLocation: "router",
            createdBy: "self",
            updatedBy: "self",
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

        // 1. Límite de 10 sesiones activas por usuario (AUTH-001 §5.6)
        const activeSessions = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(and(eq(sessions.userId, params.userId), isNull(sessions.revokedAt)))
          .orderBy(asc(sessions.createdAt));

        if (activeSessions.length >= 10) {
          const oldest = activeSessions[0];
          await tx
            .update(sessions)
            .set({
              revokedAt: now,
              revokedReason: "session_limit",
              updatedAt: now,
              updatedBy: "system",
            })
            .where(eq(sessions.id, oldest.id));
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
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    try {
      const now = new Date();
      await this.db
        .update(sessions)
        .set({
          revokedAt: now,
          revokedReason: reason,
          updatedAt: now,
          updatedBy: "self",
        })
        .where(eq(sessions.id, sessionId));
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
  ): Promise<Session> {
    try {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

      const [updatedSession] = await this.db
        .update(sessions)
        .set({
          sidHash: newSidHash,
          csrfHash: newCsrfHash,
          reauthAt: now,
          lastSeenAt: now,
          expiresAt: sql`LEAST(${newExpiresAt}, ${sessions.absoluteExpiresAt})`,
          updatedAt: now,
          updatedBy: "self",
        })
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
}

/** Instancia singleton por defecto de {@link DrizzleAuthRepository}. */
export const defaultAuthRepository = new DrizzleAuthRepository();
