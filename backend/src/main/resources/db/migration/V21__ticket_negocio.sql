-- Datos del negocio que salen en el ticket (encabezado y mensaje al pie).
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS rif VARCHAR(30);
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS mensaje_ticket VARCHAR(200);
