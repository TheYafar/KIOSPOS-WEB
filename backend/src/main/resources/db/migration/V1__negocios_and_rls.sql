-- ==============================================================================
-- KIOSKPOS WEB - ESQUEMA BASE MULTI-TENANT (negocio_id + ROW LEVEL SECURITY)
-- Version: V1__negocios_and_rls.sql
--
-- Esta migración solo crea esquema. La creación del rol de aplicación sin
-- privilegios de superusuario (kioskpos_app) vive fuera de Flyway, en
-- db/init/01-create-app-role.sql, porque es infraestructura de la base de
-- datos (se ejecuta una sola vez, como superusuario, antes de que exista
-- ninguna tabla) y no un cambio de esquema versionado.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABLA: negocios (el "tenant")
-- ==============================================================================
CREATE TABLE IF NOT EXISTS negocios (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'AVISO', 'SUSPENDIDA')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 2. TABLA: productos (caso de prueba del aislamiento por negocio)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS productos (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    codigo_barras VARCHAR(50) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio_usd NUMERIC(12, 2) NOT NULL,
    stock_actual NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_productos_negocio FOREIGN KEY (negocio_id)
        REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT uq_productos_negocio_codigo UNIQUE (negocio_id, codigo_barras)
);

CREATE INDEX IF NOT EXISTS idx_productos_negocio_id ON productos(negocio_id);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY — segunda barrera, a nivel de base de datos
--    FORCE: aplica incluso al propietario de la tabla (kioskpos_admin), que es
--    quien ejecuta esta migración. El rol de runtime de la app (kioskpos_app)
--    nunca es superusuario ni propietario, así que ya le aplicaría sin FORCE;
--    FORCE además impide que un futuro "ALTER ROLE kioskpos_app ... OWNER"
--    accidental abra una puerta de escape.
--    Sin negocio fijado -> cero filas (fail-closed). Se usa NULLIF(..., '') porque,
--    tras un SET LOCAL previo en la misma conexión del pool, el GUC no vuelve a NULL
--    sino a cadena vacía '', y ''::bigint daría error en vez de cerrar el acceso.
-- ==============================================================================
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos FORCE ROW LEVEL SECURITY;

CREATE POLICY productos_aislamiento_por_negocio ON productos
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
