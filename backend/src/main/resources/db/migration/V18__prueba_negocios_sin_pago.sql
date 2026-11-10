-- Un negocio que nunca registró un pago (pago_hasta NULL) quedaba suspendido desde el
-- primer día: no podía cobrar ni fiar. Desde ahora todo negocio nuevo arranca con 7 días
-- de prueba; a los que ya existían sin pago se les da esa misma semana desde hoy.
UPDATE negocios SET pago_hasta = CURRENT_DATE + 7 WHERE pago_hasta IS NULL;
