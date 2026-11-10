# Seguridad y operación de KioskPOS Web

Guía corta para tener el servidor seguro, respaldado y saber qué hacer si una clave se filtra.

## 1. Lo que ya hace la app

| Qué | Cómo |
|---|---|
| Bloqueo por intentos | 5 fallos seguidos de **PIN**, **clave del dueño** o **clave/código del super admin** → bloqueado 15 min (configurable: `KIOSKPOS_LOGIN_MAX_INTENTOS`, `KIOSKPOS_LOGIN_BLOQUEO_MINUTOS`). Avisa "te quedan N intentos". |
| Olvidé mi contraseña | El dueño pide un enlace por correo (vence en 30 min, un solo uso). Si el correo no está configurado, **tú** (super admin) generas el enlace en el panel → *Enlace para cambiar clave* y se lo mandas por WhatsApp (vence en 24 h). |
| 2FA del super admin | En el panel de admin → *Seguridad* → escanea el QR con Google Authenticator / Authy. Desde ahí el login pide el código de 6 dígitos. **Actívalo apenas entres.** |
| Contraseñas y PIN | BCrypt. Tokens de caja y enlaces: solo se guarda su SHA-256. |
| Separación por negocio | `negocio_id` + Row Level Security en Postgres. |

## 2. Servidor (VPS) — una sola vez

1. Crea el VPS (Ubuntu 24.04, Miami) **con tu llave SSH**.
2. Prepara el servidor (firewall 22/80/443, fail2ban, parches automáticos, swap, Docker, cron del respaldo):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/TheYafar/KIOSPOS-WEB/main/ops/vps-inicial.sh -o vps.sh
   sudo bash vps.sh
   ```
3. Clona en `/opt/KIOSPOS-WEB`, copia `.env.example` a `.env` y cambia **todas** las claves
   (`openssl rand -base64 48` para cada una). Levanta con `docker compose -f docker-compose.prod.yml up -d --build`.
4. Entra como super admin, **activa la 2FA** y borra `KIOSKPOS_BOOTSTRAP_SUPERADMIN*` del `.env`.
5. Monitoreo: UptimeRobot (gratis) a `https://tudominio/actuator/health`, aviso al correo/Telegram.

## 3. Respaldos

- **Diario automático** a las 3:15 am (`/etc/cron.d/kioskpos-respaldo` → `ops/respaldo.sh`), 14 días en
  `/var/backups/kioskpos`. Log: `/var/log/kioskpos-respaldo.log`.
- **Fuera del servidor** (obligatorio: si el VPS muere, el respaldo muere con él): configura `rclone`
  (`rclone config`, ej. Backblaze B2 ~$0,006/GB) y pon `RCLONE_DESTINO=b2:kioskpos-respaldos` en el `.env`.
- **Probar la restauración** una vez al mes en un servidor de prueba:
  `sudo ./ops/restaurar.sh /var/backups/kioskpos/kioskpos-AAAAMMDD-HHMMSS.sql.gz`.
- Si usas la **BD administrada** de Vultr, ella hace el respaldo diario; igual conviene el `pg_dump` off-site.

## 4. Rotar claves (si se filtró una o cada 6 meses)

**Clave JWT (sesiones)** — sin sacar a nadie:
1. En `.env`: `KIOSKPOS_JWT_SECRET_ANTERIOR=<la actual>` y `KIOSKPOS_JWT_SECRET=<nueva>`.
2. `docker compose -f docker-compose.prod.yml up -d backend`.
3. Al día siguiente (pasadas 12 h) vacía `KIOSKPOS_JWT_SECRET_ANTERIOR` y reinicia otra vez.
   Si la clave se **filtró**, sáltate el paso 1 (sin anterior): todos vuelven a iniciar sesión.

**Clave de la base de datos** (`kioskpos_app` y la de admin):
```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U kioskpos_admin -d kioskpos \
  -c "ALTER ROLE kioskpos_app PASSWORD 'NUEVA'"
```
Pon la misma en `DB_APP_PASSWORD` del `.env` y reinicia el backend. Igual con `kioskpos_admin` / `DB_ADMIN_PASSWORD`.

**API key de Resend (correo):** en resend.com → API Keys → crea una nueva, ponla en `MAIL_PASS`, reinicia el
backend y **borra la vieja**. ⚠️ La key que se pegó en el chat de desarrollo debe considerarse filtrada:
rótala ya.

**Super admin:** cambia la clave y, si perdiste el teléfono de la 2FA, desactívala desde la base:
`UPDATE super_admins SET totp_activo=false, totp_secreto=NULL WHERE email='tu@correo';` (y vuelve a activarla).

**Token de una caja** (si roban el equipo): en el panel del dueño → *Equipo y cajas* → desautoriza esa caja.

## 5. Nunca

- Subir el `.env` a git, ni pegar claves en chats.
- Crear cuentas admin ocultas (CLAUDE.md §9). La de "Soporte Técnico" es visible y el dueño la puede apagar.
- Probar con ventas reales en el POS de un cliente.
