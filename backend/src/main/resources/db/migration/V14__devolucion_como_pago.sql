-- Devoluciones: reembolsar igual que pagó el cliente (repartido entre $, Bs, pago
-- móvil, punto...) o por un método digital. Cada parte del reembolso queda en
-- devolucion_reembolsos y el cuadre la descuenta de su forma de pago.
ALTER TABLE devoluciones DROP CONSTRAINT IF EXISTS devoluciones_metodo_reembolso_check;
ALTER TABLE devoluciones ADD CONSTRAINT devoluciones_metodo_reembolso_check CHECK (metodo_reembolso IN
    ('EFECTIVO_USD', 'EFECTIVO_BS', 'PAGO_MOVIL', 'PUNTO', 'BIOPAGO', 'COMO_PAGO', 'A_CUENTA', 'FUERA_DE_CAJA'));

CREATE TABLE devolucion_reembolsos (
    id             BIGSERIAL PRIMARY KEY,
    negocio_id     BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    devolucion_id  BIGINT        NOT NULL REFERENCES devoluciones (id) ON DELETE CASCADE,
    metodo         VARCHAR(20)   NOT NULL,   -- EFECTIVO_USD, EFECTIVO_BS, PAGO_MOVIL, PUNTO, BIOPAGO, OTRO, A_CUENTA, FUERA_DE_CAJA
    moneda         VARCHAR(3)    NOT NULL CHECK (moneda IN ('USD', 'VES')),
    monto          NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    referencia     VARCHAR(100)
);
CREATE INDEX idx_devolucion_reembolsos_dev ON devolucion_reembolsos (devolucion_id);

ALTER TABLE devolucion_reembolsos ENABLE ROW LEVEL SECURITY;
ALTER TABLE devolucion_reembolsos FORCE ROW LEVEL SECURITY;
CREATE POLICY devolucion_reembolsos_aislamiento_por_negocio ON devolucion_reembolsos
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
