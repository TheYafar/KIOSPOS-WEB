-- Cierre de caja detallado: lo que el cajero contó en CADA forma de pago
-- (efectivo $/Bs, pago móvil, punto, biopago) y sus observaciones.
-- arqueo_detalle es un JSON en texto: [{"metodo","moneda","esperado","contado","diferencia"}].
ALTER TABLE turnos
    ADD COLUMN arqueo_detalle TEXT,
    ADD COLUMN observaciones VARCHAR(500);
