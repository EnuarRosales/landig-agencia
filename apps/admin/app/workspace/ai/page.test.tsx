// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AiSettingsView } from "./ai-settings-view";
import type { TenantAiSettingsOverviewDto } from "@mocter/domain";

describe("SPEC-02 T-07 · Workspace AiSettingsView", () => {
  const baseOverview: TenantAiSettingsOverviewDto = {
    clientId: "11111111-1111-7111-8111-111111111111",
    effectiveMode: "platform_trial",
    inferenceSource: "platform_trial",
    isTrialActive: true,
    trialEndsAt: "2026-12-01T00:00:00.000Z",
    activeByok: null,
    configuredProviders: [
      {
        id: "tap-1",
        providerId: "p-openai",
        providerCode: "openai",
        providerName: "OpenAI",
        logoUrl: null,
        hasKey: true,
        apiKeyLast4: "4321",
        apiKeyKeyId: "key-v1",
        status: "active",
        priorityRole: "primary",
        lastVerifiedAt: "2026-11-14T10:00:00.000Z",
        lastVerificationError: null,
        selectedModelId: "m-4o-mini",
        selectedModelCode: "gpt-4o-mini",
        temperature: "0.7",
        maxTokens: 1000,
        updatedAt: "2026-11-14T10:00:00.000Z",
      },
    ],
    catalog: [
      {
        id: "p-openai",
        code: "openai",
        name: "OpenAI",
        apiDialect: "openai_compatible",
        logoUrl: null,
        docsUrl: "https://platform.openai.com",
        models: [
          {
            id: "m-4o-mini",
            providerId: "p-openai",
            modelId: "gpt-4o-mini",
            displayName: "GPT-4o mini",
            defaultTemperature: "0.7",
            defaultMaxTokens: 1000,
            maxOutputTokens: 16384,
            contextWindow: 128000,
            isDefault: true,
          },
        ],
      },
      {
        id: "p-deepseek",
        code: "deepseek",
        name: "DeepSeek",
        apiDialect: "openai_compatible",
        logoUrl: "https://cdn.example.com/deepseek.png",
        docsUrl: "https://platform.deepseek.com",
        models: [
          {
            id: "m-ds-reasoner",
            providerId: "p-deepseek",
            modelId: "deepseek-reasoner",
            displayName: "DeepSeek Reasoner",
            defaultTemperature: "0.5",
            defaultMaxTokens: 4096,
            maxOutputTokens: 8192,
            contextWindow: 64000,
            isDefault: false,
          },
          {
            id: "m-ds-chat",
            providerId: "p-deepseek",
            modelId: "deepseek-chat",
            displayName: "DeepSeek Chat",
            defaultTemperature: "0.3",
            defaultMaxTokens: 2048,
            maxOutputTokens: 8192,
            contextWindow: 64000,
            isDefault: true,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("muestra bloqueo de permisos para usuarios no propietarios", () => {
    render(<AiSettingsView initialOverview={null} isOwner={false} />);
    expect(screen.getByText(/Únicamente el propietario del comercio/i)).toBeDefined();
  });

  it("renderiza formulario Title Case, credencial enmascarada (••••4321) y ejecuta verificación de conexión", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            valid: true,
            providerCode: "openai",
            apiKeyLast4: "4321",
            latencyMs: 110,
            verifiedAt: "2026-11-14T11:00:00.000Z",
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: baseOverview }),
      } as Response);

    render(<AiSettingsView initialOverview={baseOverview} isOwner={true} />);

    expect(screen.getByLabelText("Proveedor de Inteligencia Artificial")).toBeDefined();
    expect(screen.getByText(/••••4321/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Probar Conexión/i }));

    await waitFor(() => {
      expect(screen.getByText(/Conexión verificada con éxito/i)).toBeDefined();
    });
  });

  it("usa ConfirmationModal del sistema de diseño (sin window.confirm) para revocar llave", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { revokedCount: 1 } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: { ...baseOverview, configuredProviders: [], activeByok: null },
        }),
      } as Response);

    render(<AiSettingsView initialOverview={baseOverview} isOwner={true} />);

    fireEvent.click(screen.getByRole("button", { name: /Revocar Llave/i }));

    expect(await screen.findByRole("dialog")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Confirmar Revocación/i }));

    await waitFor(() => {
      expect(screen.getByText(/Credencial BYOK revocada de forma segura/i)).toBeDefined();
    });
  });

  it("soporta internacionalización en inglés mediante adminDictionaries cuando locale='en'", () => {
    render(<AiSettingsView initialOverview={baseOverview} isOwner={true} locale="en" />);
    expect(
      screen.getByRole("heading", { name: "Artificial Intelligence Providers And Keys" }),
    ).toBeDefined();
    expect(screen.getByLabelText("Artificial Intelligence Provider")).toBeDefined();
    expect(screen.getByRole("button", { name: /Save And Activate Credential/i })).toBeDefined();
  });

  it("preselecciona modelo por defecto y precarga temperatura/tokens al cambiar de proveedor, enviando priorityRole", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: { updated: true } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: baseOverview }),
      } as Response);

    render(<AiSettingsView initialOverview={baseOverview} isOwner={true} />);

    const providerSelect = screen.getByLabelText(
      "Proveedor de Inteligencia Artificial",
    ) as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "deepseek" } });

    const modelSelect = screen.getByLabelText(
      "Modelo Preferido",
    ) as HTMLSelectElement;
    const tempInput = screen.getByLabelText(
      /Temperatura de Respuesta/i,
    ) as HTMLInputElement;
    const tokensInput = screen.getByLabelText(
      "Límite Máximo de Tokens",
    ) as HTMLInputElement;
    const prioritySelect = screen.getByLabelText(
      "Rol de Prioridad (Respaldo Automático)",
    ) as HTMLSelectElement;

    expect(modelSelect.value).toBe("m-ds-chat");
    expect(tempInput.value).toBe("0.3");
    expect(tokensInput.value).toBe("2048");
    expect(prioritySelect.value).toBe("secondary");
    expect(screen.getByAltText("DeepSeek")).toBeDefined();

    fireEvent.change(screen.getByLabelText("API Key del Proveedor"), {
      target: { value: "sk-deepseek-test-9999" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Guardar y Activar Credencial/i }),
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tenant/ai/settings",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"priorityRole":"secondary"'),
        }),
      );
    });
  });
});
