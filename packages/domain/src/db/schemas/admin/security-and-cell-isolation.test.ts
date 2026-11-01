import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { organizationMembers } from "./communities-and-cloning";
import { clients } from "./clients";
import { clientRouting } from "./client-routing";
import { auditLog } from "./chatwoot-media-onboarding";
import { cellOrders } from "../tenant/orders";
import { cellContacts } from "../tenant/crm";

describe("ADM-001 T-30 · Verificación de Seguridad de Roles, Membresía y Auditoría (D-25, D-31, RF-01.10)", () => {
  it("RF-08.3 · organization_members impide más de una membresía activa por inquilino mediante índice único parcial", () => {
    const config = getTableConfig(organizationMembers);
    const uniqueIndex = config.indexes.find(
      (idx) => idx.config.name === "organization_members_one_active_per_client",
    );

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.config.unique).toBe(true);
  });

  it("D-31 · audit_log requiere justificación y datos de entidad para registrar accesos administrativos o break-glass", () => {
    const config = getTableConfig(auditLog);
    const cols = config.columns.map((c) => c.name);

    expect(cols).toContain("actor_user_id");
    expect(cols).toContain("actor_role");
    expect(cols).toContain("action");
    expect(cols).toContain("entity_type");
    expect(cols).toContain("entity_id");
    expect(cols).toContain("justification");
    expect(cols).toContain("metadata");
  });

  it("D-25 · la tabla de clientes no expone claves foráneas hacia esquemas públicos no autorizados", () => {
    const config = getTableConfig(clients);
    expect(config.schema).toBe("admin");

    const fks = config.foreignKeys.map((fk) => fk.getName());
    expect(fks.some((name) => name.includes("leads"))).toBe(false);
  });
});

describe("ADM-001 T-31 · Verificación de Aislamiento Estricto entre Celdas (RF-10.7, RF-10.8)", () => {
  it("RF-10.7 · tablas operativas de celda (cellOrders, cellContacts) no contienen llaves foráneas duras hacia el Router Global", () => {
    const ordersConfig = getTableConfig(cellOrders);
    const crmConfig = getTableConfig(cellContacts);

    // Las celdas almacenan client_id como uuid puro sin FK referencial hacia admin.clients
    const ordersFks = ordersConfig.foreignKeys.map((fk) => fk.getName());
    const crmFks = crmConfig.foreignKeys.map((fk) => fk.getName());

    expect(ordersFks.some((name) => name.includes("clients_id_fk"))).toBe(false);
    expect(crmFks.some((name) => name.includes("clients_id_fk"))).toBe(false);
  });

  it("RF-10.8 · el enrutamiento de inquilinos a celdas se resuelve exclusivamente mediante admin.client_routing", () => {
    const config = getTableConfig(clientRouting);
    const cols = config.columns.map((c) => c.name);

    expect(cols).toContain("client_id");
    expect(cols).toContain("cell_id");
    expect(cols).toContain("routing_status");
    expect(cols).toContain("routing_version");
  });

  it("RF-10.11 · todas las tablas operativas de celda tienen columna client_id obligatoria para RLS", () => {
    const ordersConfig = getTableConfig(cellOrders);
    const crmConfig = getTableConfig(cellContacts);

    const orderClientCol = ordersConfig.columns.find((c) => c.name === "client_id");
    const crmClientCol = crmConfig.columns.find((c) => c.name === "client_id");

    expect(orderClientCol?.notNull).toBe(true);
    expect(crmClientCol?.notNull).toBe(true);
  });
});

