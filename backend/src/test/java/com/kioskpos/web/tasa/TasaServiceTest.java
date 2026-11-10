package com.kioskpos.web.tasa;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** Redondeo de la tasa BCV (sin red): siempre hacia arriba al bolívar entero. */
class TasaServiceTest {

    private final ObjectMapper json = new ObjectMapper();

    private Integer tasa(String body) throws Exception {
        return TasaService.tasaDesdeJson(json.readTree(body));
    }

    @Test
    void redondeaHaciaArribaAlBolivarEntero() throws Exception {
        assertThat(tasa("{\"promedio\": 896.1225}")).isEqualTo(897);
        assertThat(tasa("{\"promedio\": 899.01}")).isEqualTo(900);
    }

    @Test
    void tasaExactaNoSube() throws Exception {
        assertThat(tasa("{\"promedio\": 900.0}")).isEqualTo(900);
    }

    @Test
    void respuestaInvalidaDevuelveNull() throws Exception {
        assertThat(tasa("{}")).isNull();
        assertThat(tasa("{\"promedio\": 0}")).isNull();
        assertThat(tasa("{\"promedio\": null}")).isNull();
    }
}
