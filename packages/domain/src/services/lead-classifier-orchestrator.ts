import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import {
  LEAD_LABELS,
  resolveLeadLabel,
  selectClassifierWindow,
  type ClassifierTurn,
  type LeadLabel,
} from "./lead-classifier";
import type { CrmService } from "./crm.service";
import type { ConversationStateService } from "./conversation-state.service";

/**
 * Cliente de Chatwoot para actualizar etiquetas en una conversación específica (CHW-001 / ADM-001).
 */
export interface IChatwootConversationGateway {
  /**
   * Agrega o sincroniza etiquetas en la conversación de Chatwoot.
   */
  updateConversationLabels(params: {
    accountId: number;
    conversationId: number;
    labels: string[];
    serviceToken?: string;
  }): Promise<{ success: boolean; labels: string[] }>;
}

/**
 * Inferencia de clasificación de leads: corre sobre los últimos 10 turnos (RF-04.4).
 */
export interface ILeadClassifierModelClient {
  classify(params: {
    systemPrompt: string;
    turns: ClassifierTurn[];
  }): Promise<string>;
}

export interface ClassifyAndApplyLeadInput {
  cellId: string;
  clientId: string;
  chatwootAccountId: number;
  chatwootConversationId: number;
  prospectId?: string;
  turns: ClassifierTurn[];
  hasOrderEvidence?: boolean;
  systemPrompt?: string;
  serviceToken?: string;
}

export interface ClassifyAndApplyLeadResult {
  previousLabel: LeadLabel | null;
  newLabel: LeadLabel | null;
  changed: boolean;
  discarded: boolean;
  appliedToCrm: boolean;
  appliedToChatwoot: boolean;
}

/**
 * Orquestador del clasificador de leads (BOT-002 T-07, RF-04).
 *
 * Flujo de ejecución:
 * 1. Toma los últimos 10 turnos de la conversación.
 * 2. Ejecuta la llamada separada de inferencia del clasificador.
 * 3. Valida la salida contra los 4 slugs reservados (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`).
 * 4. Si la salida es inválida o es `compra-realizada` sin evidencia de pedido, se descarta y conserva la etiqueta previa.
 * 5. Si la etiqueta es válida y cambió, actualiza:
 *    - El estado de conversación en la celda (`ConversationStateService`).
 *    - Las etiquetas del prospecto en el CRM (`CrmService`).
 *    - La conversación en Chatwoot (`IChatwootConversationGateway`).
 */
export class LeadClassifierOrchestrator {
  constructor(
    private readonly modelClient: ILeadClassifierModelClient,
    private readonly conversationGateway?: IChatwootConversationGateway,
    private readonly crmService?: CrmService,
    private readonly stateService?: ConversationStateService,
  ) {}

  /**
   * Clasifica la conversación y propaga la etiqueta resultante.
   */
  async classifyAndApply(
    input: ClassifyAndApplyLeadInput,
  ): Promise<Result<ClassifyAndApplyLeadResult>> {
    try {
      const window = selectClassifierWindow(input.turns);
      const prompt =
        input.systemPrompt ??
        "Clasifica esta conversación en exactamente uno de: lead-frio, lead-tibio, lead-caliente, compra-realizada.";

      // 1. Obtener estado actual de la conversación si hay servicio disponible
      let previousLabel: LeadLabel | null = null;
      if (this.stateService) {
        const stateRes = await this.stateService.getState(
          input.cellId,
          input.clientId,
          input.chatwootConversationId,
        );
        if (stateRes.ok && stateRes.data?.lastLabel) {
          const prev = stateRes.data.lastLabel.toLowerCase();
          if (LEAD_LABELS.includes(prev as LeadLabel)) {
            previousLabel = prev as LeadLabel;
          }
        }
      }

      // 2. Inferencia en llamada separada
      const rawOutput = await this.modelClient.classify({
        systemPrompt: prompt,
        turns: window,
      });

      // 3. Resolución y validación estricta
      const { label, changed, discarded } = resolveLeadLabel(
        rawOutput,
        previousLabel,
        Boolean(input.hasOrderEvidence),
      );

      let appliedToCrm = false;
      let appliedToChatwoot = false;

      // 4. Si cambió, propagar a Mocter y Chatwoot
      if (changed && label) {
        // Actualizar estado de conversación
        if (this.stateService) {
          await this.stateService.saveState(input.cellId, input.clientId, {
            chatwootConversationId: input.chatwootConversationId,
            lastLabel: label,
            prospectId: input.prospectId,
          });
        }

        // Actualizar prospecto en CRM
        if (this.crmService && input.prospectId) {
          const updateRes = await this.crmService.updateProspect(
            input.cellId,
            input.clientId,
            input.prospectId,
            {
              tags: [label],
              updatedBy: "bot.classifier",
            },
          );
          if (updateRes.ok) {
            appliedToCrm = true;
          } else {
            appLogger.warn("[LeadClassifier] No se pudo actualizar etiquetas del prospecto en CRM", {
              error: updateRes.error,
              prospectId: input.prospectId,
            });
          }
        }

        // Actualizar etiquetas en Chatwoot
        if (this.conversationGateway) {
          try {
            await this.conversationGateway.updateConversationLabels({
              accountId: input.chatwootAccountId,
              conversationId: input.chatwootConversationId,
              labels: [label],
              serviceToken: input.serviceToken,
            });
            appliedToChatwoot = true;
          } catch (cwError) {
            appLogger.warn("[LeadClassifier] Error al actualizar etiquetas en Chatwoot", {
              error: cwError instanceof Error ? cwError.message : String(cwError),
              conversationId: input.chatwootConversationId,
            });
          }
        }

        appLogger.info("[LeadClassifier] Etiqueta de lead actualizada", {
          chatwootConversationId: input.chatwootConversationId,
          previousLabel,
          newLabel: label,
        });
      }

      return ok({
        previousLabel,
        newLabel: label,
        changed,
        discarded,
        appliedToCrm,
        appliedToChatwoot,
      });
    } catch (err_: any) {
      const msg = err_ instanceof Error ? err_.message : String(err_);
      appLogger.error(`[LeadClassifier] Error inesperado en orquestador de clasificación: ${msg}`, err_);
      return err(msg, "CLASSIFIER_ERROR");
    }
  }
}

