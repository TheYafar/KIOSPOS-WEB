# Desplegar en Railway

Sí: Railway te da un **link público funcionando** (`https://algo.up.railway.app`, o tu
propio dominio) con los 3 servicios. Son **3 servicios dentro de un mismo proyecto**
Railway, hechos del mismo repo:

1. **Postgres** (plugin de Railway, administrado — no es el de `docker-compose`).
2. **backend** (`backend/Dockerfile`).
3. **frontend** (`frontend/Dockerfile`) — este es el que le das al cliente.

No usa Caddy ni nginx-como-proxy-de-dominio: Railway ya te da HTTPS automático en su
subdominio. El `Caddyfile`/`docker-compose.prod.yml` son para tu propio VPS; en Railway
no se usan.

## 1. Crea el proyecto y el Postgres

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** →
   elige `KIOSPOS-WEB`.
2. En el proyecto: **+ New** → **Database** → **PostgreSQL**. Railway lo deja listo con
   sus propias variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`).

Railway te crea un primer servicio apuntando al repo entero — bórralo (los dos pasos
siguientes lo reemplazan por **backend** y **frontend** por separado).

## 2. Servicio **backend**

**+ New** → **GitHub Repo** → el mismo repo. Luego, en ese servicio:

- **Settings → Root Directory**: `backend`
- **Settings → Builder**: Dockerfile (Railway lo detecta solo al ver `backend/Dockerfile`)
- **Variables** (pestaña Variables; `${{Postgres.PGHOST}}` etc. son referencias a las
  variables del servicio Postgres — Railway las autocompleta al escribir `${{`):

  ```
  DB_HOST=${{Postgres.PGHOST}}
  DB_PORT=${{Postgres.PGPORT}}
  DB_NAME=${{Postgres.PGDATABASE}}
  DB_ADMIN_USER=${{Postgres.PGUSER}}
  DB_ADMIN_PASSWORD=${{Postgres.PGPASSWORD}}
  DB_APP_USER=kioskpos_app
  DB_APP_PASSWORD=<genera una clave fuerte aparte — NO la de Postgres>
  KIOSKPOS_JWT_SECRET=<openssl rand -base64 48>
  KIOSKPOS_BOOTSTRAP_SUPERADMINEMAIL=tu-correo@dominio.com
  KIOSKPOS_BOOTSTRAP_SUPERADMINPASSWORD=<clave fuerte>
  MAIL_APP_URL=https://<el dominio que te dé el servicio frontend, lo pones después>
  ```

  (`DB_APP_PASSWORD` la toma `beforeMigrate.sql` para crear/sincronizar el rol de
  runtime — ya no se queda con la clave de desarrollo en una base administrada.)

- **Settings → Networking → Generate Domain** (opcional, solo para probar el backend
  solo o pegarle con `curl`; el frontend NO necesita este dominio público, usa la red
  privada — paso siguiente).
- Deploy. Mira los **Logs**: debe decir `Started KioskposWebBackendApplication`.

## 3. Servicio **frontend**

**+ New** → **GitHub Repo** → el mismo repo otra vez.

- **Settings → Root Directory**: `frontend`
- **Settings → Builder**: Dockerfile
- **Variables**:

  ```
  BACKEND_HOST=backend.railway.internal:${{backend.PORT}}
  ```

  (`backend` = el **nombre exacto** que le pusiste al servicio del paso 2, en
  minúsculas y sin espacios — revísalo en Settings → Service Name de ese servicio.
  `${{backend.PORT}}` es el puerto que Railway le asignó a ESE servicio; se autocompleta
  igual que con Postgres.)

- **Settings → Networking → Generate Domain**. Esa URL (`https://xxxx.up.railway.app`)
  es el link que le das al cliente.
- Deploy.

Abre esa URL: debe cargar el login de KioskPOS. Si sale "No se pudo cargar" o 502/504,
ver **Solución de problemas** abajo.

## 4. Primer uso

1. Entra con el correo/clave de `KIOSKPOS_BOOTSTRAP_SUPERADMINEMAIL` en
   `https://tu-frontend.up.railway.app/#admin` (o el botón "Soy el administrador" en
   Login) — ese es el panel de super admin.
2. Crea el primer negocio (nombre, dueño, correo, clave, plan).
3. **Borra** `KIOSKPOS_BOOTSTRAP_SUPERADMINEMAIL`/`PASSWORD` del servicio backend una vez
   creado el primer super admin (igual que en cualquier despliegue — CLAUDE.md §9).

## 5. Correo y HTTPS para el Conector

- **Correo** (opcional): agrega las variables de `MAIL_*` del `.env.example` al servicio
  backend (Resend). Sin ellas, la app funciona igual; solo no manda correos.
- **El Conector de impresión** (en la PC de la caja) solo necesita que la PWA tenga
  HTTPS — Railway ya lo da solo. No hace falta nada más ahí.

## Solución de problemas

- **502/504 al abrir el link del frontend**: casi siempre `BACKEND_HOST` mal escrito
  (nombre de servicio o puerto). Revisa los **Logs** del servicio frontend: si dice
  algo de `backend.railway.internal` y "could not be resolved" o "Connection refused",
  el nombre o el puerto no coinciden con el servicio backend real.
- **El backend no arranca / se reinicia solo**: mira sus Logs. Casi siempre son las
  variables de Postgres mal copiadas (`DB_HOST`/`DB_PORT`/etc.) o que el Postgres
  todavía no terminó de aprovisionarse — espera un minuto y vuelve a desplegar.
- **Login de super admin da "credenciales inválidas"**: revisa que
  `KIOSKPOS_BOOTSTRAP_SUPERADMINEMAIL/PASSWORD` estaban puestas ANTES del primer
  arranque del backend (el seeder solo crea el super admin si todavía no existe
  ninguno). Si ya arrancó sin ellas, agrégalas y vuelve a desplegar ese servicio.
- **Railway cobra**: no tiene capa gratis indefinida como antes; revisa su plan actual
  antes de dejarlo en producción con clientes reales.
