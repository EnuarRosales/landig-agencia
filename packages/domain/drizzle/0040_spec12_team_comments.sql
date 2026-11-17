-- Comentarios de documentación SQL para columnas nuevas de SPEC-12 en plano de control.
COMMENT ON COLUMN "admin"."tenant_invitations"."display_name" IS 'Nombre visible sugerido para personalizar el saludo del correo de invitación y precargar el perfil del colaborador.';
--> statement-breakpoint
COMMENT ON COLUMN "admin"."tenant_invitations"."grant_chatwoot_access" IS 'Indica si la invitación contempla acceso como agente en la cuenta Chatwoot del comercio (validado contra cuota chatwoot_agents).';
