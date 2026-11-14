package com.kioskpos.web.venta;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Reglas del cobro (sin base de datos): mixto en Bs exactos y el vuelto partido $ / Bs. */
class CobroCalculadoraTest {

    private static CobroCalculadora.Pago usd(String m) { return new CobroCalculadora.Pago(Moneda.USD, new BigDecimal(m)); }
    private static CobroCalculadora.Pago bs(String m) { return new CobroCalculadora.Pago(Moneda.VES, new BigDecimal(m)); }
    private static final BigDecimal TASA = new BigDecimal("912");

    @Test
    void mixtoConBs20DeMenosNoCubre() {
        // El caso real: $2,90 = Bs 2.644,80; paga $2 (Bs 1.824) + Bs 800 → faltan Bs 20,80.
        var r = CobroCalculadora.calcular(new BigDecimal("2.90"), TASA, List.of(usd("2"), bs("800")));
        assertThat(r.cubre()).isFalse();
        var ok = CobroCalculadora.calcular(new BigDecimal("2.90"), TASA, List.of(usd("2"), bs("820.80")));
        assertThat(ok.cubre()).isTrue();
        assertThat(ok.vueltoUsd()).isEqualByComparingTo("0");
        assertThat(ok.vueltoBs()).isEqualByComparingTo("0");
    }

    @Test
    void mixtoToleraSoloCentimos() {
        assertThat(CobroCalculadora.calcular(new BigDecimal("2.90"), TASA, List.of(usd("2"), bs("820.30"))).cubre()).isTrue();
        assertThat(CobroCalculadora.calcular(new BigDecimal("2.90"), TASA, List.of(usd("2"), bs("819.50"))).cubre()).isFalse();
    }

    @Test
    void vueltoPartidoEnDolaresYBolivares() {
        // Paga $5 una compra de $2,90: sobra $2,10 = Bs 1.915,20.
        var todoUsd = CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA, List.of(usd("5")), null);
        assertThat(todoUsd.vueltoUsd()).isEqualByComparingTo("2.10");
        assertThat(todoUsd.vueltoBs()).isEqualByComparingTo("0");

        var partido = CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA, List.of(usd("5")), new BigDecimal("2"));
        assertThat(partido.vueltoUsd()).isEqualByComparingTo("2");
        assertThat(partido.vueltoBs()).isEqualByComparingTo("91.20");

        var todoBs = CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA, List.of(usd("5")), BigDecimal.ZERO);
        assertThat(todoBs.vueltoUsd()).isEqualByComparingTo("0");
        assertThat(todoBs.vueltoBs()).isEqualByComparingTo("1915.20");
    }

    @Test
    void vueltoEscritoAManoPuedeSerMenosPeroNoMas() {
        // Sobran $2,10 = Bs 1.915,20. Da $2 + Bs 90 (no tenía Bs 91,20): se guarda lo entregado.
        var menos = CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA, List.of(usd("5")), new BigDecimal("2"), new BigDecimal("90"));
        assertThat(menos.vueltoUsd()).isEqualByComparingTo("2");
        assertThat(menos.vueltoBs()).isEqualByComparingTo("90");
        // Bs 91,90 = 70 céntimos de más: tolerado. Bs 95 de más: no.
        assertThat(CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA, List.of(usd("5")), new BigDecimal("2"), new BigDecimal("91.90")).vueltoBs())
                .isEqualByComparingTo("91.90");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> CobroCalculadora.calcular(new BigDecimal("2.90"), null, TASA,
                List.of(usd("5")), new BigDecimal("2"), new BigDecimal("186.20"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void soloBolivaresDaVueltoEnBsPorDefecto() {
        var r = CobroCalculadora.calcular(new BigDecimal("2"), new BigDecimal("900"), List.of(bs("2000")));
        assertThat(r.cubre()).isTrue();
        assertThat(r.vueltoBs()).isEqualByComparingTo("200");
        assertThat(r.vueltoUsd()).isEqualByComparingTo("0");
    }

    @Test
    void ventaTodaACreditoCubre() {
        assertThat(CobroCalculadora.calcular(BigDecimal.ZERO, TASA, List.of()).cubre()).isTrue();
        assertThat(CobroCalculadora.calcular(new BigDecimal("3"), TASA, List.of()).cubre()).isFalse();
    }
}
