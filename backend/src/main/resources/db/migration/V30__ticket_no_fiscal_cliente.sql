-- Ticket NO FISCAL mientras el negocio no emite facturas por imprenta digital o máquina fiscal
-- (Providencia SNAT/2026/00093): se guarda, opcional, a quién se le vendió (nombre y cédula/RIF)
-- para imprimirlo en el ticket.
ALTER TABLE ventas ADD COLUMN cliente_nombre VARCHAR(80);
ALTER TABLE ventas ADD COLUMN cliente_doc VARCHAR(20);
