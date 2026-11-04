-- 0027_add_chat_retention_days.sql
-- Inserción canónica de la dimensión de retención de conversaciones (ADM-001 RF-04.5, T-10)
-- y backfill de límite base de 30 días en planes comerciales.

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
  'chat_retention_days',
  '{"es":"Retención de conversaciones","en":"Conversation retention"}'::jsonb,
  'days',
  'integer',
  30,
  NULL,
  30,
  30,
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
  "legal_floor_value" = EXCLUDED."legal_floor_value",
  "updated_at" = now();--> statement-breakpoint

-- Backfill para todos los planes existentes: asegurar que chat_retention_days esté sembrado con 30 días LIMITED si no existe
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
  'chat_retention_days',
  30,
  'LIMITED',
  now(),
  now(),
  'migration',
  'migration'
FROM "admin"."plans" p
WHERE NOT EXISTS (
  SELECT 1 FROM "admin"."plan_limits" l WHERE l.plan_id = p.id AND l.dimension = 'chat_retention_days'
);
