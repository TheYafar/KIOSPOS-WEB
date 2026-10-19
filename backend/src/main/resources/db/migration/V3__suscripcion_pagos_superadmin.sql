-- ==============================================================================
-- KIOSKPOS WEB - SUSCRIPCIÓN, PAGOS Y SUPER ADMIN (Paso 4)
-- Version: V3__suscripcion_pagos_superadmin.sql
--
-- El "corazón del negocio" (CLAUDE.md §3): cada negocio tiene una suscripción
-- mensual. El super admin (uriel) aprueba pagos manuales que empujan "pagó hasta".
-- La caja necesita un permiso firmado por el servidor para cobrar; ese permiso solo
-- se renueva si el negocio está al día.
--
-- Las tablas de FACTURACIÓN (campos de suscripción en negocios, pagos, super_admins)
-- NO van bajo Row Level Security: son datos que el super admin maneja de forma
-- transversal a todos los negocios. Los endpoints del dueño filtran por su negocio_id
-- en la aplicación. Esto es coherente con que negocios ya era una tabla sin RLS.
-- ==============================================================================

-- ==============================================================================
-- 1. Campos de suscripción en negocios
--    plan: nombre del plan (precio en el catálogo del código).
--    pago_hasta: fecha hasta la que está pagado (NULL = nunca ha pagado).
--    estado (ya existía): aquí se usa como OVERRIDE MANUAL del super admin:
--      'SUSPENDIDA' = cortado a mano; 'ACTIVA' = normal. El estado "AVISO" y la
--      escalera de corte se CALCULAN desde pago_hasta y el reloj del servidor, no
--      se guardan.
-- ==============================================================================
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS plan VARCHAR(30) NOT NULL DEFAULT 'BASICO';
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS pago_hasta DATE;

-- ==============================================================================
-- 2. pagos (sin RLS — facturación transversal)
--    El dueño reporta un pago (PENDIENTE); el super admin lo aprueba (APROBADO) y
--    eso empuja pago_hasta. metodo/referencia: pago móvil, etc. (manuales por ahora).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pagos (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    monto NUMERIC(14, 2) NOT NULL,
    moneda VARCHAR(10) NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'VES')),
    metodo VARCHAR(30) NOT NULL,
    referencia VARCHAR(120),
    meses INT NOT NULL DEFAULT 1 CHECK (meses >= 1),
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    reportado_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aprobado_at TIMESTAMP,
    aprobado_por BIGINT,
    CONSTRAINT fk_pagos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pagos_negocio_id ON pagos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);

-- ==============================================================================
-- 3. super_admins (sin RLS — identidad global, no pertenece a ningún negocio)
--    uriel. La verificación en dos pasos (2FA) queda pendiente (se anota en código).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS super_admins (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
