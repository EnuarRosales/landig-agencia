/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CellActions } from "./cell-actions";
import type { AdminCellDto } from "@mocter/domain";

const mockCell: AdminCellDto = {
  id: "cell-01-uuid",
  code: "cell-01",
  hostId: null,
  tier: "standard",
  status: "active",
  topologyType: "remote_vps",
  pgbouncerHost: "pgbouncer-cell-01",
  pgbouncerPort: 6432,
  databaseName: "pg-cell-01",
  appUrl: "http://10.0.0.2:3004",
  privateIp: "10.0.0.2",
  publicIp: null,
  workingDir: "/opt/cell-01",
  deployUser: "deploy:1000",
  maxClients: 100,
  currentClients: 0,
  region: "us-east-1",
  healthStatus: null,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "system",
  updatedBy: "system",
};

describe("apps/admin · CellActions Component", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza todos los botones de acción sin errores", () => {
    render(<CellActions cell={mockCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    expect(screen.getByRole("button", { name: /manifiesto/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reverificar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /drenar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /migrar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /editar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /eliminar/i })).toBeDefined();
  });

  it("abre el modal de confirmación de migración de esquema al presionar Migrar", () => {
    render(<CellActions cell={mockCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    const migrateButton = screen.getByRole("button", { name: /migrar/i });
    fireEvent.click(migrateButton);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Ejecutar Migraciones De Esquema/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Ejecutar Migración/i })).toBeDefined();
  });

  it("renderiza botón 'Verificar Conexión' cuando la célula está en draft o error_connection", () => {
    const draftCell: AdminCellDto = { ...mockCell, status: "draft" };
    render(<CellActions cell={draftCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    expect(screen.getByRole("button", { name: /verificar conexión/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /reverificar/i })).toBeNull();
  });

  it("abre el modal de confirmación de drenado al presionar Drenar", () => {
    render(<CellActions cell={mockCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    const drainButton = screen.getByRole("button", { name: /drenar/i });
    fireEvent.click(drainButton);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Drenado De Célula De Datos/i)).toBeDefined();
    expect(screen.getByText(/Confirmar Drenado De Célula/i)).toBeDefined();
  });

  it("abre el modal de confirmación de eliminación al presionar Eliminar", () => {
    render(<CellActions cell={mockCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    const deleteButton = screen.getByRole("button", { name: /eliminar/i });
    fireEvent.click(deleteButton);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Eliminación De Célula De Datos/i)).toBeDefined();
    expect(screen.getByText(/Eliminar Célula Definitivamente/i)).toBeDefined();
  });

  it("abre el modal de edición de célula al presionar Editar", () => {
    render(<CellActions cell={mockCell} apiUrl="http://localhost:3001/api" onRefresh={onRefresh} />);

    const editButton = screen.getByRole("button", { name: /editar/i });
    fireEvent.click(editButton);

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Editar Célula De Datos · cell-01/i)).toBeDefined();
    expect(screen.getByLabelText(/URL De La Aplicación Celular/i)).toBeDefined();
  });
});
