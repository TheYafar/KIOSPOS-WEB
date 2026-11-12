-- 1) Recargas y avances de efectivo se cobran DENTRO de la venta (una sola cuenta con los
--    productos). La venta guarda una línea por servicio con su monto exacto en Bs; la recarga
--    y el avance quedan registrados aparte (comisión, efectivo que sale de la gaveta) con
--    metodo_cobro = 'VENTA', que el cuadre NO vuelve a sumar (ya lo sumaron los pagos de la venta).
ALTER TABLE detalle_ventas ADD COLUMN monto_bs NUMERIC(14,2);
ALTER TABLE detalle_ventas ADD COLUMN servicio VARCHAR(10);
ALTER TABLE recargas ADD COLUMN venta_id BIGINT;
ALTER TABLE movimientos_caja ADD COLUMN venta_id BIGINT;
CREATE INDEX idx_recargas_venta ON recargas (venta_id) WHERE venta_id IS NOT NULL;
CREATE INDEX idx_movimientos_caja_venta ON movimientos_caja (venta_id) WHERE venta_id IS NOT NULL;

DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname, conrelid::regclass AS tabla FROM pg_constraint
             WHERE contype = 'c' AND conrelid IN ('recargas'::regclass, 'movimientos_caja'::regclass)
               AND pg_get_constraintdef(oid) ILIKE '%metodo_cobro%'
               AND conname <> 'avance_completo'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tabla, c.conname);
    END LOOP;
END $$;
ALTER TABLE recargas ADD CONSTRAINT recargas_metodo_cobro_valido
    CHECK (metodo_cobro IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'PUNTO', 'PAGO_MOVIL', 'BIOPAGO', 'VENTA'));
ALTER TABLE movimientos_caja ADD CONSTRAINT movimientos_caja_metodo_cobro_valido
    CHECK (metodo_cobro IS NULL OR metodo_cobro IN ('PUNTO', 'PAGO_MOVIL', 'BIOPAGO', 'VENTA'));

-- 2) Comisiones por defecto del negocio (se cambian en Configuración).
ALTER TABLE negocios ADD COLUMN comision_recarga_pct NUMERIC(5,2) NOT NULL DEFAULT 20;
ALTER TABLE negocios ADD COLUMN comision_avance_pct NUMERIC(5,2) NOT NULL DEFAULT 10;

-- 3) Trabajadores ligados al personal del sistema: cada cajero/encargado tiene su ficha de
--    trabajador (crédito y nómina) para darle crédito al cobrar y descontárselo del sueldo.
ALTER TABLE clientes ADD COLUMN usuario_id BIGINT;
CREATE UNIQUE INDEX uq_clientes_usuario ON clientes (negocio_id, usuario_id) WHERE usuario_id IS NOT NULL;
