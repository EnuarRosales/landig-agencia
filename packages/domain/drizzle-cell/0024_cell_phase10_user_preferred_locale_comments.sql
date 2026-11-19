-- Comentarios de documentación SQL para preferencia individual de idioma en celda de datos (SPEC-17).
COMMENT ON COLUMN "admin"."users"."preferred_locale" IS 'Idioma preferido individual del usuario (es | en); cuando es NULL hereda clients.locale y luego Accept-Language.';
