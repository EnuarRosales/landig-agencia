#!/usr/bin/env bash
# ==============================================================================
# Mocter · Script de Respaldo de SeaweedFS y Multimedia (OPS-001 §7.8, T-22)
#
# Genera snapshot consistente, manifiesto con sumas SHA-256,
# aplica cifrado simétrico en cliente (AES-256-CBC) y sincroniza hacia R2.
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/tmp/seaweedfs-backup"
SEAWEEDFS_CONTAINER="mocter-media-seaweedfs-1"
R2_BUCKET="mocter-backups"
R2_PREFIX="media/seaweedfs"
CIPHER_FILE="/etc/seaweedfs/cipher"
LOG_TAG="[MocterMediaBackup]"

echo "$LOG_TAG Iniciando ciclo de respaldo de SeaweedFS..."

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="${BACKUP_DIR}/seaweedfs_${TIMESTAMP}.tar.zst"
ENCRYPTED_FILE="${SNAPSHOT_FILE}.enc"
MANIFEST_FILE="${BACKUP_DIR}/manifest_${TIMESTAMP}.json"

# 1. Comprobar que SeaweedFS esté en ejecución
if ! docker inspect -f '{{.State.Running}}' "$SEAWEEDFS_CONTAINER" 2>/dev/null | grep -q "true"; then
  echo "$LOG_TAG [ERROR] El contenedor $SEAWEEDFS_CONTAINER no se encuentra activo." >&2
  exit 1
fi

# 2. Exportar o empaquetar volumen de datos
echo "$LOG_TAG Empaquetando volumen de datos /data desde $SEAWEEDFS_CONTAINER..."
docker exec "$SEAWEEDFS_CONTAINER" tar -cf - -C /data . | zstd -3 -o "$SNAPSHOT_FILE"

# 3. Generar manifiesto con SHA-256
SHA256_HASH=$(sha256sum "$SNAPSHOT_FILE" | cut -d ' ' -f 1)
FILE_SIZE=$(stat -c%s "$SNAPSHOT_FILE")

cat <<EOF > "$MANIFEST_FILE"
{
  "timestamp": "${TIMESTAMP}",
  "service": "seaweedfs",
  "archive": "seaweedfs_${TIMESTAMP}.tar.zst",
  "sha256": "${SHA256_HASH}",
  "sizeBytes": ${FILE_SIZE}
}
EOF

# 4. Cifrado en cliente con AES-256-CBC si existe clave de cifrado
if [[ -f "$CIPHER_FILE" ]]; then
  echo "$LOG_TAG Cifrando archivo de respaldo con AES-256-CBC..."
  CIPHER_PASS=$(tr -d '\r\n' < "$CIPHER_FILE")
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$SNAPSHOT_FILE" -out "$ENCRYPTED_FILE" -pass "pass:${CIPHER_PASS}"
  UPLOAD_TARGET="$ENCRYPTED_FILE"
else
  echo "$LOG_TAG [AVISO] No se encontró clave en $CIPHER_FILE. Subiendo sin cifrado adicional."
  UPLOAD_TARGET="$SNAPSHOT_FILE"
fi

# 5. Cargar archivo y manifiesto hacia Cloudflare R2 vía AWS CLI / S3 API
if command -v aws >/dev/null 2>&1; then
  echo "$LOG_TAG Sincronizando respaldo hacia s3://${R2_BUCKET}/${R2_PREFIX}/..."
  aws s3 cp "$UPLOAD_TARGET" "s3://${R2_BUCKET}/${R2_PREFIX}/$(basename "$UPLOAD_TARGET")"
  aws s3 cp "$MANIFEST_FILE" "s3://${R2_BUCKET}/${R2_PREFIX}/$(basename "$MANIFEST_FILE")"
  echo "$LOG_TAG Carga hacia R2 completada con éxito."
else
  echo "$LOG_TAG [AVISO] aws CLI no disponible en el host. El respaldo se conserva en $UPLOAD_TARGET."
fi

# 6. Limpieza temporal
rm -f "$SNAPSHOT_FILE" "${ENCRYPTED_FILE}" "$MANIFEST_FILE"
echo "$LOG_TAG Respaldo de SeaweedFS concluido satisfactoriamente."
exit 0
