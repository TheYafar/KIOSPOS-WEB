-- Seguridad del acceso (Sección 3).
-- Tablas de DIRECTORIO (sin RLS, como cuentas_login): se usan ANTES de que exista sesión.

-- 1) Bloqueo por intentos fallidos. clave = 'dueno:<correo>' | 'cajero:<cajaId>:<usuarioId>' | 'admin:<correo>'.
CREATE TABLE intentos_login (
    clave           VARCHAR(300) PRIMARY KEY,
    fallos          INT          NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    ultimo_fallo    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2) "Olvidé mi contraseña" del dueño/encargado: enlace de un solo uso (se guarda el hash).
CREATE TABLE reset_clave (
    id              BIGSERIAL    PRIMARY KEY,
    cuenta_login_id BIGINT       NOT NULL REFERENCES cuentas_login (id) ON DELETE CASCADE,
    token_hash      VARCHAR(64)  NOT NULL UNIQUE,
    expira          TIMESTAMPTZ  NOT NULL,
    usado           BOOLEAN      NOT NULL DEFAULT FALSE,
    creado          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX reset_clave_cuenta_idx ON reset_clave (cuenta_login_id);

-- 3) Verificación en dos pasos (TOTP, apps tipo Google Authenticator) del super admin.
ALTER TABLE super_admins
    ADD COLUMN totp_secreto VARCHAR(64),
    ADD COLUMN totp_activo  BOOLEAN NOT NULL DEFAULT FALSE;
