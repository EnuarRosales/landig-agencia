// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  BotConfigurationView,
  type BotConfigData,
  type BotToneOption,
  type BotPresetOption,
  type BotProviderOption,
  type BotModelOption,
  type BotChannelOption,
  type ByokKeyItem,
} from "./bot-configuration-view";

describe("BOT-001 T-10 · BotConfigurationView Component", () => {
  afterEach(() => {
    cleanup();
  });

  const mockBot: BotConfigData = {
    id: "bot-101",
    name: "Asistente Mocter",
    objective: "Atender clientes y registrar pedidos",
    toneId: "tone-1",
    presetId: "preset-1",
    providerId: null,
    modelId: null,
    status: "active",
    persona: "Experto en ventas y atención cálida",
    greetingMessage: "¡Hola! ¿En qué puedo orientarte hoy?",
    fallbackMessage: "Un momento, te comunico con un asesor humano.",
    answerPolicy: "solo_conocimiento",
  };

  const mockTones: BotToneOption[] = [
    {
      id: "tone-1",
      code: "cercano",
      label: "Cercano y Empático",
      description: "Lenguaje accesible y amable",
    },
  ];

  const mockPresets: BotPresetOption[] = [
    {
      id: "preset-1",
      code: "natural_rhythm",
      label: "Ritmo Natural",
      modelName: "GPT-4o",
      recommendedFor: "Ventas consultivas",
    },
  ];

  const mockProviders: BotProviderOption[] = [
    { id: "prov-1", code: "openai", name: "OpenAI" },
    { id: "prov-2", code: "anthropic", name: "Anthropic" },
  ];

  const mockModels: BotModelOption[] = [
    {
      id: "mod-1",
      providerId: "prov-1",
      modelId: "gpt-4o",
      displayName: "GPT-4o Omnicanal",
    },
  ];

  const mockChannels: BotChannelOption[] = [
    {
      id: "chan-1",
      code: "website",
      label: "Widget Web",
      provisioning: "api",
      isConfigured: true,
      inboxId: 44,
      enabled: true,
    },
    {
      id: "chan-2",
      code: "whatsapp_cloud",
      label: "WhatsApp Cloud",
      provisioning: "oauth",
      isConfigured: false,
      enabled: false,
    },
  ];

  const mockByokKeys: ByokKeyItem[] = [
    {
      id: "byok-1",
      providerId: "prov-1",
      providerName: "OpenAI",
      maskedApiKey: "••••9988",
      status: "active",
    },
  ];

  it("renderiza el estado operativo y los labels en Title Case estricto", () => {
    render(
      <BotConfigurationView
        initialBot={mockBot}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
      />,
    );

    expect(screen.getByText("Configuración Del Bot De Atención")).toBeDefined();
    expect(screen.getByText("Operativo")).toBeDefined();
    // Labels en Title Case estricto (Regla 4.8)
    expect(screen.getByText(/Nombre Del Bot/)).toBeDefined();
    expect(screen.getByText(/Objetivo Principal De Atención/)).toBeDefined();
    expect(screen.getByText(/Tono Comunicacional/)).toBeDefined();
    expect(screen.getByText(/Canales De Atención E Integraciones/)).toBeDefined();
    expect(screen.getByText(/Credenciales Propias \(BYOK\)/)).toBeDefined();
  });

  it("permite guardar la configuración del bot", async () => {
    const handleSave = vi.fn().mockResolvedValue(true);
    render(
      <BotConfigurationView
        initialBot={mockBot}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
        onSaveBot={handleSave}
      />,
    );

    const nameInput = screen.getByDisplayValue("Asistente Mocter");
    fireEvent.change(nameInput, { target: { value: "Bot Mocter Pro" } });

    const submitBtn = screen.getByRole("button", { name: "Guardar Configuración Del Bot" });
    fireEvent.click(submitBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bot Mocter Pro",
      }),
    );
  });

  it("permite alternar el estado operativo entre activo y pausado", async () => {
    const handleStatus = vi.fn().mockResolvedValue(true);
    render(
      <BotConfigurationView
        initialBot={mockBot}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
        onUpdateStatus={handleStatus}
      />,
    );

    const pauseBtn = screen.getByRole("button", { name: "Pausar Operación Del Bot" });
    fireEvent.click(pauseBtn);

    expect(handleStatus).toHaveBeenCalledWith("paused");
  });

  it("permite habilitar o desactivar canales de atención", async () => {
    const handleToggle = vi.fn().mockResolvedValue(true);
    render(
      <BotConfigurationView
        initialBot={mockBot}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
        onToggleChannel={handleToggle}
      />,
    );

    const disableBtn = screen.getByRole("button", { name: "Desactivar Canal" });
    fireEvent.click(disableBtn);

    expect(handleToggle).toHaveBeenCalledWith("chan-1", false);
  });

  it("permite registrar una nueva clave de API BYOK cifrada", async () => {
    const handleByok = vi.fn().mockResolvedValue(true);
    render(
      <BotConfigurationView
        initialBot={mockBot}
        tones={mockTones}
        presets={mockPresets}
        providers={mockProviders}
        models={mockModels}
        channels={mockChannels}
        byokKeys={mockByokKeys}
        onSaveByokKey={handleByok}
      />,
    );

    const keyInput = screen.getByPlaceholderText("sk-...");
    fireEvent.change(keyInput, { target: { value: "sk-proj-1234567890abcdef" } });

    const saveKeyBtn = screen.getByRole("button", { name: "Registrar Clave Cifrada" });
    fireEvent.click(saveKeyBtn);

    expect(handleByok).toHaveBeenCalledWith("prov-1", "sk-proj-1234567890abcdef");
  });
});

