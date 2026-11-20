-- Marcar como expiradas las invitaciones pendientes ya caducadas antes de indexar
UPDATE "admin"."organization_invitations"
SET "status" = 'expired', "updated_at" = NOW()
WHERE "status" = 'pending' AND "expires_at" <= NOW();--> statement-breakpoint
-- Depurar invitaciones pendientes duplicadas por comunidad + correo (conservando la más reciente)
WITH ranked_by_email AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id", lower("email")
      ORDER BY "expires_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "admin"."organization_invitations"
  WHERE "status" = 'pending'
)
UPDATE "admin"."organization_invitations" AS inv
SET "status" = 'revoked', "updated_at" = NOW()
FROM ranked_by_email AS r
WHERE inv."id" = r."id" AND r.rn > 1;--> statement-breakpoint
-- Depurar invitaciones pendientes duplicadas por comunidad + target_client_id (conservando la más reciente)
WITH ranked_by_client AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id", "target_client_id"
      ORDER BY "expires_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "admin"."organization_invitations"
  WHERE "status" = 'pending' AND "target_client_id" IS NOT NULL
)
UPDATE "admin"."organization_invitations" AS inv
SET "status" = 'revoked', "updated_at" = NOW()
FROM ranked_by_client AS r
WHERE inv."id" = r."id" AND r.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_pending_org_email_unique" ON "admin"."organization_invitations" USING btree ("organization_id",lower("email")) WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitations_pending_org_client_unique" ON "admin"."organization_invitations" USING btree ("organization_id","target_client_id") WHERE status = 'pending' AND target_client_id IS NOT NULL;