# Desplegar KioskPOS Web en la nube (para probarlo online)

Esta app **no es estática**: necesita el backend (Java + PostgreSQL). Por eso
Vercel/GitHub Pages **solos no bastan** (solo sirven el frontend). Aquí tienes dos
caminos para tenerla funcionando online con su link.

> El dueño del repo despliega esto en **su** cuenta; el link sale al terminar.

---

## Opción 1 — VPS con Docker (recomendado: funciona idéntico a local)

Es la más simple porque el repo ya está hecho para `docker-compose`: el script del
rol de la base y el proxy del frontend se configuran solos.

1. Crea un VPS barato (Vultr Miami ~$6/mes, o DigitalOcean/Hetzner). Ubuntu 22/24.
2. Instala Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Clona y configura:
   ```bash
   git clone https://github.com/TheYafar/KIOSPOS-WEB
   cd KIOSPOS-WEB
   cp .env.example .env
   nano .env   # pon claves reales (ver abajo)
   ```
4. Levanta todo y siembra datos de demo:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   sleep 60
   BASE_URL=http://localhost node seed-dev.mjs    # necesita Node; o corre el seed desde tu PC apuntando a la IP
   ```
5. Abre **http://IP-DEL-VPS** → login verde/blanco, funcional.
6. Para HTTPS y dominio: pon un proxy (Caddy/Traefik) delante, o el balanceador del
   proveedor. La PWA necesita HTTPS para instalarse.

`.env` mínimo:
```
DB_ADMIN_PASSWORD=pon-una-clave-fuerte
KIOSKPOS_JWT_SECRET=un-secreto-aleatorio-de-al-menos-32-bytes
KIOSKPOS_BOOTSTRAP_SUPERADMINEMAIL=uriel@kioskpos.com
KIOSKPOS_BOOTSTRAP_SUPERADMINPASSWORD=superadmin123
```

---

## Opción 2 — Render (plan free, con 2 pasos manuales)

El repo trae un **blueprint** (`render.yaml`) que crea Postgres + backend + frontend.

1. En https://render.com → **New → Blueprint** → conecta este repositorio.
   Render lee `render.yaml` y crea los 3 recursos. Deja que la base y el backend
   terminen de crearse.

2. **PASO MANUAL A — crear el rol de la app en la base.** La base administrada no
   corre el script de init sola. Copia la *External Connection string* de la base
   en Render (empieza por `postgresql://kioskpos_admin:...`) y ejecuta una vez:
   ```bash
   psql "PEGA-AQUI-LA-CONNECTION-STRING-EXTERNA" \
     -f backend/src/main/resources/db/init/01-create-app-role.sql
   ```
   (Crea el rol `kioskpos_app` con la clave `kioskpos_app_dev`, que es la que usa el
   backend. Si cambias esa clave, cámbiala también en el script y en `render.yaml`.)
   Luego, en el servicio **kioskpos-backend** → **Manual Deploy → Restart** para que
   conecte ya con el rol creado.

3. **PASO MANUAL B — ajustar el proxy del frontend (si hace falta).** Abre el servicio
   **kioskpos-backend** y copia su URL (ej. `https://kioskpos-backend-xxxx.onrender.com`).
   Si NO es exactamente `https://kioskpos-backend.onrender.com`, edita en `render.yaml`
   el `destination` del rewrite `/api/*` con la URL real y vuelve a desplegar el
   frontend (o cámbialo en Render → kioskpos-frontend → Redirects/Rewrites).

4. **Siembra los datos de demo.** Desde tu PC (con Node):
   ```bash
   BASE_URL=https://kioskpos-backend-xxxx.onrender.com node seed-dev.mjs
   ```
   (usa la URL real del backend).

5. Abre la URL del **frontend** (`https://kioskpos-frontend-xxxx.onrender.com`) → listo.

> El plan free de Render **duerme** los servicios tras inactividad (el primer acceso
> tarda ~30 s en despertar) y la base expira a los ~90 días. Para algo estable, usa
> la Opción 1 (VPS) o un plan pago.

---

## Credenciales de demo (las crea `seed-dev.mjs`)

| Rol | Entra con | Clave / PIN |
|---|---|---|
| Súper admin (uriel) | `uriel@kioskpos.com` | `superadmin123` |
| Dueño | `dueno@bodegademo.com` | `dueno123456` |
| Encargado | `encargado@bodegademo.com` | `encargado123` |
| Cajero (Ana) | PIN | `1234` |
| Cajero (José) | PIN | `5678` |

El **token de la caja** lo imprime el seed al final: en la pantalla de entrada,
la primera vez, pégalo en "Configura esta caja". Luego aparecen Ana y José.

> Cambia todas estas claves antes de usarlo con datos reales, y quita las variables
> `KIOSKPOS_BOOTSTRAP_SUPERADMIN*` tras el primer arranque.
