-- Devolución "fuera de caja": cómo se le dio el dinero al cliente (efectivo $, pago móvil, Zelle…).
-- No toca el cuadre (metodo sigue siendo FUERA_DE_CAJA); es para saber cómo se devolvió.
ALTER TABLE devolucion_reembolsos ADD COLUMN forma VARCHAR(20);
