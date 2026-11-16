-- Hand-written migration (drizzle-kit --custom) for Cell Data Plane (SPEC-10 + SPEC-19 + SPEC-20).
-- Backfills E.164 validation status & ISO country codes, reaffirms FORCE RLS, and documents columns.

UPDATE admin.contacts
SET phone_validation_status = CASE
  WHEN phone_mobile IS NOT NULL AND trim(phone_mobile) ~ '^\+[1-9][0-9]{6,14}$' THEN 'verified_e164'
  WHEN phone_mobile IS NOT NULL AND trim(phone_mobile) <> '' THEN 'legacy_unformatted'
  ELSE 'unverified'
END;
--> statement-breakpoint
UPDATE admin.contact_addresses
SET country_code = CASE
  WHEN upper(trim(country)) IN ('CO', 'AR', 'MX', 'US', 'CA', 'CL', 'PE', 'EC', 'PA', 'CR', 'BR', 'UY', 'PY', 'BO', 'VE', 'DO', 'GT', 'SV', 'HN', 'NI', 'PR', 'ES', 'GB', 'FR', 'DE', 'IT', 'PT') THEN upper(trim(country))
  WHEN lower(trim(country)) IN ('colombia') THEN 'CO'
  WHEN lower(trim(country)) IN ('argentina') THEN 'AR'
  WHEN lower(trim(country)) IN ('méxico', 'mexico') THEN 'MX'
  WHEN lower(trim(country)) IN ('chile') THEN 'CL'
  WHEN lower(trim(country)) IN ('perú', 'peru') THEN 'PE'
  WHEN lower(trim(country)) IN ('ecuador') THEN 'EC'
  WHEN lower(trim(country)) IN ('estados unidos', 'united states', 'usa') THEN 'US'
  WHEN lower(trim(country)) IN ('españa', 'espana', 'spain') THEN 'ES'
  ELSE country_code
END
WHERE country IS NOT NULL;
--> statement-breakpoint
ALTER TABLE admin.tenant_labels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.tenant_labels FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contact_addresses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.contact_addresses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.conversation_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admin.conversation_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_labels.category IS 'Categoría de etiqueta automática: operational (SPEC-10) o functional (SPEC-19).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_labels.activation_rule IS 'Regla declarativa de activación automática para el clasificador conversacional (SPEC-19).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_labels.side_effects IS 'Acciones colaterales documentadas al activar la etiqueta (SPEC-19).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contacts.phone_validation_status IS 'Estado de verificación E.164 del móvil principal: verified_e164, legacy_unformatted o unverified (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_addresses.country_code IS 'Código ISO 3166-1 alpha-2 canónico del país de entrega (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_addresses.subdivision_code IS 'Código ISO 3166-2 de subdivisión territorial del domicilio (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.contact_addresses.address_complement IS 'Complemento estructural del inmueble (apartamento, torre, conjunto, piso) separado de reference_notes (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.country_code IS 'Código ISO 3166-1 alpha-2 congelado en el snapshot del pedido (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.subdivision_code IS 'Código ISO 3166-2 de subdivisión administrativa congelado en el pedido (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.address_complement IS 'Complemento estructural de la dirección de entrega del pedido (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.neighborhood IS 'Barrio, colonia o sector urbano de entrega del pedido (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.reference_notes IS 'Indicaciones operativas de llegada para el mensajero separadas del complemento (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.geo_resolution_status IS 'Estado determinístico de homologación geográfica al capturar el pedido (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.raw_location_input IS 'Entrada geográfica cruda preservada cuando el cliente o bot aporta texto libre (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.orders.provider_geo_refs IS 'Mapa JSONB ACL de IDs externos homologados por transportadora/ERP (Dropi, Effi, MercadoLibre).';
--> statement-breakpoint
COMMENT ON COLUMN admin.conversation_state.country_code IS 'País ISO 3166-1 alpha-2 inferido desde E.164 o declarado en chat (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.conversation_state.subdivision_code IS 'Subdivisión ISO 3166-2 resuelta en la conversación (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.conversation_state.address_complement IS 'Complemento estructural del domicilio capturado en chat (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.conversation_state.geo_resolution_status IS 'Estado de resolución geográfica actual de la sesión conversacional (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.conversation_state.provider_geo_refs IS 'Referencias ACL resueltas por LocationResolverService durante el flujo de captura (SPEC-20).';
