-- Hand-written migration (drizzle-kit --custom) for Central Control Plane (SPEC-10 + SPEC-19 + SPEC-20).
-- Safe backfill of ISO 3166-1 alpha-2 codes and SQL documentation comments.

UPDATE admin.clients
SET country_code = CASE
  WHEN upper(trim(country)) IN ('CO', 'AR', 'MX', 'US', 'CA', 'CL', 'PE', 'EC', 'PA', 'CR', 'BR', 'UY', 'PY', 'BO', 'VE', 'DO', 'GT', 'SV', 'HN', 'NI', 'PR', 'ES', 'GB', 'FR', 'DE', 'IT', 'PT') THEN upper(trim(country))
  WHEN lower(trim(country)) IN ('colombia', 'república de colombia', 'republica de colombia') THEN 'CO'
  WHEN lower(trim(country)) IN ('argentina', 'república argentina', 'republica argentina') THEN 'AR'
  WHEN lower(trim(country)) IN ('méxico', 'mexico') THEN 'MX'
  WHEN lower(trim(country)) IN ('chile') THEN 'CL'
  WHEN lower(trim(country)) IN ('perú', 'peru') THEN 'PE'
  WHEN lower(trim(country)) IN ('ecuador') THEN 'EC'
  WHEN lower(trim(country)) IN ('panamá', 'panama') THEN 'PA'
  WHEN lower(trim(country)) IN ('costa rica') THEN 'CR'
  WHEN lower(trim(country)) IN ('brasil', 'brazil') THEN 'BR'
  WHEN lower(trim(country)) IN ('uruguay') THEN 'UY'
  WHEN lower(trim(country)) IN ('estados unidos', 'united states', 'usa', 'eeuu') THEN 'US'
  WHEN lower(trim(country)) IN ('canadá', 'canada') THEN 'CA'
  WHEN lower(trim(country)) IN ('españa', 'espana', 'spain') THEN 'ES'
  ELSE country_code
END
WHERE country_code IS NULL AND country IS NOT NULL;
--> statement-breakpoint
COMMENT ON TABLE admin.geo_provider_locations IS 'Catálogo ACL global de homologación geográfica para proveedores externos (Dropi, Effi, MercadoLibre) alineado con ISO 3166-1/3166-2 (SPEC-20 §3.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.country_code IS 'Código ISO 3166-1 alpha-2 canónico del país principal del comercio (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.subdivision_code IS 'Código ISO 3166-2 de la subdivisión administrativa del comercio (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.clients.address_complement IS 'Complemento estructural del domicilio comercial (oficina, piso, local, bloque) separado de la dirección principal (SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_bots.default_messages IS 'Diccionario JSONB tipado con los 6 mensajes operativos clave asistidos por AI (SPEC-10 §7.1).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_bots.business_hours IS 'Horario semanal por inquilino con timezone derivado de clients.timezone/country_code para disparar out_of_hours (SPEC-10 + SPEC-20).';
--> statement-breakpoint
COMMENT ON COLUMN admin.tenant_bots.classifier_prompt IS 'Prompt personalizado de clasificación automática de conversaciones (SPEC-19 + SPEC-10).';
