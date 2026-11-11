#!/usr/bin/env bash
# Manda un aviso a Telegram (si TELEGRAM_TOKEN y TELEGRAM_CHAT_ID están en .env) y lo deja en el log.
# Uso: ./ops/avisar.sh "texto"
set -uo pipefail
cd "$(dirname "$0")/.."
leer() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
: "${TELEGRAM_TOKEN:=$(leer TELEGRAM_TOKEN)}"
: "${TELEGRAM_CHAT_ID:=$(leer TELEGRAM_CHAT_ID)}"
MSG="KioskPOS ($(hostname)): ${1:-aviso}"
echo "$(date -Is) $MSG"
if [ -n "${TELEGRAM_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  curl -fsS -m 15 "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${MSG}" > /dev/null || echo "$(date -Is) no se pudo avisar por Telegram"
fi
