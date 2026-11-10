-- ==============================================================================
-- Sección 5: proveedores, facturas de compra (entrada de mercancía + costo promedio),
-- anular ventas y devoluciones parciales. Todo con RLS por negocio_id.
-- ==============================================================================

CREATE TABLE proveedores (
    id          BIGSERIAL PRIMARY KEY,
    negocio_id  BIGINT       NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    nombre      VARCHAR(120) NOT NULL,
    rif         VARCHAR(20),
    telefono    VARCHAR(30),
    contacto    VARCHAR(120),
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_proveedores_negocio ON proveedores (negocio_id);

-- Factura de compra a un proveedor: suma stock y recalcula el costo promedio.
CREATE TABLE compras (
    id              BIGSERIAL PRIMARY KEY,
    negocio_id      BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    proveedor_id    BIGINT        REFERENCES proveedores (id) ON DELETE SET NULL,
    numero_factura  VARCHAR(40),
    fecha           DATE          NOT NULL,
    total_usd       NUMERIC(14,2) NOT NULL,
    tasa            NUMERIC(14,4),
    pagada          BOOLEAN       NOT NULL DEFAULT TRUE,
    estado          VARCHAR(12)   NOT NULL DEFAULT 'REGISTRADA' CHECK (estado IN ('REGISTRADA', 'ANULADA')),
    nota            VARCHAR(200),
    usuario_id      BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_compras_negocio ON compras (negocio_id);
CREATE INDEX idx_compras_proveedor ON compras (proveedor_id);

CREATE TABLE compra_detalles (
    id                 BIGSERIAL PRIMARY KEY,
    negocio_id         BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    compra_id          BIGINT        NOT NULL REFERENCES compras (id) ON DELETE CASCADE,
    producto_id        BIGINT        REFERENCES productos (id) ON DELETE SET NULL,
    nombre             VARCHAR(200)  NOT NULL,
    cantidad           NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    costo_unitario_usd NUMERIC(12,4) NOT NULL CHECK (costo_unitario_usd >= 0),
    subtotal_usd       NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_compra_detalles_compra ON compra_detalles (compra_id);

-- Devolución (parcial o total) de una venta: vuelve la mercancía y se reembolsa.
CREATE TABLE devoluciones (
    id                BIGSERIAL PRIMARY KEY,
    negocio_id        BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    venta_id          BIGINT        NOT NULL REFERENCES ventas (id) ON DELETE RESTRICT,
    turno_id          BIGINT        REFERENCES turnos (id) ON DELETE RESTRICT,
    caja_id           BIGINT        REFERENCES cajas (id) ON DELETE RESTRICT,
    usuario_id        BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    total_usd         NUMERIC(14,2) NOT NULL CHECK (total_usd > 0),
    -- EFECTIVO_USD / EFECTIVO_BS (sale de la gaveta del turno), A_CUENTA (baja el fiado), FUERA_DE_CAJA
    metodo_reembolso  VARCHAR(20)   NOT NULL CHECK (metodo_reembolso IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'A_CUENTA', 'FUERA_DE_CAJA')),
    monto_reembolso   NUMERIC(14,2) NOT NULL,
    tasa              NUMERIC(14,4),
    motivo            VARCHAR(200),
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_devoluciones_negocio ON devoluciones (negocio_id);
CREATE INDEX idx_devoluciones_venta ON devoluciones (venta_id);
CREATE INDEX idx_devoluciones_turno ON devoluciones (turno_id);

CREATE TABLE devolucion_detalles (
    id                BIGSERIAL PRIMARY KEY,
    negocio_id        BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    devolucion_id     BIGINT        NOT NULL REFERENCES devoluciones (id) ON DELETE CASCADE,
    detalle_venta_id  BIGINT        NOT NULL REFERENCES detalle_ventas (id) ON DELETE RESTRICT,
    producto_id       BIGINT,
    cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    monto_usd         NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_devolucion_detalles_dev ON devolucion_detalles (devolucion_id);
CREATE INDEX idx_devolucion_detalles_det ON devolucion_detalles (detalle_venta_id);

-- Venta anulada: quién y por qué.
ALTER TABLE ventas ADD COLUMN anulada_por BIGINT;
ALTER TABLE ventas ADD COLUMN motivo_anulacion VARCHAR(200);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['proveedores', 'compras', 'compra_detalles', 'devoluciones', 'devolucion_detalles'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (negocio_id = NULLIF(current_setting(''app.current_negocio_id'', true), '''')::bigint) '
                    || 'WITH CHECK (negocio_id = NULLIF(current_setting(''app.current_negocio_id'', true), '''')::bigint)',
                       t || '_aislamiento_por_negocio', t);
    END LOOP;
END
$$;
