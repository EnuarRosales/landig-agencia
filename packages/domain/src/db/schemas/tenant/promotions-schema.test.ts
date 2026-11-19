import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { cellPromotions, cellPromotionTargets } from "./promotions";
import { cellOrderItems, cellOrders } from "./orders";

const dialect = new PgDialect();

const spec18SchemaSql = readFileSync(
  fileURLToPath(
    new URL("../../../../drizzle-cell/0025_cell_phase11_promotions_spec18.sql", import.meta.url),
  ),
  "utf8",
);

const spec18RlsSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../drizzle-cell/0026_cell_phase11_promotions_spec18_rls_grants_comments.sql",
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

describe("SPEC-18 T-01 · Esquema de promociones comerciales, objetivos y trazabilidad en pedidos", () => {
  it("define admin.promotions con PK compuesta (client_id, id), BIGINT en discount_value, auditoría, soft delete y CHECKs", () => {
    const config = getTableConfig(cellPromotions);
    expect(config.name).toBe("promotions");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const cols = columnNames(cellPromotions);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "client_id",
        "name",
        "description",
        "scope_type",
        "discount_type",
        "discount_value",
        "starts_at",
        "ends_at",
        "max_discounted_units",
        "discounted_units_sold",
        "is_active",
        "deleted_at",
        "deleted_by",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ]),
    );

    const discountCol = config.columns.find((c) => c.name === "discount_value");
    expect(discountCol?.getSQLType()).toBe("bigint");

    const checks = checkSql(cellPromotions);
    expect(checks["promotions_scope_type_check"]).toContain(
      "scope_type IN ('all_catalog', 'category', 'product')",
    );
    expect(checks["promotions_discount_type_check"]).toContain(
      "discount_type IN ('percentage', 'fixed_amount', 'fixed_price')",
    );
    expect(checks["promotions_percentage_range_check"]).toContain(
      "discount_value >= 1 AND discount_value <= 95",
    );
    expect(checks["promotions_fixed_price_scope_check"]).toContain(
      "discount_type <> 'fixed_price' OR scope_type = 'product'",
    );
    expect(checks["promotions_ends_after_starts_check"]).toContain(
      "ends_at IS NULL OR ends_at > starts_at",
    );
  });

  it("define admin.promotion_targets con FKs compuestas tenant-scoped e índices parciales", () => {
    const config = getTableConfig(cellPromotionTargets);
    expect(config.name).toBe("promotion_targets");
    expect(config.schema).toBe("admin");

    const pkColumns = config.primaryKeys[0]?.columns.map((col) => col.name);
    expect(pkColumns).toEqual(["client_id", "id"]);

    const fkNames = config.foreignKeys.map((fk) => fk.getName());
    expect(fkNames).toContain("promotion_targets_promotion_fk");
    expect(fkNames).toContain("promotion_targets_product_fk");

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_promotion_targets_promotion",
        "idx_promotion_targets_product",
        "idx_promotion_targets_category",
      ]),
    );

    const checks = checkSql(cellPromotionTargets);
    expect(checks["promotion_targets_payload_consistency_check"]).toContain(
      "target_type = 'product' AND product_id IS NOT NULL AND category_name IS NULL",
    );
  });

  it("extiende admin.orders y admin.order_items con bandera idempotente y snapshot de promoción", () => {
    const orderCols = columnNames(cellOrders);
    expect(orderCols).toContain("promotion_quota_deducted");

    const itemConfig = getTableConfig(cellOrderItems);
    const itemCols = columnNames(cellOrderItems);
    expect(itemCols).toEqual(
      expect.arrayContaining(["promotion_id", "promotion_name", "original_unit_price_cents"]),
    );
    const fkNames = itemConfig.foreignKeys.map((fk) => fk.getName());
    expect(fkNames).toContain("order_items_promotion_fk");
  });

  it("incluye migración SQL válida, FORCE ROW LEVEL SECURITY, grants y comentarios SQL obligatorios", () => {
    expect(spec18SchemaSql).toContain('CREATE TABLE "admin"."promotions"');
    expect(spec18SchemaSql).toContain('CREATE TABLE "admin"."promotion_targets"');
    expect(spec18SchemaSql).toContain('ALTER TABLE "admin"."orders" ADD COLUMN "promotion_quota_deducted"');
    expect(spec18SchemaSql).toContain('ALTER TABLE "admin"."order_items" ADD COLUMN "promotion_id"');
    expect(spec18SchemaSql).toContain('REFERENCES "admin"."products"("client_id","id")');

    expect(spec18RlsSql).toContain("GRANT ALL ON TABLE admin.promotions TO mocter_migrator");
    expect(spec18RlsSql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.promotions TO mocter_admin");
    expect(spec18RlsSql).toContain("ALTER TABLE admin.promotions ENABLE ROW LEVEL SECURITY");
    expect(spec18RlsSql).toContain("ALTER TABLE admin.promotions FORCE ROW LEVEL SECURITY");
    expect(spec18RlsSql).toContain("ALTER TABLE admin.promotion_targets ENABLE ROW LEVEL SECURITY");
    expect(spec18RlsSql).toContain("ALTER TABLE admin.promotion_targets FORCE ROW LEVEL SECURITY");
    expect(spec18RlsSql).toContain("COMMENT ON TABLE admin.promotions");
    expect(spec18RlsSql).toContain("COMMENT ON TABLE admin.promotion_targets");
    expect(spec18RlsSql).toContain("COMMENT ON COLUMN admin.orders.promotion_quota_deducted");
    expect(spec18RlsSql).toContain("COMMENT ON COLUMN admin.order_items.promotion_id");
  });
});
