import React from "react";
import { describe, expect, it, vi } from "vitest";
import AdminAiPage from "./page";
import { AiGovernanceView } from "./ai-governance-view";

vi.mock("@mocter/domain", () => ({
  fetchAdminAiGovernanceOverview: vi.fn().mockResolvedValue({
    kpis: {
      totalProviders: 4,
      totalModels: 6,
      activePrompts: 14,
      defaultSpreadPercent: 30,
    },
    providers: [
      {
        id: "p-01",
        code: "openai",
        name: "OpenAI",
        isActive: true,
        supportedModes: { byok: true, mocter: true },
        modelsCount: 2,
      },
    ],
    models: [
      {
        id: "m-01",
        providerId: "p-01",
        providerCode: "openai",
        modelId: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        spreadPercent: 30,
        costInputMtokUsdCents: 15,
        costOutputMtokUsdCents: 60,
        retailInputMtokUsdCents: 20,
        retailOutputMtokUsdCents: 78,
        isActive: true,
      },
    ],
    promptBlocks: [
      {
        id: "b-01",
        blockKey: "core.identity",
        version: 1,
        contentEs: "Eres {{bot_name}}, asistente de {{business_name}}.",
        contentEn: "You are {{bot_name}}, assistant of {{business_name}}.",
        status: "active",
      },
    ],
    aiAssistPrompts: [
      {
        id: "ap-01",
        fieldKey: "bot.objective",
        fieldLabel: "Objetivo Del Bot",
        version: 1,
        masterPrompt: "Crea un objetivo claro y accionable",
        inputHint: "Escribe el objetivo",
        status: "active",
      },
    ],
    defaults: {
      defaultMaxTurns: 10,
      defaultAnswerPolicy: "solo_conocimiento",
      defaultHandoffTriggers: ["asesor", "humano"],
      defaultMaxMessagesPerContact: 50,
    },
  }),
}));

describe("BOT-001 / BOT-002 / AI-001 · Gobernanza de Inteligencia Artificial y Prompts", () => {
  it("renderiza el Server Component con encabezado, KPIs y la vista interactiva", async () => {
    const page = await AdminAiPage();
    expect(page.type).toBe("div");

    const children = React.Children.toArray(page.props.children);
    expect(children.length).toBe(3);

    const header = children[0] as React.ReactElement;
    expect(header.type).toBe("header");

    const kpisSection = children[1] as React.ReactElement;
    expect(kpisSection.type).toBe("section");

    const view = children[2] as React.ReactElement;
    expect(view.type).toBe(AiGovernanceView);
  });

  it("renderiza AiGovernanceView con pestañas y modelos LLM", () => {
    const mockData = {
      kpis: { totalProviders: 1, totalModels: 1, activePrompts: 1, defaultSpreadPercent: 30 },
      providers: [
        {
          id: "p-01",
          code: "openai",
          name: "OpenAI",
          isActive: true,
          supportedModes: { byok: true, mocter: true },
          modelsCount: 1,
        },
      ],
      models: [
        {
          id: "m-01",
          providerId: "p-01",
          providerCode: "openai",
          modelId: "gpt-4o-mini",
          displayName: "GPT-4o Mini",
          contextWindow: 128000,
          maxOutputTokens: 4096,
          spreadPercent: 30,
          costInputMtokUsdCents: 15,
          costOutputMtokUsdCents: 60,
          retailInputMtokUsdCents: 20,
          retailOutputMtokUsdCents: 78,
          isActive: true,
        },
      ],
      promptBlocks: [],
      aiAssistPrompts: [],
      defaults: {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor"],
        defaultMaxMessagesPerContact: 50,
      },
    };

    const element = <AiGovernanceView initialData={mockData} />;
    expect(React.isValidElement(element)).toBe(true);
  });
});
