package com.kioskpos.web.venta;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Lógica de cobro multimoneda (USD / Bs tasa BCV), portada del CobroCalculadoraService del
 * escritorio: valida que los pagos cubran el total y calcula el vuelto. El servidor es la
 * autoridad del cobro.
 *
 *  - Solo $  : se compara en dólares exactos.
 *  - Solo Bs : se compara en bolívares exactos.
 *  - Mixto   : se compara en BOLÍVARES (lo pagado en $ se pasa a Bs a la tasa), con una
 *              tolerancia de Bs 1 por céntimos de conversión. Antes era $0,05, que a tasa ~900
 *              son ~Bs 45: dejaba cobrar con Bs 20 de menos.
 *
 * Vuelto: el cajero elige cuántos DÓLARES entrega ({@code vueltoUsdPedido}); el resto sale en
 * bolívares. Sin elección: solo-Bs → todo en Bs; si no → todo en $ (como antes).
 * Vuelto A MANO ({@code vueltoBsPedido} además de los dólares): se guarda lo que de verdad se entregó.
 * Puede ser MENOS de lo que se debe (no hay sencillo: la diferencia queda en la gaveta y el cuadre
 * lo refleja), pero nunca más (tolerancia Bs 1), para no perder dinero.
 */
public final class CobroCalculadora {

    static final BigDecimal TOLERANCIA_BS = new BigDecimal("1.00");

    private CobroCalculadora() {
    }

    public record Pago(Moneda moneda, BigDecimal montoOriginal) {
    }

    public record Resultado(
            BigDecimal totalPagadoUsd,
            BigDecimal totalPagadoBs,
            boolean cubre,
            BigDecimal vueltoUsd,
            BigDecimal vueltoBs) {
    }

    public static Resultado calcular(BigDecimal totalUsd, BigDecimal tasa, List<Pago> pagos) {
        return calcular(totalUsd, null, tasa, pagos, null);
    }

    public static Resultado calcular(BigDecimal totalUsd, BigDecimal totalBsExacto, BigDecimal tasa, List<Pago> pagos) {
        return calcular(totalUsd, totalBsExacto, tasa, pagos, null);
    }

    /**
     * @param totalBsExacto total exacto en Bs cuando la venta lleva servicios cobrados en Bs (recargas,
     *                      avances): así "Bs 600" se cobra con Bs 600 y no con su redondeo en $.
     * @param vueltoUsdPedido cuántos dólares del vuelto se entregan en $ (el resto, en Bs); null = automático.
     */
    public static Resultado calcular(BigDecimal totalUsd, BigDecimal totalBsExacto, BigDecimal tasa, List<Pago> pagos,
                                     BigDecimal vueltoUsdPedido) {
        return calcular(totalUsd, totalBsExacto, tasa, pagos, vueltoUsdPedido, null);
    }

    /** @param vueltoBsPedido bolívares del vuelto escritos a mano (con {@code vueltoUsdPedido} = dólares entregados). */
    public static Resultado calcular(BigDecimal totalUsd, BigDecimal totalBsExacto, BigDecimal tasa, List<Pago> pagos,
                                     BigDecimal vueltoUsdPedido, BigDecimal vueltoBsPedido) {
        if (tasa == null || tasa.signum() <= 0) {
            throw new IllegalArgumentException("La tasa del día debe ser mayor a 0");
        }
        BigDecimal total = sane(totalUsd).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalBs = totalBsExacto != null ? totalBsExacto.setScale(2, RoundingMode.HALF_UP)
                : total.multiply(tasa).setScale(2, RoundingMode.HALF_UP);

        BigDecimal usd = BigDecimal.ZERO;
        BigDecimal bs = BigDecimal.ZERO;
        for (Pago p : pagos) {
            BigDecimal m = sane(p.montoOriginal()).setScale(2, RoundingMode.HALF_UP);
            if (p.moneda() == Moneda.USD) {
                usd = usd.add(m);
            } else {
                bs = bs.add(m);
            }
        }
        BigDecimal totalPagadoBs = bs.add(usd.multiply(tasa)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalPagadoUsd = usd.add(bs.divide(tasa, 4, RoundingMode.HALF_UP)).setScale(2, RoundingMode.HALF_UP);

        boolean soloUsd = bs.signum() == 0 && usd.signum() > 0;
        boolean soloBs = usd.signum() == 0 && bs.signum() > 0;
        boolean cubre;
        BigDecimal sobraUsd;
        BigDecimal sobraBs;
        if (soloUsd) {
            cubre = usd.compareTo(total) >= 0;
            sobraUsd = usd.subtract(total).max(BigDecimal.ZERO);
            sobraBs = sobraUsd.multiply(tasa).setScale(2, RoundingMode.HALF_UP);
        } else if (soloBs) {
            cubre = bs.compareTo(totalBs) >= 0;
            sobraBs = bs.subtract(totalBs).max(BigDecimal.ZERO);
            sobraUsd = sobraBs.divide(tasa, 2, RoundingMode.HALF_UP);
        } else {
            // Mixto (o nada pagado: venta toda a crédito, donde lo que queda por cobrar es 0).
            cubre = usd.signum() == 0 && bs.signum() == 0 ? total.signum() == 0
                    : totalPagadoBs.add(TOLERANCIA_BS).compareTo(totalBs) >= 0;
            sobraBs = totalPagadoBs.subtract(totalBs).max(BigDecimal.ZERO);
            sobraUsd = sobraBs.divide(tasa, 2, RoundingMode.HALF_UP);
        }

        BigDecimal vueltoUsd = BigDecimal.ZERO;
        BigDecimal vueltoBs = BigDecimal.ZERO;
        if (cubre && sobraBs.signum() > 0 && vueltoBsPedido != null) {
            BigDecimal pu = vueltoUsdPedido == null ? BigDecimal.ZERO : vueltoUsdPedido.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal pb = vueltoBsPedido.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal entregadoBs = pu.multiply(tasa).add(pb).setScale(2, RoundingMode.HALF_UP);
            if (entregadoBs.compareTo(sobraBs.add(TOLERANCIA_BS)) > 0) {
                throw new IllegalArgumentException("El vuelto (Bs " + entregadoBs.toPlainString()
                        + ") pasa de lo que se le debe al cliente (Bs " + sobraBs.toPlainString() + ")");
            }
            vueltoUsd = pu;
            vueltoBs = pb;
        } else if (cubre && sobraBs.signum() > 0) {
            BigDecimal pedido = vueltoUsdPedido == null ? (soloBs ? BigDecimal.ZERO : sobraUsd)
                    : vueltoUsdPedido.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            if (pedido.compareTo(sobraUsd) >= 0) {
                vueltoUsd = sobraUsd;                     // todo en dólares
            } else {
                vueltoUsd = pedido;                       // parte en $ y el resto en Bs
                vueltoBs = sobraBs.subtract(pedido.multiply(tasa)).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            }
        }
        return new Resultado(totalPagadoUsd, totalPagadoBs, cubre, vueltoUsd.setScale(2, RoundingMode.HALF_UP),
                vueltoBs.setScale(2, RoundingMode.HALF_UP));
    }

    private static BigDecimal sane(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
