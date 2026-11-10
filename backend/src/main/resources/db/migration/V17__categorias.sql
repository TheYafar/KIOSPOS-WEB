-- Categorías de productos que crea el negocio (Víveres, Bebidas, Charcutería...).
-- Los productos guardan el NOMBRE de su categoría (productos.categoria); esta tabla es
-- la lista que el dueño administra (crear, renombrar, borrar), aunque aún no tenga productos.
CREATE TABLE categorias (
    id          BIGSERIAL PRIMARY KEY,
    negocio_id  BIGINT       NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    nombre      VARCHAR(60)  NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_categorias_nombre ON categorias (negocio_id, lower(nombre));

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias FORCE ROW LEVEL SECURITY;
CREATE POLICY categorias_aislamiento_por_negocio ON categorias
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
