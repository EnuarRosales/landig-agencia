import { ok, err, type Result } from "../types/result";
import type { IConversationStateRepository } from "../repositories/conversation-state.repository.interface";
import type { CellConversationState } from "../db/schemas/tenant/conversation-state";
import type { LeadLabel } from "./lead-classifier";

/** Cambios parciales del estado producidos por un turno. */
export interface ConversationStatePatch {
  prospectId?: string | null;
  productId?: string | null;
  quantity?: number | null;
  city?: string | null;
  customerName?: string | null;
  shippingMethod?: "home" | "office" | null;
  stage?: CellConversationState["stage"];
  lastLabel?: LeadLabel | null;
  configVersion?: number | null;
}

/**
 * Mantiene el estado de conversación como variables (BOT-002 T-06): el prompt consume solo
 * lo que cada bloque necesita y no crece con el historial.
 */
export class ConversationStateService {
  constructor(private readonly repo: IConversationStateRepository) {}

  /**
   * Aplica un patch conservando los campos no enviados. Cambiar de producto no borra ciudad ni
   * nombre; solo `undefined` significa «sin cambio» (`null` limpia el campo).
   */
  async applyTurn(params: {
    cellId: string;
    clientId: string;
    chatwootConversationId: number;
    patch: ConversationStatePatch;
    actor?: string;
  }): Promise<Result<CellConversationState>> {
    const { cellId, clientId, chatwootConversationId, patch, actor = "bot" } = params;

    if (patch.quantity !== undefined && patch.quantity !== null && patch.quantity <= 0) {
      return err("La cantidad debe ser mayor a cero.", "STATE_INVALID_QUANTITY");
    }

    const current = await this.repo.findByConversation(cellId, clientId, chatwootConversationId);

    const saved = await this.repo.upsert(cellId, clientId, {
      chatwootConversationId,
      prospectId: patch.prospectId !== undefined ? patch.prospectId : (current?.prospectId ?? null),
      productId: patch.productId !== undefined ? patch.productId : (current?.productId ?? null),
      quantity: patch.quantity !== undefined ? patch.quantity : (current?.quantity ?? null),
      city: patch.city !== undefined ? patch.city : (current?.city ?? null),
      customerName:
        patch.customerName !== undefined ? patch.customerName : (current?.customerName ?? null),
      shippingMethod:
        patch.shippingMethod !== undefined
          ? patch.shippingMethod
          : (current?.shippingMethod ?? null),
      stage: patch.stage ?? current?.stage ?? "greeting",
      lastLabel: patch.lastLabel !== undefined ? patch.lastLabel : (current?.lastLabel ?? null),
      configVersion:
        patch.configVersion !== undefined ? patch.configVersion : (current?.configVersion ?? null),
      lastTurnAt: new Date(),
      createdBy: actor,
      updatedBy: actor,
    });

    return ok(saved);
  }

  /** Obtiene el estado vigente o `null` si la conversación es nueva. */
  async getState(
    cellId: string,
    clientId: string,
    chatwootConversationId: number,
  ): Promise<Result<CellConversationState | null>> {
    return ok(await this.repo.findByConversation(cellId, clientId, chatwootConversationId));
  }
}
