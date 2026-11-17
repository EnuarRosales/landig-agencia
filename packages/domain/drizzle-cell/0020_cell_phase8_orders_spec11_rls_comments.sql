-- Hand-written migration (drizzle-kit --custom) for Cell Data Plane (SPEC-11).
-- Documents new columns in admin.orders and admin.order_items and reaffirms FORCE ROW LEVEL SECURITY.

ALTER TABLE admin.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.order_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.contact_address_id IS 'Identificador opcional de la dirección guardada del contacto en admin.contact_addresses usada como base del pedido (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.stock_deducted IS 'Bandera idempotente que garantiza que el inventario físico de los ítems no se descuente dos veces (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.guide_generated_at IS 'Marca de tiempo de la generación de guía o remisión logística imprimible (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.cancellation_reason IS 'Motivo justificado de cancelación del pedido (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.issue_notes IS 'Detalle operativo registrado cuando el pedido entra en novedad de entrega (delivery_issue, SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.repeated_from_order_id IS 'Identificador del pedido origen cuando la orden fue generada mediante Repetir Pedido (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.external_erp_system IS 'Sistema ERP logístico externo homologado (dropi, effi) para integración futura (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.external_erp_reference IS 'Identificador externo del pedido en el ERP logístico asociado (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.order_items.unit_cost_cents IS 'Snapshot del costo unitario del producto en centavos al momento de vender para cálculo de rentabilidad (SPEC-11).';
--> statement-breakpoint
COMMENT ON COLUMN admin.order_items.selected_attributes IS 'Mapa JSONB de atributos dinámicos seleccionados para el ítem al momento de la compra (SPEC-08, SPEC-11).';
