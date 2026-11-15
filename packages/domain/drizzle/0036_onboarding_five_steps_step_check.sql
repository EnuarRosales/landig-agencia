ALTER TABLE "admin"."onboarding_sessions" DROP CONSTRAINT IF EXISTS "onboarding_sessions_step_check";--> statement-breakpoint
UPDATE "admin"."onboarding_sessions" SET "current_step" = 'assistant_payments' WHERE "current_step" = 'bot_channel';--> statement-breakpoint
ALTER TABLE "admin"."onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_step_check" CHECK (current_step IN ('business', 'plan', 'product', 'assistant_payments', 'billing', 'completed'));--> statement-breakpoint
INSERT INTO "admin"."bot_tones" ("code", "labels", "description", "is_active", "sort_order", "created_by", "updated_by")
VALUES
  ('friendly_close', '{"es":"Cercano y Amigable","en":"Warm and Friendly"}'::jsonb, '{"es":"Trato cálido, empático y conversacional orientado a generar confianza rápida.","en":"Warm, empathetic, conversational style focused on quick trust building."}'::jsonb, true, 1, 'system.seed', 'system.seed'),
  ('professional_clear', '{"es":"Profesional y Directo","en":"Professional and Direct"}'::jsonb, '{"es":"Respuestas claras, respetuosas y estructuradas sin rodeos innecesarios.","en":"Clear, respectful, and structured answers without unnecessary filler."}'::jsonb, true, 2, 'system.seed', 'system.seed'),
  ('consultative_expert', '{"es":"Consultivo y Experto","en":"Consultative and Expert"}'::jsonb, '{"es":"Guía al cliente con recomendaciones comparativas basadas en necesidades.","en":"Guides customers with tailored comparative recommendations."}'::jsonb, true, 3, 'system.seed', 'system.seed'),
  ('dynamic_commercial', '{"es":"Dinámico y Comercial","en":"Dynamic and Persuasive"}'::jsonb, '{"es":"Enfocado en resaltar beneficios clave y agilizar el cierre del pedido.","en":"Focused on highlighting key benefits and speeding up order closing."}'::jsonb, true, 4, 'system.seed', 'system.seed')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "admin"."bot_presets" ("code", "labels", "model_id", "temperature", "max_tokens", "recommended_for", "is_active", "sort_order", "created_by", "updated_by")
SELECT v.code, v.labels::jsonb, m.id, v.temperature, v.max_tokens, v.recommended_for::jsonb, true, v.sort_order, 'system.seed', 'system.seed'
FROM (
  VALUES
    ('quick_sales', '{"es":"Ventas Rápidas","en":"Fast Sales"}', 'gpt-4o-mini', '0.4', 700, '{"es":"Catálogos ágiles que buscan responder precios, disponibilidad y cerrar pedidos en pocos turnos.","en":"Fast-moving catalogs focused on pricing, stock answers, and quick checkout."}', 1),
    ('consultative_advisor', '{"es":"Asesor Consultivo","en":"Consultative Advisor"}', 'gpt-4o', '0.6', 1100, '{"es":"Productos técnicos o servicios que requieren orientación comparativa antes de comprar.","en":"Technical products or services needing comparative guidance before purchase."}', 2),
    ('support_booking', '{"es":"Soporte y Reservas","en":"Support and Bookings"}', 'claude-3-5-haiku-20241022', '0.3', 800, '{"es":"Atención postventa, seguimiento de pedidos y agendamiento preciso con baja variabilidad.","en":"Post-sale support, order tracking, and accurate scheduling with low variance."}', 3)
) AS v(code, labels, preferred_model, temperature, max_tokens, recommended_for, sort_order)
CROSS JOIN LATERAL (
  SELECT id FROM "admin"."ai_models"
  WHERE is_active = true
  ORDER BY CASE WHEN model_id = v.preferred_model THEN 0 ELSE 1 END, sort_order ASC
  LIMIT 1
) AS m
ON CONFLICT ("code") DO NOTHING;
