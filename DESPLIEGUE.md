# Despliegue de KioskPOS Web

Todo corre con Docker: **Postgres + backend (Spring Boot) + frontend (nginx)**. El
frontend sirve la PWA y hace de proxy de `/api` al backend.

## Local / servidor (cualquier máquina con Docker)

```bash
cd kioskpos-web
cp .env.example .env     # edita las claves
docker compose -f docker-compose.prod.yml up -d --build
```

Abre `http://<ip-del-servidor>` (o el `WEB_PORT` que pongas). El primer arranque:
- crea el esquema (Flyway),
- crea el rol de runtime `kioskpos_app` (db/init),
- crea el primer super admin si pusiste `KIOSKPOS_BOOTSTRAP_SUPERADMIN*`.

Luego entra como **administrador** con ese correo/clave, crea un negocio+dueño, y el
dueño crea cajas y cajeros. En cada equipo de caja, pega el **token de la caja** en la
pantalla de configuración.

## En Vultr (CLAUDE.md §8)

1. Crea un servidor en **Miami** (empieza con 2 GB) + una **base de datos administrada**
   de Postgres 16 (respaldo automático). Paga con **cripto (USDT/USDC vía BitPay)**.
2. Instala Docker en el servidor.
3. Clona el repo, crea el `.env`:
   - Si usas la **BD administrada** de Vultr: quita el servicio `postgres` del compose y
     apunta `DB_HOST`/`DB_PORT`/credenciales a esa BD. Corre una vez el script
     `backend/src/main/resources/db/init/01-create-app-role.sql` contra esa BD.
   - Si usas la BD en Docker (más simple para empezar): deja el compose como está.
4. `docker compose -f docker-compose.prod.yml up -d --build`.
5. HTTPS ya viene incluido con **Caddy** (certificado Let's Encrypt automático). Solo:
   - Apunta tu dominio al servidor (ej. `kiospos.duckdns.org` → IP del servidor).
   - Pon `DOMAIN=tudominio` en el `.env`.
   - Abre los puertos **80 y 443** en el firewall del servidor.
   Al levantar, Caddy saca el certificado solo y sirve `https://tudominio`. (La PWA
   necesita HTTPS para instalarse y para el service worker.)
6. Monitoreo: UptimeRobot gratis al `/` del sitio. Respaldo diario (lo da la BD
   administrada de Vultr) o `pg_dump` off-site si usas la BD en Docker.

## Notas de seguridad

- Cambia **todas** las claves del `.env` (admin de BD, JWT, super admin).
- Para producción seria, cambia también la clave de `kioskpos_app` en el script de
  `db/init` y en `.env` (deben coincidir).
- Quita las variables `KIOSKPOS_BOOTSTRAP_SUPERADMIN*` después del primer arranque.
- El **Conector de impresión** corre en cada PC de caja (ver `conector/README.md`), no
  en el servidor.
