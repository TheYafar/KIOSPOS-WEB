#!/usr/bin/env bash
# Respaldo diario de la base de KioskPOS (BD en Docker).
#  - pg_dump comprimido en $DESTINO (por defecto /var/backups/kioskpos)
#  - verifica que el archivo no esté dañado
#  - borra los de más de $DIAS días (por defecto 14)
#  - si defines RCLONE_DESTINO (ej. "b2:kioskpos-respaldos"), copia FUERA del servidor
#
# Uso (desde la carpeta del repo):   sudo ./ops/respaldo.sh
# Cron diario 3:15 am:               15 3 * * * cd /opt/KIOSPOS-WEB && ./ops/respaldo.sh >> /var/log/kioskpos-respaldo.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
# Lee solo las variables que hacen falta del .env (sin ejecutarlo: tiene valores con espacios).
leer() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
: "${DB_NAME:=$(leer DB_NAME)}"
: "${DB_ADMIN_USER:=$(leer DB_ADMIN_USER)}"
: "${RCLONE_DESTINO:=$(leer RCLONE_DESTINO)}"

DESTINO="${DESTINO:-/var/backups/kioskpos}"
DIAS="${DIAS:-14}"
DB_NAME="${DB_NAME:-kioskpos}"
DB_ADMIN_USER="${DB_ADMIN_USER:-kioskpos_admin}"
COMPOSE="docker compose -f docker-compose.prod.yml"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
ARCHIVO="$DESTINO/kioskpos-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "$(date -Is) respaldando en $ARCHIVO"
$COMPOSE exec -T postgres pg_dump -U "$DB_ADMIN_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip -9 > "$ARCHIVO.tmp"
gzip -t "$ARCHIVO.tmp"                       # archivo sano
[ "$(stat -c %s "$ARCHIVO.tmp")" -gt 1024 ]  # y no vacío
mv "$ARCHIVO.tmp" "$ARCHIVO"
chmod 600 "$ARCHIVO"

find "$DESTINO" -name 'kioskpos-*.sql.gz' -mtime +"$DIAS" -delete

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$ARCHIVO" "$RCLONE_DESTINO" --quiet
  echo "$(date -Is) copiado fuera del servidor: $RCLONE_DESTINO"
fi
echo "$(date -Is) listo ($(du -h "$ARCHIVO" | cut -f1))"
