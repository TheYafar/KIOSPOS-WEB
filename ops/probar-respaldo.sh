#!/usr/bin/env bash
# Prueba DE VERDAD el último respaldo: lo restaura en un Postgres temporal (aparte, no toca
# la base en uso), revisa que estén las tablas y los datos, y lo borra. Avisa si falla.
# Un respaldo que nunca se restauró no es un respaldo.
# Cron semanal (domingo 4:30 am):
#   30 4 * * 0 root cd /opt/KIOSPOS-WEB && ./ops/probar-respaldo.sh >> /var/log/kioskpos-respaldo.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
RESPALDOS="${DESTINO:-/var/backups/kioskpos}"
ARCHIVO="${1:-$(ls -1t "$RESPALDOS"/kioskpos-*.sql.gz 2>/dev/null | head -1)}"
NOMBRE="kioskpos-prueba-respaldo-$$"
fallar() { ./ops/avisar.sh "❌ La prueba del respaldo falló: $1"; docker rm -f "$NOMBRE" > /dev/null 2>&1 || true; exit 1; }
trap 'docker rm -f "$NOMBRE" > /dev/null 2>&1 || true' EXIT

[ -n "$ARCHIVO" ] && [ -f "$ARCHIVO" ] || fallar "no hay respaldo en $RESPALDOS"
gzip -t "$ARCHIVO" || fallar "el archivo está dañado ($ARCHIVO)"

echo "$(date -Is) probando $ARCHIVO en un Postgres temporal"
docker run -d --rm --name "$NOMBRE" -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=kioskpos postgres:16 > /dev/null
for i in $(seq 1 30); do docker exec "$NOMBRE" pg_isready -U postgres -d kioskpos > /dev/null 2>&1 && break; sleep 2; done
docker exec "$NOMBRE" psql -U postgres -d kioskpos -qc "CREATE ROLE kioskpos_app LOGIN PASSWORD 'x'" > /dev/null 2>&1 || true

gunzip -c "$ARCHIVO" | docker exec -i "$NOMBRE" psql -v ON_ERROR_STOP=1 -U postgres -d kioskpos -q > /dev/null \
  || fallar "no se pudo restaurar ($ARCHIVO)"

q() { docker exec "$NOMBRE" psql -U postgres -d kioskpos -tAc "$1"; }
tablas=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
negocios=$(q "SELECT count(*) FROM negocios")
migracion=$(q "SELECT max(version::int) FROM flyway_schema_history WHERE version ~ '^[0-9]+$'")
[ "${tablas:-0}" -ge 20 ] || fallar "faltan tablas (hay $tablas)"
[ "${negocios:-0}" -ge 1 ] || fallar "no hay negocios en el respaldo"
echo "$(date -Is) OK: $tablas tablas, $negocios negocios, migración V$migracion"
