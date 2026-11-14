// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminAiPage from "./page";
import { AiGovernanceView } from "./ai-governance-view";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

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
        apiDialect: "openai_compatible",
        baseUrl: "https://api.openai.com",
        verifyPath: "/v1/models",
        logoStorageKey: null,
        logoUrl: null,
        docsUrl: "https://platform.openai.com",
        sortOrder: 10,
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
        defaultTemperature: 0.7,
        defaultMaxTokens: 1000,
        isDefault: true,
        recommendedUse: { es: "Uso general", en: "General use" },
        sortOrder: 10,
        spreadPercent: 30,
        costInputMtokUsdCents: 15,
        costOutputMtokUsdCents: 60,
        retailInputMtokUsdCents: 20,
        retailOutputMtokUsdCents: 78,
        isActive: true,
      },
    ],
    platformKeys: [
      {
        id: "pk-01",
        providerId: "p-01",
        providerCode: "openai",
        providerName: "OpenAI",
        keyId: "trial-openai",
        apiKeyLast4: "8899",
        defaultModelId: "m-01",
        defaultModelCode: "gpt-4o-mini",
        monthlyTokenCap: 500000,
        temperature: 0.7,
        maxTokens: 1000,
        priorityRole: "primary",
        status: "active",
        purpose: "inference",
        updatedAt: "2026-11-14T10:00:00.000Z",
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
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

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

  it("permite registrar/rotar llave de prueba, abrir ConfirmationModal al retirar y editar prompts maestros", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          id: "pk-02",
          providerId: "p-01",
          providerCode: "openai",
          providerName: "OpenAI",
          keyId: "trial-openai",
          apiKeyLast4: "4455",
          defaultModelId: "m-01",
          defaultModelCode: "gpt-4o-mini",
          monthlyTokenCap: 500000,
          temperature: 0.7,
          maxTokens: 1000,
          priorityRole: "primary",
          status: "active",
          purpose: "inference",
          updatedAt: "2026-11-14T16:10:00.000Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const mockData = {
      kpis: { totalProviders: 1, totalModels: 1, activePrompts: 2, defaultSpreadPercent: 30 },
      providers: [
        {
          id: "p-01",
          code: "openai",
          name: "OpenAI",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.openai.com",
          verifyPath: "/v1/models",
          logoStorageKey: null,
          logoUrl: null,
          docsUrl: "https://platform.openai.com",
          sortOrder: 10,
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
          defaultTemperature: 0.7,
          defaultMaxTokens: 1000,
          isDefault: true,
          recommendedUse: { es: "Uso general", en: "General use" },
          sortOrder: 10,
          spreadPercent: 30,
          costInputMtokUsdCents: 15,
          costOutputMtokUsdCents: 60,
          retailInputMtokUsdCents: 20,
          retailOutputMtokUsdCents: 78,
          isActive: true,
        },
      ],
      platformKeys: [
        {
          id: "pk-01",
          providerId: "p-01",
          providerCode: "openai" as const,
          providerName: "OpenAI",
          keyId: "trial-openai",
          apiKeyLast4: "8899",
          defaultModelId: "m-01",
          defaultModelCode: "gpt-4o-mini",
          monthlyTokenCap: 500000,
          temperature: 0.7,
          maxTokens: 1000,
          priorityRole: "primary" as const,
          status: "active",
          purpose: "inference",
          updatedAt: "2026-11-14T10:00:00.000Z",
        },
      ],
      promptBlocks: [],
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
        defaultHandoffTriggers: ["asesor"],
        defaultMaxMessagesPerContact: 50,
      },
    };

    render(<AiGovernanceView initialData={mockData} />);

    // 1. Verifica que se muestra la llave enmascarada existente
    expect(screen.getByText("••••8899")).toBeTruthy();

    // 2. Registra una nueva llave de prueba
    const keyInput = screen.getByLabelText("Clave API Del Proveedor") as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: "sk-proj-test-key-4455" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar Y Activar Llave De Prueba" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/ai",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(keyInput.value).toBe("");
      expect(screen.getByText("••••4455")).toBeTruthy();
    });

    // 3. Abrir ConfirmationModal al retirar la credencial activa
    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Retirar Llave De Prueba De Plataforma")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mantener Activa" }));

    // 4. Pestaña Biblioteca De Prompts Maestros y edición de prompt
    fireEvent.click(screen.getByRole("button", { name: "Biblioteca De Prompts Maestros" }));
    expect(screen.getByText("1 campos activos")).toBeTruthy();
    expect(screen.getByText("Objetivo Del Bot")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Versionar Prompt Maestro: Objetivo Del Bot")).toBeTruthy();
  });

  it("permite crear proveedor LLM con subida de logo, crear modelo con isDefault y abrir ConfirmationModal al eliminar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            storageKey: "ai-providers/deepseek/logo.png",
            logoUrl: "https://cdn.example.com/deepseek.png",
            mimeType: "image/png",
            format: "png",
            sizeBytes: 512,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            id: "p-ds",
            code: "deepseek",
            name: "DeepSeek",
            apiDialect: "openai_compatible",
            baseUrl: "https://api.deepseek.com",
            verifyPath: "/v1/models",
            logoStorageKey: "ai-providers/deepseek/logo.png",
            logoUrl: "https://cdn.example.com/deepseek.png",
            docsUrl: null,
            sortOrder: 20,
            isActive: true,
            supportedModes: { byok: true, mocter: true },
            modelsCount: 0,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            id: "m-ds",
            providerId: "p-ds",
            providerCode: "deepseek",
            modelId: "deepseek-chat",
            displayName: "DeepSeek Chat",
            contextWindow: 64000,
            maxOutputTokens: 4096,
            defaultTemperature: 0.3,
            defaultMaxTokens: 2048,
            isDefault: true,
            recommendedUse: { es: "Uso general", en: "General use" },
            sortOrder: 10,
            spreadPercent: 30,
            costInputMtokUsdCents: 14,
            costOutputMtokUsdCents: 28,
            retailInputMtokUsdCents: 18,
            retailOutputMtokUsdCents: 36,
            isActive: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          code: "AI_RESOURCE_IN_ACTIVE_USE",
          error: "El proveedor tiene llaves activas asociadas y no puede eliminarse.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const mockData = {
      kpis: { totalProviders: 1, totalModels: 1, activePrompts: 1, defaultSpreadPercent: 30 },
      providers: [
        {
          id: "p-01",
          code: "openai",
          name: "OpenAI",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.openai.com",
          verifyPath: "/v1/models",
          logoStorageKey: null,
          logoUrl: null,
          docsUrl: null,
          sortOrder: 10,
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
          defaultTemperature: 0.7,
          defaultMaxTokens: 1000,
          isDefault: true,
          recommendedUse: { es: "Uso general", en: "General use" },
          sortOrder: 10,
          spreadPercent: 30,
          costInputMtokUsdCents: 15,
          costOutputMtokUsdCents: 60,
          retailInputMtokUsdCents: 20,
          retailOutputMtokUsdCents: 78,
          isActive: true,
        },
      ],
      platformKeys: [],
      promptBlocks: [],
      aiAssistPrompts: [],
      defaults: {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor"],
        defaultMaxMessagesPerContact: 50,
      },
    };

    render(<AiGovernanceView initialData={mockData} />);

    // 1. Crear proveedor + subir logo
    fireEvent.click(screen.getByRole("button", { name: /Agregar Proveedor LLM/i }));
    fireEvent.change(screen.getByLabelText("Código De Proveedor (Slug)"), {
      target: { value: "deepseek" },
    });
    fireEvent.change(screen.getByLabelText("Nombre Del Proveedor"), {
      target: { value: "DeepSeek" },
    });
    fireEvent.change(screen.getByLabelText("Url Base De Inferencia"), {
      target: { value: "https://api.deepseek.com" },
    });

    const fileInput = screen.getByLabelText(/Logo Del Proveedor/i) as HTMLInputElement;
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [pngFile] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/ai/providers/logo",
        expect.objectContaining({ method: "POST" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Crear Proveedor" }));
    await waitFor(() => {
      expect(screen.getByText("DeepSeek")).toBeTruthy();
    });

    // 2. Crear modelo con isDefault
    fireEvent.click(screen.getByRole("button", { name: /Agregar Modelo/i }));
    fireEvent.change(screen.getByLabelText("Identificador Del Modelo (Slug Api)"), {
      target: { value: "deepseek-chat" },
    });
    fireEvent.change(screen.getByLabelText("Nombre Visible Del Modelo"), {
      target: { value: "DeepSeek Chat" },
    });
    fireEvent.click(screen.getByLabelText("Modelo Por Defecto Del Proveedor"));
    fireEvent.click(screen.getByRole("button", { name: "Crear Modelo" }));

    await waitFor(() => {
      expect(screen.getByText("DeepSeek Chat")).toBeTruthy();
    });

    // 3. Intentar eliminar proveedor con dependencias activas (409)
    const deleteButtons = screen.getAllByRole("button", { name: "Eliminar" });
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText("Eliminar Proveedor LLM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar Eliminación" }));

    await waitFor(() => {
      expect(
        screen.getByText(/El proveedor tiene llaves activas asociadas y no puede eliminarse/i),
      ).toBeTruthy();
    });
  });

  it("usa verifyPath '/models', acepta AVIF, limita maxTokens<=8192, preserva spread 0% y muestra mensaje 'archivado' ante soft_deleted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            id: "m-zero",
            providerId: "p-01",
            providerCode: "openai",
            modelId: "gpt-zero",
            displayName: "GPT Zero Spread",
            contextWindow: 128000,
            maxOutputTokens: 4096,
            defaultTemperature: 0.7,
            defaultMaxTokens: 1000,
            isDefault: false,
            recommendedUse: { es: "Uso general", en: "General use" },
            sortOrder: 0,
            spreadPercent: 0,
            costInputMtokUsdCents: 10,
            costOutputMtokUsdCents: 20,
            retailInputMtokUsdCents: 10,
            retailOutputMtokUsdCents: 20,
            isActive: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { mode: "soft_deleted", id: "p-01" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const mockData = {
      kpis: { totalProviders: 1, totalModels: 1, activePrompts: 1, defaultSpreadPercent: 30 },
      providers: [
        {
          id: "p-01",
          code: "openai",
          name: "OpenAI",
          apiDialect: "openai_compatible" as const,
          baseUrl: "https://api.openai.com/v1",
          verifyPath: "/models",
          logoStorageKey: null,
          logoUrl: null,
          docsUrl: null,
          sortOrder: 10,
          isActive: true,
          supportedModes: { byok: true, mocter: true },
          modelsCount: 1,
        },
      ],
      models: [],
      platformKeys: [],
      promptBlocks: [],
      aiAssistPrompts: [],
      defaults: {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor"],
        defaultMaxMessagesPerContact: 50,
      },
    };

    render(<AiGovernanceView initialData={mockData} />);

    // 1. Verificar default verifyPath '/models' y accept AVIF en modal proveedor
    fireEvent.click(screen.getByRole("button", { name: /Agregar Proveedor LLM/i }));
    const verifyInput = screen.getByLabelText("Ruta De Verificación") as HTMLInputElement;
    expect(verifyInput.value).toBe("/models");
    const fileInput = screen.getByLabelText(/Logo Del Proveedor/i) as HTMLInputElement;
    expect(fileInput.accept).toContain("image/avif");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    // 2. Verificar spreadPercent: 0 no se sobreescribe a 30
    fireEvent.click(screen.getByRole("button", { name: /Agregar Modelo/i }));
    fireEvent.change(screen.getByLabelText("Identificador Del Modelo (Slug Api)"), {
      target: { value: "gpt-zero" },
    });
    fireEvent.change(screen.getByLabelText("Nombre Visible Del Modelo"), {
      target: { value: "GPT Zero Spread" },
    });
    fireEvent.change(screen.getByLabelText("Spread Comercial (%)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear Modelo" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/ai",
        expect.objectContaining({
          body: expect.stringContaining('"spreadPercent":0'),
        }),
      );
    });

    // 3. Verificar mensaje 'archivado' ante mode='soft_deleted'
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar Eliminación" }));
    await waitFor(() => {
      expect(screen.getByText(/archivado \(mantiene historial de uso\)/i)).toBeTruthy();
    });

    // 4. Verificar max="8192" y opción standby en sección de llaves de plataforma (visible en pestaña Modelos)
    const trialTokens = screen.getByLabelText("Límite Máximo De Tokens") as HTMLInputElement;
    expect(trialTokens.max).toBe("8192");
    const prioritySelect = screen.getByLabelText("Rol De Prioridad") as HTMLSelectElement;
    expect(Array.from(prioritySelect.options).some((o) => o.value === "standby")).toBe(true);
  });

  it("filtra, ordena y pagina la tabla 'Catálogo De Modelos LLM y Spread Comercial' manteniendo lectura limpia", () => {
    const providers = [
      {
        id: "p-openai",
        code: "openai",
        name: "OpenAI",
        apiDialect: "openai_compatible" as const,
        baseUrl: "https://api.openai.com/v1",
        verifyPath: "/models",
        logoStorageKey: null,
        logoUrl: null,
        docsUrl: null,
        sortOrder: 10,
        isActive: true,
        supportedModes: { byok: true, mocter: true },
        modelsCount: 6,
      },
      {
        id: "p-anthropic",
        code: "anthropic",
        name: "Anthropic",
        apiDialect: "anthropic" as const,
        baseUrl: "https://api.anthropic.com/v1",
        verifyPath: "/models",
        logoStorageKey: null,
        logoUrl: null,
        docsUrl: null,
        sortOrder: 20,
        isActive: true,
        supportedModes: { byok: true, mocter: true },
        modelsCount: 6,
      },
    ];

    const models = Array.from({ length: 12 }, (_, idx) => {
      const isAnthropic = idx % 2 === 1;
      const num = idx + 1;
      return {
        id: `m-${num}`,
        providerId: isAnthropic ? "p-anthropic" : "p-openai",
        providerCode: isAnthropic ? "anthropic" : "openai",
        modelId: isAnthropic ? `claude-model-${num}` : `gpt-model-${num}`,
        displayName: isAnthropic ? `Claude Modelo ${num}` : `GPT Modelo ${num}`,
        contextWindow: 128000,
        maxOutputTokens: 4096,
        defaultTemperature: 0.7,
        defaultMaxTokens: 1000,
        isDefault: num === 1 || num === 2,
        recommendedUse: { es: "Uso general", en: "General use" },
        sortOrder: num * 10,
        spreadPercent: 20 + num,
        costInputMtokUsdCents: 10 + num,
        costOutputMtokUsdCents: 40 + num,
        retailInputMtokUsdCents: 20 + num,
        retailOutputMtokUsdCents: 60 + num,
        isActive: num !== 12,
      };
    });

    const mockData = {
      kpis: { totalProviders: 2, totalModels: 12, activePrompts: 0, defaultSpreadPercent: 30 },
      providers,
      models,
      platformKeys: [],
      promptBlocks: [],
      aiAssistPrompts: [],
      defaults: {
        defaultMaxTurns: 10,
        defaultAnswerPolicy: "solo_conocimiento",
        defaultHandoffTriggers: ["asesor"],
        defaultMaxMessagesPerContact: 50,
      },
    };

    render(<AiGovernanceView initialData={mockData} />);

    // 1. Paginación inicial por defecto: 10 filas por página -> 12 modelos => 2 páginas
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 1–10 de 12 modelos",
    );
    expect(screen.getByText("Página 1 de 2")).toBeTruthy();

    // 2. Cambiar tamaño de página a 5 filas y navegar a página 2
    fireEvent.change(screen.getByLabelText("Filas Por Página"), { target: { value: "5" } });
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 1–5 de 12 modelos",
    );
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 6–10 de 12 modelos",
    );
    expect(screen.getByText("Página 2 de 3")).toBeTruthy();

    // 3. Filtrar por proveedor reinicia a página 1 y muestra 6 modelos de Anthropic
    fireEvent.change(screen.getByLabelText("Filtrar Por Proveedor"), {
      target: { value: "anthropic" },
    });
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 1–5 de 6 modelos (12 total)",
    );
    expect(screen.getByText("Página 1 de 2")).toBeTruthy();

    // 4. Filtrar por estado Inactivos -> solo Claude Modelo 12
    fireEvent.change(screen.getByLabelText("Filtrar Por Estado"), {
      target: { value: "inactive" },
    });
    expect(screen.getByText("Claude Modelo 12")).toBeTruthy();
    expect(screen.queryByText("Claude Modelo 2")).toBeNull();

    // 5. Limpiar filtros restaura los 12 modelos y activa filtro "Solo Por Defecto"
    fireEvent.click(screen.getByRole("button", { name: "Limpiar Filtros" }));
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 1–5 de 12 modelos",
    );

    fireEvent.click(screen.getByLabelText("Solo Por Defecto"));
    expect(screen.getByTestId("models-catalog-summary").textContent).toContain(
      "Mostrando 1–2 de 2 modelos (12 total)",
    );
    expect(screen.getByText("GPT Modelo 1")).toBeTruthy();
    expect(screen.getByText("Claude Modelo 2")).toBeTruthy();

    // 6. Búsqueda textual y ordenamiento por Spread Comercial
    fireEvent.click(screen.getByRole("button", { name: "Limpiar Filtros" }));
    fireEvent.change(screen.getByLabelText("Buscar Modelo"), {
      target: { value: "claude-model-4" },
    });
    expect(screen.getByText("Claude Modelo 4")).toBeTruthy();
    expect(screen.queryByText("GPT Modelo 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar Filtros" }));
    fireEvent.click(screen.getByRole("button", { name: "Spread Comercial" }));
    expect(screen.getByText("GPT Modelo 1")).toBeTruthy();
    expect(screen.queryByText("Claude Modelo 12")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Spread Comercial" }));
    expect(screen.getByText("Claude Modelo 12")).toBeTruthy();
  });
});
