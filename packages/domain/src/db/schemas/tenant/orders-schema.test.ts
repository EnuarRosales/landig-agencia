import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import {
  cellOrders,
  cellOrderItems,
  cellOrderEvents,
  cellOrderReturns,
  cellOrderSequences,
  cellShippingCarriers,
} from "./orders";

const dialect = new PgDialect();

const cellOrdersSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0006_cell_phase4_orders.sql", import.meta.url),
  ),
  "utf8",
);

const cellOrdersRlsGrantsSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../drizzle-cell/0007_cell_phase4_orders_rls_grants_comments.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

function checkSql(table: PgTable): Record<string, string> {
  const result: Record<string, string> = {};
  for (const check of getTableConfig(table).checks) {
    result[check.name] = dialect.sqlToQuery(check.value).sql;
  }
  return result;
}

function columnNames(table: PgTable): string[] {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("ORD-001 T-02 · Persistencia de Pedidos en celdas (Cell Data Plane)", () => {
  it("define orders con PK compuesta (client_id, id), checks de estado e índice de idempotencia", () => {
    const config = getTableConfig(cellOrders);
    expect(config.name).toBe("orders");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const cols = columnNames(cellOrders);
    expect(cols).toContain("number");
    expect(cols).toContain("prospect_id");
    expect(cols).toContain("chatwoot_conversation_id");
    expect(cols).toContain("source");
    expect(cols).toContain("status");
    expect(cols).toContain("payment_method");
    expect(cols).toContain("payment_status");
    expect(cols).toContain("shipping_method");
    expect(cols).toContain("carrier_id");
    expect(cols).toContain("customer_name");
    expect(cols).toContain("customer_phone");
    expect(cols).toContain("subtotal_cents");
    expect(cols).toContain("shipping_cents");
    expect(cols).toContain("discount_cents");
    expect(cols).toContain("total_cents");
    expect(cols).toContain("currency");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("orders_number_client_unique");
    expect(indexNames).toContain("orders_cw_conversation_active_unique");
    expect(indexNames).toContain("orders_client_prospect_idx");
    expect(indexNames).toContain("orders_client_status_idx");

    const checks = checkSql(cellOrders);
    expect(checks["orders_source_check"]).toContain("source IN ('bot', 'manual')");
    expect(checks["orders_status_check"]).toContain(
      "status IN ('registered', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned')",
    );
    expect(checks["orders_payment_status_check"]).toContain(
      "payment_status IN ('pending', 'paid', 'refunded', 'failed')",
    );
    expect(checks["orders_shipping_method_check"]).toContain(
      "shipping_method IN ('home', 'office')",
    );
    expect(checks["orders_subtotal_cents_check"]).toContain("subtotal_cents >= 0");
    expect(checks["orders_shipping_cents_check"]).toContain("shipping_cents >= 0");
    expect(checks["orders_discount_cents_check"]).toContain("discount_cents >= 0");
    expect(checks["orders_total_cents_check"]).toContain("total_cents >= 0");
  });

  it("define order_items con PK compuesta, checks de cantidades y valores >= 0", () => {
    const config = getTableConfig(cellOrderItems);
    expect(config.name).toBe("order_items");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const cols = columnNames(cellOrderItems);
    expect(cols).toContain("order_id");
    expect(cols).toContain("product_id");
    expect(cols).toContain("product_name");
    expect(cols).toContain("product_sku");
    expect(cols).toContain("quantity");
    expect(cols).toContain("unit_price_cents");
    expect(cols).toContain("line_total_cents");

    const checks = checkSql(cellOrderItems);
    expect(checks["order_items_quantity_check"]).toContain("quantity > 0");
    expect(checks["order_items_unit_price_cents_check"]).toContain("unit_price_cents >= 0");
    expect(checks["order_items_line_total_cents_check"]).toContain("line_total_cents >= 0");
  });

  it("define order_events con trazabilidad inmutable y PK compuesta", () => {
    const config = getTableConfig(cellOrderEvents);
    expect(config.name).toBe("order_events");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const cols = columnNames(cellOrderEvents);
    expect(cols).toContain("order_id");
    expect(cols).toContain("from_status");
    expect(cols).toContain("to_status");
    expect(cols).toContain("actor");
    expect(cols).toContain("reason");
    expect(cols).toContain("created_at");
  });

  it("define order_returns con validación de montos y estados permitidos", () => {
    const config = getTableConfig(cellOrderReturns);
    expect(config.name).toBe("order_returns");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const checks = checkSql(cellOrderReturns);
    expect(checks["order_returns_amount_cents_check"]).toContain("amount_cents >= 0");
    expect(checks["order_returns_status_check"]).toContain(
      "status IN ('requested', 'approved', 'received', 'refunded')",
    );
  });

  it("define order_sequences con PK compuesta (client_id, period)", () => {
    const config = getTableConfig(cellOrderSequences);
    expect(config.name).toBe("order_sequences");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "period"]);

    const cols = columnNames(cellOrderSequences);
    expect(cols).toContain("current_val");
    expect(cols).toContain("updated_at");
  });

  it("define shipping_carriers con PK compuesta y unicidad por nombre e inquilino", () => {
    const config = getTableConfig(cellShippingCarriers);
    expect(config.name).toBe("shipping_carriers");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("shipping_carriers_client_name_unique");
  });

  it("garantiza que las migraciones SQL aplican RLS estricto y grants requeridos", () => {
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."orders"');
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."order_items"');
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."order_events"');
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."order_returns"');
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."order_sequences"');
    expect(cellOrdersSql).toContain('CREATE TABLE "admin"."shipping_carriers"');

    const expectedRlsTables = [
      "orders",
      "order_items",
      "order_events",
      "order_returns",
      "order_sequences",
      "shipping_carriers",
    ];

    for (const table of expectedRlsTables) {
      expect(cellOrdersRlsGrantsSql).toContain(`ALTER TABLE admin.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(cellOrdersRlsGrantsSql).toContain(`ALTER TABLE admin.${table} FORCE ROW LEVEL SECURITY;`);
      expect(cellOrdersRlsGrantsSql).toContain(`CREATE POLICY cell_${table}_isolation ON admin.${table}`);
      expect(cellOrdersRlsGrantsSql).toContain(
        `USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)`,
      );
    }
  });
});
