package com.kioskpos.web.suscripcion;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;

/**
 * Catálogo de planes (en código; si cambian a menudo, pasar a tabla). La mensualidad es
 * el precio del plan + cada caja por encima de las incluidas. Todos los planes traen
 * todos los módulos; lo que cambia es cuántas cajas y el precio por caja extra.
 */
public final class PlanCatalogo {

    public record Plan(String codigo, String nombre, BigDecimal precioBase, int cajasIncluidas,
                       BigDecimal precioCajaExtra, int maxCajas, String descripcion) {
        public BigDecimal mensualidad(int cajas) {
            int extra = Math.max(0, cajas - cajasIncluidas);
            return precioBase.add(precioCajaExtra.multiply(BigDecimal.valueOf(extra)));
        }
    }

    public static final List<Plan> PLANES = List.of(
            new Plan("BASICO", "Bodega", new BigDecimal("25.00"), 1, new BigDecimal("10.00"), 3,
                    "Para la bodega de una o dos cajas. Ventas, inventario, fiado, recargas, cierres y reportes."),
            new Plan("PRO", "Bodega Pro", new BigDecimal("40.00"), 2, new BigDecimal("8.00"), 10,
                    "Para negocios con varias cajas: 2 incluidas y cajas extra más baratas."));

    private PlanCatalogo() {
    }

    public static Plan plan(String codigo) {
        String c = codigo == null ? "" : codigo.trim().toUpperCase(Locale.ROOT);
        return PLANES.stream().filter(p -> p.codigo().equals(c)).findFirst().orElse(PLANES.get(0));
    }

    public static boolean existe(String codigo) {
        String c = codigo == null ? "" : codigo.trim().toUpperCase(Locale.ROOT);
        return PLANES.stream().anyMatch(p -> p.codigo().equals(c));
    }

    /** Mensualidad del plan con esas cajas. */
    public static BigDecimal mensualidad(String plan, Integer cajas) {
        return plan(plan).mensualidad(cajas == null ? 1 : cajas);
    }

    /** Compatibilidad: precio base del plan. */
    public static BigDecimal precioMensual(String plan) {
        return plan(plan).precioBase();
    }

    /** Valida plan + cajas; devuelve el código normalizado. */
    public static String validar(String codigo, int cajas) {
        if (!existe(codigo)) {
            throw new IllegalArgumentException("Plan inválido");
        }
        Plan p = plan(codigo);
        if (cajas < 1) {
            throw new IllegalArgumentException("Debe haber al menos 1 caja");
        }
        if (cajas > p.maxCajas()) {
            throw new IllegalArgumentException("El plan " + p.nombre() + " permite hasta " + p.maxCajas()
                    + " cajas. Para más, elige el plan Bodega Pro.");
        }
        return p.codigo();
    }
}
