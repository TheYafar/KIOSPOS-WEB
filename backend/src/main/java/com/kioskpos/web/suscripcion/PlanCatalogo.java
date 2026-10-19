package com.kioskpos.web.suscripcion;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Catálogo de planes y su precio mensual en USD. Por ahora en código (un solo plan,
 * ~$25/mes, CLAUDE.md §1). Si más adelante hay varios planes o precios cambiantes,
 * esto se mueve a una tabla.
 */
public final class PlanCatalogo {

    private static final Map<String, BigDecimal> PRECIOS = Map.of(
            "BASICO", new BigDecimal("25.00"));

    private static final BigDecimal POR_DEFECTO = new BigDecimal("25.00");

    private PlanCatalogo() {
    }

    public static BigDecimal precioMensual(String plan) {
        return PRECIOS.getOrDefault(plan, POR_DEFECTO);
    }
}
