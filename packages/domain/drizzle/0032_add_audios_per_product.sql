-- 0032_add_audios_per_product.sql
-- Inserción canónica de la dimensión de pistas de audio por producto (SPEC-03 T-01, RN-SPEC-03-01)
-- y backfill de límite base 0 LIMITED en planes comerciales existentes que carezcan de la dimensión.

INSERT INTO "admin"."plan_dimensions" (
  "key",
  "label",
  "unit",
  "value_type",
  "min_value",
  "max_value",
  "default_value",
  "legal_floor_value",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
) VALUES (
  'audios_per_product',
  '{"es":"Pistas de audio por producto","en":"Audio tracks per product"}'::jsonb,
  'count',
  'integer',
  0,
  NULL,
  0,
  NULL,
  now(),
  now(),
  'migration',
  'migration'
) ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "unit" = EXCLUDED."unit",
  "value_type" = EXCLUDED."value_type",
  "min_value" = EXCLUDED."min_value",
  "default_value" = EXCLUDED."default_value",
  "updated_at" = now();--> statement-breakpoint

-- Backfill idempotente para todos los planes existentes: asignar 0 LIMITED si no existe registro previo
INSERT INTO "admin"."plan_limits" (
  "plan_id",
  "dimension",
  "value",
  "mode",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
)
SELECT
  p.id,
  'audios_per_product',
  0,
  'LIMITED',
  now(),
  now(),
  'migration',
  'migration'
FROM "admin"."plans" p
WHERE NOT EXISTS (
  SELECT 1 FROM "admin"."plan_limits" l WHERE l.plan_id = p.id AND l.dimension = 'audios_per_product'
);
