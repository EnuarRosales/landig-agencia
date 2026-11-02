/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import AdminCellsPage from "./page";

const mockCells = [
  {
    id: "cell-01",
    code: "cell-01",
    tier: "standard",
    status: "draft",
    topologyType: "remote_vps",
    pgbouncerHost: "pgbouncer-cell-01",
    pgbouncerPort: 6432,
    databaseName: "mocter_cell_01",
    appUrl: "http://localhost:3004",
    privateIp: "10.0.0.2",
    publicIp: null,
    workingDir: "/opt/cell-01",
    deployUser: "deploy:1000",
    maxClients: 100,
    currentClients: 0,
    region: "us-east-1",
    healthStatus: null,
    lastHealthCheckAt: null,
    createdAt: "2026-11-01T12:00:00.000Z",
    updatedAt: "2026-11-01T12:00:00.000Z",
    createdBy: "owner-001",
    updatedBy: "owner-001",
  },
];

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("./create-cell-form", () => ({
  CreateCellForm: ({ apiUrl, onSuccess }: { apiUrl: string; onSuccess?: () => void }) => (
    <div data-testid="create-cell-form" data-apiurl={apiUrl}>
      {onSuccess ? <button onClick={onSuccess}>Trigger success</button> : null}
    </div>
  ),
}));

describe("DAT-001 T1 · AdminCellsPage cliente", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("renderiza estado de carga inicialmente", () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }),
    );

    const { container } = render(<AdminCellsPage />);
    expect(container.textContent).toMatch(/cargando células/i);
  });

  it("lista celdas obtenidas desde la API protegida de apps/web", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: mockCells }), { status: 200 }),
    );

    const { container } = render(<AdminCellsPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("cell-01");
      expect(container.textContent).toContain("Handshake");
      expect(container.textContent).toContain("Manifiesto");
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/cells"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("renderiza botón Drenar cuando la célula se encuentra en estado active", async () => {
    const activeCells = [{ ...mockCells[0], status: "active" }];
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: activeCells }), { status: 200 }),
    );

    const { container } = render(<AdminCellsPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("cell-01");
      expect(container.textContent).toContain("Drenar");
    });
  });

  it("muestra mensaje de error cuando la API protegida responde con fallo", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Sesión requerida." }), { status: 401 }),
    );

    const { container } = render(<AdminCellsPage />);

    await waitFor(() => {
      expect(container.textContent).toMatch(/error al cargar celdas/i);
    });
  });
});
