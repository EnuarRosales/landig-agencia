import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import { users, identities } from "../db/schemas";
import {
  type ICellAuthRepository,
  type CellUserCredentials,
  type CellIdentitySnapshot,
  type ExpandCellUserParams,
  CellUnavailableError,
} from "./cell-auth.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Conector de bajo nivel o evaluador de conectividad por celda (AUTH-001 T-27, DAT-001 §4.4).
 */
export type CellConnectionChecker = (cellId: string) => Promise<boolean>;

/**
 * Implementación de persistencia y consulta delegada a celdas de datos con RLS (AUTH-001 T-27).
 */
export class DrizzleCellAuthRepository implements ICellAuthRepository {
  constructor(
    private readonly dbProvider: () => PostgresJsDatabase<typeof schema> = getDb,
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) {}

  private get db(): PostgresJsDatabase<typeof schema> {
    return this.dbProvider();
  }

  /**
   * Valida la disponibilidad de la celda antes de ejecutar cualquier transacción.
   */
  private async ensureCellAvailable(cellId: string): Promise<void> {
    if (this.cellHealthChecker) {
      const isAvailable = await this.cellHealthChecker(cellId);
      if (!isAvailable) {
        throw new CellUnavailableError(`Celda ${cellId} fuera de servicio.`, cellId);
      }
    }
  }

