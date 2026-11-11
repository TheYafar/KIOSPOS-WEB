-- ==============================================================================
-- Callback de Flyway: se ejecuta ANTES de migrar, en CADA arranque, sobre la
-- conexión administrativa de Flyway (dueño de las tablas). Idempotente.
--
-- Crea el rol de runtime `kioskpos_app` (con el que la app sirve requests, sin
-- privilegios de superusuario para que Row Level Security no se pueda saltar) si
-- aún no existe, y SIEMPRE sincroniza su clave con ${kioskposAppPassword}
-- (= DB_APP_PASSWORD, placeholder de Flyway). Reemplaza al script manual
-- db/init/01-create-app-role.sql + 02-app-password.sh en despliegues con base
-- ADMINISTRADA (Render, Railway, Vultr, etc.) donde esos init no corren solos:
-- sin esto, una base administrada se quedaba con la clave de desarrollo
-- 'kioskpos_app_dev' para siempre. En Docker local el init ya la puso igual,
-- así que este ALTER es un no-op (misma clave).
--
-- Corre antes de que el pool de runtime (Hikari) intente conectarse, así que el
-- backend ya encuentra el rol listo (y con su clave real) y arranca sin el paso
-- manual de psql.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kioskpos_app') THEN
        CREATE ROLE kioskpos_app LOGIN PASSWORD '${kioskposAppPassword}';
    ELSE
        ALTER ROLE kioskpos_app PASSWORD '${kioskposAppPassword}';
    END IF;
END
$$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO kioskpos_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO kioskpos_app;

-- Tablas/secuencias que YA existan (en una base ya migrada).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kioskpos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kioskpos_app;

-- Tablas/secuencias que Flyway cree DESPUÉS (base nueva), mientras las cree este
-- mismo usuario administrador.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kioskpos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO kioskpos_app;
