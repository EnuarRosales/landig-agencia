import type {
  CellConversationState,
  NewCellConversationState,
} from "../db/schemas/tenant/conversation-state";

/**
 * Contrato de persistencia del estado de conversación del motor BOT-002 en la celda.
 */
export interface IConversationStateRepository {
  /** Consulta el estado de una conversación de Chatwoot bajo RLS del inquilino. */
  findByConversation(
    cellId: string,
    clientId: string,
    chatwootConversationId: number,
  ): Promise<CellConversationState | null>;

  /** Inserta o actualiza (por `client_id` + conversación) el estado de la conversación. */
  upsert(
    cellId: string,
    clientId: string,
    state: Omit<NewCellConversationState, "clientId">,
  ): Promise<CellConversationState>;
}

