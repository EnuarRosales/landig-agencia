-- 0029_seed_canonical_cell_hosts.sql
-- Siembra de hosts de infraestructura canónicos para placement celular (CEL-001 §3, DAT-001 §3.3).
-- Garantiza disponibilidad inmediata de hosts en entornos locales y productivos tras db:migrate.

INSERT INTO "admin"."cell_hosts" (
  "code",
  "deployment_profile",
  "status",
  "connectivity_config_ref",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
) VALUES
  (
    'host-local-dev',
    'local_development',
    'ready',
    'docker_compose_local',
    now(),
    now(),
    'system_migration',
    'system_migration'
  ),
  (
    'host-control-plane-vps',
    'control_plane_vps',
    'ready',
    'traefik_internal_mesh',
    now(),
    now(),
    'system_migration',
    'system_migration'
  ),
  (
    'host-external-vps',
    'external_vps',
    'ready',
    'wireguard_overlay_mesh',
    now(),
    now(),
    'system_migration',
    'system_migration'
  )
ON CONFLICT ("code") DO NOTHING;

