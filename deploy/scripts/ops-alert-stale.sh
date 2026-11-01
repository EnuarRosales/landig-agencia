#!/usr/bin/env bash
# ==============================================================================
# Mocter · Verificación de antigüedad del último respaldo Full (OPS-001 §5)
# Alerta si el último respaldo completo supera 8 días de antigüedad.
# ==============================================================================

set -euo pipefail

STANZA="pg-portal"
CONTAINER="pg-portal"
MAX_AGE_SECONDS=691200 # 8 días (8 * 86400)

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q "true"; then
  echo "[ALERT] [CRITICAL] El contenedor $CONTAINER no está en ejecución." >&2
  exit 1
fi

BACKUP_INFO=$(docker exec "$CONTAINER" pgbackrest-secure --stanza="$STANZA" --output=json info 2>/dev/null || true)
if [[ -z "$BACKUP_INFO" ]]; then
  echo "[ALERT] [CRITICAL] Imposible obtener información de respaldos de $STANZA." >&2
  exit 1
fi

# Extraer timestamp del último respaldo full
LAST_FULL_STOP=$(echo "$BACKUP_INFO" | grep -o '"stop":{"epoch":[0-9]*' | head -n 1 | grep -o '[0-9]*$' || echo "0")
NOW=$(date +%s)
AGE=$((NOW - LAST_FULL_STOP))

if [[ $AGE -gt $MAX_AGE_SECONDS ]]; then
  DAYS=$((AGE / 86400))
  echo "[ALERT] [CRITICAL] El último respaldo full de $STANZA tiene $DAYS días de antigüedad (supera límite de 8 días)." >&2
  exit 1
fi

echo "Antigüedad del último full OK ($((AGE / 3600)) horas)."
exit 0
