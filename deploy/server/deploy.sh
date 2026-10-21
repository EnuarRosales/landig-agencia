#!/usr/bin/env bash
# ==============================================================================
# Mocter · Script de despliegue en servidor (Hostinger VPS)
# Ubicación en servidor: /opt/mocter-admin/bin/deploy.sh
# Permisos en servidor: root:root 755
#
# Ciclo de vida:
#   1. Validación estricta de argumentos (tag / git_ref) y bloqueo de concurrencia.
#   2. Respaldo preventivo con pg_dump (salvo primer despliegue).
#   3. Descarga de compose.yml desde GitHub para la ref exacta.
#   4. Login opcional a GHCR (si GHCR_READ_TOKEN está configurado).
#   5. Pull de la imagen de producción.
#   6. Ejecución del servicio de migración Drizzle ("migrate").
#   7. Reemplazo atómico de compose y arranque con verificación de salud (--wait).
#   8. Rollback automático de imagen si el contenedor no alcanza estado healthy.
#   9. Registro en releases.log y rotación de respaldos.
# ==============================================================================

set -euo pipefail

APP_DIR="/opt/mocter-admin"
CONF_FILE="${APP_DIR}/deploy.conf"
ENV_FILE="${APP_DIR}/.env"
LOCK_FILE="/tmp/mocter-deploy.lock"
COMPOSE_FILE="${APP_DIR}/compose.yml"
COMPOSE_PREV="${APP_DIR}/compose.yml.prev"
COMPOSE_NEW="${APP_DIR}/compose.yml.new"
RELEASES_LOG="${APP_DIR}/releases.log"
LOG_DIR="${APP_DIR}/logs"
BACKUP_DIR="${APP_DIR}/backups"

# Valores por defecto configurables en deploy.conf
ENVIRONMENT="production"
BACKUP_RETENTION=10
GHCR_USER=""
GHCR_READ_TOKEN=""
IMAGE="ghcr.io/enuarrosales/mocter-web"

# Cargar configuración si existe
if [[ -f "$CONF_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONF_FILE"
fi

mkdir -p "$LOG_DIR" "$BACKUP_DIR"
exec > >(tee -a "${LOG_DIR}/deploy.log") 2>&1

log() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $*"
}

error() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [ERROR] $*" >&2
}

# Obtener comandos desde SSH_ORIGINAL_COMMAND o argumentos directos
COMMAND_STRING="${SSH_ORIGINAL_COMMAND:-$*}"
if [[ -z "$COMMAND_STRING" ]]; then
  error "No se proporcionó ningún comando. Uso: deploy <tag> <git_ref> | status"
  exit 1
fi

read -r -a ARGS <<< "$COMMAND_STRING"
ACTION="${ARGS[0]:-}"

