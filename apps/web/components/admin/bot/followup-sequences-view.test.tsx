// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  FollowupSequencesView,
  type FollowupSequenceItem,
} from "./followup-sequences-view";

afterEach(() => {
  cleanup();
});

const sampleSequences: FollowupSequenceItem[] = [
  {
    id: "seq-01",
    clientId: "client-active",
    botId: "bot-01",
    name: "Recuperación De Carrito",
    origin: "tenant_custom",
    triggerInactivityMinutes: 120,
    status: "active",
    revision: 1,
    createdAt: "2026-10-30T10:00:00.000Z",
    steps: [
      {
        position: 1,
        delayMinutes: 0,
        message: "¿Deseas finalizar tu orden?",
      },
      {
        position: 2,
        delayMinutes: 1440,
        message: "Te mantenemos los precios promocionales.",
      },
    ],
  },
];

describe("BOT-001 T-21 · FollowupSequencesView Component", () => {
  it("renderiza el listado de secuencias y los labels en Title Case estricto", () => {
    render(<FollowupSequencesView initialSequences={sampleSequences} />);

    expect(screen.getByText("Secuencias De Recordatorios Y Seguimientos")).toBeDefined();
    expect(screen.getByText("Recuperación De Carrito")).toBeDefined();
    expect(screen.getByText("Activa")).toBeDefined();
    expect(screen.getByText("Personalizada")).toBeDefined();
    expect(screen.getByText("Pausar Secuencia")).toBeDefined();
  });

  it("permite alternar el estado de una secuencia entre activa y pausada", async () => {
    const handleUpdateStatus = vi.fn().mockResolvedValue(true);
    render(
      <FollowupSequencesView
        initialSequences={sampleSequences}
        onUpdateStatus={handleUpdateStatus}
      />,
    );

    const pauseBtn = screen.getByText("Pausar Secuencia");
    fireEvent.click(pauseBtn);

    expect(handleUpdateStatus).toHaveBeenCalledWith("seq-01", "paused");
    expect(await screen.findByText("Activar Secuencia")).toBeDefined();
  });

  it("abre el editor para crear nueva secuencia y muestra labels en Title Case", () => {
    render(<FollowupSequencesView initialSequences={[]} />);

    const newBtn = screen.getByText("Crear Nueva Secuencia");
    fireEvent.click(newBtn);

    expect(screen.getByText("Nombre De La Secuencia")).toBeDefined();
    expect(screen.getByText("Inactividad Para Disparo (Minutos)")).toBeDefined();
    expect(screen.getByText("Pasos De La Secuencia (Máximo 10)")).toBeDefined();
    expect(screen.getByText(/Mejorar Con AI/i)).toBeDefined();
  });

  it("asiste la redacción del mensaje con AI al pulsar Mejorar Con AI", () => {
    render(<FollowupSequencesView initialSequences={[]} />);

    fireEvent.click(screen.getByText("Crear Nueva Secuencia"));

    const improveBtn = screen.getByText(/Mejorar Con AI/i);
    fireEvent.click(improveBtn);

    expect(
      screen.getByText("Texto del recordatorio optimizado con Inteligencia Artificial."),
    ).toBeDefined();
  });

  it("permite adoptar la plantilla predeterminada de reactivación", async () => {
    const handleSeed = vi.fn().mockResolvedValue(true);
    render(
      <FollowupSequencesView
        initialSequences={[]}
        onSeedDefaults={handleSeed}
      />,
    );

    const adoptBtn = screen.getByText("Cargar Plantilla Predeterminada");
    fireEvent.click(adoptBtn);

    expect(handleSeed).toHaveBeenCalled();
    expect(
      await screen.findByText("Secuencia De Reactivación Predeterminada"),
    ).toBeDefined();
    expect(screen.getByText("Plantilla Mocter")).toBeDefined();
  });
});

