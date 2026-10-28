import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  users,
  userConsents,
  emailVerificationTokens,
  passwordResetTokens,
  type User,
  type UserConsent,
  type EmailVerificationToken,
  type PasswordResetToken,
} from "../db/schemas";
import type {
  IAuthRepository,
  CreateUserWithConsentParams,
  CreateEmailVerificationTokenParams,
  CreatePasswordResetTokenParams,
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
}

/** Instancia singleton por defecto de {@link DrizzleAuthRepository}. */
export const defaultAuthRepository = new DrizzleAuthRepository();
