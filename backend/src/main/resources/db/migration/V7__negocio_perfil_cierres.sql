-- Perfil del negocio + horarios de cierre de caja.
-- horarios_cierre: lista de horas "HH:mm" separadas por coma (ej. "15:00,19:00,22:00").
-- La cantidad de cierres = cantidad de horas. Sirve para avisarle al cajero en la caja
-- cuando se acerca la hora de cerrar (y 20 min antes).
ALTER TABLE negocios
    ADD COLUMN telefono VARCHAR(40),
    ADD COLUMN direccion VARCHAR(200),
    ADD COLUMN cajas_contratadas INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN horarios_cierre VARCHAR(200);
