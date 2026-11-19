-- Hand-written migration (drizzle-kit --custom) for the Cell Data Plane (pg-cell-XX).
-- Applies after 0025_cell_phase11_promotions_spec18.sql (SPEC-18 T-01).
--
-- Grants privileges to mocter_migrator and mocter_admin,
-- enforces ENABLE + FORCE ROW LEVEL SECURITY isolated by app.current_client_id on
-- admin.promotions and admin.promotion_targets, and documents tables and columns.

GRANT ALL ON TABLE admin.promotions TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.promotions TO mocter_admin;
--> statement-breakpoint
GRANT ALL ON TABLE admin.promotion_targets TO mocter_migrator;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin.promotion_targets TO mocter_admin;
--> statement-breakpoint
ALTER TABLE admin.promotions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.promotions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_promotions_isolation ON admin.promotions;
--> statement-breakpoint
CREATE POLICY cell_promotions_isolation ON admin.promotions
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE admin.promotion_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.promotion_targets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS cell_promotion_targets_isolation ON admin.promotion_targets;
--> statement-breakpoint
CREATE POLICY cell_promotion_targets_isolation ON admin.promotion_targets
  USING (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid)
  WITH CHECK (client_id = NULLIF(current_setting('app.current_client_id', true), '')::uuid);
--> statement-breakpoint
COMMENT ON TABLE admin.promotions IS 'Campañas y promociones comerciales automáticas del inquilino con vigencia explícita, cupo de unidades y soft delete bajo FORCE ROW LEVEL SECURITY (SPEC-18 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.id IS 'Identificador UUIDv7 único de la promoción comercial.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.client_id IS 'Identificador del inquilino propietario de la promoción (clave de aislamiento RLS).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.name IS 'Nombre comercial de la campaña o promoción visible en catálogo, backoffice y Bot AI.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.description IS 'Argumento comercial o condiciones visibles para el asistente AI y el equipo.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.scope_type IS 'Alcance de selección: all_catalog (todo el catálogo), category (categorías) o product (productos/combos exactos).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.discount_type IS 'Tipo de beneficio: percentage (% OFF 1-95), fixed_amount (descuento fijo en centavos) o fixed_price (precio final fijo en centavos solo para scope product).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.discount_value IS 'Valor del beneficio: porcentaje entero (1-95) para percentage, o monto en centavos (> 0, BIGINT) para fixed_amount / fixed_price.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.starts_at IS 'Fecha y hora exacta (UTC/TIMESTAMPTZ) de inicio de vigencia de la promoción.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.ends_at IS 'Fecha y hora exacta de finalización; NULL indica vigencia abierta hasta pausa manual.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.max_discounted_units IS 'Tope opcional de unidades totales vendibles bajo esta promoción antes de pasar a estado depleted.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.discounted_units_sold IS 'Acumulado de unidades vendidas bajo esta promoción en pedidos confirmados (con restitución en cancelación o devolución).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.is_active IS 'Indicador administrativo para activar o pausar manualmente la promoción.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.deleted_at IS 'Marca temporal de eliminación lógica (soft delete) para preservar integridad histórica con order_items (SPEC-18 D-08).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotions.deleted_by IS 'Actor que ejecutó la eliminación lógica de la promoción.';
--> statement-breakpoint
COMMENT ON TABLE admin.promotion_targets IS 'Vínculos objetivo de una promoción comercial hacia productos/combos específicos o nombres de categoría bajo FORCE ROW LEVEL SECURITY (SPEC-18 §7.2).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotion_targets.promotion_id IS 'Identificador de la promoción propietaria del vínculo objetivo.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotion_targets.target_type IS 'Tipo de objetivo: product (producto/combo puntual) o category (categoría de catálogo).';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotion_targets.product_id IS 'Identificador del producto o combo objetivo cuando target_type = product.';
--> statement-breakpoint
COMMENT ON COLUMN admin.promotion_targets.category_name IS 'Nombre de la categoría objetivo cuando target_type = category (comparación case-insensitive normalizada).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.promotion_quota_deducted IS 'Bandera idempotente análoga a stock_deducted que indica si las unidades promocionales del pedido ya fueron descontadas en admin.promotions.discounted_units_sold (SPEC-18 D-05).';
--> statement-breakpoint
COMMENT ON COLUMN admin.order_items.promotion_id IS 'Identificador de la promoción vigente aplicada a la línea del pedido (FK compuesta con ON DELETE RESTRICT preservada mediante soft delete, SPEC-18 D-08).';
--> statement-breakpoint
COMMENT ON COLUMN admin.order_items.promotion_name IS 'Snapshot inmutable del nombre comercial de la campaña aplicada al momento de registrar la línea del pedido.';
--> statement-breakpoint
COMMENT ON COLUMN admin.order_items.original_unit_price_cents IS 'Precio unitario regular en centavos previo a la aplicación de la promoción comercial.';
