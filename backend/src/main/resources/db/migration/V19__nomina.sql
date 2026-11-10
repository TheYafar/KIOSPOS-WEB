-- Pagos de nómina a los trabajadores (clientes tipo TRABAJADOR). Se complementa con el
-- fiado: lo que el trabajador debe se descuenta del sueldo en el mismo pago.
-- neto = sueldo + bonos − otros descuentos − fiado descontado.
CREATE TABLE pagos_nomina (
    id                    BIGSERIAL PRIMARY KEY,
    negocio_id            BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    trabajador_id         BIGINT        NOT NULL REFERENCES clientes (id) ON DELETE RESTRICT,
    periodo               VARCHAR(60)   NOT NULL,
    sueldo_usd            NUMERIC(12,2) NOT NULL CHECK (sueldo_usd >= 0),
    bonos_usd             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (bonos_usd >= 0),
    otros_descuentos_usd  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (otros_descuentos_usd >= 0),
    concepto_descuentos   VARCHAR(120),
    fiado_descontado_usd  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fiado_descontado_usd >= 0),
    neto_usd              NUMERIC(12,2) NOT NULL CHECK (neto_usd >= 0),
    metodo                VARCHAR(20)   NOT NULL,
    moneda                VARCHAR(3)    NOT NULL CHECK (moneda IN ('USD', 'VES')),
    monto_pagado          NUMERIC(14,2) NOT NULL,
    tasa                  NUMERIC(14,4),
    referencia            VARCHAR(100),
    nota                  VARCHAR(200),
    usuario_id            BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pagos_nomina_negocio ON pagos_nomina (negocio_id);
CREATE INDEX idx_pagos_nomina_trabajador ON pagos_nomina (trabajador_id);

ALTER TABLE pagos_nomina ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_nomina FORCE ROW LEVEL SECURITY;
CREATE POLICY pagos_nomina_aislamiento_por_negocio ON pagos_nomina
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
