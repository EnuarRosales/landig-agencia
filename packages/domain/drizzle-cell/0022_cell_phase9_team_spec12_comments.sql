-- Comentarios de documentación SQL para columnas nuevas de SPEC-12 en celda de datos.
COMMENT ON COLUMN "admin"."tenant_users"."grant_chatwoot_access" IS 'Indica si el colaborador tiene habilitado el acceso operativo como agente en la cuenta Chatwoot del comercio.';
--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_users"."chatwoot_agent_id" IS 'Identificador numérico del usuario agente correlacionado en la cuenta Chatwoot del comercio.';
