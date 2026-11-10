#!/usr/bin/env bash
# Restaura un respaldo hecho con ops/respaldo.sh. BORRA los datos actuales.
# Uso:  sudo ./ops/restaurar.sh /var/backups/kioskpos/kioskpos-AAAAMMDD-HHMMSS.sql.gz
# Pruébalo de vez en cuando en un servidor de prueba: un respaldo que nunca se
# restauró no es un respaldo.
set -euo pipefail
cd "$(dirname "$0")/.."
# Lee solo las variables que hacen falta del .env (sin ejecutarlo: tiene valores con espacios).
leer() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
: "${DB_NAME:=$(leer DB_NAME)}"
: "${DB_ADMIN_USER:=$(leer DB_ADMIN_USER)}"
: "${RCLONE_DESTINO:=$(leer RCLONE_DESTINO)}"
ARCHIVO="${1:?indica el archivo .sql.gz}"
DB_NAME="${DB_NAME:-kioskpos}"
DB_ADMIN_USER="${DB_ADMIN_USER:-kioskpos_admin}"
COMPOSE="docker compose -f docker-compose.prod.yml"

gzip -t "$ARCHIVO"
read -r -p "Esto REEMPLAZA la base '$DB_NAME' con $ARCHIVO. Escribe RESTAURAR para seguir: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

$COMPOSE stop backend
gunzip -c "$ARCHIVO" | $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USER" -d "$DB_NAME" -q
$COMPOSE start backend
echo "Restaurado. Revisa la app y el log: $COMPOSE logs -f backend"
