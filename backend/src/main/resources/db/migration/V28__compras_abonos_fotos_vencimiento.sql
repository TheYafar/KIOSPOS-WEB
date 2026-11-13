-- Mejoras a las facturas de compra a proveedores:
--  1) Abonos: una factura "por pagar" se puede ir abonando poco a poco (no solo pagada/por pagar).
--     Se guarda cuánto se lleva pagado y el historial de cada abono.
--  2) Fecha de pago (vence): cuándo toca pagarle al proveedor, para la campanita de avisos.
--  3) Foto de la factura: el dueño le toma una foto al papel y queda guardada (digitalizada) con la compra.

-- 1) Cuánto se lleva pagado de la factura (el saldo = total_usd - pagado_usd). Las ya pagadas
--    arrancan con pagado = total; las "por pagar" en 0.
ALTER TABLE compras ADD COLUMN pagado_usd NUMERIC(14,2) NOT NULL DEFAULT 0;
UPDATE compras SET pagado_usd = total_usd WHERE pagada = TRUE;

-- 2) Fecha en que hay que pagarle al proveedor (opcional).
ALTER TABLE compras ADD COLUMN vence DATE;

-- Historial de abonos a una factura de compra.
CREATE TABLE compra_abonos (
    id          BIGSERIAL PRIMARY KEY,
    negocio_id  BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    compra_id   BIGINT        NOT NULL REFERENCES compras (id) ON DELETE CASCADE,
    fecha       DATE          NOT NULL,
    monto_usd   NUMERIC(14,2) NOT NULL CHECK (monto_usd > 0),
    metodo      VARCHAR(16),
    nota        VARCHAR(200),
    usuario_id  BIGINT        REFERENCES usuarios (id) ON DELETE SET NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_compra_abonos_compra ON compra_abonos (compra_id);

-- Foto(s) de la factura del proveedor, digitalizada (JPEG/PNG en base64). Puede haber varias páginas.
CREATE TABLE compra_fotos (
    id          BIGSERIAL PRIMARY KEY,
    negocio_id  BIGINT        NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    compra_id   BIGINT        NOT NULL REFERENCES compras (id) ON DELETE CASCADE,
    mime        VARCHAR(40)   NOT NULL,
    datos       TEXT          NOT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_compra_fotos_compra ON compra_fotos (compra_id);

-- RLS por negocio_id (mismo patrón fail-closed del resto del esquema).
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['compra_abonos', 'compra_fotos'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (negocio_id = NULLIF(current_setting(''app.current_negocio_id'', true), '''')::bigint) '
                    || 'WITH CHECK (negocio_id = NULLIF(current_setting(''app.current_negocio_id'', true), '''')::bigint)',
                       t || '_aislamiento_por_negocio', t);
    END LOOP;
END
$$;
