-- 1) Costo HISTÓRICO en cada línea de venta: la ganancia de un día pasado ya no cambia
--    cuando una compra recalcula el costo promedio del producto.
ALTER TABLE detalle_ventas ADD COLUMN costo_unitario_usd NUMERIC(12,4);
-- Ventas viejas: se toma el costo actual (lo mejor que hay). Si el usuario de migración
-- no salta RLS, no actualiza nada y los reportes usan el costo actual como antes.
UPDATE detalle_ventas d SET costo_unitario_usd = p.costo_usd
  FROM productos p WHERE p.id = d.producto_id AND d.costo_unitario_usd IS NULL;

-- 2) Un pago de nómina mal hecho se puede anular (devuelve lo descontado del fiado).
ALTER TABLE pagos_nomina ADD COLUMN estado VARCHAR(10) NOT NULL DEFAULT 'PAGADO';
ALTER TABLE pagos_nomina ADD CONSTRAINT pagos_nomina_estado_check CHECK (estado IN ('PAGADO', 'ANULADO'));
ALTER TABLE pagos_nomina ADD COLUMN motivo_anulacion VARCHAR(200);
