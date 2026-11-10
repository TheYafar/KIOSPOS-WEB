-- ==============================================================================
-- Sección 4: movimientos de caja (gastos, retiros, ingresos, avances) y fiado.
-- Todo bajo RLS por negocio_id (doble barrera, CLAUDE.md §2).
-- ==============================================================================

-- 1) Movimientos de efectivo del turno que NO son ventas.
--    GASTO/RETIRO/AVANCE: sale efectivo de la gaveta. INGRESO: entra.
--    AVANCE (avance de efectivo): el cliente paga por punto/pago móvil/biopago
--    (monto_cobrado, en Bs) y se le entrega efectivo (monto). comision = ganancia en Bs.
CREATE TABLE movimientos_caja (
    id            BIGSERIAL PRIMARY KEY,
    negocio_id    BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    turno_id      BIGINT        NOT NULL REFERENCES turnos (id) ON DELETE RESTRICT,
    caja_id       BIGINT        NOT NULL REFERENCES cajas (id) ON DELETE RESTRICT,
    usuario_id    BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    tipo          VARCHAR(10)   NOT NULL CHECK (tipo IN ('GASTO', 'RETIRO', 'INGRESO', 'AVANCE')),
    moneda        VARCHAR(3)    NOT NULL CHECK (moneda IN ('USD', 'VES')),
    monto         NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    metodo_cobro  VARCHAR(20)   CHECK (metodo_cobro IS NULL OR metodo_cobro IN ('PUNTO', 'PAGO_MOVIL', 'BIOPAGO')),
    monto_cobrado NUMERIC(14,2),
    comision      NUMERIC(14,2),
    tasa          NUMERIC(14,4),
    concepto      VARCHAR(200)  NOT NULL,
    anulado       BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT avance_completo CHECK (tipo <> 'AVANCE' OR (metodo_cobro IS NOT NULL AND monto_cobrado IS NOT NULL))
);
CREATE INDEX idx_mov_caja_negocio ON movimientos_caja (negocio_id);
CREATE INDEX idx_mov_caja_turno ON movimientos_caja (turno_id);

ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja FORCE ROW LEVEL SECURITY;
CREATE POLICY movimientos_caja_aislamiento_por_negocio ON movimientos_caja
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

-- 2) Clientes (libreta de fiado).
CREATE TABLE clientes (
    id                 BIGSERIAL PRIMARY KEY,
    negocio_id         BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    nombre             VARCHAR(120)  NOT NULL,
    cedula             VARCHAR(20),
    telefono           VARCHAR(30),
    limite_credito_usd NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 0 = sin límite
    activo             BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clientes_negocio ON clientes (negocio_id);
CREATE UNIQUE INDEX uq_clientes_cedula ON clientes (negocio_id, cedula) WHERE cedula IS NOT NULL AND cedula <> '';

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes FORCE ROW LEVEL SECURITY;
CREATE POLICY clientes_aislamiento_por_negocio ON clientes
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

-- 3) Cuenta del cliente: CARGO (venta fiada) y ABONO (lo que paga). Saldo = cargos − abonos (USD).
CREATE TABLE movimientos_cliente (
    id             BIGSERIAL PRIMARY KEY,
    negocio_id     BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    cliente_id     BIGINT        NOT NULL REFERENCES clientes (id) ON DELETE RESTRICT,
    tipo           VARCHAR(6)    NOT NULL CHECK (tipo IN ('CARGO', 'ABONO')),
    monto_usd      NUMERIC(12,2) NOT NULL CHECK (monto_usd > 0),
    venta_id       BIGINT        REFERENCES ventas (id) ON DELETE SET NULL,
    turno_id       BIGINT        REFERENCES turnos (id) ON DELETE RESTRICT,
    caja_id        BIGINT        REFERENCES cajas (id) ON DELETE RESTRICT,
    usuario_id     BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    metodo         VARCHAR(20),  -- ABONO: cómo pagó (EFECTIVO_USD, EFECTIVO_BS, PUNTO, PAGO_MOVIL, BIOPAGO)
    moneda         VARCHAR(3)    CHECK (moneda IS NULL OR moneda IN ('USD', 'VES')),
    monto_original NUMERIC(14,2),
    tasa           NUMERIC(14,4),
    referencia     VARCHAR(100),
    nota           VARCHAR(200),
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mov_cliente_negocio ON movimientos_cliente (negocio_id);
CREATE INDEX idx_mov_cliente_cliente ON movimientos_cliente (cliente_id);
CREATE INDEX idx_mov_cliente_turno ON movimientos_cliente (turno_id);

ALTER TABLE movimientos_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cliente FORCE ROW LEVEL SECURITY;
CREATE POLICY movimientos_cliente_aislamiento_por_negocio ON movimientos_cliente
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

-- 4) La venta fiada: a quién y con qué método.
ALTER TABLE ventas ADD COLUMN cliente_id BIGINT REFERENCES clientes (id) ON DELETE SET NULL;
ALTER TABLE pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_check;
ALTER TABLE pagos_venta ADD CONSTRAINT pagos_venta_metodo_check
    CHECK (metodo IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'PUNTO', 'PAGO_MOVIL', 'BIOPAGO', 'OTRO', 'FIADO'));
