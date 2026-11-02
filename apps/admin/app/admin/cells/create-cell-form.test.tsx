/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CreateCellForm } from "./create-cell-form";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("DAT-001 / ADM-001 · CreateCellForm Component", () => {
  const apiUrl = "http://localhost:3001/api";

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza el botón de apertura inicial y abre el modal dialog al hacer clic", () => {
    render(<CreateCellForm apiUrl={apiUrl} />);

    const openButton = screen.getByRole("button", { name: /registrar nueva célula/i });
    expect(openButton).toBeDefined();

    // No modal yet
    expect(screen.queryByRole("dialog")).toBeNull();

    // Open modal
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("muestra todos los labels en formato Title Case estricto sin mayúsculas sostenidas", () => {
    render(<CreateCellForm apiUrl={apiUrl} />);
    fireEvent.click(screen.getByRole("button", { name: /registrar nueva célula/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    // Validar etiquetas Title Case
    expect(screen.getByLabelText(/Código De La Célula/i)).toBeDefined();
    expect(screen.getByLabelText(/Nivel De Servicio/i)).toBeDefined();
    expect(screen.getByLabelText(/Topología De Despliegue/i)).toBeDefined();
    expect(screen.getByLabelText(/Host De PgBouncer O PostgreSQL/i)).toBeDefined();
    expect(screen.getByLabelText(/Puerto De Conexión/i)).toBeDefined();
    expect(screen.getByLabelText(/Nombre De La Base De Datos/i)).toBeDefined();
    expect(screen.getByLabelText(/Capacidad Máxima De Inquilinos/i)).toBeDefined();
    expect(screen.getByLabelText(/Región Geográfica De Despliegue/i)).toBeDefined();
  });

  it("permite cerrar el modal con el botón Cancelar", () => {
    render(<CreateCellForm apiUrl={apiUrl} />);
    fireEvent.click(screen.getByRole("button", { name: /registrar nueva célula/i }));

    expect(screen.getByRole("dialog")).toBeDefined();

    const cancelButton = screen.getAllByRole("button", { name: /cancelar/i })[0];
    fireEvent.click(cancelButton);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("envía la petición POST con el token CSRF y los datos diligenciados", async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/auth/csrf")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, csrfToken: "csrf-token-xyz" }), { status: 200 }),
        );
      }
      if (urlStr.includes("/admin/cells")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: { id: "cell-99", code: "cell-custom", status: "draft" },
            }),
            { status: 201 },
          ),
        );
      }
      return Promise.reject(new Error("Unknown route"));
    });

    const onSuccess = vi.fn();
    render(<CreateCellForm apiUrl={apiUrl} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: /registrar nueva célula/i }));

    fireEvent.change(screen.getByLabelText(/Código De La Célula/i), {
      target: { value: "cell-custom" },
    });
    fireEvent.change(screen.getByLabelText(/Nombre De La Base De Datos/i), {
      target: { value: "mocter_cell_custom" },
    });

    const submitButton = screen.getByRole("button", { name: /^registrar célula$/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/cells"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-csrf-token": "csrf-token-xyz",
        }),
      }),
    );
  });
});
