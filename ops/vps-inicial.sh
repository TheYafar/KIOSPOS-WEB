#!/usr/bin/env bash
# Preparación inicial de un VPS Ubuntu 22.04/24.04 (Vultr Miami) para KioskPOS.
# Se corre UNA vez como root, ANTES de clonar y levantar la app:
#   curl -fsSL https://raw.githubusercontent.com/TheYafar/KIOSPOS-WEB/main/ops/vps-inicial.sh -o vps.sh
#   less vps.sh            # léelo antes de correrlo
#   sudo bash vps.sh
#
# Hace: actualizaciones automáticas de seguridad, firewall (solo 22/80/443),
# fail2ban (frena fuerza bruta por SSH), swap de 2 GB (VPS chicos), Docker,
# usuario "kiosk" sin clave (entra con tu llave SSH) y el cron del respaldo diario.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Córrelo con sudo"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades ca-certificates curl git rclone

# 1) Parches de seguridad automáticos
dpkg-reconfigure -f noninteractive unattended-upgrades

# 2) Firewall: solo SSH y web
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 3) fail2ban para SSH
cat > /etc/fail2ban/jail.d/sshd.local <<'J'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
J
systemctl enable --now fail2ban

# 4) Swap (evita que Java se caiga por memoria en 1-2 GB)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 5) Docker (repositorio oficial)
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# 6) Usuario de trabajo con tu llave SSH (copia la de root)
if ! id kiosk >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" kiosk
  usermod -aG docker,sudo kiosk
  mkdir -p /home/kiosk/.ssh && cp /root/.ssh/authorized_keys /home/kiosk/.ssh/ 2>/dev/null || true
  chown -R kiosk:kiosk /home/kiosk/.ssh && chmod 700 /home/kiosk/.ssh
fi

# 7) SSH: solo con llave (desactiva claves) — SOLO si ya hay una llave cargada
if [ -s /root/.ssh/authorized_keys ]; then
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload ssh || systemctl reload sshd
else
  echo "AVISO: no hay llave SSH en /root/.ssh/authorized_keys; NO se desactivó el login con clave."
fi

# 8) Respaldo diario 3:15 am, prueba de restauración los domingos y vigilancia cada 5 min
#    (la app debe estar en /opt/KIOSPOS-WEB). Avisos por Telegram: TELEGRAM_TOKEN y
#    TELEGRAM_CHAT_ID en el .env (ver DESPLIEGUE.md).
cat > /etc/cron.d/kioskpos-respaldo <<'C'
15 3 * * * root cd /opt/KIOSPOS-WEB && ./ops/respaldo.sh >> /var/log/kioskpos-respaldo.log 2>&1 || ./ops/avisar.sh "El respaldo diario falló"
30 4 * * 0 root cd /opt/KIOSPOS-WEB && ./ops/probar-respaldo.sh >> /var/log/kioskpos-respaldo.log 2>&1
*/5 * * * * root cd /opt/KIOSPOS-WEB && ./ops/monitor.sh >> /var/log/kioskpos-monitor.log 2>&1
C

echo "Listo. Ahora: git clone https://github.com/TheYafar/KIOSPOS-WEB.git /opt/KIOSPOS-WEB, crea el .env y levanta (ver DESPLIEGUE.md)."
