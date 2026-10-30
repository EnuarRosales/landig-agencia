import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import { cellUsers, cellIdentities } from "../db/schemas/tenant";
import {
  type ICellAuthRepository,
  type CellUserCredentials,
  type CellIdentitySnapshot,
  type ExpandCellUserParams,
  CellUnavailableError,
} from "./cell-auth.repository.interface";
import { appLogger } from "../utils/logger";

/**
 * Evaluador asíncrono de salud y conectividad para una celda de datos (`pg-cell-XX`, AUTH-001 T-27, DAT-001 §4.4).
 */
export type CellConnectionChecker = (cellId: string) => Promise<boolean>;

/**
 * Proveedor de instancias Drizzle conectadas al pool (PgBouncer) de una celda de datos específica.
 */
export type CellDatabaseProvider = (cellId?: string) => PostgresJsDatabase<typeof schema>;

/**
 * Implementación Drizzle de persistencia y consulta de credenciales delegada al Cell Data Plane
 * bajo aislamiento Row-Level Security (`app.current_client_id`, AUTH-001 T-04 y T-27).
 */
export class DrizzleCellAuthRepository implements ICellAuthRepository {
  /**
   * Crea una instancia de {@link DrizzleCellAuthRepository}.
   *
   * @param dbProvider - Función que resuelve la conexión Drizzle para la celda solicitada.
   * @param cellHealthChecker - Evaluador opcional de disponibilidad previa de la celda.
   */
  constructor(
    private readonly dbProvider: CellDatabaseProvider = () => getDb(),
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) {}

  private getDbForCell(cellId: string): PostgresJsDatabase<typeof schema> {
    return this.dbProvider(cellId);
  }

  /**
   * Valida la disponibilidad de la celda antes de abrir cualquier transacción (principio Fail-Closed).
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
   * Consulta las credenciales y secretos TOTP de un usuario en su celda asignada fijando el contexto RLS.
   */
  async findUserCredentialsInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellUserCredentials | null> {
    await this.ensureCellAvailable(cellId);

    try {
      return await this.getDbForCell(cellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const rows = await tx
          .select()
          .from(cellUsers)
          .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, userId)))
          .limit(1);

        const row = rows[0];
        if (!row) {
          return null;
        }

