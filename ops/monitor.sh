#!/usr/bin/env bash
# Vigilancia del servidor (cron cada 5 min). Avisa por Telegram (ops/avisar.sh) cuando algo
# se cae y otra vez cuando se recupera (no repite el mismo aviso cada 5 minutos).
#  - la app responde /actuator/health por el dominio (HTTPS) o localmente
#  - los contenedores postgres/backend/frontend/caddy están corriendo
#  - el disco no pasa de 85 %
#  - el último respaldo tiene menos de 30 horas
#  - el certificado HTTPS vence en más de 14 días
# Cron:  */5 * * * * root cd /opt/KIOSPOS-WEB && ./ops/monitor.sh >> /var/log/kioskpos-monitor.log 2>&1
set -uo pipefail
cd "$(dirname "$0")/.."
leer() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
: "${DOMAIN:=$(leer DOMAIN)}"
RESPALDOS="${DESTINO:-/var/backups/kioskpos}"
ESTADO_DIR="${ESTADO_DIR:-/var/lib/kioskpos-monitor}"
mkdir -p "$ESTADO_DIR"
COMPOSE="docker compose -f docker-compose.prod.yml"
problemas=()

# 1) La app responde.
URL="http://127.0.0.1/actuator/health"
[ -n "${DOMAIN:-}" ] && URL="https://${DOMAIN}/actuator/health"
if ! curl -fsS -m 10 "$URL" | grep -q '"UP"'; then
  problemas+=("la app no responde en $URL")
fi

# 2) Contenedores.
for s in postgres backend frontend caddy; do
  if ! $COMPOSE ps --status running --services 2>/dev/null | grep -qx "$s"; then
    problemas+=("el contenedor '$s' no está corriendo")
  fi
done

# 3) Disco.
uso=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
[ "${uso:-0}" -ge 85 ] && problemas+=("disco al ${uso}%")

# 4) Respaldo reciente.
ultimo=$(ls -1t "$RESPALDOS"/kioskpos-*.sql.gz 2>/dev/null | head -1)
if [ -z "$ultimo" ]; then
  problemas+=("no hay respaldos en $RESPALDOS")
elif [ $(( $(date +%s) - $(stat -c %Y "$ultimo") )) -gt $(( 30 * 3600 )) ]; then
  problemas+=("el último respaldo tiene más de 30 horas ($(basename "$ultimo"))")
fi

# 5) Certificado HTTPS.
if [ -n "${DOMAIN:-}" ]; then
  fin=$(echo | timeout 10 openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$fin" ]; then
    dias=$(( ($(date -d "$fin" +%s) - $(date +%s)) / 86400 ))
    [ "$dias" -lt 14 ] && problemas+=("el certificado HTTPS vence en $dias días")
  fi
fi

# Avisar solo cuando cambia el estado.
anterior=$(cat "$ESTADO_DIR/estado" 2>/dev/null || echo "OK")
if [ ${#problemas[@]} -gt 0 ]; then
  resumen=$(printf '%s; ' "${problemas[@]}")
  if [ "$anterior" != "$resumen" ]; then
    ./ops/avisar.sh "⚠️ PROBLEMA: $resumen"
    echo "$resumen" > "$ESTADO_DIR/estado"
  fi
  exit 1
fi
if [ "$anterior" != "OK" ]; then
  ./ops/avisar.sh "✅ Todo volvió a la normalidad"
  echo "OK" > "$ESTADO_DIR/estado"
fi
exit 0
