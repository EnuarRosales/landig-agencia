import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client";
import * as schema from "../db/schemas";
import {
  cellConversationState,
  type CellConversationState,
  type NewCellConversationState,
} from "../db/schemas/tenant/conversation-state";
import type { IConversationStateRepository } from "./conversation-state.repository.interface";
import type {
  CellConnectionChecker,
  CellDatabaseProvider,
} from "./drizzle-cell-auth.repository";
import { CellUnavailableError } from "./cell-auth.repository.interface";

/**
 * Implementación Drizzle del estado de conversación; fija `app.current_client_id` por transacción
 * para cumplir `FORCE ROW LEVEL SECURITY`.
 */
export class DrizzleConversationStateRepository implements IConversationStateRepository {
  constructor(
    private readonly dbProvider: CellDatabaseProvider = () => getDb(),
    private readonly cellHealthChecker?: CellConnectionChecker,
  ) {}

  private async dbFor(cellId: string): Promise<PostgresJsDatabase<typeof schema>> {
    if (this.cellHealthChecker && !(await this.cellHealthChecker(cellId))) {
      throw new CellUnavailableError(`Celda ${cellId} fuera de servicio.`, cellId);
    }
    return this.dbProvider(cellId);
  }

  async findByConversation(
    cellId: string,
    clientId: string,
    chatwootConversationId: number,
  ): Promise<CellConversationState | null> {
    const db = await this.dbFor(cellId);
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const [row] = await tx
        .select()
        .from(cellConversationState)
        .where(
          and(
            eq(cellConversationState.clientId, clientId),
            eq(cellConversationState.chatwootConversationId, chatwootConversationId),
          ),
        )
        .limit(1);
      return row ?? null;
    });
  }

  async upsert(
    cellId: string,
    clientId: string,
    state: Omit<NewCellConversationState, "clientId">,
  ): Promise<CellConversationState> {
    const db = await this.dbFor(cellId);
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_client_id', ${clientId}, true)`);
      const { id: _ignoredId, createdBy: _ignoredCreatedBy, ...mutable } = state;
      const [row] = await tx
        .insert(cellConversationState)
        .values({ ...state, clientId })
        .onConflictDoUpdate({
          target: [cellConversationState.clientId, cellConversationState.chatwootConversationId],
          set: { ...mutable, updatedAt: sql`NOW()` },
        })
        .returning();
      if (!row) {
        throw new Error("No fue posible persistir el estado de la conversación.");
      }
      return row;
    });
  }
}

