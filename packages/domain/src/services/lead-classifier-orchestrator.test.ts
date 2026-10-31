import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  LeadClassifierOrchestrator,
  type ILeadClassifierModelClient,
  type IChatwootConversationGateway,
} from "./lead-classifier-orchestrator";
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
      saveState: vi.fn().mockResolvedValue(ok({ id: "cs-1" })),
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

    expect(mockStateService.saveState).toHaveBeenCalledWith(
      "pg-cell-01",
      "11111111-1111-7111-8111-111111111111",
      expect.objectContaining({
        chatwootConversationId: 1001,
        lastLabel: "lead-caliente",
        prospectId: "p-123",
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

    expect(mockStateService.saveState).not.toHaveBeenCalled();
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

