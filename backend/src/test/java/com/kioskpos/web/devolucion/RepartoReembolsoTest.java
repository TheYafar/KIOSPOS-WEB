package com.kioskpos.web.devolucion;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/** "Como pagó": el reembolso se reparte igual que pagó el cliente, sin contar el vuelto. */
class RepartoReembolsoTest {

    private static RepartoReembolso.Pago p(String metodo, String moneda, String monto) {
        return new RepartoReembolso.Pago(metodo, moneda, new BigDecimal(monto));
    }

    private static BigDecimal de(List<RepartoReembolso.Parte> l, String metodo) {
        return l.stream().filter(x -> x.metodo().equals(metodo)).map(RepartoReembolso.Parte::monto).findFirst().orElse(BigDecimal.ZERO);
    }

    @Test
    void mixtoSinVueltoSeRepartePorMitad() {
        // Venta $6: pagó $3 en efectivo y Bs 2.700 por pago móvil (tasa 900). Devuelve $3 (la mitad).
        var r = RepartoReembolso.repartir(List.of(p("EFECTIVO_USD", "USD", "3"), p("PAGO_MOVIL", "VES", "2700")),
                BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("900"), new BigDecimal("6"), new BigDecimal("3"));
        assertThat(de(r, "EFECTIVO_USD")).isEqualByComparingTo("1.50");
        assertThat(de(r, "PAGO_MOVIL")).isEqualByComparingTo("1350.00");
    }

    @Test
    void elVueltoNoSeDevuelve() {
        // Venta $4 pagada con $5: le dieron $1 de vuelto. Devolver todo = $4, no $5.
        var r = RepartoReembolso.repartir(List.of(p("EFECTIVO_USD", "USD", "5")), new BigDecimal("1"), BigDecimal.ZERO,
                new BigDecimal("900"), new BigDecimal("4"), new BigDecimal("4"));
        assertThat(r).hasSize(1);
        assertThat(de(r, "EFECTIVO_USD")).isEqualByComparingTo("4.00");
    }

    @Test
    void vueltoEnBsDeUnPagoEnDolares() {
        // Venta $4 (tasa 900) pagada con $5; vuelto Bs 900 → dejó $4 netos.
        var r = RepartoReembolso.repartir(List.of(p("EFECTIVO_USD", "USD", "5")), BigDecimal.ZERO, new BigDecimal("900"),
                new BigDecimal("900"), new BigDecimal("4"), new BigDecimal("4"));
        assertThat(de(r, "EFECTIVO_USD")).isEqualByComparingTo("4.00");
    }

    @Test
    void loFiadoVuelveASuCuenta() {
        var r = RepartoReembolso.repartir(List.of(p("EFECTIVO_USD", "USD", "1"), p("FIADO", "USD", "3")), BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("900"), new BigDecimal("4"), new BigDecimal("4"));
        assertThat(de(r, "EFECTIVO_USD")).isEqualByComparingTo("1.00");
        assertThat(de(r, "A_CUENTA")).isEqualByComparingTo("3.00");
    }
}