  /**
   * Consulta las credenciales de un usuario en su celda asignada fijando el contexto RLS.
   */
  async findUserCredentialsInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellUserCredentials | null> {
    await this.ensureCellAvailable(cellId);

    try {
      return await this.db.transaction(async (tx) => {
        // Fijar contexto RLS con SET LOCAL (o set_config(..., true))
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const rows = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, userId), eq(users.activeClientId, clientId)))
          .limit(1);

        const row = rows[0];
        if (!row) {
          return null;
        }

        return {
          id: row.id,
          clientId,
          email: row.email,
          passwordHash: row.passwordHash ?? null,
          passwordUpdatedAt: row.passwordUpdatedAt ?? null,
          totpSecretCiphertext: (row.totpSecretCiphertext as unknown as Buffer) ?? null,
          totpKeyId: row.totpKeyId ?? null,
          totpEnabledAt: row.totpEnabledAt ?? null,
          totpPendingSecretCiphertext: (row.totpPendingSecretCiphertext as unknown as Buffer) ?? null,
          totpPendingKeyId: row.totpPendingKeyId ?? null,
          totpPendingCreatedAt: row.totpPendingCreatedAt ?? null,
          totpLastUsedStep: row.totpLastUsedStep ?? null,
          status: row.status,
          displayName: row.displayName ?? null,
          avatarUrl: row.avatarUrl ?? null,
        };
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.findUserCredentialsInCell Failed] ${msg}`, error, {
        cellId,
        clientId,
        userId,
      });
      throw new CellUnavailableError(`Fallo de conexión con celda ${cellId}: ${msg}`, cellId);
    }
  }

  /**
   * Actualiza el hash de contraseña en la celda asignada bajo RLS.
   */
  async updatePasswordHashInCell(
    cellId: string,
    clientId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.ensureCellAvailable(cellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(users)
          .set({
            passwordHash,
            passwordUpdatedAt: now,
            updatedAt: now,
            updatedBy: "cell_auth_rehash",
          })
          .where(and(eq(users.id, userId), eq(users.activeClientId, clientId)));
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.updatePasswordHashInCell Failed] ${msg}`, error, {
        cellId,
        clientId,
        userId,
      });
      throw new CellUnavailableError(`Fallo al actualizar hash en celda ${cellId}: ${msg}`, cellId);
    }
  }

  /**
   * Actualiza el último paso temporal TOTP en la celda asignada bajo RLS.
   */
  async updateTotpLastUsedStepInCell(
    cellId: string,
    clientId: string,
    userId: string,
    step: number,
  ): Promise<void> {
    await this.ensureCellAvailable(cellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(users)
          .set({
            totpLastUsedStep: step,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), eq(users.activeClientId, clientId)));
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.updateTotpLastUsedStepInCell Failed] ${msg}`, error, {
        cellId,
        clientId,
        userId,
        step,
      });
      throw new CellUnavailableError(`Fallo al actualizar TOTP step en celda ${cellId}: ${msg}`, cellId);
    }
  }

  /**
   * Lista las identidades federadas asociadas al usuario en la celda bajo RLS.
   */
  async listUserIdentitiesInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellIdentitySnapshot[]> {
    await this.ensureCellAvailable(cellId);

    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const rows = await tx
          .select()
          .from(identities)
          .where(eq(identities.userId, userId));

        return rows.map((row) => ({
          provider: row.provider as "google" | "facebook",
          providerUserId: row.providerUserId,
          providerEmail: row.providerEmail ?? null,
          displayName: row.displayName ?? null,
          avatarUrl: row.avatarUrl ?? null,
        }));
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.listUserIdentitiesInCell Failed] ${msg}`, error, {
        cellId,
        clientId,
        userId,
      });
      throw new CellUnavailableError(`Fallo al consultar identidades en celda ${cellId}: ${msg}`, cellId);
    }
  }

  /**
   * Fase 1: Expande el usuario en la celda destino con RLS (§5.12).
   */
  async expandCellUser(targetCellId: string, user: ExpandCellUserParams): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${user.clientId}, true)`,
        );

        const now = new Date();
        await tx
          .insert(users)
          .values({
            id: user.id,
            email: user.email.toLowerCase(),
            activeClientId: user.clientId,
            emailVerifiedAt: user.emailVerifiedAt,
            status: user.status,
            identityLocation: targetCellId,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
            createdBy: "cell_migration",
            updatedBy: "cell_migration",
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              activeClientId: user.clientId,
              identityLocation: targetCellId,
              status: user.status,
              updatedAt: now,
            },
          });
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.expandCellUser Failed] ${msg}`, error, {
        targetCellId,
        userId: user.id,
      });
      throw new CellUnavailableError(`Fallo en expansión a celda destino ${targetCellId}: ${msg}`, targetCellId);
    }
  }

  /**
   * Fase 2: Copia contraseñas y TOTP a la celda destino (§5.12).
   */
  async copyCredentialsToCell(
    targetCellId: string,
    credentials: CellUserCredentials,
  ): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${credentials.clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(users)
          .set({
            passwordHash: credentials.passwordHash,
            passwordUpdatedAt: credentials.passwordUpdatedAt,
            totpSecretCiphertext: credentials.totpSecretCiphertext,
            totpKeyId: credentials.totpKeyId,
            totpEnabledAt: credentials.totpEnabledAt,
            totpPendingSecretCiphertext: credentials.totpPendingSecretCiphertext,
            totpPendingKeyId: credentials.totpPendingKeyId,
            totpPendingCreatedAt: credentials.totpPendingCreatedAt,
            totpLastUsedStep: credentials.totpLastUsedStep,
            updatedAt: now,
            updatedBy: "cell_migration",
          })
          .where(eq(users.id, credentials.id));
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.copyCredentialsToCell Failed] ${msg}`, error, {
        targetCellId,
        userId: credentials.id,
      });
      throw new CellUnavailableError(`Fallo en copia de credenciales a celda ${targetCellId}: ${msg}`, targetCellId);
    }
  }

  /**
   * Fase 2: Copia identidades federadas a la celda destino (§5.12).
   */
  async copyIdentitiesToCell(
    targetCellId: string,
    clientId: string,
    userId: string,
    identitiesList: CellIdentitySnapshot[],
  ): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        for (const identity of identitiesList) {
          await tx
            .insert(identities)
            .values({
              userId,
              provider: identity.provider,
              providerUserId: identity.providerUserId,
              providerEmail: identity.providerEmail ?? null,
              displayName: identity.displayName ?? null,
              avatarUrl: identity.avatarUrl ?? null,
              createdBy: "cell_migration",
              updatedBy: "cell_migration",
            })
            .onConflictDoNothing();
        }
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.copyIdentitiesToCell Failed] ${msg}`, error, {
        targetCellId,
        userId,
      });
      throw new CellUnavailableError(`Fallo al copiar identidades a celda ${targetCellId}: ${msg}`, targetCellId);
    }
  }

  /**
   * Fase 3: Limpia contraseñas y secretos de la celda de origen (§5.12).
   */
  async cleanupSourceCredentials(
    sourceCellId: string,
    clientId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureCellAvailable(sourceCellId);

    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(users)
          .set({
            passwordHash: null,
            passwordUpdatedAt: null,
            totpSecretCiphertext: null,
            totpKeyId: null,
            totpEnabledAt: null,
            totpPendingSecretCiphertext: null,
            totpPendingKeyId: null,
            totpPendingCreatedAt: null,
            totpLastUsedStep: null,
            updatedAt: now,
            updatedBy: "cell_migration_cleanup",
          })
          .where(eq(users.id, userId));

        // Eliminar identidades federadas de la celda origen
        await tx.delete(identities).where(eq(identities.userId, userId));
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.cleanupSourceCredentials Failed] ${msg}`, error, {
        sourceCellId,
        clientId,
        userId,
      });
      throw new CellUnavailableError(`Fallo en limpieza de celda origen ${sourceCellId}: ${msg}`, sourceCellId);
    }
  }
}

/** Instancia singleton por defecto de {@link DrizzleCellAuthRepository}. */
export const defaultCellAuthRepository = new DrizzleCellAuthRepository();
