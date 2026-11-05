-- ==============================================================================
-- KIOSKPOS WEB - CONTABILIDAD (módulo P2, panel del dueño)
-- Version: V7__contabilidad.sql
--
-- Dos cosas separadas, por diseño (spec 2026-10-31-contabilidad-design.md):
--   1) Contabilidad AUTOMÁTICA: la app calcula entró/salió/queda desde datos reales.
--      - entró = ganancia de ventas (ya existe en ReporteService).
--      - salió = pagos de nómina (del módulo Nómina) + gastos que el dueño anota aquí.
--      - queda = entró − salió, repartido en "para mercancía" y "para tu bolsillo".
--      La nómina NO se guarda aquí (se lee del módulo Nómina para no contarla doble:
--      anti-objetivo del spec). Aquí solo viven los gastos de servicios/otros.
--   2) Mi libro MANUAL: libreta en blanco; la app SOLO guarda y suma lo que el dueño
--      escribe. No mete ningún número calculado (requisito duro del dueño).
--
-- Multi-tenant: toda tabla con negocio_id de la sesión + RLS FORCE (calcado de V6).
-- Moneda base en $ (como catálogo y nómina). Bs se muestra por tasa BCV en el front.
-- ==============================================================================

-- --- Gastos anotados del modo AUTOMÁTICO (servicios/otros; la nómina NO va aquí) ---
CREATE TABLE IF NOT EXISTS conta_gastos (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    fecha DATE NOT NULL,
    categoria VARCHAR(20) NOT NULL DEFAULT 'OTRO'
        CHECK (categoria IN ('SERVICIOS', 'INTERNET', 'ALQUILER', 'OTRO')),
    concepto VARCHAR(200) NOT NULL,
    monto_usd NUMERIC(12, 2) NOT NULL CHECK (monto_usd >= 0),
    created_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conta_gastos_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_conta_gastos_negocio_fecha ON conta_gastos(negocio_id, fecha);

-- --- Líneas del libro MANUAL (nada derivado; la app solo guarda y suma) ---
CREATE TABLE IF NOT EXISTS conta_libro (
    id BIGSERIAL PRIMARY KEY,
    negocio_id BIGINT NOT NULL,
    fecha DATE NOT NULL,
    concepto VARCHAR(200) NOT NULL,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
    monto_usd NUMERIC(12, 2) NOT NULL CHECK (monto_usd >= 0),
    created_by BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conta_libro_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_conta_libro_negocio_fecha ON conta_libro(negocio_id, fecha);

-- --- Ajustes del modo automático por negocio (una fila por negocio) ---
CREATE TABLE IF NOT EXISTS conta_config (
    negocio_id BIGINT PRIMARY KEY,
    reparto_mercancia_pct NUMERIC(5, 2) NOT NULL DEFAULT 40.00
        CHECK (reparto_mercancia_pct >= 0 AND reparto_mercancia_pct <= 100),
    CONSTRAINT fk_conta_config_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);

-- --- Row Level Security (misma doble barrera que el resto: app fija negocio_id, BD lo fuerza) ---
ALTER TABLE conta_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta_gastos FORCE ROW LEVEL SECURITY;
CREATE POLICY conta_gastos_aislamiento_por_negocio ON conta_gastos
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE conta_libro ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta_libro FORCE ROW LEVEL SECURITY;
CREATE POLICY conta_libro_aislamiento_por_negocio ON conta_libro
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);

ALTER TABLE conta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta_config FORCE ROW LEVEL SECURITY;
CREATE POLICY conta_config_aislamiento_por_negocio ON conta_config
    USING (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint)
    WITH CHECK (negocio_id = NULLIF(current_setting('app.current_negocio_id', true), '')::bigint);
