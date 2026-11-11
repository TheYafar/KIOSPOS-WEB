#!/bin/sh
# Arma la config de nginx a partir de nginx.conf.template en CADA arranque del
# contenedor, con:
#  - PORT: el puerto en el que escucha (local/Docker: 80; Railway: el que te asigne).
#  - BACKEND_HOST: host:puerto del backend (local/Docker: "backend:8080"; en Railway,
#    el host interno de ese servicio — ver RAILWAY.md).
#  - RESOLVER: el DNS del propio contenedor (de /etc/resolv.conf), para resolver
#    BACKEND_HOST en caliente y no solo al arrancar (ver nginx.conf.template).
set -e

export PORT="${PORT:-80}"
export BACKEND_HOST="${BACKEND_HOST:-backend:8080}"
export RESOLVER="$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null)"
export RESOLVER="${RESOLVER:-127.0.0.11}"

envsubst '${PORT} ${BACKEND_HOST} ${RESOLVER}' \
  < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
