-- ==============================================================================
-- KIOSKPOS WEB - VENTAS (Paso 5)
-- Version: V4__ventas.sql
--
-- Una venta pertenece a un negocio, una caja y un cajero. El servidor re-valida
-- (CLAUDE.md §2): recalcula los montos con SUS precios, descuenta stock de forma
-- atómica y exige un permiso de cobro vigente. numero_factura es correlativo POR
-- CAJA (CLAUDE.md §5). codigo_unico permite deduplicar reenvíos de la cola offline
-- (modelo SincronizadorModoLocal) sin cobrar dos veces.
--
-- Igual que el resto de datos del negocio: negocio_id + Row Level Security en cada
-- tabla (ventas, detalle_ventas, pagos_venta).
-- ==============================================================================

-- ==============================================================================
-- 1. ventas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ventas (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    caja_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    codigo_unico VARCHAR(64),
    numero_factura INT NOT NULL,
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tasa_bcv NUMERIC(14, 4) NOT NULL,
    total_usd NUMERIC(12, 2) NOT NULL,
    total_bs NUMERIC(14, 2) NOT NULL,
    vuelto_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    vuelto_bs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA', 'ANULADA')),
    CONSTRAINT fk_ventas_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ventas_caja FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ventas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT uq_ventas_caja_factura UNIQUE (caja_id, numero_factura),
    CONSTRAINT uq_ventas_negocio_codigo UNIQUE (negocio_id, codigo_unico)
);
CREATE INDEX IF NOT EXISTS idx_ventas_negocio_id ON ventas(negocio_id);
CREATE INDEX IF NOT EXISTS idx_ventas_caja_fecha ON ventas(caja_id, fecha_hora);

-- ==============================================================================
-- 2. detalle_ventas (producto_id NULL = cobro rápido: artículo cobrado por monto)
--    nombre: copia del nombre al momento de la venta (no cambia si el producto se
--    renombra después).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    venta_id BIGINT NOT NULL,
    producto_id BIGINT,
    nombre VARCHAR(150) NOT NULL,
    cantidad NUMERIC(12, 3) NOT NULL CHECK (cantidad > 0),
    precio_unitario_usd NUMERIC(12, 2) NOT NULL,
    subtotal_usd NUMERIC(12, 2) NOT NULL,
    CONSTRAINT fk_detalles_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_detalles_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    CONSTRAINT fk_detalles_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_detalles_venta_id ON detalle_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalles_negocio_id ON detalle_ventas(negocio_id);

-- ==============================================================================
-- 3. pagos_venta
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pagos_venta (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    venta_id BIGINT NOT NULL,
    metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'PUNTO', 'PAGO_MOVIL', 'BIOPAGO')),
    moneda VARCHAR(10) NOT NULL CHECK (moneda IN ('USD', 'VES')),
    monto_original NUMERIC(14, 2) NOT NULL,
    equivalente_usd NUMERIC(12, 2) NOT NULL,
    referencia VARCHAR(100),
    CONSTRAINT fk_pagosventa_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pagosventa_venta FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pagosventa_venta_id ON pagos_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagosventa_negocio_id ON pagos_venta(negocio_id);

-- ==============================================================================
-- 4. RLS (mismo patrón y NULLIF que V1/V2)
-- ==============================================================================
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas FORCE ROW LEVEL SECURITY;
CREATE POLICY ventas_aislamiento_por_negocio ON ventas
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE detalle_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_ventas FORCE ROW LEVEL SECURITY;
CREATE POLICY detalles_aislamiento_por_negocio ON detalle_ventas
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE pagos_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_venta FORCE ROW LEVEL SECURITY;
CREATE POLICY pagosventa_aislamiento_por_negocio ON pagos_venta
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
