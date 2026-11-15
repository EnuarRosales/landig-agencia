import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import {
  cellProductBundleItems,
  cellProductMedia,
  cellProducts,
} from "./tenancy-catalog";

const dialect = new PgDialect();

const spec08SchemaSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0013_cell_phase6_catalog_spec08.sql", import.meta.url),
  ),
  "utf8",
);

const spec08RlsSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../drizzle-cell/0014_cell_phase6_catalog_spec08_rls_grants_comments.sql",
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

describe("SPEC-08 T-01 · Esquema de productos, combos, portada is_cover y stock en celda", () => {
  it("extiende admin.products con composition_type, status activo/inactivo/borrador, bot_master_prompt y stock", () => {
    const cols = columnNames(cellProducts);
    expect(cols).toContain("composition_type");
    expect(cols).toContain("cost_price_cents");
    expect(cols).toContain("bot_master_prompt");
    expect(cols).toContain("stock_quantity");
    expect(cols).toContain("min_stock_threshold");
    expect(cols).toContain("low_stock_alert_sent_at");

    const checks = checkSql(cellProducts);
    expect(checks["products_status_check"]).toContain("status IN ('active', 'inactive', 'draft')");
    expect(checks["products_composition_type_check"]).toContain(
      "composition_type IN ('simple', 'combo')",
    );
    expect(checks["products_cost_price_non_negative_check"]).toContain("cost_price_cents >= 0");
    expect(checks["products_stock_quantity_check"]).toContain("stock_quantity >= 0");
    expect(checks["products_min_stock_threshold_check"]).toContain("min_stock_threshold >= 0");
  });

  it("agrega media_kind e is_cover en admin.product_media con índice único parcial de portada", () => {
    const config = getTableConfig(cellProductMedia);
    const cols = columnNames(cellProductMedia);
    expect(cols).toContain("media_kind");
    expect(cols).toContain("is_cover");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("product_media_one_cover_per_product");

    const checks = checkSql(cellProductMedia);
    expect(checks["product_media_kind_check"]).toContain(
      "media_kind IN ('image', 'video', 'audio', 'pdf')",
    );
    expect(checks["product_media_cover_image_check"]).toContain(
      "NOT is_cover OR media_kind = 'image'",
    );
  });

  it("define admin.product_bundle_items con FKs compuestas tenant-scoped y sin auto-referencias", () => {
    const config = getTableConfig(cellProductBundleItems);
    expect(config.name).toBe("product_bundle_items");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const fkNames = config.foreignKeys.map((fk) => fk.getName());
    expect(fkNames).toContain("product_bundle_items_bundle_fk");
    expect(fkNames).toContain("product_bundle_items_component_fk");

    const checks = checkSql(cellProductBundleItems);
    expect(checks["product_bundle_items_quantity_check"]).toContain("quantity > 0");
    expect(checks["product_bundle_items_no_self_ref_check"]).toContain(
      "bundle_product_id <> component_product_id",
    );
  });

  it("incluye migración segura de datos previos, FORCE ROW LEVEL SECURITY, grants y comentarios SQL", () => {
    expect(spec08SchemaSql).toContain('SET "cost_price_cents" = 0');
    expect(spec08SchemaSql).toContain("WHEN \"status\" = 'published' THEN 'active'");
    expect(spec08SchemaSql).toContain("WHEN \"status\" = 'archived' THEN 'inactive'");
    expect(spec08SchemaSql).toContain('SET "bot_master_prompt" = COALESCE("prompt", \'\')');
    expect(spec08SchemaSql).toContain("CREATE UNIQUE INDEX \"product_media_one_cover_per_product\"");

    expect(spec08RlsSql).toContain("GRANT ALL ON TABLE admin.product_bundle_items TO mocter_migrator");
    expect(spec08RlsSql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.product_bundle_items TO mocter_admin",
    );
    expect(spec08RlsSql).toContain("ALTER TABLE admin.product_bundle_items ENABLE ROW LEVEL SECURITY");
    expect(spec08RlsSql).toContain("ALTER TABLE admin.product_bundle_items FORCE ROW LEVEL SECURITY");
    expect(spec08RlsSql).toContain("COMMENT ON TABLE admin.product_bundle_items");
    expect(spec08RlsSql).toContain("COMMENT ON COLUMN admin.product_media.is_cover");
    expect(spec08RlsSql).toContain("COMMENT ON COLUMN admin.products.low_stock_alert_sent_at");
  });
});
