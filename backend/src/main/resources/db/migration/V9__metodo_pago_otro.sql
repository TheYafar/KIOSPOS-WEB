-- Formas de pago / monedas extra que el negocio agrega (Zelle, Binance, euros...).
-- Se guardan como metodo 'OTRO' en USD o VES (equivalente), con su nombre y el
-- monto original en "referencia".
ALTER TABLE pagos_venta DROP CONSTRAINT IF EXISTS pagos_venta_metodo_check;
ALTER TABLE pagos_venta ADD CONSTRAINT pagos_venta_metodo_check
    CHECK (metodo IN ('EFECTIVO_USD', 'EFECTIVO_BS', 'PUNTO', 'PAGO_MOVIL', 'BIOPAGO', 'OTRO'));
