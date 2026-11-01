#!/usr/bin/env bash
# ==============================================================================
# Mocter · Script de Restauración de Adjuntos de Chatwoot (OPS-001 §7.8, T-22B)
#
# Descifra el archivo con la clave en /etc/chatwoot/cipher, valida el hash SHA-256
# contra el manifiesto y restaura en un volumen Docker de destino o scratch.
# ==============================================================================

set -euo pipefail

TARGET_ARCHIVE="${1:-}"
TARGET_MANIFEST="${2:-}"
RESTORE_VOLUME="${3:-mocter-chatwoot-restore-storage}"
CIPHER_FILE="/etc/chatwoot/cipher"
LOG_TAG="[MocterChatwootRestore]"

if [[ -z "$TARGET_ARCHIVE" || -z "$TARGET_MANIFEST" ]]; then
  echo "Uso: $0 <archivo_cifrado_o_tar_zst> <archivo_manifiesto_json> [volumen_destino]" >&2
  exit 1
fi

echo "$LOG_TAG Iniciando restore de adjuntos en volumen $RESTORE_VOLUME..."

WORK_DIR=$(mktemp -d /tmp/chatwoot-restore-work.XXXXXX)
trap 'rm -rf "$WORK_DIR"' EXIT

DECRYPTED_ARCHIVE="${WORK_DIR}/decrypted.tar.zst"

# 1. Descifrado si tiene extensión .enc
if [[ "$TARGET_ARCHIVE" =~ \.enc$ ]]; then
  if [[ ! -f "$CIPHER_FILE" ]]; then
    echo "$LOG_TAG [ERROR] El archivo está cifrado pero no existe $CIPHER_FILE" >&2
    exit 1
  fi
  echo "$LOG_TAG Descifrando archivo con clave de $CIPHER_FILE..."
  CIPHER_PASS=$(tr -d '\r\n' < "$CIPHER_FILE")
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$TARGET_ARCHIVE" -out "$DECRYPTED_ARCHIVE" -pass "pass:${CIPHER_PASS}"
else
  cp "$TARGET_ARCHIVE" "$DECRYPTED_ARCHIVE"
fi

# 2. Validación de integridad SHA-256
echo "$LOG_TAG Validando integridad SHA-256 contra el manifiesto..."
EXPECTED_HASH=$(grep -o '"sha256": *"[^"]*"' "$TARGET_MANIFEST" | cut -d '"' -f 4)
ACTUAL_HASH=$(sha256sum "$DECRYPTED_ARCHIVE" | cut -d ' ' -f 1)

if [[ "$EXPECTED_HASH" != "$ACTUAL_HASH" ]]; then
  echo "$LOG_TAG [ERROR CRÍTICO] Hash SHA-256 inválido." >&2
  echo "  Esperado : $EXPECTED_HASH" >&2
  echo "  Obtenido : $ACTUAL_HASH" >&2
  exit 1
fi
echo "$LOG_TAG Verificación de integridad exitosa ($ACTUAL_HASH)."

# 3. Crear volumen de destino si no existe
docker volume create "$RESTORE_VOLUME" >/dev/null

# 4. Descomprimir en el volumen de destino
echo "$LOG_TAG Descomprimiendo archivos en el volumen $RESTORE_VOLUME..."
docker run --rm \
  -v "${WORK_DIR}:/work:ro" \
  -v "${RESTORE_VOLUME}:/target" \
  alpine:3.20 \
  sh -c "apk add --no-cache zstd tar >/dev/null && tar -I zstd -xf /work/decrypted.tar.zst -C /target"

echo "$LOG_TAG Restauración completada con éxito en el volumen $RESTORE_VOLUME."
