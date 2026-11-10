-- Fiar productos desde la libreta (perfil del cliente/trabajador), sin estar en una caja:
-- la venta fiada queda sin caja (caja_id NULL). Su número es correlativo entre las ventas
-- sin caja del negocio. Baja el stock y entra en los reportes igual que cualquier venta.
ALTER TABLE ventas ALTER COLUMN caja_id DROP NOT NULL;
