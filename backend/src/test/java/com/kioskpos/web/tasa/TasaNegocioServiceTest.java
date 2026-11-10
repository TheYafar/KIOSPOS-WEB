package com.kioskpos.web.tasa;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** Cálculo de la tasa del negocio en el servidor (sin red ni base de datos). */
class TasaNegocioServiceTest {

    private static BigDecimal bd(String s) {
        return new BigDecimal(s);
    }

    @Test
    void bcvTalCual() {
        assertThat(TasaNegocioService.calcular("BCV", "PCT", bd("5"), bd("0"), 900)).isEqualByComparingTo("900");
    }

    @Test
    void aumentoPorcentualSeRedondeaHaciaArriba() {
        // 900 + 2% = 918 exacto; 897 + 2% = 914,94 -> 915
        assertThat(TasaNegocioService.calcular("AJUSTE", "PCT", bd("2"), null, 900)).isEqualByComparingTo("918");
        assertThat(TasaNegocioService.calcular("AJUSTE", "PCT", bd("2"), null, 897)).isEqualByComparingTo("915");
    }

    @Test
    void aumentoEnBolivares() {
        assertThat(TasaNegocioService.calcular("AJUSTE", "BS", bd("10.5"), null, 900)).isEqualByComparingTo("911");
    }

    @Test
    void manualNoDependeDeLaBcv() {
        assertThat(TasaNegocioService.calcular("MANUAL", "PCT", null, bd("950.256"), null)).isEqualByComparingTo("950.26");
        // Tasa fija elegida pero sin escribir todavía: cobra a la BCV.
        assertThat(TasaNegocioService.calcular("MANUAL", "PCT", null, bd("0"), 900)).isEqualByComparingTo("900");
    }

    @Test
    void sinBcvNoHayTasaDelNegocio() {
        assertThat(TasaNegocioService.calcular("AJUSTE", "PCT", bd("2"), null, null)).isNull();
    }

    @Test
    void margenDeTresPorCiento() {
        assertThat(TasaNegocioService.dentroDelMargen(bd("927"), bd("900"))).isTrue();   // +3%
        assertThat(TasaNegocioService.dentroDelMargen(bd("928"), bd("900"))).isFalse();  // +3,1%
        assertThat(TasaNegocioService.dentroDelMargen(bd("873"), bd("900"))).isTrue();   // -3%
        assertThat(TasaNegocioService.dentroDelMargen(bd("40"), null)).isTrue();          // sin BCV: se acepta
    }
}