        return {
          id: row.id,
          clientId: row.clientId,
          email: row.email,
          passwordHash: row.passwordHash ?? null,
          passwordUpdatedAt: row.passwordUpdatedAt ?? null,
          totpSecretCiphertext: (row.totpSecretCiphertext as unknown as Buffer) ?? null,
          totpKeyId: row.totpKeyId ?? null,
          totpEnabledAt: row.totpEnabledAt ?? null,
          totpPendingSecretCiphertext:
            (row.totpPendingSecretCiphertext as unknown as Buffer) ?? null,
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
   * Actualiza el hash Argon2id de contraseña en la celda asignada bajo aislamiento RLS.
   */
  async updatePasswordHashInCell(
    cellId: string,
    clientId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.ensureCellAvailable(cellId);

    try {
      await this.getDbForCell(cellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(cellUsers)
          .set({
            passwordHash,
            passwordUpdatedAt: now,
            updatedAt: now,
            updatedBy: "cell_auth_rehash",
          })
          .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, userId)));
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
      throw new CellUnavailableError(
        `Fallo al actualizar hash en celda ${cellId}: ${msg}`,
        cellId,
      );
    }
  }

  /**
   * Actualiza el último paso temporal TOTP aceptado en la celda asignada bajo aislamiento RLS.
   */
  async updateTotpLastUsedStepInCell(
    cellId: string,
    clientId: string,
    userId: string,
    step: number,
  ): Promise<void> {
    await this.ensureCellAvailable(cellId);

    try {
      await this.getDbForCell(cellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .update(cellUsers)
          .set({
            totpLastUsedStep: step,
            updatedAt: now,
            updatedBy: "cell_auth_totp",
          })
          .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, userId)));
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
      throw new CellUnavailableError(
        `Fallo al actualizar TOTP step en celda ${cellId}: ${msg}`,
        cellId,
      );
    }
  }

  /**
   * Lista las identidades federadas asociadas al usuario en la celda bajo aislamiento RLS.
   */
  async listUserIdentitiesInCell(
    cellId: string,
    clientId: string,
    userId: string,
  ): Promise<CellIdentitySnapshot[]> {
    await this.ensureCellAvailable(cellId);

    try {
      return await this.getDbForCell(cellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const rows = await tx
          .select()
          .from(cellIdentities)
          .where(and(eq(cellIdentities.clientId, clientId), eq(cellIdentities.userId, userId)));

        return rows.map((row) => ({
          provider: row.provider as "google" | "facebook",
          providerUserId: row.providerUserId,
          providerEmail: row.providerEmail ?? null,
          emailVerified: row.emailVerified,
          displayName: row.displayName ?? null,
          avatarUrl: row.avatarUrl ?? null,
          linkedAt: row.linkedAt,
          lastLoginAt: row.lastLoginAt ?? null,
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
      throw new CellUnavailableError(
        `Fallo al consultar identidades en celda ${cellId}: ${msg}`,
        cellId,
      );
    }
  }

  /**
   * Fase 1 (Expandir): Crea o actualiza la proyección `admin.users` en la celda destino preservando `id` bajo RLS (AUTH-001 §5.12).
   */
  async expandCellUser(targetCellId: string, user: ExpandCellUserParams): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.getDbForCell(targetCellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${user.clientId}, true)`,
        );

        const now = new Date();
        const normalizedEmail = user.email.trim().toLowerCase();
        await tx
          .insert(cellUsers)
          .values({
            id: user.id,
            clientId: user.clientId,
            email: normalizedEmail,
            emailVerifiedAt: user.emailVerifiedAt,
            status: user.status,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
            createdBy: "cell_migration",
            updatedBy: "cell_migration",
          })
          .onConflictDoUpdate({
            target: [cellUsers.clientId, cellUsers.id],
            set: {
              email: normalizedEmail,
              emailVerifiedAt: user.emailVerifiedAt,
              status: user.status,
              displayName: user.displayName ?? null,
              avatarUrl: user.avatarUrl ?? null,
              updatedAt: now,
              updatedBy: "cell_migration",
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
        clientId: user.clientId,
        userId: user.id,
      });
      throw new CellUnavailableError(
        `Fallo en expansión a celda destino ${targetCellId}: ${msg}`,
        targetCellId,
      );
    }
  }

  /**
   * Fase 2 (Copiar): Copia el hash de contraseña y los secretos TOTP a la celda destino bajo RLS (AUTH-001 §5.12).
   */
  async copyCredentialsToCell(
    targetCellId: string,
    credentials: CellUserCredentials,
  ): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.getDbForCell(targetCellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${credentials.clientId}, true)`,
        );

        const now = new Date();
        const passwordUpdatedAt =
          credentials.passwordHash !== null
            ? (credentials.passwordUpdatedAt ?? now)
            : null;

        await tx
          .update(cellUsers)
          .set({
            passwordHash: credentials.passwordHash,
            passwordUpdatedAt,
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
          .where(
            and(
              eq(cellUsers.clientId, credentials.clientId),
              eq(cellUsers.id, credentials.id),
            ),
          );
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.copyCredentialsToCell Failed] ${msg}`, error, {
        targetCellId,
        clientId: credentials.clientId,
        userId: credentials.id,
      });
      throw new CellUnavailableError(
        `Fallo en copia de credenciales a celda ${targetCellId}: ${msg}`,
        targetCellId,
      );
    }
  }

  /**
   * Fase 2 (Copiar): Copia identidades federadas a la celda destino preservando `client_id` bajo RLS (AUTH-001 §5.12).
   */
  async copyIdentitiesToCell(
    targetCellId: string,
    clientId: string,
    userId: string,
    identitiesList: CellIdentitySnapshot[],
  ): Promise<void> {
    await this.ensureCellAvailable(targetCellId);

    try {
      await this.getDbForCell(targetCellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        for (const identity of identitiesList) {
          await tx
            .insert(cellIdentities)
            .values({
              clientId,
              userId,
              provider: identity.provider,
              providerUserId: identity.providerUserId,
              providerEmail: identity.providerEmail ?? null,
              emailVerified: identity.emailVerified ?? false,
              displayName: identity.displayName ?? null,
              avatarUrl: identity.avatarUrl ?? null,
              ...(identity.linkedAt ? { linkedAt: identity.linkedAt } : {}),
              lastLoginAt: identity.lastLoginAt ?? null,
              createdBy: "cell_migration",
              updatedBy: "cell_migration",
            })
            .onConflictDoUpdate({
              target: [
                cellIdentities.clientId,
                cellIdentities.provider,
                cellIdentities.providerUserId,
              ],
              set: {
                providerEmail: identity.providerEmail ?? null,
                emailVerified: identity.emailVerified ?? false,
                displayName: identity.displayName ?? null,
                avatarUrl: identity.avatarUrl ?? null,
                lastLoginAt: identity.lastLoginAt ?? null,
                updatedAt: now,
                updatedBy: "cell_migration",
              },
            });
        }
      });
    } catch (error) {
      if (error instanceof CellUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[CellAuthRepository.copyIdentitiesToCell Failed] ${msg}`, error, {
        targetCellId,
        clientId,
        userId,
      });
      throw new CellUnavailableError(
        `Fallo al copiar identidades a celda ${targetCellId}: ${msg}`,
        targetCellId,
      );
    }
  }

  /**
   * Fase 3 (Conmutar/Limpiar): Limpia contraseñas, secretos TOTP e identidades federadas de la celda origen bajo RLS (AUTH-001 §5.12).
   */
  async cleanupSourceCredentials(
    sourceCellId: string,
    clientId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureCellAvailable(sourceCellId);

    try {
      await this.getDbForCell(sourceCellId).transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.current_client_id', ${clientId}, true)`,
        );

        const now = new Date();
        await tx
          .delete(cellIdentities)
          .where(and(eq(cellIdentities.clientId, clientId), eq(cellIdentities.userId, userId)));

        await tx
          .update(cellUsers)
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
          .where(and(eq(cellUsers.clientId, clientId), eq(cellUsers.id, userId)));
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
      throw new CellUnavailableError(
        `Fallo en limpieza de celda origen ${sourceCellId}: ${msg}`,
        sourceCellId,
      );
    }
  }
}

/** Instancia singleton por defecto de {@link DrizzleCellAuthRepository}. */
export const defaultCellAuthRepository = new DrizzleCellAuthRepository();
