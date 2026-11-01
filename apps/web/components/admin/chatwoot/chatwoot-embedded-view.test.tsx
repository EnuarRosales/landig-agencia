// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ChatwootEmbeddedView } from "./chatwoot-embedded-view";

describe("ADM-001 T-36 · ChatwootEmbeddedView (Chatwoot Embebido en iframe)", () => {
  afterEach(() => {
    cleanup();
  });
  const defaultProps = {
    clientId: "01930000-0000-7000-8000-000000000001",
    t: {
      title: "Bandeja de Atención",
      subtitle: "Gestión unificada de conversaciones",
      loading: "Conectando con la bandeja segura de conversaciones...",
      errorTitle: "No se pudo cargar la bandeja",
      errorMessage: "Hubo un problema al establecer la sesión con el motor de chat.",
      retryButton: "Reintentar Conexión",
      reconnectButton: "Reconectar Sesión",
    },
  };

  it("renderiza el estado de carga inicial y el iframe con src seguro", () => {
    render(<ChatwootEmbeddedView {...defaultProps} />);

    expect(screen.getByTestId("chatwoot-loading-state")).toBeDefined();
    expect(screen.getByText("Conectando con la bandeja segura de conversaciones...")).toBeDefined();

    const iframe = screen.getByTestId("chatwoot-iframe") as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.src).toContain("/auth/chatwoot/embed?client_id=01930000-0000-7000-8000-000000000001");
  });

  it("oculta el loading al dispararse el evento onLoad del iframe", () => {
    render(<ChatwootEmbeddedView {...defaultProps} />);

    const iframe = screen.getByTestId("chatwoot-iframe");
    fireEvent.load(iframe);

    expect(screen.queryByTestId("chatwoot-loading-state")).toBeNull();
  });

  it("muestra la pantalla de error cuando se produce un timeout de conexión y permite reintentar", () => {
    vi.useFakeTimers();
    render(<ChatwootEmbeddedView {...defaultProps} />);

    // Avanzar el tiempo 16 segundos para disparar el timeout de error
    act(() => {
      vi.advanceTimersByTime(16000);
    });

    expect(screen.getByTestId("chatwoot-error-state")).toBeDefined();
    expect(screen.getByText("No se pudo cargar la bandeja")).toBeDefined();

    // Reintentar conexión
    const retryBtn = screen.getByText("Reintentar Conexión");
    fireEvent.click(retryBtn);

    // Debe volver a mostrar el estado de carga
    expect(screen.getByTestId("chatwoot-loading-state")).toBeDefined();

    vi.useRealTimers();
  });
});
