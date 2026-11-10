-- Configuración de caja del NEGOCIO (antes vivía en cada equipo): formas de pago
-- activas + monedas extra (JSON) y cómo se calcula la tasa con la que se cobra.
ALTER TABLE negocios
    ADD COLUMN metodos_pago TEXT,
    ADD COLUMN tasa_modo VARCHAR(10) NOT NULL DEFAULT 'BCV',
    ADD COLUMN tasa_ajuste_tipo VARCHAR(5) NOT NULL DEFAULT 'PCT',
    ADD COLUMN tasa_ajuste NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN tasa_manual NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE negocios ADD CONSTRAINT negocios_tasa_modo_check CHECK (tasa_modo IN ('BCV', 'AJUSTE', 'MANUAL'));
ALTER TABLE negocios ADD CONSTRAINT negocios_tasa_ajuste_tipo_check CHECK (tasa_ajuste_tipo IN ('PCT', 'BS'));
