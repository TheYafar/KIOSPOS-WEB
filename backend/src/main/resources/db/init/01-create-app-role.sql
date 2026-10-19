-- ==============================================================================
-- Bootstrap de infraestructura (NO es una migración Flyway).
--
-- Crea el rol con el que la aplicación se conecta en TIEMPO DE EJECUCIÓN:
-- sin privilegios de superusuario y sin ser propietario de ninguna tabla, para
-- que Row Level Security (ver V1__negocios_and_rls.sql) no se pueda saltar.
--
-- Se ejecuta UNA SOLA VEZ, antes de que exista ninguna tabla:
--  - En dev: automáticamente, vía docker-entrypoint-initdb.d (docker-compose.yml).
--  - En pruebas: vía Testcontainers PostgreSQLContainer#withInitScript.
--  - En producción (Vultr): a mano, una sola vez, contra la base administrada,
--    conectado como el usuario administrador que entrega Vultr.
--
-- El usuario que ejecuta este script (POSTGRES_USER / el admin de Vultr) sigue
-- siendo el dueño de las tablas que cree Flyway; las default privileges de
-- abajo hacen que kioskpos_app pueda usarlas sin ser su propietario.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kioskpos_app') THEN
        CREATE ROLE kioskpos_app LOGIN PASSWORD 'kioskpos_app_dev';
    END IF;
END
$$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO kioskpos_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO kioskpos_app;

-- Aplica a las tablas/secuencias que YA existan al correr esto (normalmente ninguna).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kioskpos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kioskpos_app;

-- Aplica automáticamente a las tablas/secuencias que Flyway cree DESPUÉS,
-- mientras las siga creando el usuario que ejecuta este script.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kioskpos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO kioskpos_app;
