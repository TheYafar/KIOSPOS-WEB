package com.kioskpos.web.venta;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Lógica de cobro multimoneda (USD / Bs tasa BCV), portada y simplificada del
 * CobroCalculadoraService del escritorio para P1: valida que los pagos cubran el
 * total y calcula el vuelto. El servidor es la autoridad del cobro.
 */
public final class CobroCalculadora {

    private static final BigDecimal TOLERANCIA_USD = new BigDecimal("0.05");

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

    /**
     * @param totalUsd total de la venta en USD (autoridad del servidor)
     * @param tasa     tasa BCV del día
     * @param pagos    pagos recibidos
     */
    public static Resultado calcular(BigDecimal totalUsd, BigDecimal tasa, List<Pago> pagos) {
        if (tasa == null || tasa.signum() <= 0) {
            throw new IllegalArgumentException("La tasa del día debe ser mayor a 0");
        }
        BigDecimal total = sane(totalUsd).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalBs = total.multiply(tasa).setScale(2, RoundingMode.HALF_UP);

        BigDecimal pagadoUsdDirecto = BigDecimal.ZERO;
        BigDecimal pagadoBsDirecto = BigDecimal.ZERO;
        for (Pago p : pagos) {
            BigDecimal m = sane(p.montoOriginal()).setScale(2, RoundingMode.HALF_UP);
            if (p.moneda() == Moneda.USD) {
                pagadoUsdDirecto = pagadoUsdDirecto.add(m);
            } else {
                pagadoBsDirecto = pagadoBsDirecto.add(m);
            }
        }

        BigDecimal totalPagadoBs = pagadoBsDirecto.add(pagadoUsdDirecto.multiply(tasa)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalPagadoUsd = pagadoUsdDirecto.add(pagadoBsDirecto.divide(tasa, 4, RoundingMode.HALF_UP)).setScale(2, RoundingMode.HALF_UP);

        boolean cubre;
        BigDecimal vueltoUsd = BigDecimal.ZERO;
        BigDecimal vueltoBs = BigDecimal.ZERO;

        if (pagadoBsDirecto.signum() == 0 && pagadoUsdDirecto.signum() > 0) {
            // Solo USD: se compara en USD.
            cubre = pagadoUsdDirecto.compareTo(total) >= 0;
            if (cubre) {
                vueltoUsd = pagadoUsdDirecto.subtract(total).setScale(2, RoundingMode.HALF_UP);
            }
        } else if (pagadoUsdDirecto.signum() == 0 && pagadoBsDirecto.signum() > 0) {
            // Solo Bs: se compara en Bs (moneda de menor magnitud, criterio más estricto).
            cubre = pagadoBsDirecto.compareTo(totalBs) >= 0;
            if (cubre) {
                vueltoBs = pagadoBsDirecto.subtract(totalBs).setScale(2, RoundingMode.HALF_UP);
            }
        } else {
            // Mixto: se compara el equivalente combinado en USD con una tolerancia de conversión.
            cubre = totalPagadoUsd.add(TOLERANCIA_USD).compareTo(total) >= 0;
            if (cubre) {
                BigDecimal sobra = totalPagadoUsd.subtract(total).max(BigDecimal.ZERO);
                vueltoUsd = sobra.setScale(2, RoundingMode.HALF_UP);
            }
        }

        return new Resultado(totalPagadoUsd, totalPagadoBs, cubre, vueltoUsd, vueltoBs);
    }

    private static BigDecimal sane(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
