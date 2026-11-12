-- Tickets de cierre del PUNTO DE VENTA (o Biopago) que imprime el banco al cerrar el lote.
-- El cajero los copia en la app al cerrar su caja (el papel se pierde); el dueño los ve
-- todos en su panel por fecha. Cada ticket tiene 3 secciones (crédito, débito y
-- Debit Master/Visa), cada una con compras y anulaciones (cantidad y monto en Bs).
CREATE TABLE cierres_punto (
    id               BIGSERIAL PRIMARY KEY,
    negocio_id       BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    turno_id         BIGINT        REFERENCES turnos (id) ON DELETE SET NULL,
    caja_id          BIGINT,
    usuario_id       BIGINT,
    tipo             VARCHAR(10)   NOT NULL DEFAULT 'PUNTO' CHECK (tipo IN ('PUNTO', 'BIOPAGO')),
    titular          VARCHAR(80),
    afiliado         VARCHAR(30),
    lote_credito     VARCHAR(20),
    lote_debito      VARCHAR(20),
    lote_master_visa VARCHAR(20),
    fecha_hora       TIMESTAMP     NOT NULL,
    cred_compras_n   INT           NOT NULL DEFAULT 0,
    cred_compras     NUMERIC(14,2) NOT NULL DEFAULT 0,
    cred_anul_n      INT           NOT NULL DEFAULT 0,
    cred_anul        NUMERIC(14,2) NOT NULL DEFAULT 0,
    deb_compras_n    INT           NOT NULL DEFAULT 0,
    deb_compras      NUMERIC(14,2) NOT NULL DEFAULT 0,
    deb_anul_n       INT           NOT NULL DEFAULT 0,
    deb_anul         NUMERIC(14,2) NOT NULL DEFAULT 0,
    mv_compras_n     INT           NOT NULL DEFAULT 0,
    mv_compras       NUMERIC(14,2) NOT NULL DEFAULT 0,
    mv_anul_n        INT           NOT NULL DEFAULT 0,
    mv_anul          NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_bs         NUMERIC(14,2) NOT NULL DEFAULT 0,
    nota             VARCHAR(300),
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_cierres_punto_fecha ON cierres_punto (negocio_id, fecha_hora);
CREATE INDEX idx_cierres_punto_turno ON cierres_punto (turno_id);

ALTER TABLE cierres_punto ENABLE ROW LEVEL SECURITY;
ALTER TABLE cierres_punto FORCE ROW LEVEL SECURITY;
CREATE POLICY cierres_punto_aislamiento_por_negocio ON cierres_punto
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