# Acción: status
if [[ "$ACTION" == "status" ]]; then
  log "Consultando estado de Mocter ($ENVIRONMENT)..."
  if [[ -f "$COMPOSE_FILE" ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
  else
    echo "No existe compose.yml activo."
  fi
  if [[ -f "$RELEASES_LOG" ]]; then
    echo "--- Últimos releases ---"
    tail -n 5 "$RELEASES_LOG"
  fi
  exit 0
fi

# Acción: deploy
if [[ "$ACTION" != "deploy" ]]; then
  error "Acción no permitida: '$ACTION'. Solo se permite 'deploy' o 'status'."
  exit 1
fi

IMAGE_TAG="${ARGS[1]:-}"
GIT_REF="${ARGS[2]:-}"

if [[ -z "$IMAGE_TAG" || -z "$GIT_REF" ]]; then
  error "Parámetros incompletos. Uso: deploy <image_tag> <git_ref>"
  exit 1
fi

# 1. Validación de parámetros por entorno
if [[ "$ENVIRONMENT" == "production" ]]; then
  if [[ ! "$IMAGE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    error "Etiqueta '$IMAGE_TAG' no cumple con formato SemVer vX.Y.Z en producción."
    exit 1
  fi
  if [[ "$GIT_REF" != "$IMAGE_TAG" ]]; then
    error "En producción git_ref ($GIT_REF) debe ser idéntico al tag ($IMAGE_TAG)."
    exit 1
  fi
  COMPOSE_TARGET="docker-compose.prod.yml"
else
  if [[ ! "$IMAGE_TAG" =~ ^sha-[0-9a-f]{7}$ ]]; then
    error "Etiqueta '$IMAGE_TAG' inválida para staging. Debe ser sha-<7>."
    exit 1
  fi
  if [[ ! "$GIT_REF" =~ ^[0-9a-f]{40}$ ]]; then
    error "git_ref '$GIT_REF' debe ser un commit SHA de 40 caracteres en staging."
    exit 1
  fi
  if [[ "$IMAGE_TAG" != "sha-${GIT_REF:0:7}" ]]; then
    error "Inconsistencia: tag ($IMAGE_TAG) no coincide con git_ref (${GIT_REF:0:7})."
    exit 1
  fi
  COMPOSE_TARGET="docker-compose.test.yml"
fi

# Bloqueo de concurrencia
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  error "Ya existe otro despliegue en ejecución. Abortando."
  exit 1
fi

log "Iniciando despliegue de Mocter [$ENVIRONMENT]: Tag=$IMAGE_TAG, Ref=$GIT_REF"

# 2. Respaldo preventivo con pg_dump
if [[ -f "$COMPOSE_FILE" ]]; then
  PG_CONTAINER=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q pg-portal 2>/dev/null || true)
  if [[ -n "$PG_CONTAINER" && "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null)" == "true" ]]; then
    BACKUP_FILE="${BACKUP_DIR}/backup_$(date +%Y%m%d_%H%M%S)_${IMAGE_TAG}.dump"
    log "Creando respaldo de PostgreSQL en $BACKUP_FILE..."
    
    # Extraer POSTGRES_USER y POSTGRES_DB desde .env
    DB_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d '=' -f2- | tr -d ' "\r')
    DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d '=' -f2- | tr -d ' "\r')

    if docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$BACKUP_FILE"; then
      log "Respaldo completado exitosamente ($(du -h "$BACKUP_FILE" | cut -f1))."
    else
      error "Falló la creación del respaldo preventivo. Abortando despliegue."
      exit 1
    fi

    # Rotación de respaldos: conservar los últimos BACKUP_RETENTION
    log "Rotando respaldos (conservando los últimos $BACKUP_RETENTION)..."
    ls -1t "${BACKUP_DIR}"/backup_*.dump 2>/dev/null | tail -n +"$((BACKUP_RETENTION + 1))" | xargs -r rm -f || true
  else
    log "Servicio pg-portal no está en ejecución. Omitiendo respaldo (posible primer despliegue)."
  fi
else
  log "No existe compose.yml previo. Omitiendo respaldo (primer despliegue)."
fi

# 3. Descarga del archivo compose correspondiente a la ref exacta
log "Descargando $COMPOSE_TARGET para la ref $GIT_REF..."
COMPOSE_URL="https://raw.githubusercontent.com/EnuarRosales/landig-agencia/${GIT_REF}/${COMPOSE_TARGET}"
if ! curl -sSfL "$COMPOSE_URL" -o "$COMPOSE_NEW"; then
  error "No se pudo descargar el archivo compose desde $COMPOSE_URL."
  exit 1
fi

# 4. Login opcional a GHCR
if [[ -n "$GHCR_READ_TOKEN" && -n "$GHCR_USER" ]]; then
  log "Autenticando contra GHCR con credenciales configuradas..."
  echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null 2>&1 || {
    error "Fallo al autenticarse en ghcr.io."
    exit 1
  }
fi

# 5. Descargar la imagen indicada
log "Descargando imagen ${IMAGE}:${IMAGE_TAG}..."
TAG="$IMAGE_TAG" docker compose -f "$COMPOSE_NEW" --env-file "$ENV_FILE" pull

# 6. Ejecución de migraciones de Drizzle (Servicio migrate)
log "Ejecutando migraciones pendientes con el perfil migrate..."
if ! TAG="$IMAGE_TAG" docker compose -f "$COMPOSE_NEW" --env-file "$ENV_FILE" run --rm migrate; then
  error "Las migraciones fallaron. El despliegue ha sido cancelado sin modificar el servicio web actual."
  rm -f "$COMPOSE_NEW"
  exit 1
fi
log "Migraciones aplicadas o validadas con éxito."

# 7. Despliegue del servicio web con compose
log "Actualizando servicios con compose.yml..."
if [[ -f "$COMPOSE_FILE" ]]; then
  cp "$COMPOSE_FILE" "$COMPOSE_PREV"
fi
mv "$COMPOSE_NEW" "$COMPOSE_FILE"

if TAG="$IMAGE_TAG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans --wait; then
  log "Contenedor web-portal levantado y en estado healthy."
else
  error "El nuevo contenedor no superó las pruebas de salud (healthcheck). Iniciando rollback..."
  if [[ -f "$COMPOSE_PREV" ]]; then
    mv "$COMPOSE_PREV" "$COMPOSE_FILE"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans --wait || true
    error "Rollback completado a la versión previa."
  else
    error "No existe compose.yml.prev para realizar rollback automático."
  fi
  exit 1
fi

# 8. Registro de éxito
rm -f "$COMPOSE_PREV"
RELEASE_ENTRY="$(date -u +"%Y-%m-%dT%H:%M:%SZ") | ${ENVIRONMENT} | ${IMAGE_TAG} | ${GIT_REF} | SUCCESS"
echo "$RELEASE_ENTRY" >> "$RELEASES_LOG"
log "Despliegue completado con éxito: $RELEASE_ENTRY"
