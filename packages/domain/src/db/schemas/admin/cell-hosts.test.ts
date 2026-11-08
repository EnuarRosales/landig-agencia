import { describe, it, expect } from "vitest";
import { cellHosts } from "./cell-hosts";
import { cells } from "./cells";

describe("CEL-001 T01b · cell_hosts and cells host relationship schema", () => {
  it("define el esquema de cell_hosts con default de status 'ready'", () => {
    expect(cellHosts.id).toBeDefined();
    expect(cellHosts.code).toBeDefined();
    expect(cellHosts.deploymentProfile).toBeDefined();
    expect(cellHosts.status).toBeDefined();
    expect(cellHosts.connectivityConfigRef).toBeDefined();
    expect(cellHosts.createdAt).toBeDefined();
    expect(cellHosts.updatedAt).toBeDefined();
    expect(cellHosts.createdBy).toBeDefined();
    expect(cellHosts.updatedBy).toBeDefined();

    const defaultStatus = cellHosts.status.default;
    expect(defaultStatus).toBeDefined();
    expect(String(defaultStatus)).toMatch(/ready/i);
  });

  it("agrega hostId a cells como columna de relación con cell_hosts", () => {
    expect(cells.hostId).toBeDefined();
  });

  it("verifica que max_clients tenga límite 100", () => {
    const defaultMaxClients = cells.maxClients.default;
    expect(defaultMaxClients).toBe(100);
  });
});

