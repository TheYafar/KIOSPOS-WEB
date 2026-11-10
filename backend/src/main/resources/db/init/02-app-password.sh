#!/bin/bash
# Pone la clave REAL del rol de runtime (kioskpos_app) en el primer arranque de la BD
# en Docker, tomándola de DB_APP_PASSWORD (.env). Así producción no queda con la clave
# de desarrollo del script 01. Si la variable no está (dev), no hace nada.
set -e
if [ -n "${DB_APP_PASSWORD:-}" ] && [ "${DB_APP_PASSWORD}" != "kioskpos_app_dev" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v clave="$DB_APP_PASSWORD" <<'SQL'
ALTER ROLE kioskpos_app PASSWORD :'clave';
SQL
  echo "kioskpos_app: clave de producción aplicada"
fi
