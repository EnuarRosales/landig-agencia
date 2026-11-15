import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import {
  LEAD_LABELS,
  buildTenantClassifierPrompt,
  resolveLeadLabel,
  resolveTenantConversationClassification,
  selectClassifierWindow,
  type ClassifierTurn,
  type LeadLabel,
  type OperationalSideEffect,
  type TenantClassifierLabelDefinition,
} from "./lead-classifier";
import type { CrmService } from "./crm.service";
import type { ConversationStateService } from "./conversation-state.service";

/**
 * Cliente de Chatwoot para actualizar etiquetas y dirigir conversaciones en una cuenta (CHW-001 / ADM-001 / SPEC-19).
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

  /**
   * Opcional: Dirige/transfiere la conversación a atención humana en Chatwoot (`handoff_human`, SPEC-19 D-03).
   */
  handoffToHumanAgent?(params: {
    accountId: number;
    conversationId: number;
    reasonLabel: string;
    orientationColor?: string | null;
    serviceToken?: string;
  }): Promise<{ success: boolean }>;
}

/**
 * Puerto opcional para ejecutar efectos secundarios operativos disparados por etiquetas (`SPEC-19 D-03`).
 */
export interface ILeadClassifierSideEffectExecutor {
  /** Pausa el bot automático en la conversación activa (`pause_bot`). */
  pauseBotForConversation?(params: {
    cellId: string;
    clientId: string;
    chatwootConversationId: number;
    reasonLabels: string[];
  }): Promise<void>;

  /** Envía notificación por correo electrónico al comercio (`send_email_notification`, NTF-001). */
  sendOperationalEmailAlert?(params: {
    cellId: string;
    clientId: string;
    chatwootConversationId: number;
    functionalLabel: string | null;
    operationalLabels: string[];
  }): Promise<void>;
}

/**
 * Inferencia de clasificación de leads: corre sobre los últimos turnos (RF-04.4).
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
 * Entrada para la clasificación dinámica multidimensional por inquilino (SPEC-19 D-03).
 */
export interface ClassifyTenantConversationInput extends ClassifyAndApplyLeadInput {
  locale?: "es" | "en";
  /** Etiquetas personalizadas del inquilino (Funcionales y Operativas) en `cell_tenant_labels`. */
  customLabels?: ReadonlyArray<TenantClassifierLabelDefinition>;
  /** Etiquetas operativas activas previamente en la conversación. */
  previousOperationalLabels?: string[];
}

/**
 * Resultado de la clasificación dinámica multidimensional (Funcional + Operativa) por inquilino (SPEC-19 D-03).
 */
export interface ClassifyTenantConversationResult {
  previousFunctionalLabel: string | null;
  functionalLabel: string | null;
  /** Color hexadecimal orientativo para la conversación en Chatwoot según la etiqueta funcional activa. */
  functionalColor: string | null;
  operationalLabels: string[];
  allLabels: string[];
  triggeredSideEffects: OperationalSideEffect[];
  executedSideEffects: OperationalSideEffect[];
  changed: boolean;
  discarded: boolean;
  appliedToCrm: boolean;
  appliedToChatwoot: boolean;
}

/**
 * Orquestador del clasificador de conversaciones y leads (BOT-002 T-07, RF-04, SPEC-19 D-03).
 *
 * Soporta:
 * 1. `classifyAndApply`: modo canónico de 4 slugs base (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`).
 * 2. `classifyTenantConversation`: modo dinámico por inquilino bajo metodología IDEAL que evalúa
 *    Etiquetas Funcionales (embudo + color orientativo en Chatwoot) y Etiquetas Operativas
 *    (estado/acción: dirigir a agente humano, pausar el bot o enviar notificación por correo).
 */
export class LeadClassifierOrchestrator {
  constructor(
    private readonly modelClient: ILeadClassifierModelClient,
    private readonly conversationGateway?: IChatwootConversationGateway,
    private readonly crmService?: CrmService,
    private readonly stateService?: ConversationStateService,
    private readonly sideEffectExecutor?: ILeadClassifierSideEffectExecutor,
  ) {}

