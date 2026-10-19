# KioskPOS Web — Backend

Ver [`CLAUDE.md`](CLAUDE.md) para el contexto completo del proyecto.

## Requisitos

- Java 21 (ya instalado: `java -version`)
- Docker Desktop (para Postgres en dev y para las pruebas con Testcontainers)

## Levantar Postgres de desarrollo

```bash
docker compose up -d
```

Esto crea:
- `kioskpos_admin` (superusuario, dueño de las tablas — solo lo usa Flyway para migrar).
- `kioskpos_app` (sin privilegios de superusuario ni de propietario — es con el que
  corre la app en runtime; así Row Level Security no se puede saltar).

Las credenciales de dev están en `docker-compose.yml` (se pueden sobreescribir con
variables de entorno `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD`, `DB_APP_USER`, `DB_APP_PASSWORD`,
`DB_NAME`, `DB_PORT`).

## Correr el backend

```bash
cd backend
./mvnw.cmd spring-boot:run
```

Health check: http://localhost:8080/actuator/health

## Correr las pruebas

```bash
cd backend
./mvnw.cmd test
```

`NegocioRlsIsolationTest` levanta su propio Postgres 16 vía Testcontainers (necesita
Docker corriendo) y prueba que una bodega no puede leer los productos de otra, incluso
conociendo el ID exacto de una fila ajena, y que sin negocio_id fijado en el contexto
no se ve nada (fail-closed) — ver [`CLAUDE.md`](CLAUDE.md) sección 2.

## Dónde está cada barrera del aislamiento multi-tenant

1. **Barrera de aplicación** — [`NegocioContext`](backend/src/main/java/com/kioskpos/web/tenant/NegocioContext.java):
   el `negocio_id` vive en un `ThreadLocal`, se fija desde la sesión (el login del
   Paso 3 lo hará) y ningún servicio lo acepta como parámetro externo —
   ver [`ProductoService`](backend/src/main/java/com/kioskpos/web/producto/ProductoService.java).
2. **Barrera de base de datos** — [`V1__negocios_and_rls.sql`](backend/src/main/resources/db/migration/V1__negocios_and_rls.sql)
   (Row Level Security con `FORCE`) + [`TenantAwareJpaTransactionManager`](backend/src/main/java/com/kioskpos/web/tenant/TenantAwareJpaTransactionManager.java)
   (fija el GUC de sesión de Postgres al iniciar cada transacción) +
   [`01-create-app-role.sql`](backend/src/main/resources/db/init/01-create-app-role.sql)
   (el rol de runtime nunca es superusuario ni propietario de las tablas).
