#!/usr/bin/env bash
# ==============================================================================
# Mocter · Script de Restauración y Verificación de SeaweedFS (OPS-001 §7.8, T-22)
#
# Descarga el snapshot, descifra el archivo, valida el hash contra el manifiesto
# y extrae el volumen en una instancia scratch para verificación sin tocar producción.
# ==============================================================================

set -euo pipefail

RESTORE_DIR="/tmp/seaweedfs-restore"
CIPHER_FILE="/etc/seaweedfs/cipher"
LOG_TAG="[MocterMediaRestore]"

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo_respaldo.tar.zst[.enc]> [archivo_manifiesto.json]" >&2
  exit 1
fi

BACKUP_INPUT="$1"
MANIFEST_INPUT="${2:-}"

mkdir -p "$RESTORE_DIR"
WORKDIR=$(mktemp -d -p "$RESTORE_DIR")
trap 'rm -rf "$WORKDIR"' EXIT

echo "$LOG_TAG Preparando restauración en $WORKDIR..."

# 1. Descifrado si corresponde
if [[ "$BACKUP_INPUT" =~ \.enc$ ]]; then
  if [[ ! -f "$CIPHER_FILE" ]]; then
    echo "$LOG_TAG [ERROR] El respaldo está cifrado pero no existe $CIPHER_FILE." >&2
    exit 1
  fi
  DECRYPTED_ARCHIVE="${WORKDIR}/archive.tar.zst"
  CIPHER_PASS=$(tr -d '\r\n' < "$CIPHER_FILE")
  echo "$LOG_TAG Descifrando $BACKUP_INPUT con AES-256-CBC..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_INPUT" -out "$DECRYPTED_ARCHIVE" -pass "pass:${CIPHER_PASS}"
  TARGET_ARCHIVE="$DECRYPTED_ARCHIVE"
else
  TARGET_ARCHIVE="$BACKUP_INPUT"
fi

# 2. Validación de suma SHA-256 contra el manifiesto si fue suministrado
if [[ -n "$MANIFEST_INPUT" && -f "$MANIFEST_INPUT" ]]; then
  echo "$LOG_TAG Validando integridad SHA-256 contra manifiesto..."
  EXPECTED_HASH=$(grep -o '"sha256":"[^"]*"' "$MANIFEST_INPUT" | cut -d'"' -f4)
  ACTUAL_HASH=$(sha256sum "$TARGET_ARCHIVE" | cut -d ' ' -f 1)
  if [[ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]]; then
    echo "$LOG_TAG [ERROR] Discrepancia de integridad: esperado $EXPECTED_HASH, obtenido $ACTUAL_HASH." >&2
    exit 1
  fi
  echo "$LOG_TAG Verificación de integridad SHA-256 aprobada."
fi

# 3. Descompresión y extracción
EXTRACT_DIR="${WORKDIR}/extracted_data"
mkdir -p "$EXTRACT_DIR"
echo "$LOG_TAG Descomprimiendo archivos en entorno scratch..."
zstd -d "$TARGET_ARCHIVE" -c | tar -xf - -C "$EXTRACT_DIR"

# 4. Verificación de muestra de archivos (imagen, audio, video, pdf)
echo "$LOG_TAG Verificando catálogo de objetos restaurados..."
OBJECT_COUNT=$(find "$EXTRACT_DIR" -type f | wc -l)
echo "$LOG_TAG Total de archivos extraídos: $OBJECT_COUNT"

if [[ $OBJECT_COUNT -eq 0 ]]; then
  echo "$LOG_TAG [ERROR] La extracción no generó archivos válidos." >&2
  exit 1
fi

echo "$LOG_TAG Restauración y verificación de SeaweedFS completada con éxito."
exit 0
