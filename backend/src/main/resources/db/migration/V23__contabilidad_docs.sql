-- Lo que el dueño anota a mano en Cuentas (libreta guiada y hojas libres), guardado en
-- el servidor para no perderlo al cambiar de equipo. Un documento JSON por clave.
-- version: control de concurrencia (dos equipos editando a la vez). Bajo RLS.
CREATE TABLE contabilidad_docs (
    negocio_id  BIGINT       NOT NULL REFERENCES negocios (id) ON DELETE RESTRICT,
    clave       VARCHAR(20)  NOT NULL CHECK (clave IN ('libro', 'hojas')),
    contenido   TEXT         NOT NULL,
    version     BIGINT       NOT NULL DEFAULT 1,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (negocio_id, clave)
);

ALTER TABLE contabilidad_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad_docs FORCE ROW LEVEL SECURITY;
CREATE POLICY contabilidad_docs_aislamiento_por_negocio ON contabilidad_docs
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
