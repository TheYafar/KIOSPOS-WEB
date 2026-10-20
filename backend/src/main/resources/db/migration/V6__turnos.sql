-- ==============================================================================
-- KIOSKPOS WEB - CUADRE DE CAJA (Paso 7)
-- Version: V6__turnos.sql
--
-- Un turno = una sesión de caja: se abre con un fondo (base de la gaveta), acumula
-- las ventas y se cierra contando el efectivo. El cierre simple compara lo esperado
-- (fondo + efectivo cobrado − vuelto) contra lo contado, y da sobrante/faltante.
-- "El vuelto siempre sale de la caja" (CLAUDE.md §9): por eso se resta al esperado.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS turnos (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    caja_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    fecha_apertura TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP,
    fondo_inicial_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    fondo_inicial_bs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO')),
    declarado_usd NUMERIC(12, 2),
    declarado_bs NUMERIC(14, 2),
    diferencia_usd NUMERIC(12, 2),
    diferencia_bs NUMERIC(14, 2),
    CONSTRAINT fk_turnos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_turnos_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_turnos_negocio_id ON turnos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_estado ON turnos(caja_id, estado);

-- Solo un turno ABIERTO por caja a la vez (evita doble apertura).
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_abierto_por_caja
    ON turnos(caja_id) WHERE estado = 'ABIERTO';

-- La venta pertenece al turno abierto de su caja (si hay uno).
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS turno_id BIGINT;
ALTER TABLE ventas ADD CONSTRAINT fk_ventas_turno FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_ventas_turno_id ON ventas(turno_id);

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos FORCE ROW LEVEL SECURITY;
CREATE POLICY turnos_aislamiento_por_negocio ON turnos
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
