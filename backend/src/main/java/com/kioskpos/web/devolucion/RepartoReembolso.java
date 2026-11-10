package com.kioskpos.web.devolucion;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "Como pagó": reparte lo que se devuelve entre las formas en que el cliente pagó, en
 * proporción. Primero se le quita a cada forma el vuelto que se le dio (el vuelto sale del
 * efectivo), así se devuelve lo que de verdad dejó. Lo fiado vuelve a su cuenta (A_CUENTA).
 * Mismo cálculo en la PWA (frontend/src/reembolso.ts).
 */
public final class RepartoReembolso {

    private RepartoReembolso() {
    }

    public record Pago(String metodo, String moneda, BigDecimal monto) {
    }

    public record Parte(String metodo, String moneda, BigDecimal monto) {
    }

    /**
     * @param pagos      pagos de la venta (montos en su moneda)
     * @param vueltoUsd  vuelto entregado en $
     * @param vueltoBs   vuelto entregado en Bs
     * @param tasa       tasa de la venta
     * @param totalVenta total de la venta en $
     * @param devolver   lo que se devuelve ahora en $
     */
    public static List<Parte> repartir(List<Pago> pagos, BigDecimal vueltoUsd, BigDecimal vueltoBs, BigDecimal tasa,
                                       BigDecimal totalVenta, BigDecimal devolver) {
        Map<String, Parte> neto = new LinkedHashMap<>();
        for (Pago p : pagos) {
            if (p.monto() == null || p.monto().signum() <= 0) {
                continue;
            }
            String metodo = "FIADO".equals(p.metodo()) ? "A_CUENTA" : p.metodo();
            neto.merge(metodo + ":" + p.moneda(), new Parte(metodo, p.moneda(), p.monto()),
                    (a, b) -> new Parte(a.metodo(), a.moneda(), a.monto().add(b.monto())));
        }
        // El vuelto sale del efectivo: primero de la misma moneda, el resto de la otra.
        BigDecimal vu = nz(vueltoUsd);
        BigDecimal vb = nz(vueltoBs);
        BigDecimal t = tasa == null || tasa.signum() <= 0 ? BigDecimal.ONE : tasa;
        vu = quitar(neto, "EFECTIVO_USD:USD", vu);
        vb = quitar(neto, "EFECTIVO_BS:VES", vb);
        if (vu.signum() > 0) {
            BigDecimal restoBs = quitar(neto, "EFECTIVO_BS:VES", vu.multiply(t));
            vu = restoBs.divide(t, 2, RoundingMode.HALF_UP);
        }
        if (vb.signum() > 0) {
            quitar(neto, "EFECTIVO_USD:USD", vb.divide(t, 2, RoundingMode.HALF_UP));
        }

        BigDecimal total = nz(totalVenta);
        if (total.signum() <= 0) {
            return List.of();
        }
        BigDecimal f = nz(devolver).divide(total, 8, RoundingMode.HALF_UP).min(BigDecimal.ONE);
        List<Parte> r = new ArrayList<>();
        for (Parte p : neto.values()) {
            BigDecimal m = p.monto().multiply(f).setScale(2, RoundingMode.HALF_UP);
            if (m.signum() > 0) {
                r.add(new Parte(p.metodo(), p.moneda(), m));
            }
        }
        return r;
    }

    /** Resta hasta `cuanto` de una forma; devuelve lo que no se pudo restar. */
    private static BigDecimal quitar(Map<String, Parte> neto, String clave, BigDecimal cuanto) {
        Parte p = neto.get(clave);
        if (p == null || cuanto.signum() <= 0) {
            return cuanto;
        }
        BigDecimal q = p.monto().min(cuanto);
        neto.put(clave, new Parte(p.metodo(), p.moneda(), p.monto().subtract(q)));
        return cuanto.subtract(q);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
