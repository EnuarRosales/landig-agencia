#!/usr/bin/env bash
# ==============================================================================
# Mocter · Guardián de ejecución y estado de respaldos (OPS-001 §5, RF-05.6)
# Ejecutado por systemd timer ops-backup-guard cada 5 minutos.
# ==============================================================================

set -euo pipefail

STANZA="pg-portal"
CONTAINER="pg-portal"
MAX_LAG_SECONDS=300 # 5 minutos

# Verificar que el contenedor esté corriendo
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q "true"; then
  echo "[ALERT] [CRITICAL] El contenedor $CONTAINER no está en ejecución. Imposible validar respaldos." >&2
  exit 1
fi

# Consultar información de respaldos vía pgbackrest info en formato JSON
BACKUP_INFO=$(docker exec "$CONTAINER" pgbackrest-secure --stanza="$STANZA" --output=json info 2>/dev/null || true)

if [[ -z "$BACKUP_INFO" ]]; then
  echo "[ALERT] [CRITICAL] Imposible obtener información de stanza '$STANZA' desde pgBackRest." >&2
  exit 1
fi

# Validar estado del último respaldo
STATUS_CODE=$(echo "$BACKUP_INFO" | grep -o '"code":[0-9]*' | head -n 1 | cut -d':' -f2 || echo "1")
if [[ "$STATUS_CODE" != "0" ]]; then
  echo "[ALERT] [CRITICAL] La última ejecución de respaldo para stanza '$STANZA' reportó error (código: $STATUS_CODE)." >&2
  exit 1
fi

echo "Guardián de respaldos OK para stanza $STANZA."
exit 0
