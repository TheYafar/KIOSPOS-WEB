-- ==============================================================================
-- KIOSKPOS WEB - AUTENTICACIÓN (Paso 3)
-- Version: V2__auth.sql
--
-- Jerarquía: negocio -> local -> caja -> usuario.
--
-- Dos tipos de tabla:
--  A) Tablas de DATOS del negocio (locales, usuarios, cajas): llevan negocio_id y
--     Row Level Security, igual que productos. Se acceden SIEMPRE con el negocio ya
--     fijado en la sesión.
--  B) Tablas de DIRECTORIO / enrutamiento (cuentas_login, caja_tokens): SIN RLS,
--     porque se consultan para resolver a qué negocio pertenece una credencial
--     ANTES de que exista sesión (no se sabe el negocio_id todavía). Solo se
--     consultan por su clave exacta (email / hash de token) y devuelven el
--     negocio_id para luego fijar la sesión y seguir ya con RLS.
-- ==============================================================================

-- ==============================================================================
-- 1. locales (tabla de datos, RLS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS locales (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_locales_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_locales_negocio_id ON locales(negocio_id);

-- ==============================================================================
-- 2. usuarios (tabla de datos, RLS)
--    rol DUENO/ENCARGADO: entran con correo+contraseña (fila en cuentas_login).
--    rol CAJERO: entra con PIN, solo sobre una caja registrada (pin_hash aquí).
--    es_soporte: la cuenta visible "Soporte Técnico" (uriel), que el dueño puede
--    desactivar. SUPER_ADMIN es global (su panel se maneja en el Paso 4).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('DUENO', 'ENCARGADO', 'CAJERO', 'SOPORTE', 'SUPER_ADMIN')),
    pin_hash VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    es_soporte BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuarios_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_usuarios_negocio_id ON usuarios(negocio_id);

-- ==============================================================================
-- 3. cajas (tabla de datos, RLS)
--    Un equipo/navegador registrado. autorizada: el dueño la aprobó para cobrar.
--    El secreto de la caja NO vive aquí (vive hasheado en caja_tokens).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cajas (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    local_id BIGINT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    autorizada BOOLEAN NOT NULL DEFAULT TRUE,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    CONSTRAINT fk_cajas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cajas_local FOREIGN KEY (local_id) REFERENCES locales(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_cajas_negocio_id ON cajas(negocio_id);

-- ==============================================================================
-- 4. RLS para las tablas de datos (mismo patrón que productos en V1)
-- ==============================================================================
-- NULLIF(..., '') por el mismo motivo que en V1: tras un SET LOCAL previo en la
-- conexión del pool, el GUC vuelve a '' (no a NULL), y '' debe contar como "sin
-- negocio" (cero filas), no reventar el cast a bigint.
ALTER TABLE locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE locales FORCE ROW LEVEL SECURITY;
CREATE POLICY locales_aislamiento_por_negocio ON locales
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;
CREATE POLICY usuarios_aislamiento_por_negocio ON usuarios
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas FORCE ROW LEVEL SECURITY;
CREATE POLICY cajas_aislamiento_por_negocio ON cajas
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

-- ==============================================================================
-- 5. cuentas_login (DIRECTORIO, SIN RLS)
--    Credencial de correo+contraseña. email único GLOBAL para poder resolver el
--    negocio en el login (el dueño entra "desde cualquier lado", sin decir a qué
--    negocio pertenece). Solo se consulta por email exacto. La contraseña va
--    hasheada con BCrypt. Enlaza a un usuario (el "quién", en la tabla con RLS).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cuentas_login (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    negocio_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cuentas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cuentas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ==============================================================================
-- 6. caja_tokens (DIRECTORIO, SIN RLS)
--    El secreto que guarda el navegador de una caja. Se consulta por token_hash
--    exacto para resolver el negocio antes de que haya sesión. El token en claro
--    solo existe en el navegador de la caja; aquí se guarda su hash (SHA-256).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS caja_tokens (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    caja_id BIGINT NOT NULL UNIQUE,
    negocio_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cajatokens_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cajatokens_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE
);
