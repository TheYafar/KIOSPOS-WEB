-- ==============================================================================
-- KIOSKPOS WEB - INVENTARIO (Paso 6)
-- Version: V5__inventario.sql
--
-- Amplía productos con los campos que faltaban del modelo del escritorio (costo,
-- categoría, stock mínimo, pesable, unidad) y agrega la bitácora de movimientos de
-- inventario. productos ya tenía negocio_id + RLS (V1); movimientos_inventario los
-- añade igual.
-- ==============================================================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) NOT NULL DEFAULT 'General';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(12, 3) NOT NULL DEFAULT 0.000;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_pesable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(10) NOT NULL DEFAULT 'UND';

-- ==============================================================================
-- movimientos_inventario: bitácora de cada cambio de stock (venta, ajuste, importación).
-- cantidad es con signo (negativa = salida). Guarda stock antes/después para auditar.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    producto_id BIGINT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    cantidad NUMERIC(12, 3) NOT NULL,
    stock_previo NUMERIC(12, 3) NOT NULL,
    stock_posterior NUMERIC(12, 3) NOT NULL,
    referencia VARCHAR(100),
    descripcion VARCHAR(255),
    usuario_id BIGINT,
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movinv_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_movinv_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_movinv_negocio_id ON movimientos_inventario(negocio_id);
CREATE INDEX IF NOT EXISTS idx_movinv_producto_id ON movimientos_inventario(producto_id);

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario FORCE ROW LEVEL SECURITY;
CREATE POLICY movinv_aislamiento_por_negocio ON movimientos_inventario
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
