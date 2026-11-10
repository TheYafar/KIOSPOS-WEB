-- Fiado a trabajadores del local: se anotan en la libreta como TRABAJADOR con su sueldo.
-- Lo que se llevan baja el stock (es una venta fiada) y el dueño lo descuenta del sueldo
-- (abono con método NOMINA, que no toca ninguna caja).
ALTER TABLE clientes ADD COLUMN tipo VARCHAR(12) NOT NULL DEFAULT 'CLIENTE';
ALTER TABLE clientes ADD CONSTRAINT clientes_tipo_check CHECK (tipo IN ('CLIENTE', 'TRABAJADOR'));
ALTER TABLE clientes ADD COLUMN sueldo_usd NUMERIC(12,2) NOT NULL DEFAULT 0;
