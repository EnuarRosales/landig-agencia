import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LeadClassifierOrchestrator,
  type ILeadClassifierModelClient,
  type IChatwootConversationGateway,
  type ILeadClassifierSideEffectExecutor,
} from "./lead-classifier-orchestrator";
import {
  buildTenantClassifierPrompt,
  resolveTenantConversationClassification,
  type TenantClassifierLabelDefinition,
} from "./lead-classifier";
import { ok } from "../types/result";
import type { CrmService } from "./crm.service";
import type { ConversationStateService } from "./conversation-state.service";

describe("BOT-002 T-07 · LeadClassifierOrchestrator", () => {
  let mockModelClient: ILeadClassifierModelClient;
  let mockConversationGateway: IChatwootConversationGateway;
  let mockCrmService: any;
  let mockStateService: any;

  beforeEach(() => {
    mockModelClient = {
      classify: vi.fn(),
    };
    mockConversationGateway = {
      updateConversationLabels: vi.fn().mockResolvedValue({
        success: true,
        labels: ["lead-caliente"],
      }),
    };
    mockCrmService = {
      updateProspect: vi.fn().mockResolvedValue(ok({ id: "p-123", tags: ["lead-caliente"] })),
    };
    mockStateService = {
      getState: vi.fn().mockResolvedValue(ok({ lastLabel: "lead-tibio" })),
      applyTurn: vi.fn().mockResolvedValue(ok({ id: "cs-1" })),
    };
  });

  it("clasifica exitosamente con slug válido y propaga a CRM, Chatwoot y ConversationState", async () => {
    (mockModelClient.classify as any).mockResolvedValue("lead-caliente");

    const orchestrator = new LeadClassifierOrchestrator(
      mockModelClient,
      mockConversationGateway,
      mockCrmService as unknown as CrmService,
      mockStateService as unknown as ConversationStateService,
    );

    const result = await orchestrator.classifyAndApply({
      cellId: "pg-cell-01",
      clientId: "11111111-1111-7111-8111-111111111111",
      chatwootAccountId: 10,
      chatwootConversationId: 1001,
      prospectId: "p-123",
      turns: [
        { role: "user", text: "¿Cuánto vale?" },
        { role: "assistant", text: "Vale 50.000 COP" },
        { role: "user", text: "Quiero comprar 2 ya mismo" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.previousLabel).toBe("lead-tibio");
    expect(result.data.newLabel).toBe("lead-caliente");
    expect(result.data.changed).toBe(true);
    expect(result.data.discarded).toBe(false);
    expect(result.data.appliedToCrm).toBe(true);
    expect(result.data.appliedToChatwoot).toBe(true);

    expect(mockStateService.applyTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        cellId: "pg-cell-01",
        clientId: "11111111-1111-7111-8111-111111111111",
        chatwootConversationId: 1001,
        patch: {
          lastLabel: "lead-caliente",
          prospectId: "p-123",
        },
        actor: "bot.classifier",
      }),
    );

    expect(mockCrmService.updateProspect).toHaveBeenCalledWith(
      "pg-cell-01",
      "11111111-1111-7111-8111-111111111111",
      "p-123",
      expect.objectContaining({
        tags: ["lead-caliente"],
      }),
    );

    expect(mockConversationGateway.updateConversationLabels).toHaveBeenCalledWith({
      accountId: 10,
      conversationId: 1001,
      labels: ["lead-caliente"],
      serviceToken: undefined,
    });
  });

  it("descarta una salida inválida del modelo y preserva la etiqueta anterior sin propagar cambios", async () => {
    (mockModelClient.classify as any).mockResolvedValue("cliente_indeciso_o_raro");

    const orchestrator = new LeadClassifierOrchestrator(
      mockModelClient,
      mockConversationGateway,
      mockCrmService as unknown as CrmService,
      mockStateService as unknown as ConversationStateService,
    );

    const result = await orchestrator.classifyAndApply({
      cellId: "pg-cell-01",
      clientId: "11111111-1111-7111-8111-111111111111",
      chatwootAccountId: 10,
      chatwootConversationId: 1001,
      prospectId: "p-123",
      turns: [{ role: "user", text: "Hola" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.previousLabel).toBe("lead-tibio");
    expect(result.data.newLabel).toBe("lead-tibio");
    expect(result.data.changed).toBe(false);
    expect(result.data.discarded).toBe(true);
    expect(result.data.appliedToCrm).toBe(false);
    expect(result.data.appliedToChatwoot).toBe(false);

    expect(mockStateService.applyTurn).not.toHaveBeenCalled();
    expect(mockCrmService.updateProspect).not.toHaveBeenCalled();
    expect(mockConversationGateway.updateConversationLabels).not.toHaveBeenCalled();
  });

  it("descarta 'compra-realizada' si no existe evidencia de pedido", async () => {
    (mockModelClient.classify as any).mockResolvedValue("compra-realizada");

    const orchestrator = new LeadClassifierOrchestrator(
      mockModelClient,
      mockConversationGateway,
      mockCrmService as unknown as CrmService,
      mockStateService as unknown as ConversationStateService,
    );

    const result = await orchestrator.classifyAndApply({
      cellId: "pg-cell-01",
      clientId: "11111111-1111-7111-8111-111111111111",
      chatwootAccountId: 10,
      chatwootConversationId: 1001,
      prospectId: "p-123",
      hasOrderEvidence: false, // Sin pedido registrado
      turns: [{ role: "user", text: "Ya compré por la página" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.discarded).toBe(true);
    expect(result.data.changed).toBe(false);
    expect(result.data.newLabel).toBe("lead-tibio");
    expect(mockConversationGateway.updateConversationLabels).not.toHaveBeenCalled();
  });

  it("acepta 'compra-realizada' cuando existe evidencia de pedido y propaga el cambio", async () => {
    (mockModelClient.classify as any).mockResolvedValue("compra-realizada");

    const orchestrator = new LeadClassifierOrchestrator(
      mockModelClient,
      mockConversationGateway,
      mockCrmService as unknown as CrmService,
      mockStateService as unknown as ConversationStateService,
    );

    const result = await orchestrator.classifyAndApply({
      cellId: "pg-cell-01",
      clientId: "11111111-1111-7111-8111-111111111111",
      chatwootAccountId: 10,
      chatwootConversationId: 1001,
      prospectId: "p-123",
      hasOrderEvidence: true, // Con evidencia de pedido
      turns: [{ role: "user", text: "Acabo de completar el pedido" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.discarded).toBe(false);
    expect(result.data.changed).toBe(true);
    expect(result.data.newLabel).toBe("compra-realizada");
    expect(mockConversationGateway.updateConversationLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ["compra-realizada"],
      }),
    );
  });
});

describe("SPEC-19 · Clasificador Dinámico por Inquilino (Etiquetas Funcionales y Operativas)", () => {
  it("buildTenantClassifierPrompt compila los 5 bloques IDEAL e incorpora etiquetas personalizadas del inquilino", () => {
    const customLabels: TenantClassifierLabelDefinition[] = [
      {
        slug: "cliente-mayorista",
        title: "Cliente Mayorista",
        category: "functional",
        color: "#06B6D4",
        activationRule: "Solicita cotización por más de 12 unidades.",
        sideEffects: [],
      },
      {
        slug: "alerta_vip",
        title: "Alerta VIP",
        category: "operational",
        color: "#8B5CF6",
        activationRule: "Compra corporativa de alto valor.",
        sideEffects: ["handoff_human", "send_email_notification"],
      },
    ];

    const compiled = buildTenantClassifierPrompt(customLabels);
    expect(compiled).toContain("## [I] Intención");
    expect(compiled).toContain("## [D] Detalle");
    expect(compiled).toContain("## [E] Ejemplo");
    expect(compiled).toContain("## [A] Acción");
    expect(compiled).toContain("## [L] Límites");
    expect(compiled).toContain("cliente-mayorista");
    expect(compiled).toContain("#06B6D4");
    expect(compiled).toContain("alerta_vip");
    expect(compiled).toContain("dirigir a agente humano, enviar notificación por correo");
  });

  it("resolveTenantConversationClassification aplica guardarraíl anti-falsos positivos cuando no hay evidencia de pedido", () => {
    const rawJson = JSON.stringify({
      functionalLabel: "compra-realizada",
      operationalLabels: ["nuevo_pedido", "pendiente_pago"],
      reason: "Preguntó cuánto cuesta con envío",
    });

    const withoutEvidence = resolveTenantConversationClassification({
      rawOutput: rawJson,
      hasOrderEvidence: false,
    });
    expect(withoutEvidence.functionalLabel).toBe("lead-caliente");
    expect(withoutEvidence.functionalColor).toBe("#F97316");
    expect(withoutEvidence.operationalLabels).toEqual(["pendiente_pago"]);

    const withEvidence = resolveTenantConversationClassification({
      rawOutput: rawJson,
      hasOrderEvidence: true,
    });
    expect(withEvidence.functionalLabel).toBe("compra-realizada");
    expect(withEvidence.functionalColor).toBe("#10B981");
    expect(withEvidence.operationalLabels).toContain("nuevo_pedido");
    expect(withEvidence.triggeredSideEffects).toContain("register_order");
    expect(withEvidence.triggeredSideEffects).toContain("send_email_notification");
  });

  it("classifyTenantConversation sincroniza color orientativo y ejecuta handoff humano, pausa del bot y correo en etiquetas operativas", async () => {
    const mockModelClient: ILeadClassifierModelClient = {
      classify: vi.fn().mockResolvedValue(
        JSON.stringify({
          functionalLabel: "devolucion",
          operationalLabels: ["soporte_humano"],
          reason: "Reclama garantía y pide hablar con asesor humano",
        }),
      ),
    };
    const mockConversationGateway: IChatwootConversationGateway = {
      updateConversationLabels: vi.fn().mockResolvedValue({
        success: true,
        labels: ["devolucion", "soporte_humano"],
      }),
      handoffToHumanAgent: vi.fn().mockResolvedValue({ success: true }),
    };
    const mockCrmService = {
      updateProspect: vi.fn().mockResolvedValue(ok({ id: "p-123" })),
    };
    const mockStateService = {
      getState: vi.fn().mockResolvedValue(ok({ lastLabel: "lead-tibio" })),
      applyTurn: vi.fn().mockResolvedValue(ok({ id: "cs-1" })),
    };
    const mockSideEffects: ILeadClassifierSideEffectExecutor = {
      pauseBotForConversation: vi.fn().mockResolvedValue(undefined),
      sendOperationalEmailAlert: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new LeadClassifierOrchestrator(
      mockModelClient,
      mockConversationGateway,
      mockCrmService as unknown as CrmService,
      mockStateService as unknown as ConversationStateService,
      mockSideEffects,
    );

    const res = await orchestrator.classifyTenantConversation({
      cellId: "pg-cell-01",
      clientId: "11111111-1111-7111-8111-111111111111",
      chatwootAccountId: 10,
      chatwootConversationId: 1001,
      prospectId: "p-123",
      turns: [{ role: "user", text: "El producto llegó roto, pásame con un asesor humano" }],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.functionalLabel).toBe("devolucion");
    expect(res.data.functionalColor).toBe("#EF4444");
    expect(res.data.operationalLabels).toEqual(["soporte_humano"]);
    expect(res.data.executedSideEffects).toEqual(
      expect.arrayContaining(["handoff_human", "pause_bot", "send_email_notification"]),
    );

    expect(mockConversationGateway.handoffToHumanAgent).toHaveBeenCalledTimes(1);
    expect(mockSideEffects.pauseBotForConversation).toHaveBeenCalledTimes(1);
    expect(mockSideEffects.sendOperationalEmailAlert).toHaveBeenCalledTimes(1);
  });
});


