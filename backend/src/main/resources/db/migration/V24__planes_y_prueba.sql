-- Sección 6: planes y prueba gratis que vence sola.
-- en_prueba = el negocio está en su semana gratis (nunca ha pagado). Al vencer la prueba
-- queda suspendido de una vez (sin los 15 días de gracia de quien ya es cliente).
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS en_prueba BOOLEAN NOT NULL DEFAULT FALSE;

-- Los que nunca tuvieron un pago aprobado están en prueba.
UPDATE negocios n SET en_prueba = TRUE
WHERE NOT EXISTS (SELECT 1 FROM pagos p WHERE p.negocio_id = n.id AND p.estado = 'APROBADO');

-- Plan válido para todos (el catálogo vive en código: BASICO, PRO).
UPDATE negocios SET plan = 'BASICO' WHERE plan IS NULL OR plan NOT IN ('BASICO', 'PRO');