  /**
   * Clasifica la conversación y propaga la etiqueta resultante (modo canónico BOT-002).
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
          await this.stateService.applyTurn({
            cellId: input.cellId,
            clientId: input.clientId,
            chatwootConversationId: input.chatwootConversationId,
            patch: {
              lastLabel: label,
              prospectId: input.prospectId,
            },
            actor: "bot.classifier",
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
    } catch (err_: unknown) {
      const msg = err_ instanceof Error ? err_.message : String(err_);
      appLogger.error(`[LeadClassifier] Error inesperado en orquestador de clasificación: ${msg}`, err_);
      return err(msg, "CLASSIFIER_ERROR");
    }
  }

  /**
   * Clasifica dinámicamente la conversación evaluando el catálogo del inquilino
   * (Etiquetas Funcionales con color orientativo en Chatwoot + Etiquetas Operativas con sideEffects)
   * bajo la metodología secuencial IDEAL (SPEC-19 D-03, RF-SPEC-19-07).
   */
  async classifyTenantConversation(
    input: ClassifyTenantConversationInput,
  ): Promise<Result<ClassifyTenantConversationResult>> {
    try {
      const window = selectClassifierWindow(input.turns, 20);
      const prompt =
        input.systemPrompt ??
        buildTenantClassifierPrompt(input.customLabels ?? [], input.locale ?? "es");

      let previousFunctionalLabel: string | null = null;
      if (this.stateService) {
        const stateRes = await this.stateService.getState(
          input.cellId,
          input.clientId,
          input.chatwootConversationId,
        );
        if (stateRes.ok && stateRes.data?.lastLabel) {
          previousFunctionalLabel = stateRes.data.lastLabel.trim().toLowerCase();
        }
      }

      const rawOutput = await this.modelClient.classify({
        systemPrompt: prompt,
        turns: window,
      });

      const resolved = resolveTenantConversationClassification({
        rawOutput,
        customLabels: input.customLabels,
        previousFunctionalLabel,
        previousOperationalLabels: input.previousOperationalLabels,
        hasOrderEvidence: input.hasOrderEvidence,
      });

      let appliedToCrm = false;
      let appliedToChatwoot = false;
      const executedSideEffects: OperationalSideEffect[] = [];

      if (resolved.changed && resolved.allLabels.length > 0) {
        if (this.stateService && resolved.functionalLabel) {
          const safeStateLabel: LeadLabel | undefined = LEAD_LABELS.includes(
            resolved.functionalLabel as LeadLabel,
          )
            ? (resolved.functionalLabel as LeadLabel)
            : undefined;
          await this.stateService.applyTurn({
            cellId: input.cellId,
            clientId: input.clientId,
            chatwootConversationId: input.chatwootConversationId,
            patch: {
              ...(safeStateLabel ? { lastLabel: safeStateLabel } : {}),
              prospectId: input.prospectId,
            },
            actor: "bot.classifier.ideal",
          });
        }

        if (this.crmService && input.prospectId) {
          const updateRes = await this.crmService.updateProspect(
            input.cellId,
            input.clientId,
            input.prospectId,
            {
              tags: resolved.allLabels,
              updatedBy: "bot.classifier.ideal",
            },
          );
          if (updateRes.ok) {
            appliedToCrm = true;
          }
        }

        if (this.conversationGateway) {
          try {
            await this.conversationGateway.updateConversationLabels({
              accountId: input.chatwootAccountId,
              conversationId: input.chatwootConversationId,
              labels: resolved.allLabels,
              serviceToken: input.serviceToken,
            });
            appliedToChatwoot = true;
          } catch (cwError) {
            appLogger.warn("[LeadClassifier] Error al sincronizar etiquetas multidimensionales en Chatwoot", {
              error: cwError instanceof Error ? cwError.message : String(cwError),
              conversationId: input.chatwootConversationId,
            });
          }
        }

        // Ejecutar efectos secundarios operativos (handoff_human, pause_bot, send_email_notification)
        for (const effect of resolved.triggeredSideEffects) {
          if (effect === "handoff_human") {
            if (this.conversationGateway?.handoffToHumanAgent) {
              await this.conversationGateway.handoffToHumanAgent({
                accountId: input.chatwootAccountId,
                conversationId: input.chatwootConversationId,
                reasonLabel: resolved.operationalLabels[0] ?? resolved.functionalLabel ?? "soporte_humano",
                orientationColor: resolved.functionalColor,
                serviceToken: input.serviceToken,
              });
            }
            executedSideEffects.push("handoff_human");
          } else if (effect === "pause_bot") {
            if (this.sideEffectExecutor?.pauseBotForConversation) {
              await this.sideEffectExecutor.pauseBotForConversation({
                cellId: input.cellId,
                clientId: input.clientId,
                chatwootConversationId: input.chatwootConversationId,
                reasonLabels: resolved.operationalLabels,
              });
            }
            executedSideEffects.push("pause_bot");
          } else if (effect === "send_email_notification") {
            if (this.sideEffectExecutor?.sendOperationalEmailAlert) {
              await this.sideEffectExecutor.sendOperationalEmailAlert({
                cellId: input.cellId,
                clientId: input.clientId,
                chatwootConversationId: input.chatwootConversationId,
                functionalLabel: resolved.functionalLabel,
                operationalLabels: resolved.operationalLabels,
              });
            }
            executedSideEffects.push("send_email_notification");
          } else if (effect === "register_order") {
            executedSideEffects.push("register_order");
          }
        }
      }

      return ok({
        previousFunctionalLabel,
        functionalLabel: resolved.functionalLabel,
        functionalColor: resolved.functionalColor,
        operationalLabels: resolved.operationalLabels,
        allLabels: resolved.allLabels,
        triggeredSideEffects: resolved.triggeredSideEffects,
        executedSideEffects,
        changed: resolved.changed,
        discarded: resolved.discarded,
        appliedToCrm,
        appliedToChatwoot,
      });
    } catch (err_: unknown) {
      const msg = err_ instanceof Error ? err_.message : String(err_);
      appLogger.error(`[LeadClassifier] Error inesperado en classifyTenantConversation: ${msg}`, err_);
      return err(msg, "CLASSIFIER_ERROR");
    }
  }
}
