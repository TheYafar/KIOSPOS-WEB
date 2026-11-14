-- 1) Negocios de DEMO: cada visitante que toca "Probar la demo" recibe su propia bodega de
--    muestra (aislada por RLS como cualquier negocio). Se marcan para ocultarlos del panel del
--    super admin y para bloquear lo que no tiene sentido en una demo (cuentas con correo, pagos).
ALTER TABLE negocios ADD COLUMN es_demo BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_negocios_demo ON negocios (es_demo, created_at) WHERE es_demo;

-- 2) Código de recuperación de la cuenta (como el de un banco): con el correo + este código el
--    dueño pone una clave nueva sin correo electrónico. Se guarda solo su hash (BCrypt).
ALTER TABLE cuentas_login ADD COLUMN recuperacion_hash VARCHAR(100);
