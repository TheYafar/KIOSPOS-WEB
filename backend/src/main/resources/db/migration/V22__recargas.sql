-- Recargas de saldo (Movistar, Digitel, Movilnet, TV, internet...). El cliente paga en la
-- caja (efectivo o digital) y la bodega recarga desde su saldo con la operadora.
-- monto_bs = lo que se recarga; monto_cobrado (en su moneda) = lo que pagó el cliente;
-- comision_bs = ganancia de la bodega. Bajo RLS por negocio_id.
CREATE TABLE recargas (
    id            BIGSERIAL PRIMARY KEY,
    negocio_id    BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    turno_id      BIGINT        NOT NULL REFERENCES turnos (id) ON DELETE RESTRICT,
    caja_id       BIGINT        NOT NULL REFERENCES cajas (id) ON DELETE RESTRICT,
    usuario_id    BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    operadora     VARCHAR(20)   NOT NULL,
    numero        VARCHAR(30)   NOT NULL,
    monto_bs      NUMERIC(14,2) NOT NULL CHECK (monto_bs > 0),
    metodo_cobro  VARCHAR(20)   NOT NULL CHECK (metodo_cobro IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'PUNTO', 'PAGO_MOVIL', 'BIOPAGO')),
    moneda        VARCHAR(3)    NOT NULL CHECK (moneda IN ('USD', 'VES')),
    monto_cobrado NUMERIC(14,2) NOT NULL CHECK (monto_cobrado > 0),
    tasa          NUMERIC(14,4) NOT NULL,
    comision_bs   NUMERIC(14,2) NOT NULL DEFAULT 0,
    referencia    VARCHAR(60),
    anulada       BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recargas_negocio ON recargas (negocio_id);
CREATE INDEX idx_recargas_turno ON recargas (turno_id);
CREATE INDEX idx_recargas_fecha ON recargas (negocio_id, created_at);

ALTER TABLE recargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recargas FORCE ROW LEVEL SECURITY;
CREATE POLICY recargas_aislamiento_por_negocio ON recargas
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
