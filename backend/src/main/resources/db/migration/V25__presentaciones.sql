-- Presentaciones (bloques) de un producto: cómo más se vende además de la unidad.
-- Ej.: Cigarros → "Caja" trae 20 a $5,00; "Media caja" trae 10 a $2,60. La unidad suelta
-- es el producto mismo (su precio y su stock). Para productos por peso o medida la
-- cantidad puede ser decimal (Ej.: Arroz → "Saco" trae 25 kg).
CREATE TABLE producto_presentaciones (
    id            BIGSERIAL PRIMARY KEY,
    negocio_id    BIGINT         NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    producto_id   BIGINT         NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
    nombre        VARCHAR(60)    NOT NULL,
    cantidad      NUMERIC(12,3)  NOT NULL CHECK (cantidad > 0),
    precio_usd    NUMERIC(12,2)  NOT NULL CHECK (precio_usd > 0),
    codigo_barras VARCHAR(60),
    created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_presentaciones_producto ON producto_presentaciones (producto_id);
CREATE UNIQUE INDEX uq_presentaciones_nombre ON producto_presentaciones (producto_id, lower(nombre));

ALTER TABLE producto_presentaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_presentaciones FORCE ROW LEVEL SECURITY;
CREATE POLICY presentaciones_aislamiento_por_negocio ON producto_presentaciones
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

-- Cada línea de venta recuerda cuántas unidades del producto trae lo que se vendió
-- (1 = suelto; 20 = una caja de 20). cantidad sigue contando bloques vendidos, y el
-- stock se mueve cantidad × unidades (al vender, anular y devolver).
ALTER TABLE detalle_ventas ADD COLUMN unidades NUMERIC(12,3) NOT NULL DEFAULT 1;
