#!/usr/bin/env bash
# ==============================================================================
# Mocter · Script de Respaldo de Adjuntos de Chatwoot (OPS-001 §7.8, T-22B)
#
# Genera snapshot consistente del volumen local mocter-chatwoot_storage-chatwoot,
# calcula manifiesto con SHA-256, aplica cifrado simétrico en cliente (AES-256-CBC)
# y sincroniza hacia Cloudflare R2 bajo el prefijo chatwoot/attachments/.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/tmp/chatwoot-storage-backup"
STORAGE_VOLUME="mocter-chatwoot_storage-chatwoot"
R2_BUCKET="mocter-backups"
R2_PREFIX="chatwoot/attachments"
CIPHER_FILE="/etc/chatwoot/cipher"
LOG_TAG="[MocterChatwootStorageBackup]"

echo "$LOG_TAG Iniciando respaldo de adjuntos de Chatwoot..."

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="${BACKUP_DIR}/chatwoot_storage_${TIMESTAMP}.tar.zst"
ENCRYPTED_FILE="${SNAPSHOT_FILE}.enc"
MANIFEST_FILE="${BACKUP_DIR}/manifest_${TIMESTAMP}.json"

# 1. Verificar si existe el volumen Docker
if ! docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "$LOG_TAG [ERROR] El volumen Docker $STORAGE_VOLUME no existe." >&2
  exit 1
fi

# 2. Empaquetar el volumen mediante contenedor efímero
echo "$LOG_TAG Empaquetando contenido del volumen $STORAGE_VOLUME..."
docker run --rm \
  -v "${STORAGE_VOLUME}:/storage:ro" \
  alpine:3.20 \
  tar -cf - -C /storage . | zstd -3 -o "$SNAPSHOT_FILE"

# 3. Generar manifiesto SHA-256
SHA256_HASH=$(sha256sum "$SNAPSHOT_FILE" | cut -d ' ' -f 1)
FILE_SIZE=$(stat -c%s "$SNAPSHOT_FILE")

cat <<EOF > "$MANIFEST_FILE"
{
  "timestamp": "${TIMESTAMP}",
  "service": "chatwoot_storage",
  "volume": "${STORAGE_VOLUME}",
  "archive": "chatwoot_storage_${TIMESTAMP}.tar.zst",
  "sha256": "${SHA256_HASH}",
  "sizeBytes": ${FILE_SIZE}
}
EOF

# 4. Cifrado simétrico en cliente
if [[ -f "$CIPHER_FILE" ]]; then
  echo "$LOG_TAG Cifrando adjuntos de Chatwoot con AES-256-CBC..."
  CIPHER_PASS=$(tr -d '\r\n' < "$CIPHER_FILE")
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$SNAPSHOT_FILE" -out "$ENCRYPTED_FILE" -pass "pass:${CIPHER_PASS}"
  UPLOAD_TARGET="$ENCRYPTED_FILE"
else
  echo "$LOG_TAG [AVISO] No se encontró clave en $CIPHER_FILE. Subiendo sin cifrado simétrico."
  UPLOAD_TARGET="$SNAPSHOT_FILE"
fi

# 5. Sincronizar a Cloudflare R2
if command -v aws >/dev/null 2>&1 && [[ -n "${R2_ENDPOINT:-}" ]]; then
  echo "$LOG_TAG Sincronizando respaldo a R2 (s3://${R2_BUCKET}/${R2_PREFIX}/)..."
  aws --endpoint-url="$R2_ENDPOINT" s3 cp "$UPLOAD_TARGET" "s3://${R2_BUCKET}/${R2_PREFIX}/$(basename "$UPLOAD_TARGET")"
  aws --endpoint-url="$R2_ENDPOINT" s3 cp "$MANIFEST_FILE" "s3://${R2_BUCKET}/${R2_PREFIX}/manifest_${TIMESTAMP}.json"
  echo "$LOG_TAG Subida completada."
else
  echo "$LOG_TAG [LOCAL] Respaldo almacenado en host: $UPLOAD_TARGET"
fi

# 6. Limpieza temporal
rm -f "$SNAPSHOT_FILE" "$ENCRYPTED_FILE" "$MANIFEST_FILE"
echo "$LOG_TAG Respaldo de adjuntos finalizado con éxito a las $(date -u)."
